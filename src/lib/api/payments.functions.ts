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
  idempotencyKey: z.string().min(8).max(80).optional(),
  saleId: z.string().uuid().optional(),
});

const PaymentSuccessInput = z.object({
  saleId: z.string().uuid(),
});

const CancelPaymentInput = z.object({
  saleId: z.string().uuid(),
  reason: z.enum(["customer_cancelled", "timeout"]).default("customer_cancelled"),
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

type GatewayCallResult = {
  ok: boolean;
  status: number;
  json: Record<string, unknown> | null;
  text: string;
};

export const getSaleStatus = createServerFn({ method: "GET" })
  .inputValidator((input) => PaymentSuccessInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sale } = await supabaseAdmin
      .from("sales")
      .select("id, status, created_at, payment_reference, failure_reason, failure_code, products(access_link, delivery_link)")
      .eq("id", data.saleId)
      .maybeSingle();
    if (!sale) return { status: "not_found" as const, accessLink: null, error: null };
    const raw = String(sale.status ?? "").toLowerCase();
    const paid = ["paid", "approved", "success", "completed"].includes(raw);
    const failed = ["failed", "error", "cancelled", "canceled", "expired", "refused", "declined"].includes(raw);
    const createdAt = sale.created_at ? new Date(sale.created_at).getTime() : 0;
    if (!paid && !failed && createdAt > 0 && Date.now() - createdAt > 130_000) {
      const { markSaleTerminalFailure } = await import("@/lib/payments/confirmation.server");
      await markSaleTerminalFailure({
        saleId: data.saleId,
        status: "expired",
        reference: sale.payment_reference,
        reason: "O pedido expirou sem confirmação do PIN.",
        code: "timeout",
      }).catch((error) => console.error("getSaleStatus timeout update error", error));
      return {
        status: "failed" as const,
        accessLink: null,
        error: "O pedido expirou sem confirmação do PIN.",
        failureCode: "timeout",
      };
    }
    const product = sale.products as { access_link?: string | null; delivery_link?: string | null } | null;
    return {
      status: paid ? ("paid" as const) : failed ? ("failed" as const) : ("pending" as const),
      accessLink: paid ? (product?.access_link || product?.delivery_link || null) : null,
      error: failed ? (sale.failure_reason || sale.payment_reference || "Pagamento cancelado ou recusado.") : null,
      failureCode: failed ? (sale.failure_code || null) : null,
    };
  });

export const cancelPayment = createServerFn({ method: "POST" })
  .inputValidator((input) => CancelPaymentInput.parse(input))
  .handler(async ({ data }) => {
    const [{ supabaseAdmin }, { markSaleTerminalFailure }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/payments/confirmation.server"),
    ]);
    const isTimeout = data.reason === "timeout";
    const reason = isTimeout
      ? "O pedido expirou sem confirmação do PIN."
      : "Pagamento cancelado pelo cliente.";
    const code = isTimeout ? "timeout" : "cancelled_by_user";

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { data: sale } = await supabaseAdmin
        .from("sales")
        .select("id, status, payment_reference, failure_reason, failure_code")
        .eq("id", data.saleId)
        .maybeSingle();

      if (!sale) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }

      const raw = String(sale.status ?? "").toLowerCase();
      if (["paid", "approved", "success", "completed"].includes(raw)) {
        return { success: false, error: "Pagamento já confirmado." };
      }
      if (["failed", "error", "cancelled", "canceled", "expired", "refused", "declined"].includes(raw)) {
        return {
          success: true,
          status: "failed" as const,
          error: sale.failure_reason || reason,
          failureCode: sale.failure_code || code,
        };
      }

      await markSaleTerminalFailure({
        saleId: data.saleId,
        status: isTimeout ? "expired" : "failed",
        reference: sale.payment_reference,
        reason,
        code,
      });
      return { success: true, status: "failed" as const, error: reason, failureCode: code };
    }

    return { success: false, error: "Venda não encontrada para cancelar." };
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

type UserCreds = {
  e2p_client_id: string;
  e2p_client_secret: string;
  wallet_mpesa: string | null;
  wallet_emola: string | null;
};

async function loadUserCreds(userId: string): Promise<UserCreds | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_payment_credentials")
    .select("e2p_client_id, e2p_client_secret, wallet_mpesa, wallet_emola")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.e2p_client_id || !data?.e2p_client_secret) return null;
  return {
    e2p_client_id: data.e2p_client_id,
    e2p_client_secret: data.e2p_client_secret,
    wallet_mpesa: data.wallet_mpesa,
    wallet_emola: data.wallet_emola,
  };
}

