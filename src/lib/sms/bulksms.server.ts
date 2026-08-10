/**
 * Envio de SMS via BulkSMS Moçambique.
 * Isolado de pagamentos: nenhuma falha aqui pode alterar o estado de uma venda.
 * A API Key vive apenas em secrets de backend e nunca é registada em logs/BD.
 */

export type BulkSmsResult = {
  status: "sent" | "failed";
  messageId: string | null;
  error: string | null;
};

/** Normaliza um número moçambicano para o formato +258XXXXXXXXX. */
export function normalizeMozPhoneStrict(raw: string | null | undefined): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("258")) digits = digits.slice(3);
  digits = digits.replace(/^0+/, "");
  if (!/^(82|83|84|85|86|87)\d{7}$/.test(digits)) return null;
  return `+258${digits}`;
}

/** POST para a BulkSMS. Nunca lança — devolve sempre um resultado. */
export async function sendBulkSms(phone: string, body: string): Promise<BulkSmsResult> {
  const apiKey = process.env["BULKSMS_API_KEY"];
  const apiUrl = process.env["BULKSMS_API_URL"];
  if (!apiKey || !apiUrl) {
    return { status: "failed", messageId: null, error: "BulkSMS não configurada no backend." };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      // Sem campo "sender": a BulkSMS rejeita senders não aprovados.
      body: JSON.stringify({ to: [phone], body }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    const text = (await resp.text().catch(() => "")).slice(0, 1000);
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }

    if (!resp.ok) {
      return {
        status: "failed",
        messageId: null,
        error: `HTTP ${resp.status}${text ? ` — ${text.slice(0, 200)}` : ""}`,
      };
    }

    const explicitFailure =
      parsed && (parsed["success"] === false || parsed["status"] === "failed" || parsed["error"]);
    if (explicitFailure) {
      return {
        status: "failed",
        messageId: null,
        error: String(parsed?.["message"] ?? parsed?.["error"] ?? "A operadora recusou o envio.").slice(0, 300),
      };
    }

    const data = (parsed?.["data"] ?? null) as Record<string, unknown> | null;
    const rawId =
      parsed?.["message_id"] ?? parsed?.["messageId"] ?? parsed?.["id"] ?? data?.["id"] ?? null;

    return { status: "sent", messageId: rawId != null ? String(rawId) : null, error: null };
  } catch (err) {
    return {
      status: "failed",
      messageId: null,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 300),
    };
  }
}
