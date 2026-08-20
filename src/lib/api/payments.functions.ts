import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getE2payBaseUrl,
  orderedE2payHosts,
  setE2payBaseUrl,
} from "@/lib/payments/e2pay-hosts";


const PaymentInput = z.object({
  productId: z.string().min(1).max(120),
  method: z.enum(["mpesa", "emola", "card", "eft", "bank_transfer"]),
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

// Códigos de falha que representam cancelamento explícito do cliente.
const CANCELLED_FAILURE_CODES = new Set([
  "cancelled_by_user",
  "canceled_by_user",
  "customer_cancelled",
  "customer_canceled",
  "user_cancelled",
  "user_canceled",
  "cancelled",
  "canceled",
  "rejected",
  "refused",
]);

export const getSaleStatus = createServerFn({ method: "GET" })
  .inputValidator((input) => PaymentSuccessInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sale } = await supabaseAdmin
      .from("sales")
      .select("id, status, created_at, user_id, payment_method, transaction_id, payment_reference, failure_reason, failure_code, country, currency, products(access_link, delivery_link)")
      .eq("id", data.saleId)
      .maybeSingle();
    if (!sale) return { status: "not_found" as const, accessLink: null, error: null };
    let raw = String(sale.status ?? "").toLowerCase();
    let paid = ["paid", "approved", "success", "completed"].includes(raw);
    let failed = ["failed", "error", "cancelled", "canceled", "expired", "refused", "declined"].includes(raw);
    if (!paid && !failed) {
      const { reconcilePendingSale } = await import("@/lib/payments/reconciliation.server");
      // Limite de 2,5s: se a gateway estiver lenta, devolvemos o estado atual
      // e o próximo tick (1s depois) lê o resultado já gravado — em vez de
      // segurar a resposta e atrasar a deteção do cancelamento.
      const reconcileTask = reconcilePendingSale(sale).catch(() => null);
      await Promise.race([
        reconcileTask,
        new Promise((resolve) => setTimeout(resolve, 2_500)),
      ]);
      // CAUSA RAIZ da dessincronização: a leitura acima é feita ANTES da
      // reconciliação (que pode demorar segundos a falar com a E2Payments).
      // Nesse intervalo o webhook/gateway em background já pode ter gravado
      // `paid` — mas o handler devolvia o snapshot antigo (`pending`).
      // Solução: reler SEMPRE o estado real depois da reconciliação,
      // independentemente do que ela devolveu.
      const { data: refreshed } = await supabaseAdmin
        .from("sales")
        .select("status, failure_reason, failure_code")
        .eq("id", data.saleId)
        .maybeSingle();
      if (refreshed) {
        sale.status = refreshed.status;
        sale.failure_reason = refreshed.failure_reason;
        sale.failure_code = refreshed.failure_code;
        raw = String(refreshed.status ?? "").toLowerCase();
        paid = ["paid", "approved", "success", "completed"].includes(raw);
        failed = ["failed", "error", "cancelled", "canceled", "expired", "refused", "declined"].includes(raw);
      }
    }

    const createdAt = sale.created_at ? new Date(sale.created_at).getTime() : 0;
    // Só marcamos expirado após 5min sem sinal do gateway (mesmo cutoff do
    // sweep). O usuário pode demorar >2min pra digitar o PIN — cortar aos
    // 130s cancela vendas que ainda iam ser aprovadas, impedindo o disparo
    // da notificação de "venda aprovada".
    const { PAYMENT_WAIT_WINDOW_MS } = await import("@/lib/payments/timing");
    if (!paid && !failed && createdAt > 0 && Date.now() - createdAt > PAYMENT_WAIT_WINDOW_MS) {
      const { markSaleTerminalFailure } = await import("@/lib/payments/confirmation.server");
      await markSaleTerminalFailure({
        saleId: data.saleId,
        status: "expired",
        reference: sale.payment_reference,
        reason: "O pedido expirou sem confirmação do PIN.",
        code: "timeout",
      }).catch((error) => console.error("getSaleStatus timeout update error", error));
      return {
        status: "expired" as const,
        accessLink: null,
        error: "O tempo para confirmar o pagamento terminou.",
        failureCode: "timeout",
      };
    }

    // PostgREST pode devolver `products` como objeto OU array dependendo
    // da inferência de cardinalidade. Normalizamos para os dois casos para
    // garantir que o access_link seja SEMPRE resolvido em vendas pagas.
    const rawProducts = sale.products as
      | { access_link?: string | null; delivery_link?: string | null }
      | Array<{ access_link?: string | null; delivery_link?: string | null }>
      | null;
    const product = Array.isArray(rawProducts) ? rawProducts[0] ?? null : rawProducts;
    const accessLink = paid ? (product?.access_link || product?.delivery_link || null) : null;
    if (paid) {
      console.info("[getSaleStatus] paid resolved", { saleId: data.saleId, hasAccessLink: !!accessLink });
      // Não re-executamos efeitos de confirmação aqui: a venda já está `paid`
      // e os side-effects (notificações, webhooks, Pushcut) foram disparados
      // no momento da transição para pago (startPayment/chargeSale/webhook).
      // Recuperação idempotente continua a acontecer em /payment-success e
      // no webhook — repetir a cada tick só gera inserts e logs desnecessários.
    }
    // Estado terminal específico devolvido ao checkout: "cancelled" (cliente
    // cancelou/recusou), "failed" (recusa da operadora) ou "expired" (tempo
    // esgotado). O frontend usa isso para escolher a mensagem correta.
    const terminalKind: "cancelled" | "expired" | "failed" = ["cancelled", "canceled", "refused", "rejected"].includes(raw)
      ? "cancelled"
      : raw === "expired"
        ? "expired"
        : ["timeout", "expired"].includes(String(sale.failure_code ?? "").toLowerCase())
          ? "expired"
          : CANCELLED_FAILURE_CODES.has(String(sale.failure_code ?? "").toLowerCase())
            ? "cancelled"
            : "failed";
    const { getPaymentJustification } = await import("@/lib/payments/confirmation.server");
    return {
      status: paid ? ("paid" as const) : failed ? terminalKind : ("pending" as const),
      accessLink,
      error: failed
        ? getPaymentJustification(sale.failure_code, sale.failure_reason || "Pagamento cancelado ou recusado.")
        : null,
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

      const outcome = await markSaleTerminalFailure({
        saleId: data.saleId,
        status: isTimeout ? "expired" : "cancelled",
        reference: sale.payment_reference,
        reason,
        code,
      });
      // Race: entre o SELECT acima e o UPDATE, o webhook da E2Payments pode
      // ter confirmado o pagamento. A guarda de idempotência em
      // markSaleTerminalFailure bloqueia o update (becameFailed=false) mas
      // NÃO devemos devolver "failed" nesse caso — isso levaria o frontend
      // a invalidar o paymentRunRef e cancelar o redirect da venda aprovada.
      if (!outcome.becameFailed) {
        const { data: after } = await supabaseAdmin
          .from("sales")
          .select("status")
          .eq("id", data.saleId)
          .maybeSingle();
        const rawAfter = String(after?.status ?? "").toLowerCase();
        if (["paid", "approved", "success", "completed"].includes(rawAfter)) {
          return { success: false, error: "Pagamento já confirmado." };
        }
      }
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
    const rawProducts = sale.products as
      | {
          access_link?: string | null;
          delivery_link?: string | null;
          support_phone?: string | null;
          support_number?: string | null;
          thank_you_button_text?: string | null;
        }
      | Array<{
          access_link?: string | null;
          delivery_link?: string | null;
          support_phone?: string | null;
          support_number?: string | null;
          thank_you_button_text?: string | null;
        }>
      | null;
    const product = Array.isArray(rawProducts) ? rawProducts[0] ?? null : rawProducts;

    if (isPaid) {
      const { confirmSalePayment } = await import("@/lib/payments/confirmation.server");
      const sideEffectsTask = confirmSalePayment({ saleId: data.saleId, triggerPushcut: true }).catch((error) =>
        console.error("payment-success paid side-effects recovery error", error),
      );
      const { waitUntil } = await import("@/lib/runtime-context.server");
      if (!waitUntil(sideEffectsTask)) void sideEffectsTask;
    }

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

// Normaliza um número moçambicano para o formato exigido pela E2Payments: 258XXXXXXXXX.
// Aceita as variações comuns que o cliente digita — com espaços, hífens,
// parênteses, prefixo +258, prefixo 258, prefixo internacional 00258, zero
// à esquerda (0258...) e até duplicação acidental do país (258258...).
// Nunca invente dígitos: se sobrar algo fora do padrão, devolve como está
// para que a validação a jusante rejeite.
function normalizeMozambicanPhone(value: string) {
  let digits = (value ?? "").replace(/\D/g, "");
  // Prefixo internacional "00" (ex: 00258...) → remove.
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Zeros à esquerda antes do país (ex: 0258...) → remove.
  digits = digits.replace(/^0+/, "");
  // País duplicado por engano (ex: 258258841234567) NÃO é colapsado:
  // deixamos cair na validação para o cliente corrigir o número real.

  // Já veio no formato final 258XXXXXXXXX.
  if (digits.startsWith("258") && digits.length === 12) return digits;
  // Local de 9 dígitos → antepõe o país.
  if (digits.length === 9) return `258${digits}`;
  // Formato antigo com 0 à frente do local (ex: 0841234567).
  if (digits.length === 10 && digits.startsWith("0")) return `258${digits.slice(1)}`;
  return digits;
}


type UserCreds = {
  e2p_client_id: string;
  e2p_client_secret: string;
  wallet_mpesa: string | null;
  wallet_emola: string | null;
};

async function loadUserCreds(userId: string): Promise<UserCreds & { wallet_za?: string | null; debitopay_za_webhook_secret?: string | null } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_payment_credentials")
    .select("e2p_client_id, e2p_client_secret, wallet_mpesa, wallet_emola, wallet_za, debitopay_za_webhook_secret")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.e2p_client_id || !data?.e2p_client_secret) return null;
  return {
    e2p_client_id: data.e2p_client_id,
    e2p_client_secret: data.e2p_client_secret,
    wallet_mpesa: data.wallet_mpesa,
    wallet_emola: data.wallet_emola,
    wallet_za: data.wallet_za,
    debitopay_za_webhook_secret: data.debitopay_za_webhook_secret,
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

import { invalidateAccessToken as invalidateAccessTokenInternal } from "@/lib/payments/confirmation.server";

export function invalidateAccessToken(clientId: string) {
  tokenCache.delete(clientId);
  inflightToken.delete(clientId);
  invalidateAccessTokenInternal(clientId);
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const cached = tokenCache.get(clientId);
  if (cached && cached.expiresAt > Date.now() + TOKEN_SAFETY_MARGIN_MS) return cached.value;

  const existing = inflightToken.get(clientId);
  if (existing) return existing;

  const promise = (async () => {
    // Tenta até 3 vezes com backoff curto. A e2payment ocasionalmente devolve
    // 5xx/timeout transitório no /oauth/token — sem retry o cliente vê logo
    // "Falha ao autenticar com a gateway" e a venda é marcada como falhada.
    // Cada tentativa percorre os domínios suportados (legado + mpesaemolatech).
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      for (const baseUrl of orderedE2payHosts(clientId)) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15_000);
        try {
          const res = await fetch(`${baseUrl}/oauth/token`, {
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
          });
          const text = await res.text();
          let json: Record<string, unknown> | null = null;
          try { json = text ? JSON.parse(text) : null; } catch { /* noop */ }

          if (res.ok && json?.access_token) {
            const rawTtlMs = (Number(json.expires_in) || 3600) * 1000;
            const ttlMs = Math.min(TOKEN_MAX_TTL_MS, Math.max(TOKEN_MIN_TTL_MS, rawTtlMs));
            const value = String(json.access_token);
            setE2payBaseUrl(clientId, baseUrl);
            tokenCache.set(clientId, { value, expiresAt: Date.now() + ttlMs });
            return value;
          }

          console.error("e2payment token error", { attempt, baseUrl, status: res.status, body: text?.slice(0, 500) });
          // 4xx (credenciais inválidas/host errado): não vale retry neste host,
          // mas o próximo domínio ainda pode aceitar as mesmas credenciais.
          lastErr = new Error(`Falha ao autenticar com e2payment (HTTP ${res.status}).`);
        } catch (err) {
          lastErr = err;
          console.warn("e2payment token attempt failed", { attempt, baseUrl, err: err instanceof Error ? err.message : String(err) });
        } finally {
          clearTimeout(timeoutId);
        }
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
    }
    throw lastErr instanceof Error ? lastErr : new Error("Falha ao autenticar com e2payment.");

  })().finally(() => inflightToken.delete(clientId));


  inflightToken.set(clientId, promise);
  return promise;
}

const InitiateInput = PaymentInput;
const ChargeInput = z.object({ saleId: z.string().uuid() });

export const prewarmPaymentGateway = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ productId: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          data.productId,
        );
      let productQuery = supabaseAdmin.from("products").select("id, user_id, status");
      productQuery = isUuid
        ? productQuery.eq("id", data.productId)
        : productQuery.eq("custom_url", data.productId);
      const { data: product } = await productQuery.maybeSingle();
      if (!product || (product.status && product.status !== "active")) return { ok: false };
      const creds = await loadUserCreds(product.user_id);
      if (!creds) return { ok: false };
      await Promise.race([
        getAccessToken(creds.e2p_client_id, creds.e2p_client_secret),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_500)),
      ]);
      return { ok: true };
    } catch (error) {
      console.warn("prewarmPaymentGateway failed", error instanceof Error ? error.message : String(error));
      return { ok: false };
    }
  });

