import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Configuração de SMS (BulkSMS Moçambique).
 *
 * IMPORTANTE: a API Key NUNCA é guardada em base de dados nem devolvida ao
 * frontend. Vive apenas como secret de backend `BULKSMS_API_KEY`.
 * Esta camada é puramente aditiva — não toca em pagamentos, webhooks ou checkout.
 */

export type SmsSettings = {
  user_id: string;
  enabled: boolean;
  sender: string;
  message_paid: string;
  test_phone: string | null;
};

const DEFAULT_SENDER = "11480";
const DEFAULT_MESSAGE =
  "Olá {nome}, recebemos o seu pagamento de {valor} MT referente a {produto}. O seu pagamento foi confirmado com sucesso.";

export const getSmsSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sms_settings")
      .select("user_id, enabled, sender, message_paid, test_phone")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Apenas booleano — o valor do secret nunca é exposto.
    const hasApiKey = Boolean(process.env["BULKSMS_API_KEY"]);
    const hasEndpoint = Boolean(process.env["BULKSMS_API_URL"]);


    return {
      settings:
        (data as SmsSettings | null) ??
        ({
          user_id: context.userId,
          enabled: false,
          sender: DEFAULT_SENDER,
          message_paid: DEFAULT_MESSAGE,
          test_phone: null,
        } satisfies SmsSettings),
      exists: Boolean(data),
      hasApiKey,
      hasEndpoint,
    };
  });

export const saveSmsSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    enabled?: boolean;
    sender?: string;
    message_paid?: string;
    test_phone?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const sender = String(data.sender ?? DEFAULT_SENDER).trim().slice(0, 20);
    if (!sender) throw new Error("O sender não pode estar vazio.");

    const message = String(data.message_paid ?? DEFAULT_MESSAGE).trim().slice(0, 1000);
    if (!message) throw new Error("A mensagem não pode estar vazia.");

    const testPhone = data.test_phone ? String(data.test_phone).replace(/\D/g, "").slice(0, 15) : null;

    const { data: saved, error } = await context.supabase
      .from("sms_settings")
      .upsert(
        {
          user_id: context.userId,
          enabled: data.enabled ?? false,
          sender,
          message_paid: message,
          test_phone: testPhone,
        },
        { onConflict: "user_id" },
      )
      .select("user_id, enabled, sender, message_paid, test_phone")
      .single();
    if (error) throw new Error(error.message);
    return saved as SmsSettings;
  });

/**
 * Normaliza um número moçambicano para o formato 258XXXXXXXXX.
 * Aceita: 841234567 | +258841234567 | 258841234567 | 00258841234567
 */
export function normalizeMozPhone(raw: string): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("258")) digits = digits.slice(3);
  digits = digits.replace(/^0+/, "");
  if (!/^(82|83|84|85|86|87)\d{7}$/.test(digits)) return null;
  return `258${digits}`;
}

/**
 * Envio MANUAL de SMS de teste via BulkSMS Moçambique.
 * Só corre quando o utilizador clica no botão — nunca em build, deploy ou load.
 * Não está ligada a pagamentos, webhooks ou checkout.
 */
export const sendTestSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { phone: string; message: string }) => d)
  .handler(async ({ data, context }) => {
    const apiKey = process.env["BULKSMS_API_KEY"];
    const apiUrl = process.env["BULKSMS_API_URL"];
    if (!apiKey || !apiUrl) {
      throw new Error("Integração incompleta: configure BULKSMS_API_KEY e BULKSMS_API_URL no backend.");
    }

    const phone = normalizeMozPhone(data.phone);
    if (!phone) throw new Error("Número inválido. Use o formato 84xxxxxxx ou 258 84xxxxxxx.");

    const body = String(data.message ?? "").trim();
    if (!body) throw new Error("A mensagem não pode estar vazia.");
    if (body.length > 800) throw new Error("A mensagem é demasiado longa (máx. 800 caracteres).");

    // Sender configurado pelo utilizador (default 11480).
    const { data: settings } = await context.supabase
      .from("sms_settings")
      .select("sender")
      .eq("user_id", context.userId)
      .maybeSingle();
    const sender = (settings?.sender ?? "11480").trim() || "11480";

    let status: "sent" | "failed" = "failed";
    let messageId: string | null = null;
    let errorMsg: string | null = null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ to: [phone], body, sender }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      const text = (await resp.text().catch(() => "")).slice(0, 1000);
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }

      if (resp.ok) {
        // Alguns gateways devolvem 200 com success:false — não assumir sucesso.
        const explicitFailure =
          parsed && (parsed.success === false || parsed.status === "failed" || parsed.error);
        if (explicitFailure) {
          errorMsg =
            String(parsed.message ?? parsed.error ?? "A operadora recusou o envio.").slice(0, 300);
        } else {
          status = "sent";
          messageId =
            (parsed?.message_id ?? parsed?.messageId ?? parsed?.id ?? parsed?.data?.id ?? null) &&
            String(parsed?.message_id ?? parsed?.messageId ?? parsed?.id ?? parsed?.data?.id);
        }
      } else {
        errorMsg = `HTTP ${resp.status}${text ? ` — ${text.slice(0, 200)}` : ""}`;
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    // Log (nunca guarda a API Key)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("sms_logs").insert({
      user_id: context.userId,
      phone,
      status,
      message_id: messageId,
      error: errorMsg,
    });

    if (status !== "sent") throw new Error(errorMsg ?? "Falha no envio da SMS.");
    return { ok: true, phone, messageId };
  });
