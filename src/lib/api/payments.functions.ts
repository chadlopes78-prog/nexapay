import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PaymentInput = z.object({
  method: z.enum(["mpesa", "emola"]),
  msisdn: z.string().min(9).max(20),
  amount: z.number().positive().max(500_000),
  reference: z.string().min(1).max(100),
  customerName: z.string().max(100).optional(),
});

export const processPayment = createServerFn({ method: "POST" })
  .inputValidator(PaymentInput)
  .handler(async ({ data }) => {
    const apiKey = process.env.PAYMENT_API_KEY;
    const baseUrl = process.env.PAYMENT_API_BASE_URL || "https://h.paymoz.tech";

    if (!apiKey) {
      return { success: false, error: "API key de pagamento não configurada no servidor." };
    }

    const path =
      data.method === "mpesa"
        ? "/api/v1/pagamentos/c2b/pay/"
        : "/api/v1/pagamentos/emola/c2b/pay/";

    const url = `${baseUrl.replace(/\/$/, "")}${path}`;

    // Normalize Mozambican phone to 258XXXXXXXXX (12 digits)
    let msisdn = data.msisdn.replace(/\D/g, "");
    if (msisdn.startsWith("258")) {
      // ok
    } else if (msisdn.length === 9) {
      msisdn = "258" + msisdn;
    } else if (msisdn.startsWith("0") && msisdn.length === 10) {
      msisdn = "258" + msisdn.slice(1);
    }

    if (!/^258\d{9}$/.test(msisdn)) {
      return { success: false, error: "Número de telefone inválido. Use o formato 84xxxxxxx, 85xxxxxxx, 86xxxxxxx ou 87xxxxxxx." };
    }

    const body: Record<string, unknown> = {
      msisdn,
      amount: Number(data.amount),
      reference: data.reference,
    };

    if (data.method === "emola" && data.customerName) {
      body.nome_cliente = data.customerName;
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text };
      }

      if (!res.ok || json?.success === false) {
        const message =
          json?.message ||
          json?.error ||
          json?.detail ||
          `Falha no pagamento (HTTP ${res.status})`;
        return {
          success: false,
          error: String(message),
          code: json?.code,
          status: res.status,
        };
      }

      return {
        success: true,
        transactionId: json?.transaction_id ?? null,
        providerTxId: json?.mpesa_transaction_id ?? json?.emola_txid ?? null,
        data: json,
      };
    } catch (err: any) {
      console.error("processPayment error:", err);
      return { success: false, error: err?.message || "Erro de rede ao contactar o gateway de pagamento." };
    }
  });