async function validateAndLoad(data: z.infer<typeof PaymentInput>, product: any) {
  const isZa = product.country === "ZA" || product.currency === "ZAR";
  
  if (isZa) {
    // Para ZA, o número de telefone pode ser +27 ou 0 seguido de 9 dígitos.
    // Vamos apenas garantir que tenha dígitos.
    const digits = data.msisdn.replace(/\D/g, "");
    if (digits.length < 9) {
      return { error: "Número de telefone inválido para a África do Sul." };
    }
    return { msisdn: data.msisdn };
  }

  const msisdn = normalizeMozambicanPhone(data.msisdn);
  // Formato final exigido pela E2Payments: 258 + 9 dígitos, começando por 84/85/86/87.
  if (!/^258(84|85|86|87)\d{7}$/.test(msisdn)) {
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        data.productId,
      );
    let productQuery = supabaseAdmin
      .from("products")
      .select("id, price, status, user_id, country, currency, access_link, delivery_link");
    productQuery = isUuid
      ? productQuery.eq("id", data.productId)
      : productQuery.eq("custom_url", data.productId);
      
    const { data: product } = await productQuery.single();
    if (!product) return { success: false, error: "Produto não encontrado." };

    const v = await validateAndLoad(data, product);
    if (v.error) return { success: false, error: v.error };
    const msisdn = v.msisdn!;

    if (product.status && product.status !== "active") {
      return { success: false, error: "Produto indisponível para compra." };
    }

    const creds = await loadUserCreds(product.user_id);
    if (!creds) {
      return { success: false, error: "O vendedor ainda não configurou a integração de pagamento." };
    }
    const isZa = product.country === "ZA" || product.currency === "ZAR";
    const walletId = isZa 
      ? creds.wallet_za 
      : (data.method === "mpesa" ? creds.wallet_mpesa : creds.wallet_emola);
      
    if (!walletId) {
      const methodLabel = isZa ? "ZAR (África do Sul)" : data.method.toUpperCase();
      return { success: false, error: `Carteira ${methodLabel} não configurada pelo vendedor.` };
    }

    const amount = Number(product.price);
    const isZa = product.country === "ZA" || product.currency === "ZAR";
    
    if (isZa && amount < 5) {
      return { success: false, error: "O valor mínimo para pagamento é R5." };
    }

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
      .select("id, status, amount, payment_method, customer_phone, payment_reference, user_id, country, currency, products(access_link, delivery_link)")
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
    const paymentMethod = sale.payment_method;
    const isZa = sale.country === "ZA" || sale.currency === "ZAR";
    const walletId = isZa 
      ? creds.wallet_za 
      : (paymentMethod === "mpesa" ? creds.wallet_mpesa : creds.wallet_emola);

    if (!walletId) return { success: false, saleId: sale.id, error: "Carteira não configurada." };

    const {
      confirmSalePayment,
      markSaleTerminalFailure,
      normalizeGatewayStatus,
      readGatewayFailureDetails,
      readGatewayTransactionId,
      saveGatewayIdentifiers,
    } = await import("@/lib/payments/confirmation.server");

    const reference = sale.payment_reference || `PMZ${sale.id.replace(/[^a-zA-Z0-9]/g, "")}`.slice(0, 20);
    const localPhone = isZa ? sale.customer_phone : String(sale.customer_phone).slice(3);
    const amount = Number(sale.amount);

    try {
      let res: Response;
      
      if (isZa) {
        const { initiateDebitoPayPayment } = await import("./debitopay.server");
        const auth = { apiKey: creds.e2p_client_id, environment: "live" as const };
        const debitoRes = await initiateDebitoPayPayment(auth, {
          merchant_id: (creds as any).debitopay_merchant_id,
          wallet_code: walletId,
          amount,
          currency: "ZAR",
          customer_email: "cliente@nexapay.io", // Placeholder for serverFn
          customer_name: sale.customer_name || "Cliente",
          customer_phone: sale.customer_phone,
          return_url: `${process.env.VITE_SITE_URL || "https://nexapayio.com"}/payment-success?saleId=${sale.id}`,
        });
        
        res = {
          ok: debitoRes.ok,
          status: debitoRes.status,
          text: () => Promise.resolve(JSON.stringify(debitoRes.data)),
          json: () => Promise.resolve(debitoRes.data),
        } as Response;
      } else {
        const token = await getAccessToken(creds.e2p_client_id, creds.e2p_client_secret);
        const controller = new AbortController();
        const { PAYMENT_WAIT_WINDOW_MS } = await import("@/lib/payments/timing");
        const timeoutId = setTimeout(() => controller.abort(), PAYMENT_WAIT_WINDOW_MS);
        const endpoint = paymentMethod === "mpesa"
            ? `${getE2payBaseUrl(creds.e2p_client_id)}/v1/c2b/mpesa-payment/${walletId}`
            : `${getE2payBaseUrl(creds.e2p_client_id)}/v1/c2b/emola-payment/${walletId}`;

        res = await fetch(endpoint, {
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
      }

      const text = await res.text();
      let json: Record<string, unknown> | null = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
      console.info("e2payment response", { status: res.status, paymentMethod, reference, body: text?.slice(0, 800) });

      const transactionId = readGatewayTransactionId(json);
      const finalStatus = normalizeGatewayStatus(json, res.ok, res.status);
      const p = sale.products as { access_link?: string | null; delivery_link?: string | null } | null;

      // Se a Débito Pay devolver checkout_url, temos de a passar ao frontend
      const checkoutUrl = (json as any)?.checkout_url;

      if (finalStatus === "paid") {
        await confirmSalePayment({ saleId: sale.id, transactionId, reference, rawPayload: json, triggerPushcut: true });
        return { success: true, saleId: sale.id, transactionId, status: "paid", accessLink: p?.access_link || p?.delivery_link || null };
      }
      if (checkoutUrl && finalStatus === "pending") {
         return { success: true, saleId: sale.id, transactionId, status: "pending", accessLink: checkoutUrl }; 
      }
      if (finalStatus === "failed" || finalStatus === "expired" || finalStatus === "cancelled") {
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
    
    // Precisamos carregar o produto antes de validar o telefone
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        data.productId,
      );
    let productQuery = supabaseAdmin
      .from("products")
      .select("id, price, status, user_id, country, currency, access_link, delivery_link");
    productQuery = isUuid
      ? productQuery.eq("id", data.productId)
      : productQuery.eq("custom_url", data.productId);

    const { data: product } = await productQuery.single();
    if (!product) return { success: false, error: "Produto não encontrado." };

    const v = await validateAndLoad(data, product);
    if (v.error) return { success: false, error: v.error };
    const msisdn = v.msisdn!;
    mark("validate");


    // Parallelize both server-only module imports up-front (each import()
    // on the Worker can add 50-200ms on cold path).
    const [serverClient, confirmationMod] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/payments/confirmation.server"),
    ]);
    const { supabaseAdmin: _admin } = serverClient;
    const {
      paymentReferenceForSale,
      confirmSalePayment,
      markSaleTerminalFailure,
      normalizeGatewayStatus,
      readGatewayFailureDetails,
      readGatewayTransactionId,
      saveGatewayIdentifiers,
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

    // Produto já carregado acima
    const [trafficRes] = await Promise.all([
      data.trafficPageTrackingId
        ? supabaseAdmin
            .from("traffic_pages")
            .select("id")
            .eq("tracking_id", data.trafficPageTrackingId)
            .maybeSingle()
        : Promise.resolve({ data: null as { id?: string } | null }),
    ]);
    
    if (product.status && product.status !== "active") {
      return { success: false, error: "Produto indisponível para compra." };
    }
    mark("product");


    const creds = await loadUserCreds(product.user_id);
    if (!creds) return { success: false, error: "O vendedor ainda não configurou a integração de pagamento." };
    const isZa = product.country === "ZA" || product.currency === "ZAR";
    const walletId = isZa 
      ? creds.wallet_za 
      : (data.method === "mpesa" ? creds.wallet_mpesa : creds.wallet_emola);

    if (!walletId) return { success: false, error: `Carteira ${isZa ? "ZAR" : data.method.toUpperCase()} não configurada.` };
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
    const tokenPromise = isZa 
      ? Promise.resolve("ZA_DIRECT_KEY") 
      : getAccessToken(creds.e2p_client_id, creds.e2p_client_secret).catch((e) => e as Error);
    const saleRes = await supabaseAdmin
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
      .single();
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
    const tokenResult = await tokenPromise;
    if (tokenResult instanceof Error) {
      // NÃO falha a venda nem mostra erro ao cliente. Mantém "pending" e agenda
      // retry em background: busca token novo (com backoff) e dispara a gateway.
      // O cliente continua vendo o pop-up de PIN e o polling em getSaleStatus
      // recebe o resultado final quando a gateway responder.
      console.warn("startPayment token error — deferring to background retry", {
        saleId,
        err: tokenResult.message,
      });
      const { waitUntil } = await import("@/lib/runtime-context.server");
      const bgTask = (async () => {
        for (let attempt = 1; attempt <= 4; attempt++) {
          await new Promise((r) => setTimeout(r, 800 * attempt));
          try {
            invalidateAccessToken(creds.e2p_client_id);
            const token = await getAccessToken(creds.e2p_client_id, creds.e2p_client_secret);
            const localPhone = msisdn.slice(3);
            const endpoint =
              data.method === "mpesa"
                ? `${getE2payBaseUrl(creds.e2p_client_id)}/v1/c2b/mpesa-payment/${walletId}`
                : `${getE2payBaseUrl(creds.e2p_client_id)}/v1/c2b/emola-payment/${walletId}`;
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 240_000);
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
              signal: ctrl.signal,
            }).finally(() => clearTimeout(t));
            const text = await res.text();
            let json: Record<string, unknown> | null = null;
            try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
            const transactionId = readGatewayTransactionId(json);
            const finalStatus = normalizeGatewayStatus(json, res.ok, res.status);
            await saveGatewayIdentifiers({ saleId, transactionId, reference });
            if (finalStatus === "paid") {
              await confirmSalePayment({ saleId, transactionId, reference, rawPayload: json, triggerPushcut: true });
            } else if (finalStatus === "failed" || finalStatus === "expired" || finalStatus === "cancelled") {
              const failure = readGatewayFailureDetails(json, finalStatus);
              await markSaleTerminalFailure({ saleId, status: finalStatus, transactionId, reference, reason: failure.message, code: failure.code });
            }
            return;
          } catch (e) {
            console.warn("startPayment background retry failed", { attempt, err: e instanceof Error ? e.message : String(e) });
          }
        }
      })();
      const scheduled = waitUntil(bgTask.catch(() => {}));
      if (!scheduled) bgTask.catch(() => {});


      return { success: true, saleId, transactionId: null, status: "pending", accessLink: null };
    }
    const token = tokenResult;
    mark("sale+token");



    const localPhone = msisdn.slice(3);
    const endpoint =
      data.method === "mpesa"
        ? `${getE2payBaseUrl(creds.e2p_client_id)}/v1/c2b/mpesa-payment/${walletId}`
        : `${getE2payBaseUrl(creds.e2p_client_id)}/v1/c2b/emola-payment/${walletId}`;

    const controller = new AbortController();

    const { PAYMENT_WAIT_WINDOW_MS } = await import("@/lib/payments/timing");

    const timeoutId = setTimeout(() => controller.abort(), PAYMENT_WAIT_WINDOW_MS);

    /*
     * O pedido à gateway começa imediatamente.
     * O checkout não precisa ficar bloqueado durante toda a espera pelo PIN.
     */
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
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = { raw: text };
        }
        return { ok: res.ok, status: res.status, json, text };
      })
      .finally(() => clearTimeout(timeoutId));

    /*
     * Esta promise interpreta a resposta final da gateway e actualiza
     * a venda no Supabase.
     */
    const processGateway = gatewayPromise
      .then(async ({ ok, status, json, text }) => {
        console.info("e2payment response", {
          status,
          method: data.method,
          reference,
          body: text?.slice(0, 400),
        });

        if (status === 401 || status === 403) {
          invalidateAccessToken(creds.e2p_client_id);
        }

        const transactionId = readGatewayTransactionId(json);
        const finalStatus = normalizeGatewayStatus(json, ok, status);
        await saveGatewayIdentifiers({ saleId, transactionId, reference });

        // Log temporário de diagnóstico de cancelamento (sem tokens/segredos).
        const dbg = (json ?? {}) as Record<string, unknown>;
        const dbgData = (dbg.data && typeof dbg.data === "object" ? dbg.data : {}) as Record<string, unknown>;
        console.info("[payment-cancellation-debug]", {
          saleId,
          httpStatus: status,
          normalizedStatus: finalStatus,
          transactionId,
          gatewayStatus: dbg.status ?? dbg.payment_status ?? dbgData.status ?? null,
          gatewayCode: dbg.code ?? dbg.response_code ?? dbgData.code ?? null,
          gatewayMessage: String(dbg.message ?? dbg.error ?? dbgData.message ?? "").slice(0, 200) || null,
        });


        if (finalStatus === "paid") {
          await confirmSalePayment({
            saleId,
            transactionId,
            reference,
            rawPayload: json,
            triggerPushcut: true,
          });
        } else if (finalStatus === "failed" || finalStatus === "expired" || finalStatus === "cancelled") {
          const failure = readGatewayFailureDetails(json, finalStatus);
          await markSaleTerminalFailure({
            saleId,
            status: finalStatus,
            transactionId,
            reference,
            reason: failure.message,
            code: failure.code,
          });
        }

        return { finalStatus, transactionId, json };
      })
      .catch(async (err) => {
        console.error("startPayment gateway error", err);

        const isAbort = err instanceof Error && err.name === "AbortError";
        const message = isAbort
          ? "A solicitação de pagamento expirou antes da confirmação."
          : "Não foi possível comunicar com o serviço de pagamento.";

        await markSaleTerminalFailure({
          saleId,
          status: isAbort ? "expired" : "failed",
          reference,
          reason: message,
          code: isAbort ? "timeout" : "gateway_unavailable",
        }).catch((error) => {
          console.error("startPayment failure update error", error);
        });

        return {
          finalStatus: isAbort ? ("expired" as const) : ("failed" as const),
          transactionId: null,
          json: { message, code: isAbort ? "timeout" : "gateway_unavailable" },
        };
      });

    /*
     * Espera somente 1,5 segundo para capturar respostas imediatas.
     * Se a gateway continuar à espera do PIN, devolve pending rapidamente.
     */
    const immediateResult = await Promise.race([
      processGateway,
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 1_500);
      }),
    ]);

    /*
     * Mantém o processamento da gateway activo depois de o checkout
     * receber o saleId.
     */
    const { waitUntil } = await import("@/lib/runtime-context.server");

    const backgroundTask = processGateway.catch((error) => {
      console.error("startPayment background processing error", error);
    });

    const scheduled = waitUntil(backgroundTask);
    if (!scheduled) {
      void backgroundTask;
    }

    const accessLink = product.access_link || product.delivery_link || null;

    if (immediateResult?.finalStatus === "paid") {
      mark("returned paid");
      return {
        success: true,
        saleId,
        transactionId: immediateResult.transactionId,
        status: "paid",
        accessLink,
      };
    }

    if (
      immediateResult?.finalStatus === "failed" ||
      immediateResult?.finalStatus === "expired"
    ) {
      const failure = readGatewayFailureDetails(
        immediateResult.json,
        immediateResult.finalStatus,
      );
      return { success: false, saleId, error: failure.message };
    }

    /*
     * A gateway ainda está à espera do PIN.
     * O checkout recebe o saleId e começa a consultar getSaleStatus.
     */
    mark("returned pending");

    return {
      success: true,
      saleId,
      transactionId: null,
      status: "pending",
      accessLink: null,
    };
  });



