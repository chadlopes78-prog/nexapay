import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PAID_STATUSES = new Set([
  "success",
  "successful",
  "paid",
  "completed",
  "complete",
  "approved",
  "confirmed",
  "processed",
]);
const FAILED_STATUSES = new Set([
  "failed",
  "failure",
  "error",
  "cancelled",
  "canceled",
  "rejected",
  "refused",
  "declined",
  "denied",
]);
const EXPIRED_STATUSES = new Set(["expired", "timeout", "timed_out"]);

export type NormalizedPaymentStatus = "paid" | "failed" | "expired" | "pending";

type GatewayPayload = Record<string, unknown>;
export type GatewayFailureDetails = {
  code: string;
  message: string;
  rawMessage: string | null;
};

type SaleForConfirmation = {
  id: string;
  status?: string | null;
  user_id?: string | null;
  product_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  amount?: number | string | null;
  payment_method?: string | null;
  transaction_id?: string | null;
  payment_reference?: string | null;
  failure_reason?: string | null;
  failure_code?: string | null;
  traffic_page_id?: string | null;
  products?: { name?: string | null } | null;
};

function asObject(value: unknown): GatewayPayload {
  return value && typeof value === "object" ? (value as GatewayPayload) : {};
}

function nestedObject(payload: GatewayPayload, key: string): GatewayPayload {
  return asObject(payload[key]);
}

export function paymentReferenceForSale(saleId: string) {
  return `PMZ${saleId.replace(/[^a-zA-Z0-9]/g, "")}`.slice(0, 20);
}

export function readGatewayTransactionId(input: unknown): string | null {
  const payload = asObject(input);
  const data = nestedObject(payload, "data");
  const value =
    payload.transaction_id ??
    payload.transactionId ??
    payload.payment_id ??
    payload.paymentId ??
    payload.id ??
    data.transaction_id ??
    data.transactionId ??
    data.payment_id ??
    data.paymentId ??
    data.id ??
    null;
  return value == null ? null : String(value);
}

export function readGatewayReference(input: unknown): string | null {
  const payload = asObject(input);
  const data = nestedObject(payload, "data");
  const value =
    payload.reference ??
    payload.external_reference ??
    payload.merchant_reference ??
    data.reference ??
    data.external_reference ??
    data.merchant_reference ??
    null;
  return value == null ? null : String(value);
}

function collectGatewayText(input: unknown) {
  const payload = asObject(input);
  const data = nestedObject(payload, "data");
  const values = [
    payload.message,
    payload.error,
    payload.detail,
    payload.description,
    payload.status,
    payload.payment_status,
    payload.state,
    payload.result,
    data.message,
    data.error,
    data.detail,
    data.description,
    data.status,
    data.payment_status,
    data.state,
    data.result,
  ];

  const rawMessage = values
    .filter((value) => value != null && String(value).trim().length > 0)
    .map((value) => String(value).trim())
    .join(" | ")
    .slice(0, 500);

  let serialized = "";
  try {
    serialized = JSON.stringify(input ?? {}).slice(0, 1_000);
  } catch {
    serialized = "";
  }

  return {
    rawMessage: rawMessage || null,
    combined: `${rawMessage} ${serialized}`.toLowerCase(),
  };
}

export function readGatewayFailureDetails(
  input: unknown,
  fallbackStatus: "failed" | "expired" = "failed",
): GatewayFailureDetails {
  const { rawMessage, combined } = collectGatewayText(input);

  if (/(saldo\s+insuf|insufficient|not\s+enough|sem\s+saldo|funds|balance)/i.test(combined)) {
    return {
      code: "insufficient_funds",
      message: "Saldo insuficiente na conta do cliente.",
      rawMessage,
    };
  }

  if (/(customer\s+did\s+not\s+enter\s+pin|did\s+not\s+enter\s+pin|n[aã]o\s+introduziu\s+pin|n[aã]o\s+digitou\s+pin|cancel|cancelad|cancelou|recus|reject|declin|denied)/i.test(combined)) {
    return {
      code: "cancelled_by_user",
      message: "Pagamento cancelado pelo cliente.",
      rawMessage,
    };
  }

  if (/(pin\s+incorret|wrong\s+pin|invalid\s+pin|pin\s+inv[aá]lid)/i.test(combined)) {
    return {
      code: "invalid_pin",
      message: "PIN incorreto. O pagamento foi recusado.",
      rawMessage,
    };
  }

  if (/(expir|timeout|timed\s*out|tempo\s+expir)/i.test(combined) || fallbackStatus === "expired") {
    return {
      code: "timeout",
      message: "O pedido expirou sem confirmação do PIN.",
      rawMessage,
    };
  }

  if (/(unauthor|forbidden|credencial|auth|token)/i.test(combined)) {
    return {
      code: "gateway_auth_error",
      message: "Falha de autenticação com a gateway de pagamento.",
      rawMessage,
    };
  }

  return {
    code: "payment_failed",
    message: rawMessage && !/^pending$/i.test(rawMessage) ? rawMessage.slice(0, 200) : "Pagamento cancelado ou recusado.",
    rawMessage,
  };
}

