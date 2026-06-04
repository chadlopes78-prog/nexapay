import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PaymentInput = z.object({
  productId: z.string().uuid(),
  method: z.enum(["mpesa", "emola"]),
  msisdn: z.string().min(9).max(20),
  amount: z.number().positive().max(500_000).optional(),
  reference: z.string().min(1).max(100).optional(),
  customerName: z.string().min(1).max(100),
  contactPhone: z.string().max(20).optional(),
  trafficPageTrackingId: z.string().max(100).nullable().optional(),
});

const PAYMENT_ENDPOINTS = {
  mpesa: "/c2b/pay/",
  emola: "/emola/c2b/pay/",
} as const;

const DEFAULT_PAYMENT_API_BASE_URL = "https://h.paymoz.tech";

type PaymentGatewayResponse = {
  success?: boolean;
  status?: string | number | boolean | null;
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
      saleId: string;
      transactionId: string | null;
      providerTxId: string | null;
      data: PaymentGatewayResponse | null;
    }
  | {
      success: false;
      error: string;
      saleId?: string;
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

function normalizeApiKey(apiKey: string | undefined) {
  return apiKey?.trim().replace(/^ApiKey\s+/i, "");
}

function normalizeMozambicanPhone(value: string) {
  let msisdn = value.replace(/\D/g, "");
  if (msisdn.startsWith("258")) return msisdn;
  if (msisdn.length === 9) return `258${msisdn}`;
  if (msisdn.startsWith("0") && msisdn.length === 10) return `258${msisdn.slice(1)}`;
  return msisdn;
}

function buildSaleCustomerName(customerName: string, contactPhone?: string) {
  const name = customerName.trim();
  const contact = contactPhone?.trim();
  const fullName = contact ? `${name} (contacto: ${contact})` : name;
  return fullName.slice(0, 100);
}

function buildPaymentReference(saleId: string) {
  return saleId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
}

function getGatewayFailureMessage(
  status: number,
  json: PaymentGatewayResponse | null,
  method: "mpesa" | "emola",
) {
  const gatewayMessage = json?.message || json?.error || json?.detail;
  if (gatewayMessage) return String(gatewayMessage);

  if (status === 402) {
    const providerName = method === "emola" ? "e-Mola" : "M-Pesa";
    return `Pagamento não autorizado pelo ${providerName}. Confirme se o número está ativo, tem saldo suficiente e aprove a cobrança no telemóvel.`;
  }

  return `Falha no pagamento (HTTP ${status})`;
}

export const processPayment = createServerFn({ method: "POST" })
  .inputValidator(PaymentInput)
  .handler(async ({ data }) => {
    const apiKey = normalizeApiKey(process.env.PAYMENT_API_KEY);
    const baseUrl = process.env.PAYMENT_API_BASE_URL;

    if (!apiKey) {
      return {
        success: false,
        error: "API key de pagamento não configurada no servidor.",
      };
    }

    const url = buildPaymentUrl(baseUrl, data.method);

    // Normalize Mozambican phone to 258XXXXXXXXX (12 digits)
    const msisdn = normalizeMozambicanPhone(data.msisdn);

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

    const customerName = buildSaleCustomerName(data.customerName, data.contactPhone);
    if (!customerName) {
      return {
        success: false,
        error: "Por favor, insira o nome completo.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, price, status")
      .eq("id", data.productId)
      .single();

    if (productError || !product) {
      return {
        success: false,
        error: "Produto não encontrado.",
      };
    }

    if (product.status && product.status !== "active") {
      return {
        success: false,
        error: "Este produto não está disponível para compra.",
      };
    }

    const amount = Number(product.price);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 500_000) {
      return {
        success: false,
        error: "Valor do produto inválido para pagamento.",
      };
    }

    let finalTrafficPageId: string | null = null;
    if (data.trafficPageTrackingId) {
      const { data: pageData } = await supabaseAdmin
        .from("traffic_pages")
        .select("id")
        .eq("tracking_id", data.trafficPageTrackingId)
        .maybeSingle();
      finalTrafficPageId = pageData?.id ?? null;
    }

    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .insert({
        product_id: data.productId,
        customer_name: customerName,
        customer_phone: msisdn,
        amount,
        payment_method: data.method,
        status: "pending",
        traffic_page_id: finalTrafficPageId,
      })
      .select("id")
      .single();

    if (saleError || !sale) {
      return {
        success: false,
        error: "Não foi possível registar a venda. Verifique os dados e tente novamente.",
      };
    }

    const paymentReference = buildPaymentReference(sale.id);

    const body: Record<string, unknown> = {
      msisdn,
      amount,
      reference: paymentReference,
    };

    if (data.method === "emola") {
      body.nome_cliente = data.customerName.trim();
    }

    try {
      console.info("processPayment request started", {
        method: data.method,
        amount,
        reference: paymentReference,
        endpointUrl: url,
        apiKeyPrefix: apiKey.slice(0, 6),
        apiKeyLength: apiKey.length,
        baseUrlEnv: baseUrl ?? null,
        mpesaEndpointEnv: process.env.PAYMENT_MPESA_ENDPOINT ?? null,
        emolaEndpointEnv: process.env.PAYMENT_EMOLA_ENDPOINT ?? null,
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45_000);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      const text = await res.text();
      let json: PaymentGatewayResponse | null = null;
      try {
        json = text ? (JSON.parse(text) as PaymentGatewayResponse) : null;
      } catch {
        json = { raw: text };
      }

      console.info("processPayment response received", {
        method: data.method,
        reference: paymentReference,
        status: res.status,
        gatewayStatus: json?.status,
        gatewaySuccess: json?.success,
        gatewayBody: text?.slice(0, 500),
        requestBody: JSON.stringify(body),
      });

      if (!res.ok || json?.success === false) {
        const message = getGatewayFailureMessage(res.status, json, data.method);
        await supabaseAdmin
          .from("sales")
          .update({
            status: "failed",
            payment_reference: String(json?.transaction_id ?? message).slice(0, 200),
          })
          .eq("id", sale.id);
        return {
          success: false,
          error: String(message),
          saleId: sale.id,
          code: json?.code == null ? null : String(json.code),
          status: res.status,
        } satisfies PaymentResult;
      }

      const providerTxId =
        json?.mpesa_transaction_id == null && json?.emola_txid == null
          ? null
          : String(json.mpesa_transaction_id ?? json.emola_txid);
      const transactionId = json?.transaction_id == null ? null : String(json.transaction_id);
      const gatewayRef = transactionId || providerTxId || (json?.reference == null ? null : String(json.reference)) || sale.id;

      const { error: updateError } = await supabaseAdmin
        .from("sales")
        .update({ status: "paid", payment_reference: gatewayRef })
        .eq("id", sale.id);

      if (updateError) {
        return {
          success: false,
          saleId: sale.id,
          error: "Pagamento recebido, mas não foi possível atualizar a venda. Contacte o suporte.",
        } satisfies PaymentResult;
      }

      if (finalTrafficPageId) {
        await supabaseAdmin.from("traffic_events").insert({
          page_id: finalTrafficPageId,
          event_type: "purchase",
          metadata: { saleId: sale.id, productId: data.productId },
        });
      }

      return {
        success: true,
        saleId: sale.id,
        transactionId,
        providerTxId,
        data: json,
      } satisfies PaymentResult;
    } catch (err: unknown) {
      console.error("processPayment error:", err);
      if (typeof sale?.id === "string") {
        await supabaseAdmin
          .from("sales")
          .update({ status: "failed", payment_reference: err instanceof Error ? err.message.slice(0, 200) : null })
          .eq("id", sale.id);
      }
      return {
        success: false,
        saleId: sale?.id,
        error:
          err instanceof Error && err.name === "AbortError"
            ? "O gateway de pagamento demorou demais para responder. Verifique a BASE URL/endpoint ou tente novamente."
            : err instanceof Error
              ? err.message
              : "Erro de rede ao contactar o gateway de pagamento.",
      };
    }
  });