const tokenCache = new Map<string, { value: string; expiresAt: number }>();
// Deduplica pedidos concorrentes: se 10 clientes pagarem ao mesmo tempo com
// o mesmo vendedor, faz 1 único fetch /oauth/token em vez de 10.
const inflightToken = new Map<string, Promise<string>>();

// Margem de segurança: reusa o token enquanto faltar >2 min pra expirar.
const TOKEN_SAFETY_MARGIN_MS = 2 * 60 * 1000;
// Piso: mesmo que a API devolva expires_in curto/ausente, cacheia 10 min.
const TOKEN_MIN_TTL_MS = 10 * 60 * 1000;
// Teto: nunca confia em token por mais de 55 min (E2Payments emite 1h).
const TOKEN_MAX_TTL_MS = 55 * 60 * 1000;

export function invalidateAccessToken(clientId: string) {
  tokenCache.delete(clientId);
  inflightToken.delete(clientId);
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const cached = tokenCache.get(clientId);
  if (cached && cached.expiresAt > Date.now() + TOKEN_SAFETY_MARGIN_MS) return cached.value;

  const existing = inflightToken.get(clientId);
  if (existing) return existing;

  const promise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(`${E2PAY_BASE_URL}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; NexaPay/1.0)",
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* noop */ }

    if (!res.ok || !json?.access_token) {
      console.error("e2payment token error", { status: res.status, body: text?.slice(0, 500) });
      throw new Error(`Falha ao autenticar com e2payment (HTTP ${res.status}).`);
    }

    // Aplica piso e teto no TTL para blindar contra respostas inconsistentes.
    const rawTtlMs = (Number(json.expires_in) || 3600) * 1000;
    const ttlMs = Math.min(TOKEN_MAX_TTL_MS, Math.max(TOKEN_MIN_TTL_MS, rawTtlMs));
    const value = String(json.access_token);
    tokenCache.set(clientId, { value, expiresAt: Date.now() + ttlMs });
    return value;
  })().finally(() => inflightToken.delete(clientId));

  inflightToken.set(clientId, promise);
  return promise;
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

    const creds = await loadUserCreds(product.user_id);
    if (!creds) {
      return { success: false, error: "O vendedor ainda não configurou a integração de pagamento." };
    }
    const walletId = data.method === "mpesa" ? creds.wallet_mpesa : creds.wallet_emola;
    if (!walletId) {
      return { success: false, error: `Carteira ${data.method.toUpperCase()} não configurada pelo vendedor.` };
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
    const saleId = data.saleId || crypto.randomUUID();
    const reference = paymentReferenceForSale(saleId);
    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .insert({
        id: saleId,
        product_id: product.id,
        user_id: product.user_id,
        customer_name: customerName.slice(0, 100),
        customer_phone: msisdn,
        amount,
        payment_method: data.method,
        payment_reference: reference,
        status: "pending",
        traffic_page_id: finalTrafficPageId,
        idempotency_key: data.idempotencyKey ?? null,
      })
      .select("id")
      .single();
    if (saleError || !sale) {
      if (data.idempotencyKey && String(saleError?.code) === "23505") {
        const { data: existing } = await supabaseAdmin
          .from("sales")
          .select("id, status, failure_reason, payment_reference, products(access_link, delivery_link)")
          .eq("idempotency_key", data.idempotencyKey)
          .maybeSingle();
        if (existing) {
          const raw = String(existing.status ?? "").toLowerCase();
          const paid = ["paid", "approved", "success", "completed"].includes(raw);
          const failed = ["failed", "error", "cancelled", "canceled", "expired", "refused", "declined"].includes(raw);
          const p = existing.products as { access_link?: string | null; delivery_link?: string | null } | null;
          if (failed) return { success: false, saleId: existing.id, error: existing.failure_reason || existing.payment_reference || "Pagamento cancelado ou recusado." };
          return { success: true, saleId: existing.id, transactionId: null, status: paid ? "paid" : "pending", accessLink: paid ? (p?.access_link || p?.delivery_link || null) : null };
        }
      }
      return { success: false, error: "Não foi possível registar a venda." };
    }

    return { success: true, saleId: sale.id, transactionId: null, status: "pending", accessLink: null };
  });

export const chargeSale = createServerFn({ method: "POST" })
  .inputValidator(ChargeInput)
  .handler(async ({ data }): Promise<PaymentResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sale, error: saleErr } = await supabaseAdmin
      .from("sales")
      .select("id, status, amount, payment_method, customer_phone, payment_reference, user_id, products(access_link, delivery_link)")
      .eq("id", data.saleId)
      .maybeSingle();
    if (saleErr || !sale) return { success: false, error: "Venda não encontrada." };
    if (["paid", "approved"].includes(String(sale.status).toLowerCase())) {
      const { confirmSalePayment } = await import("@/lib/payments/confirmation.server");
      await confirmSalePayment({ saleId: sale.id, triggerPushcut: true });
      const p = sale.products as { access_link?: string | null; delivery_link?: string | null } | null;
      return { success: true, saleId: sale.id, transactionId: null, status: "paid", accessLink: p?.access_link || p?.delivery_link || null };
    }

    if (!sale.user_id) return { success: false, saleId: sale.id, error: "Venda sem vendedor associado." };
    const creds = await loadUserCreds(sale.user_id);
    if (!creds) {
      return { success: false, saleId: sale.id, error: "Vendedor sem integração de pagamento configurada." };
    }
    const method = sale.payment_method as "mpesa" | "emola";
    const walletId = method === "mpesa" ? creds.wallet_mpesa : creds.wallet_emola;
    if (!walletId) return { success: false, saleId: sale.id, error: "Carteira não configurada." };

    const {
      confirmSalePayment,
      markSaleTerminalFailure,
      normalizeGatewayStatus,
      readGatewayFailureDetails,
      readGatewayTransactionId,
    } = await import("@/lib/payments/confirmation.server");

    const reference = sale.payment_reference || `PMZ${sale.id.replace(/[^a-zA-Z0-9]/g, "")}`.slice(0, 20);
    const localPhone = String(sale.customer_phone).slice(3);
    const amount = Number(sale.amount);

    try {
      const token = await getAccessToken(creds.e2p_client_id, creds.e2p_client_secret);
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
          "User-Agent": "NexaPay/1.0",
        },
        body: JSON.stringify({
          client_id: creds.e2p_client_id,
          amount: String(amount),
          phone: localPhone,
          reference,
          merchant_name: "NexaPay",
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
        await confirmSalePayment({ saleId: sale.id, transactionId, reference, rawPayload: json, triggerPushcut: true });
        return { success: true, saleId: sale.id, transactionId, status: "paid", accessLink: p?.access_link || p?.delivery_link || null };
      }
      if (finalStatus === "failed" || finalStatus === "expired") {
        const failure = readGatewayFailureDetails(json, finalStatus);
        await markSaleTerminalFailure({ saleId: sale.id, status: finalStatus, transactionId, reference, reason: failure.message, code: failure.code });
        return { success: false, saleId: sale.id, error: failure.message };
      }
      return { success: true, saleId: sale.id, transactionId, status: "pending", accessLink: null };
    } catch (err) {
      console.error("chargeSale error", err);
      const message = "Falha de comunicação com a gateway. Tenta novamente.";
      const { markSaleTerminalFailure } = await import("@/lib/payments/confirmation.server");
      await markSaleTerminalFailure({ saleId: sale.id, status: "failed", reference, reason: message, code: "gateway_unavailable" }).catch((e) => {
        console.error("chargeSale failure update error", e);
      });
      return { success: false, saleId: sale.id, error: message };
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

// Merged fast-path: create sale + trigger gateway in a SINGLE request.
// Eliminates one client→server round-trip so the STK/PIN popup on the
// customer's phone fires as fast as possible.
export const startPayment = createServerFn({ method: "POST" })
  .inputValidator(InitiateInput)
  .handler(async ({ data }): Promise<PaymentResult> => {
    const t0 = Date.now();
    const mark = (label: string) => console.info(`[startPayment] ${label} +${Date.now() - t0}ms`);
    const v = await validateAndLoad(data);
    if (v.error) return { success: false, error: v.error };
    const msisdn = v.msisdn!;
    mark("validate");


    // Parallelize both server-only module imports up-front (each import()
    // on the Worker can add 50-200ms on cold path).
    const [{ supabaseAdmin }, confirmationMod] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/payments/confirmation.server"),
    ]);
    const {
      paymentReferenceForSale,
      confirmSalePayment,
      markSaleTerminalFailure,
      normalizeGatewayStatus,
      readGatewayFailureDetails,
      readGatewayTransactionId,
    } = confirmationMod;
    mark("imports");


    // Idempotency short-circuit
    if (data.idempotencyKey) {
      const { data: existing } = await supabaseAdmin
        .from("sales")
        .select("id, status, payment_reference, failure_reason, products(access_link, delivery_link)")
        .eq("idempotency_key", data.idempotencyKey)
        .maybeSingle();
      if (existing) {
        const raw = String(existing.status ?? "").toLowerCase();
        const paid = ["paid", "approved", "success", "completed"].includes(raw);
        const failed = ["failed", "error", "cancelled", "canceled", "expired", "refused", "declined"].includes(raw);
        const p = existing.products as { access_link?: string | null; delivery_link?: string | null } | null;
        if (paid) return { success: true, saleId: existing.id, transactionId: null, status: "paid", accessLink: p?.access_link || p?.delivery_link || null };
        if (failed) return { success: false, saleId: existing.id, error: existing.failure_reason || existing.payment_reference || "Pagamento cancelado ou recusado." };
        return { success: true, saleId: existing.id, transactionId: null, status: "pending", accessLink: null };
      }
    }

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

    const [productRes, trafficRes] = await Promise.all([
      productQuery.single(),
      data.trafficPageTrackingId
        ? supabaseAdmin
            .from("traffic_pages")
            .select("id")
            .eq("tracking_id", data.trafficPageTrackingId)
            .maybeSingle()
        : Promise.resolve({ data: null as { id?: string } | null }),
    ]);
    const product = productRes.data;
    if (productRes.error || !product) return { success: false, error: "Produto não encontrado." };
    if (product.status && product.status !== "active") {
      return { success: false, error: "Produto indisponível para compra." };
    }
    mark("product");


    const creds = await loadUserCreds(product.user_id);
    if (!creds) return { success: false, error: "O vendedor ainda não configurou a integração de pagamento." };
    const walletId = data.method === "mpesa" ? creds.wallet_mpesa : creds.wallet_emola;
    if (!walletId) return { success: false, error: `Carteira ${data.method.toUpperCase()} não configurada.` };
    mark("creds");


    const amount = Number(product.price);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 500_000) {
      return { success: false, error: "Valor do produto inválido." };
    }
    const customerName = data.contactPhone
      ? `${data.customerName.trim()} (contacto: ${data.contactPhone.trim()})`
      : data.customerName.trim();

    const saleId = data.saleId || crypto.randomUUID();
    const reference = paymentReferenceForSale(saleId);

    // Insert sale with the final gateway reference + preload OAuth token in parallel.
    // This removes the old insert→update race where a fast webhook could arrive
    // before `payment_reference` existed, leaving checkout stuck in processing.
    const [saleRes, tokenResult] = await Promise.all([
      supabaseAdmin
        .from("sales")
        .insert({
          id: saleId,
          product_id: product.id,
          user_id: product.user_id,
          customer_name: customerName.slice(0, 100),
          customer_phone: msisdn,
          amount,
          payment_method: data.method,
          payment_reference: reference,
          status: "pending",
          traffic_page_id: (trafficRes.data as { id?: string } | null)?.id ?? null,
          idempotency_key: data.idempotencyKey ?? null,
        })
        .select("id")
        .single(),
      getAccessToken(creds.e2p_client_id, creds.e2p_client_secret).catch((e) => e as Error),
    ]);
    if (saleRes.error || !saleRes.data) {
      if (data.idempotencyKey && String(saleRes.error?.code) === "23505") {
        const { data: existing } = await supabaseAdmin
          .from("sales")
          .select("id, status, payment_reference, failure_reason, products(access_link, delivery_link)")
          .eq("idempotency_key", data.idempotencyKey)
          .maybeSingle();
        if (existing) {
          const raw = String(existing.status ?? "").toLowerCase();
          const paid = ["paid", "approved", "success", "completed"].includes(raw);
          const failed = ["failed", "error", "cancelled", "canceled", "expired", "refused", "declined"].includes(raw);
          const p = existing.products as { access_link?: string | null; delivery_link?: string | null } | null;
          if (failed) return { success: false, saleId: existing.id, error: existing.failure_reason || existing.payment_reference || "Pagamento cancelado ou recusado." };
          return { success: true, saleId: existing.id, transactionId: null, status: paid ? "paid" : "pending", accessLink: paid ? (p?.access_link || p?.delivery_link || null) : null };
        }
      }
      return { success: false, error: "Não foi possível registar a venda." };
    }
    if (tokenResult instanceof Error) {
      await markSaleTerminalFailure({
        saleId,
        status: "failed",
        reference,
        reason: "Falha ao autenticar com a gateway. Tenta novamente.",
        code: "gateway_auth_error",
      }).catch((e) => console.error("startPayment token failure update error", e));
      return { success: false, saleId, error: "Falha ao autenticar com a gateway. Tenta novamente." };
    }
    const token = tokenResult;
    mark("sale+token");


    const localPhone = msisdn.slice(3);
    const endpoint =
      data.method === "mpesa"
        ? `${E2PAY_BASE_URL}/v1/c2b/mpesa-payment/${walletId}`
        : `${E2PAY_BASE_URL}/v1/c2b/emola-payment/${walletId}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 75_000);

    // Fire the gateway request immediately. The checkout response returns in
    // ~2.5s with saleId so the browser can poll status, while this promise keeps
    // running in the worker background until e2payment closes paid/cancelled.
    const gatewayPromise: Promise<GatewayCallResult> = fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "NexaPay/1.0",
      },
      body: JSON.stringify({
        client_id: creds.e2p_client_id,
        amount: String(amount),
        phone: localPhone,
        reference,
        merchant_name: "NexaPay",
        description: "Pagamento de produto digital",
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const text = await res.text();
        let json: Record<string, unknown> | null = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        return { ok: res.ok, status: res.status, json, text };
      })
      .finally(() => clearTimeout(timeoutId));

    const processGateway = gatewayPromise
      .then(async ({ ok, status, json, text }) => {
        console.info("e2payment response", { status, method: data.method, reference, body: text?.slice(0, 400) });
        const transactionId = readGatewayTransactionId(json);
        const finalStatus = normalizeGatewayStatus(json, ok);
        if (finalStatus === "paid") {
          await confirmSalePayment({ saleId, transactionId, reference, rawPayload: json, triggerPushcut: true });
        } else if (finalStatus === "failed" || finalStatus === "expired") {
          const failure = readGatewayFailureDetails(json, finalStatus);
          await markSaleTerminalFailure({ saleId, status: finalStatus, transactionId, reference, reason: failure.message, code: failure.code });
        }
        return { finalStatus, transactionId, json };
      })
      .catch(async (err) => {
        console.error("startPayment gateway error", err);
        const isAbort = err instanceof Error && err.name === "AbortError";
        const message = isAbort
          ? "Tempo expirado sem confirmação no telefone."
          : "Falha de comunicação com a gateway. Tenta novamente.";
        await markSaleTerminalFailure({
          saleId,
          status: "failed",
          reference,
          reason: message,
          code: isAbort ? "timeout" : "gateway_unavailable",
        }).catch((e) => console.error("startPayment failure update error", e));
        return {
          finalStatus: "failed" as const,
          transactionId: null,
          json: { message, code: isAbort ? "timeout" : "gateway_unavailable" },
        };
      });

    const { waitUntil } = await import("@/lib/runtime-context.server");
    const backgroundTask = processGateway
      .then((result) => {
        mark(`gateway (finalStatus=${result.finalStatus})`);
        return result;
      })
      .catch((error) => {
        console.error("startPayment background gateway error", error);
      });
    if (!waitUntil(backgroundTask)) void backgroundTask;

    // Fast path: só espera ~800ms pra capturar erros imediatos do gateway
    // (wallet inválida, credenciais). Se o gateway aceitou o request e está
    // aguardando o PIN, retornamos "pending" na hora — o STK push já foi
    // disparado no telefone. O processGateway continua no waitUntil() e
    // atualiza a venda quando e2payment fechar.
    const fastResult = await Promise.race([
      processGateway,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
    ]);
    mark(`fastResult (${fastResult ? fastResult.finalStatus : "pending"})`);


    const accessLink = product.access_link || product.delivery_link || null;
    if (fastResult?.finalStatus === "paid") {
      return { success: true, saleId, transactionId: fastResult.transactionId, status: "paid", accessLink };
    }
    if (fastResult && (fastResult.finalStatus === "failed" || fastResult.finalStatus === "expired")) {
      const failure = readGatewayFailureDetails(fastResult.json, fastResult.finalStatus);
      return { success: false, saleId, error: failure.message };
    }
    // Return the sale id quickly so the checkout can poll status immediately.
    // The gateway request continues in the worker background and updates the
    // sale to paid/failed as soon as e2payment returns the real outcome.
    return { success: true, saleId, transactionId: null, status: "pending", accessLink: null };
  });