export function normalizeGatewayStatus(input: unknown, httpOk = true): NormalizedPaymentStatus {
  const payload = asObject(input);
  const data = nestedObject(payload, "data");
  const successValue = payload.success ?? payload.ok ?? data.success ?? data.ok;
  const raw = String(
    payload.status ??
      payload.payment_status ??
      payload.state ??
      payload.result ??
      data.status ??
      data.payment_status ??
      data.state ??
      data.result ??
      "",
  )
    .toLowerCase()
    .trim();
  const successText = String(successValue ?? "")
    .toLowerCase()
    .trim();

  if (PAID_STATUSES.has(raw)) return "paid";
  if (EXPIRED_STATUSES.has(raw)) return "expired";
  if (FAILED_STATUSES.has(raw)) return "failed";

  const message = String(
    payload.message ??
      payload.error ??
      payload.detail ??
      data.message ??
      data.error ??
      data.detail ??
      "",
  ).toLowerCase();
  const combinedSuccessMessage = `${successText} ${message}`.trim();

  if (
    httpOk &&
    /(pagamento\s+realizado\s+com\s+sucesso|payment\s+successful|successfully\s+paid|sucesso)/i.test(
      combinedSuccessMessage,
    )
  ) {
    return "paid";
  }
  if (httpOk && (successValue === true || successText === "true")) return "paid";
  if (
    /(customer\s+did\s+not\s+enter\s+pin|pin\s+incorret|recus|reject|declin|cancel|insufficient|saldo\s+insuficiente)/i.test(
      `${combinedSuccessMessage} ${raw}`,
    )
  ) {
    return "failed";
  }
  if (
    successValue === false &&
    httpOk &&
    /(recus|reject|declin|cancel|fail|erro|expir)/i.test(message)
  ) {
    return message.includes("expir") ? "expired" : "failed";
  }

  // HTTP não-OK com qualquer sinal de erro/cancelamento na resposta:
  // tratar como falha terminal em vez de "pending" (evita polling infinito
  // quando o cliente cancela ou não introduz o PIN).
  if (!httpOk) {
    const combined = `${message} ${raw} ${combinedSuccessMessage}`;
    if (/expir/i.test(combined)) return "expired";
    if (
      successValue === false ||
      /(recus|reject|declin|cancel|fail|erro|invalid|not\s+found|unauthor|forbidden|timeout)/i.test(
        combined,
      ) ||
      combined.trim().length > 0
    ) {
      return "failed";
    }
  }

  return "pending";
}


