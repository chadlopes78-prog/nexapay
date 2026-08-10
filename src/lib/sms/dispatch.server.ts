/**
 * Automação de SMS para vendas APROVADAS.
 *
 * Camada estritamente aditiva: é chamada depois de o backend já ter confirmado
 * a venda como `paid`. Nunca altera o estado da venda, nunca lança para o
 * chamador e nunca bloqueia o checkout.
 *
 * Idempotência: a tabela `sms_outbox` tem UNIQUE(sale_id, sms_sequence), pelo
 * que confirmações repetidas (webhook + polling + sweep) não duplicam SMS.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeMozPhoneStrict, sendBulkSms } from "./bulksms.server";

export const MAX_SMS_PER_SALE = 5;

export type SmsTemplate = { body: string; delay_seconds: number };

type SaleLike = {
  id: string;
  user_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  amount?: number | string | null;
  payment_method?: string | null;
  transaction_id?: string | null;
  product_id?: string | null;
  products?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

export function parseTemplates(raw: unknown, fallback: string, count: number): SmsTemplate[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: SmsTemplate[] = [];
  const total = Math.min(Math.max(Number(count) || 1, 1), MAX_SMS_PER_SALE);
  for (let i = 0; i < total; i++) {
    const item = (list[i] ?? {}) as Record<string, unknown>;
    const body = String(item["body"] ?? (i === 0 ? fallback : "")).trim();
    const rawSeconds = item["delay_seconds"];
    const seconds =
      rawSeconds != null
        ? Math.max(0, Math.round(Number(rawSeconds) || 0))
        : Math.max(0, Math.round(Number(item["delay_minutes"] ?? 0) || 0)) * 60;
    out.push({ body, delay_seconds: Math.min(seconds, 72 * 3600) });
  }
  return out;
}

export function renderTemplate(
  template: string,
  vars: {
    nome: string;
    valor: string;
    produto: string;
    telefone: string;
    data: string;
    transacao: string;
  },
): string {
  return template
    .replace(/\{nome\}/g, vars.nome)
    .replace(/\{valor\}/g, vars.valor)
    .replace(/\{produto\}/g, vars.produto)
    .replace(/\{telefone\}/g, vars.telefone)
    .replace(/\{data\}/g, vars.data)
    .replace(/\{transacao\}/g, vars.transacao)
    .slice(0, 800);
}

/**
 * Agenda as SMS de uma venda aprovada. Seguro para chamar múltiplas vezes.
 * Não lança: qualquer erro é apenas registado.
 */
export async function enqueueSalesSms(sale: SaleLike): Promise<number> {
  try {
    const userId = sale.user_id;
    if (!userId) return 0;

    const { data: settings } = await supabaseAdmin
      .from("sms_settings")
      .select("enabled, message_paid, sms_count, messages")
      .eq("user_id", userId)
      .maybeSingle();

    if (!settings?.enabled) return 0;

    const phone = normalizeMozPhoneStrict(sale.customer_phone);
    if (!phone) {
      console.warn("[sms] número do comprador inválido — SMS ignorada", { saleId: sale.id });
      return 0;
    }

    const rawProducts = sale.products;
    const product = Array.isArray(rawProducts) ? (rawProducts[0] ?? null) : rawProducts;
    const amountNum = sale.amount != null ? Number(sale.amount) : 0;
    const vars = {
      nome: (sale.customer_name ?? "Cliente").toString().split(" ")[0] ?? "Cliente",
      valor: Number.isFinite(amountNum) ? String(Math.round(amountNum)) : "0",
      produto: product?.name ?? "produto",
      telefone: phone,
      data: new Date().toLocaleDateString("pt-PT"),
      transacao: sale.transaction_id ?? sale.id,
    };

    const templates = parseTemplates(
      settings.messages,
      settings.message_paid ?? "",
      (settings as { sms_count?: number }).sms_count ?? 1,
    );

    const now = Date.now();
    const rows = templates
      .map((t, i) => ({ t, seq: i + 1 }))
      .filter(({ t }) => t.body.trim().length > 0)
      .map(({ t, seq }) => ({
        user_id: userId,
        sale_id: sale.id,
        transaction_id: sale.transaction_id ?? null,
        customer_phone: phone,
        sms_sequence: seq,
        message: renderTemplate(t.body, vars),
        status: "scheduled",
        scheduled_for: new Date(now + t.delay_seconds * 1000).toISOString(),
      }));

    if (rows.length === 0) return 0;

    // ON CONFLICT DO NOTHING via upsert com ignoreDuplicates: a constraint
    // UNIQUE(sale_id, sms_sequence) é a garantia real de não-duplicação.
    const { error } = await supabaseAdmin
      .from("sms_outbox")
      .upsert(rows as never, { onConflict: "sale_id,sms_sequence", ignoreDuplicates: true });
    if (error) {
      console.error("[sms] falha ao agendar SMS", { saleId: sale.id, error: error.message });
      return 0;
    }

    return rows.length;
  } catch (e) {
    console.error("[sms] enqueueSalesSms suprimido", e);
    return 0;
  }
}

