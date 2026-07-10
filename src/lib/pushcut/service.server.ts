import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PushcutEventKey =
  | "sale_approved"
  | "sale_refused"
  | "payment_pending"
  | "payment_processing"
  | "refund"
  | "checkout_abandoned"
  | "daily_summary";

const EVENT_TITLES: Record<PushcutEventKey, string> = {
  sale_approved: "Venda Aprovada ✅",
  sale_refused: "Venda Recusada ❌",
  payment_pending: "Pagamento Pendente ⏳",
  payment_processing: "Pagamento em Processamento 🔄",
  refund: "Reembolso 💸",
  checkout_abandoned: "Checkout Abandonado 🛒",
  daily_summary: "Resumo Diário 📊",
};

interface SendOptions {
  userId: string;
  event: PushcutEventKey;
  data?: Record<string, unknown>;
  dedupeKey?: string;
  title?: string;
  text?: string;
}

/**
 * PushcutService — integração dedicada ao Pushcut (iPhone).
 * Independente do sistema de Webhooks. Envio assíncrono (fire-and-forget seguro).
 */
export const PushcutService = {
  async sendEvent(opts: SendOptions): Promise<{ ok: boolean; skipped?: string; status?: number; error?: string }> {
    const { userId, event } = opts;

    // 1. Load user's Pushcut integration
    const { data: integ } = await supabaseAdmin
      .from("pushcut_integrations")
      .select("url, active, events")
      .eq("user_id", userId)
      .maybeSingle();

    if (!integ) return { ok: false, skipped: "not_configured" };
    if (!integ.active) return { ok: false, skipped: "disabled" };
    const events = (integ.events ?? {}) as Record<string, boolean>;
    if (events[event] === false) return { ok: false, skipped: "event_disabled" };

    const url = String(integ.url || "").trim();
    if (!url) return { ok: false, skipped: "no_url" };

    // 2. Deduplication (optional)
    const dedupeKey = opts.dedupeKey || `${event}:${Date.now()}`;
    const { data: existing } = await supabaseAdmin
      .from("pushcut_logs")
      .select("id, status")
      .eq("order_id", dedupeKey)
      .maybeSingle();
    if (existing) return { ok: false, skipped: "duplicate" };

    // 3. Insert lock/log row
    const { data: log, error: lockErr } = await supabaseAdmin
      .from("pushcut_logs")
      .insert({
        order_id: dedupeKey,
        user_id: userId,
        status: "processing",
        metadata: { source: "pushcut_service", event, data: (opts.data ?? {}) as any } as any,
      })
      .select("id")
      .single();
    if (lockErr) {
      if (lockErr.code === "23505") return { ok: false, skipped: "duplicate" };
      return { ok: false, error: lockErr.message };
    }

    // 4. Build payload
    const title = opts.title ?? EVENT_TITLES[event];
    const text = opts.text ?? buildDefaultText(event, opts.data ?? {});
    const body = JSON.stringify({ title, text, input: opts.data ?? {} });

    // 5. Send
    const started = Date.now();
    let status: number | null = null;
    let responseBody = "";
    let errorMsg: string | null = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      status = resp.status;
      responseBody = (await resp.text().catch(() => "")).slice(0, 2000);
      if (!resp.ok) errorMsg = `HTTP ${resp.status}`;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }
    const elapsedMs = Date.now() - started;

    const success = !errorMsg && status !== null && status >= 200 && status < 300;
    await supabaseAdmin
      .from("pushcut_logs")
      .update({
        status: success ? "sent" : "failed",
        sent_at: success ? new Date().toISOString() : null,
        metadata: {
          source: "pushcut_service",
          event,
          data: (opts.data ?? {}) as any,
          url,
          response_code: status,
          response_body: responseBody,
          error: errorMsg,
          elapsed_ms: elapsedMs,
        },
      })
      .eq("id", log.id);

    return success
      ? { ok: true, status: status! }
      : { ok: false, status: status ?? undefined, error: errorMsg ?? "unknown" };
  },
};

function buildDefaultText(event: PushcutEventKey, d: Record<string, unknown>): string {
  const g = (k: string) => (d[k] == null ? "-" : String(d[k]));
  switch (event) {
    case "sale_approved":
      return `Produto: ${g("product_name")}\nValor: ${g("amount")}\nPagamento: ${g("payment_method")}\nCliente: ${g("customer_name")}\nHora: ${g("approved_at")}`;
    case "sale_refused":
      return `Produto: ${g("product_name")}\nCliente: ${g("customer_name")}\nMotivo: ${g("reason")}`;
    case "payment_pending":
    case "payment_processing":
      return `Produto: ${g("product_name")}\nCliente: ${g("customer_name")}\nValor: ${g("amount")}`;
    case "refund":
      return `Produto: ${g("product_name")}\nCliente: ${g("customer_name")}\nValor: ${g("amount")}`;
    case "checkout_abandoned":
      return `Produto: ${g("product_name")}\nCliente: ${g("customer_name")}`;
    case "daily_summary":
      return `Faturamento: ${g("revenue")}\nVendas: ${g("sales")}\nPendentes: ${g("pending")}\nFalhas: ${g("failed")}\nConversão: ${g("conversion")}`;
  }
}