async function fetchSaleById(saleId: string) {
  const { data, error } = await supabaseAdmin
    .from("sales")
    .select(
      "id, status, user_id, product_id, customer_name, customer_phone, amount, payment_method, transaction_id, payment_reference, failure_reason, failure_code, traffic_page_id, products(name)",
    )
    .eq("id", saleId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function findSaleForGatewayEvent(
  transactionId: string | null,
  reference: string | null,
) {
  if (transactionId) {
    const { data, error } = await supabaseAdmin
      .from("sales")
      .select(
        "id, status, user_id, product_id, customer_name, customer_phone, amount, payment_method, transaction_id, payment_reference, failure_reason, failure_code, traffic_page_id, products(name)",
      )
      .eq("transaction_id", transactionId.slice(0, 200))
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (reference) {
    const { data, error } = await supabaseAdmin
      .from("sales")
      .select(
        "id, status, user_id, product_id, customer_name, customer_phone, amount, payment_method, transaction_id, payment_reference, failure_reason, failure_code, traffic_page_id, products(name)",
      )
      .eq("payment_reference", reference.slice(0, 200))
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  return null;
}

export async function confirmSalePayment(options: {
  saleId: string;
  transactionId?: string | null;
  reference?: string | null;
  rawPayload?: unknown;
  triggerPushcut?: boolean;
}) {
  const { saleId, transactionId, reference, rawPayload, triggerPushcut = false } = options;

  const updatePayload: { status: string; payment_reference: string; transaction_id?: string } = {
    status: "paid",
    payment_reference: reference ? reference.slice(0, 200) : paymentReferenceForSale(saleId),
  };
  if (transactionId) updatePayload.transaction_id = transactionId.slice(0, 200);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("sales")
    .update(updatePayload)
    .eq("id", saleId)
    .neq("status", "paid")
    .select(
      "id, status, user_id, product_id, customer_name, customer_phone, amount, payment_method, transaction_id, payment_reference, traffic_page_id, products(name)",
    )
    .maybeSingle();

  if (updateError) throw updateError;

  if (!updated) {
    if (transactionId || reference) {
      await supabaseAdmin
        .from("sales")
        .update({
          ...(transactionId ? { transaction_id: transactionId.slice(0, 200) } : {}),
          ...(reference ? { payment_reference: reference.slice(0, 200) } : {}),
        })
        .eq("id", saleId)
        .eq("status", "paid");
    }
    const currentSale = await fetchSaleById(saleId);
    if (currentSale?.status === "paid") {
      await dispatchApprovedSideEffects(currentSale, rawPayload, triggerPushcut).catch((err) => {
        console.error("[payments] approved side-effects retry failed", err);
      });
    }
    return { sale: currentSale, becamePaid: false };
  }

  // Guarantee webhook delivery is registered before returning the paid result.
  await dispatchApprovedSideEffects(updated, rawPayload, triggerPushcut).catch((err) => {
    console.error("[payments] approved side-effects failed", err);
  });

  return { sale: updated, becamePaid: true };
}

export async function markSaleTerminalFailure(options: {
  saleId: string;
  status: "failed" | "expired";
  transactionId?: string | null;
  reference?: string | null;
  reason?: string | null;
  code?: string | null;
}) {
  const { saleId, status, transactionId, reference, reason, code } = options;
  const finalStatus = status === "expired" ? "failed" : "failed";
  const updatePayload = {
    status: finalStatus,
    transaction_id: transactionId ? transactionId.slice(0, 200) : undefined,
    payment_reference: reference ? reference.slice(0, 200) : undefined,
    failure_reason: reason ? reason.slice(0, 500) : undefined,
    failure_code: code ? code.slice(0, 80) : status,
  };
  const { data: updated, error } = await supabaseAdmin
    .from("sales")
    .update(updatePayload as never)
    .eq("id", saleId)
    .neq("status", "paid")
    .neq("status", "failed")
    .select(
      "id, status, user_id, product_id, customer_name, customer_phone, amount, payment_method",
    )
    .maybeSingle();

  if (error) throw error;
  if (!updated?.user_id) return { becameFailed: false };

  const { enqueueWebhookEvent, processPendingForUser } =
    await import("@/lib/webhooks/dispatcher.server");
  await enqueueWebhookEvent({
    userId: updated.user_id,
    productId: updated.product_id,
    event: status === "expired" ? "payment.expired" : "payment.refused",
    payload: {
      sale_id: updated.id,
      product_id: updated.product_id,
      customer_name: updated.customer_name,
      customer_phone: updated.customer_phone,
      amount: updated.amount,
      payment_method: updated.payment_method,
      status: finalStatus,
      reason: reason?.slice(0, 200) ?? status,
    },
  });
  await processPendingForUser(updated.user_id);

  // Native Web Push — notify user of failed payment
  try {
    const { sendPushToUser } = await import("@/lib/push/sender.server");
    const method = updated.payment_method ?? "pagamento";
    await sendPushToUser(updated.user_id, {
      event: "sale.failed",
      body: `${method} — ${reason?.slice(0, 80) ?? status}`,
      url: "/transactions",
      metadata: { saleId: updated.id },
    });
  } catch (e) {
    console.error("[push][sale.failed] error (suppressed)", e);
  }
  return { becameFailed: true };
}

async function dispatchApprovedSideEffects(
  sale: SaleForConfirmation,
  rawPayload: unknown,
  triggerPushcut: boolean,
) {
  const userId = sale.user_id as string | null;
  if (!userId) return;

  const { enqueueWebhookEvent, processPendingForUser } =
    await import("@/lib/webhooks/dispatcher.server");
  const productName = sale.products?.name ?? null;
  const payload = {
    sale_id: sale.id,
    product_id: sale.product_id,
    product_name: productName,
    customer_name: sale.customer_name,
    customer_phone: sale.customer_phone,
    amount: sale.amount,
    payment_method: sale.payment_method,
    status: "paid",
    payment_status: "paid",
    transaction_id: sale.transaction_id,
    payment_reference: sale.payment_reference,
    paid_at: new Date().toISOString(),
    pushcut_source: triggerPushcut ? "payment_webhook" : "blocked",
    gateway_payload: rawPayload ?? null,
  };

  // SINGLE EVENT POLICY: insert exactly ONE delivery per endpoint per sale.
  // Bypass the fan-out enqueue helper — for each endpoint we choose the highest
  // priority subscribed event and insert that single delivery directly.
  // Dedupe key `${saleId}` (no event prefix) guarantees that even if this code
  // runs twice for the same sale, the unique index blocks duplicates.
  const PRIORITY = ["sale.approved", "payment.received", "product.delivered"] as const;
  // Reset any stuck "processing" rows > 30s so retries can happen fast.
  await supabaseAdmin
    .from("webhook_deliveries")
    .update({ status: "pending" })
    .eq("user_id", userId)
    .eq("status", "processing")
    .lt("updated_at", new Date(Date.now() - 30_000).toISOString());
  const { data: endpoints } = await supabaseAdmin
    .from("webhook_endpoints")
    .select("id, events, active, product_ids, is_pushcut")
    .eq("user_id", userId)
    .eq("active", true);



  let inserted = 0;
  for (const ep of endpoints ?? []) {
    const events = Array.isArray(ep.events) ? (ep.events as string[]) : [];
    const scope = ep.product_ids as string[] | null;
    const matchesProduct =
      !scope || scope.length === 0 || (sale.product_id ? scope.includes(sale.product_id) : false);
    const chosen = PRIORITY.find((e) => events.includes(e));
    console.log("[webhooks] dispatch decision", {
      endpointId: ep.id,
      saleId: sale.id,
      subscribed: events,
      matchesProduct,
      chosen: chosen ?? null,
      isPushcut: ep.is_pushcut,
      allowedPushcutSource: triggerPushcut,
    });
    if (!matchesProduct || !chosen) continue;
    if (ep.is_pushcut && !triggerPushcut) {
      console.log("[pushcut] blocked: non-webhook source", { orderId: sale.id, endpointId: ep.id });
      continue;
    }

    const { error: insertErr } = await supabaseAdmin
      .from("webhook_deliveries")
      .insert({
        webhook_id: ep.id,
        user_id: userId,
        event: chosen,
        payload: payload as never,
        dedupe_key: `approved:${sale.id}:${ep.id}`,
      });
    if (insertErr) {
      if (insertErr.code !== "23505") {
        console.error("[webhooks] direct enqueue failed", insertErr);
      } else {
        console.log("[webhooks] dedupe skipped", { endpointId: ep.id, saleId: sale.id });
      }
      continue;
    }
    inserted++;
  }
  if (inserted > 0) {
    // Fire-and-forget: do not block the payment response on webhook delivery.
    // pg_cron drains remaining pending rows every minute; stuck "processing"
    // rows are auto-reset after 30s at the top of this function.
    await processPendingForUser(userId).catch((err) =>
      console.error("[webhooks] background deliver failed", err),
    );
  }
  // Native Web Push notification — always fires regardless of Pushcut config
  try {
    const { sendPushToUser } = await import("@/lib/push/sender.server");
    const amountNum = sale.amount != null ? Number(sale.amount) : 0;
    const amountStr = amountNum.toLocaleString("pt-MZ", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const rawMethod = (sale.payment_method ?? "").toString().toLowerCase();
    const method = rawMethod.includes("emola")
      ? "EMOLA"
      : rawMethod.includes("mpesa") || rawMethod.includes("m-pesa")
        ? "MPESA"
        : (sale.payment_method ?? "").toString().toUpperCase() || "PAGAMENTO";
    await sendPushToUser(userId, {
      event: "sale.approved",
      body: `R$ ${(amountNum * Number(process.env.MZN_TO_BRL_RATE || "0.085")).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} via ${method}`,
      url: "/transactions",
      metadata: { saleId: sale.id },
    });
  } catch (e) {
    console.error("[push][sale.approved] error (suppressed)", e);
  }

  // Native Pushcut integration — independent of the Webhooks system.
  try {
    const { PushcutService } = await import("@/lib/pushcut/service.server");
    await PushcutService.sendEvent({
      userId,
      event: "sale_approved",
      dedupeKey: `pushcut:sale_approved:${sale.id}`,
      data: {
        product_name: productName,
        amount: sale.amount,
        payment_method: sale.payment_method,
        customer_name: sale.customer_name,
        approved_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("[pushcut][sale.approved] error (suppressed)", e);
  }

  // Silence unused warning for helper kept for non-approved flows.
  void enqueueWebhookEvent;


  if (sale.traffic_page_id) {
    await supabaseAdmin.from("traffic_events").insert({
      page_id: sale.traffic_page_id,
      event_type: "purchase",
      metadata: { saleId: sale.id, productId: sale.product_id },
    });
  }
}
