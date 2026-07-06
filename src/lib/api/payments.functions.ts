import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const E2PAY_BASE_URL = "https://e2payments.explicador.co.mz";

const PaymentInput = z.object({
  productId: z.string().min(1).max(120),
  method: z.enum(["mpesa", "emola"]),
  msisdn: z.string().min(9).max(20),
  customerName: z.string().min(1).max(100),
  contactPhone: z.string().max(20).optional(),
  trafficPageTrackingId: z.string().max(100).nullable().optional(),
});

const PaymentSuccessInput = z.object({
  saleId: z.string().uuid(),
});

export type PaymentResult =
  | {
      success: true;
      saleId: string;
      transactionId: string | null;
      status: "paid" | "pending";
      accessLink?: string | null;
    }
  | {
      success: false;
      error: string;
      saleId?: string;
    };

export const getSaleStatus = createServerFn({ method: "GET" })
  .inputValidator((input) => PaymentSuccessInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sale } = await supabaseAdmin
      .from("sales")
      .select("id, status, payment_reference, products(access_link, delivery_link)")
      .eq("id", data.saleId)
      .maybeSingle();
    if (!sale) return { status: "not_found" as const, accessLink: null, error: null };
    const raw = String(sale.status ?? "").toLowerCase();
    const paid = ["paid", "approved", "success", "completed"].includes(raw);
    const failed = ["failed", "error", "cancelled", "canceled", "expired", "refused", "declined"].includes(raw);
    const product = sale.products as { access_link?: string | null; delivery_link?: string | null } | null;
    return {
      status: paid ? ("paid" as const) : failed ? ("failed" as const) : ("pending" as const),
      accessLink: paid ? (product?.access_link || product?.delivery_link || null) : null,
      error: failed ? (sale.payment_reference || "Pagamento cancelado ou recusado.") : null,
    };
  });


export const getPaymentSuccessData = createServerFn({ method: "GET" })
  .inputValidator((input) => PaymentSuccessInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sale, error } = await supabaseAdmin
      .from("sales")
      .select(
        "id, status, products(id, access_link, delivery_link, support_phone, support_number, thank_you_button_text)",
      )
      .eq("id", data.saleId)
      .maybeSingle();

    if (error) {
      console.error("payment-success lookup error", error);
      throw new Error("Não foi possível consultar o estado do pagamento.");
    }
    if (!sale) return { sale: null, product: null };

    const status = String(sale.status ?? "").toLowerCase();
    const isPaid = ["paid", "approved", "success", "completed"].includes(status);
    const product = sale.products as {
      access_link?: string | null;
      delivery_link?: string | null;
      support_phone?: string | null;
      support_number?: string | null;
      thank_you_button_text?: string | null;
    } | null;

    return {
      sale: { status: sale.status },
      product: product
        ? {
            access_link: isPaid ? product.access_link : null,
            delivery_link: isPaid ? product.delivery_link : null,
            support_phone: product.support_phone,
            support_number: product.support_number,
            thank_you_button_text: product.thank_you_button_text,
          }
        : null,
    };
  });

function normalizeMozambicanPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("258") && digits.length === 12) return digits;
  if (digits.length === 9) return `258${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `258${digits.slice(1)}`;
  return digits;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const clientId = process.env.E2PAYMENT_CLIENT_ID;
  const clientSecret = process.env.E2PAYMENT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Credenciais e2payment não configuradas no servidor.");
  }

  const res = await fetch(`${E2PAY_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; PaymentBlackmz/1.0)",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* noop */
  }

  if (!res.ok || !json?.access_token) {
    console.error("e2payment token error", { status: res.status, body: text?.slice(0, 500) });
    throw new Error(`Falha ao autenticar com e2payment (HTTP ${res.status}).`);
  }

  const expiresInMs = (Number(json.expires_in) || 3600) * 1000;
  cachedToken = {
    value: String(json.access_token),
    expiresAt: Date.now() + expiresInMs,
  };
  return cachedToken.value;
}

const InitiateInput = PaymentInput;
const ChargeInput = z.object({ saleId: z.string().uuid() });

async function validateAndLoad(data: z.infer<typeof PaymentInput>) {
  const msisdn = normalizeMozambicanPhone(data.msisdn);
  if (!/^258\d{9}$/.test(msisdn)) {
    return { error: "Número de telefone inválido. Use o formato 84/85/86/87xxxxxxx." };
  }
  const localPrefix = msisdn.slice(3, 5);
  if (data.method === "mpesa" && !["84", "85"].includes(localPrefix)) {
    return { error: "Para M-Pesa use um número 84 ou 85." };
  }
  if (data.method === "emola" && !["86", "87"].includes(localPrefix)) {
    return { error: "Para e-Mola use um número 86 ou 87." };
  }
  return { msisdn };
}

