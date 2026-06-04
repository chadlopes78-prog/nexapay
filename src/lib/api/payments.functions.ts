import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PaymentInput = z.object({
  method: z.enum(["mpesa", "emola"]),
  msisdn: z.string().min(9).max(20),
  amount: z.number().positive().max(500_000),
  reference: z.string().min(1).max(100),
  customerName: z.string().max(100).optional(),
});

const PAYMENT_ENDPOINTS = {
  mpesa: "/c2b/pay/",
  emola: "/emola/c2b/pay/",
} as const;

const DEFAULT_PAYMENT_API_BASE_URL = "https://h.paymoz.tech";

type PaymentGatewayResponse = {
  success?: boolean;
  message?: string | number | boolean | null;
  error?: string | number | boolean | null;
  detail?: string | number | boolean | null;
  code?: string | number | boolean | null;
  transaction_id?: string | number | boolean | null;
  mpesa_transaction_id?: string | number | boolean | null;
  emola_txid?: string | number | boolean | null;
  reference?: string | number | boolean | null;
  id?: string | number | boolean | null;
  raw?: string;
};

export type PaymentResult =
  | {
      success: true;
      transactionId: string | null;
      providerTxId: string | null;
      data: PaymentGatewayResponse | null;
    }
  | {
      success: false;
      error: string;
      code?: string | null;
      status?: number;
    };

function normalizePaymentBaseUrl(baseUrl: string | undefined) {
  const candidate = (baseUrl || DEFAULT_PAYMENT_API_BASE_URL).trim();
  const extractedUrl = candidate.match(/https?:\/\/[^\s]+/)?.[0] ?? candidate;

  if (!/^https?:\/\//i.test(extractedUrl)) {
    return DEFAULT_PAYMENT_API_BASE_URL;
  }

  try {
    const url = new URL(extractedUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return DEFAULT_PAYMENT_API_BASE_URL;
  }
}

function extractUrl(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(/https?:\/\/[^\s]+/);
  if (!match) return null;
  try {
    new URL(match[0]);
    return match[0];
  } catch {
    return null;
  }
}

function buildPaymentUrl(baseUrl: string | undefined, method: "mpesa" | "emola") {
  // Prefer per-method full endpoint env var if provided
  const endpointEnv =
    method === "mpesa" ? process.env.PAYMENT_MPESA_ENDPOINT : process.env.PAYMENT_EMOLA_ENDPOINT;
  const fullEndpoint = extractUrl(endpointEnv);
  if (fullEndpoint) return fullEndpoint;

  const cleanBase = normalizePaymentBaseUrl(baseUrl).replace(/\/+$/, "");
  const apiBase = `${cleanBase}/api/v1/pagamentos`;
  return `${apiBase}${PAYMENT_ENDPOINTS[method]}`;
}

export const processPayment = createServerFn({ method: "POST" })
  .inputValidator(PaymentInput)
  .handler(async ({ data }) => {
    const apiKey = process.env.PAYMENT_API_KEY;
    const baseUrl = process.env.PAYMENT_API_BASE_URL;

    if (!apiKey) {
      return {
        success: false,
        error: "API key de pagamento não configurada no servidor.",
      };
    }

    const url = buildPaymentUrl(baseUrl, data.method);

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
      return {
        success: false,
        error:
          "Número de telefone inválido. Use o formato 84xxxxxxx, 85xxxxxxx, 86xxxxxxx ou 87xxxxxxx.",
      };
    }

    const localPrefix = msisdn.slice(3, 5);
    if (data.method === "mpesa" && !["84", "85"].includes(localPrefix)) {
      return {
        success: false,
        error: "Para M-Pesa use um número que começa por 84 ou 85.",
      };
    }

    if (data.method === "emola" && !["86", "87"].includes(localPrefix)) {
      return {
        success: false,
        error: "Para e-Mola use um número que começa por 86 ou 87.",
      };
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
      let json: PaymentGatewayResponse | null = null;
      try {
        json = text ? (JSON.parse(text) as PaymentGatewayResponse) : null;
      } catch {
        json = { raw: text };
      }

      if (!res.ok || json?.success === false) {
        const message =
          json?.message || json?.error || json?.detail || `Falha no pagamento (HTTP ${res.status})`;
        return {
          success: false,
          error: String(message),
          code: json?.code == null ? null : String(json.code),
          status: res.status,
        } satisfies PaymentResult;
      }

      return {
        success: true,
        transactionId: json?.transaction_id == null ? null : String(json.transaction_id),
        providerTxId:
          json?.mpesa_transaction_id == null && json?.emola_txid == null
            ? null
            : String(json.mpesa_transaction_id ?? json.emola_txid),
        data: json,
      } satisfies PaymentResult;
    } catch (err: unknown) {
      console.error("processPayment error:", err);
      return {
        success: false,
        error:
          err instanceof Error ? err.message : "Erro de rede ao contactar o gateway de pagamento.",
      };
    }
  });
