import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PaymentInput = z.object({
  method: z.enum(["mpesa", "emola"]),
  msisdn: z.string().min(9).max(15).regex(/^\d+$/, "Telefone deve conter apenas dígitos"),
  amount: z.number().positive().max(1_000_000),
  reference: z.string().min(1).max(64),
});

export const processPayment = createServerFn({ method: "POST" })
  .inputValidator(PaymentInput)
  .handler(async ({ data }) => {
    const apiKey = process.env.PAYMENT_API_KEY;
    const baseUrl = process.env.PAYMENT_API_BASE_URL;

    if (!apiKey || !baseUrl) {
      return { success: false, error: "Pagamento não configurado no servidor." };
    }

    const path =
      data.method === "mpesa"
        ? "/api/v1/pagamentos/c2b/pay/"
        : "/api/v1/pagamentos/emola/c2b/pay/";

    const url = `${baseUrl.replace(/\/$/, "")}${path}`;

    // Normalize Mozambican phone to local 9-digit format
    let msisdn = data.msisdn.replace(/\D/g, "");
    if (msisdn.startsWith("258")) msisdn = msisdn.slice(3);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          msisdn,
          amount: data.amount,
          reference: data.reference,
        }),
      });

      const text = await res.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { raw: text };
      }

      if (!res.ok) {
        const message =
          body?.message ||
          body?.error ||
          body?.detail ||
          `Falha no pagamento (HTTP ${res.status})`;
        return { success: false, error: String(message), status: res.status };
      }

      return { success: true, data: body };
    } catch (err: any) {
      console.error("processPayment error:", err);
      return { success: false, error: err?.message || "Erro de rede ao contactar gateway." };
    }
  });