export const initiateSale = createServerFn({ method: "POST" })
  .inputValidator(InitiateInput)
  .handler(async ({ data }): Promise<PaymentResult> => {
    const v = await validateAndLoad(data);
    if (v.error) return { success: false, error: v.error };
    const msisdn = v.msisdn!;

    const walletId =
      data.method === "mpesa"
        ? process.env.E2PAYMENT_WALLET_MPESA
        : process.env.E2PAYMENT_WALLET_EMOLA;
    if (!walletId) {
      return { success: false, error: `Carteira ${data.method.toUpperCase()} não configurada.` };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        data.productId,
      );
    let productQuery = supabaseAdmin
      .from("products")
      .select("id, price, status, user_id, access_link, delivery_link");
    productQuery = isUuid
      ? productQuery.eq("id", data.productId)
      : productQuery.eq("custom_url", data.productId);
    const { data: product, error: productError } = await productQuery.single();
    if (productError || !product) return { success: false, error: "Produto não encontrado." };
    if (product.status && product.status !== "active") {
      return { success: false, error: "Produto indisponível para compra." };
    }
    const amount = Number(product.price);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 500_000) {
      return { success: false, error: "Valor do produto inválido." };
    }
    const customerName = data.contactPhone
      ? `${data.customerName.trim()} (contacto: ${data.contactPhone.trim()})`
      : data.customerName.trim();

    let finalTrafficPageId: string | null = null;
    if (data.trafficPageTrackingId) {
      const { data: pageData } = await supabaseAdmin
        .from("traffic_pages")
        .select("id")
        .eq("tracking_id", data.trafficPageTrackingId)
        .maybeSingle();
      finalTrafficPageId = pageData?.id ?? null;
    }

    const { paymentReferenceForSale } = await import("@/lib/payments/confirmation.server");
    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .insert({
        product_id: product.id,
        user_id: product.user_id,
        customer_name: customerName.slice(0, 100),
        customer_phone: msisdn,
        amount,
        payment_method: data.method,
        status: "pending",
        traffic_page_id: finalTrafficPageId,
      })
      .select("id")
      .single();
    if (saleError || !sale) return { success: false, error: "Não foi possível registar a venda." };

    const reference = paymentReferenceForSale(sale.id);
    await supabaseAdmin.from("sales").update({ payment_reference: reference }).eq("id", sale.id);

    return { success: true, saleId: sale.id, transactionId: null, status: "pending", accessLink: null };
  });

export const chargeSale = createServerFn({ method: "POST" })
  .inputValidator(ChargeInput)
  .handler(async ({ data }): Promise<PaymentResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sale, error: saleErr } = await supabaseAdmin
      .from("sales")
      .select("id, status, amount, payment_method, customer_phone, payment_reference, products(access_link, delivery_link)")
      .eq("id", data.saleId)
      .maybeSingle();
    if (saleErr || !sale) return { success: false, error: "Venda não encontrada." };
    if (["paid", "approved"].includes(String(sale.status).toLowerCase())) {
      const p = sale.products as { access_link?: string | null; delivery_link?: string | null } | null;
      return { success: true, saleId: sale.id, transactionId: null, status: "paid", accessLink: p?.access_link || p?.delivery_link || null };
    }

    const method = sale.payment_method as "mpesa" | "emola";
    const walletId =
      method === "mpesa" ? process.env.E2PAYMENT_WALLET_MPESA : process.env.E2PAYMENT_WALLET_EMOLA;
    if (!walletId) return { success: false, saleId: sale.id, error: "Carteira não configurada." };

    const {
      confirmSalePayment,
      markSaleTerminalFailure,
      normalizeGatewayStatus,
      readGatewayTransactionId,
    } = await import("@/lib/payments/confirmation.server");

    const reference = sale.payment_reference || `PMZ${sale.id.replace(/[^a-zA-Z0-9]/g, "")}`.slice(0, 20);
    const localPhone = String(sale.customer_phone).slice(3);
    const amount = Number(sale.amount);

    try {
      const token = await getAccessToken();
      const clientId = process.env.E2PAYMENT_CLIENT_ID!;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90_000);
      const endpoint =
        method === "mpesa"
          ? `${E2PAY_BASE_URL}/v1/c2b/mpesa-payment/${walletId}`
          : `${E2PAY_BASE_URL}/v1/c2b/emola-payment/${walletId}`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "PagamentosMZ/1.0",
        },
        body: JSON.stringify({
          client_id: clientId,
          amount: String(amount),
          phone: localPhone,
          reference,
          merchant_name: "PagamentosMZ",
          description: "Pagamento de produto digital",
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      const text = await res.text();
      let json: Record<string, unknown> | null = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
      console.info("e2payment response", { status: res.status, method, reference, body: text?.slice(0, 800) });

      const transactionId = readGatewayTransactionId(json);
      const finalStatus = normalizeGatewayStatus(json, res.ok);
      const p = sale.products as { access_link?: string | null; delivery_link?: string | null } | null;

      if (finalStatus === "paid") {
        await confirmSalePayment({ saleId: sale.id, transactionId, reference, rawPayload: json });
        return { success: true, saleId: sale.id, transactionId, status: "paid", accessLink: p?.access_link || p?.delivery_link || null };
      }
      if (finalStatus === "failed" || finalStatus === "expired") {
        const message = String(
          (json?.message as string) || (json?.error as string) || (json?.detail as string) ||
          (finalStatus === "expired" ? "Pagamento expirado." : "Pagamento cancelado ou recusado."),
        );
        await markSaleTerminalFailure({ saleId: sale.id, status: finalStatus, transactionId, reference, reason: message });
        return { success: false, saleId: sale.id, error: message };
      }
      return { success: true, saleId: sale.id, transactionId, status: "pending", accessLink: null };
    } catch (err) {
      console.error("chargeSale error", err);
      return { success: true, saleId: sale.id, transactionId: null, status: "pending", accessLink: null };
    }
  });

// Backward-compat wrapper
export const processPayment = createServerFn({ method: "POST" })
  .inputValidator(PaymentInput)
  .handler(async ({ data }): Promise<PaymentResult> => {
    const init = await (initiateSale as unknown as (args: { data: typeof data }) => Promise<PaymentResult>)({ data });
    if (!init.success) return init;
    return await (chargeSale as unknown as (args: { data: { saleId: string } }) => Promise<PaymentResult>)({ data: { saleId: init.saleId } });
  });