/**
 * Agenda e tenta enviar imediatamente. Mantido para compatibilidade.
 */
export async function scheduleSalesSms(sale: SaleLike): Promise<void> {
  const queued = await enqueueSalesSms(sale);
  if (queued > 0) await processDueSms(10);
}

/**
 * Rede de segurança: vendas pagas recentes que — por o Worker ter sido
 * reciclado antes do agendamento — ficaram sem linhas em `sms_outbox`.
 * Chamado pelo cron. Idempotente graças a UNIQUE(sale_id, sms_sequence).
 */
export async function enqueueMissingSalesSms(limit = 25): Promise<number> {
  let queued = 0;
  try {
    const since = new Date(Date.now() - 6 * 60 * 60_000).toISOString();
    const { data: sales } = await supabaseAdmin
      .from("sales")
      .select(
        "id, user_id, customer_name, customer_phone, amount, payment_method, transaction_id, product_id, products(name)",
      )
      .eq("status", "paid")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);

    for (const sale of sales ?? []) {
      const { data: existing } = await supabaseAdmin
        .from("sms_outbox")
        .select("id")
        .eq("sale_id", sale.id)
        .limit(1)
        .maybeSingle();
      if (existing) continue;
      queued += await enqueueSalesSms(sale as SaleLike);
    }
  } catch (e) {
    console.error("[sms] enqueueMissingSalesSms suprimido", e);
  }
  return queued;
}

/**
 * Processa SMS agendadas cujo `scheduled_for` já passou.
 * Usado pela confirmação (SMS imediata) e pelo cron (SMS com atraso).
 */
export async function processDueSms(limit = 25): Promise<{ processed: number; sent: number }> {
  let processed = 0;
  let sent = 0;
  try {
    // Reciclar envios presos em "sending" há mais de 2 minutos.
    await supabaseAdmin
      .from("sms_outbox")
      .update({ status: "scheduled" })
      .eq("status", "sending")
      .lt("updated_at", new Date(Date.now() - 120_000).toISOString());

    const { data: due } = await supabaseAdmin
      .from("sms_outbox")
      .select("id, customer_phone, message, attempts")
      .eq("status", "scheduled")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(limit);

    for (const row of due ?? []) {
      // Lock optimista: só envia quem conseguir mudar de scheduled -> sending.
      const { data: locked } = await supabaseAdmin
        .from("sms_outbox")
        .update({ status: "sending", attempts: (row.attempts ?? 0) + 1 })
        .eq("id", row.id)
        .eq("status", "scheduled")
        .select("id")
        .maybeSingle();
      if (!locked) continue;

      processed++;
      const result = await sendBulkSms(row.customer_phone, row.message);
      if (result.status === "sent") sent++;

      await supabaseAdmin
        .from("sms_outbox")
        .update({
          status: result.status,
          message_id: result.messageId,
          error: result.error,
          sent_at: result.status === "sent" ? new Date().toISOString() : null,
        })
        .eq("id", row.id);
    }
  } catch (e) {
    console.error("[sms] processDueSms suprimido", e);
  }
  return { processed, sent };
}
