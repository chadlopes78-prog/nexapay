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

export function paymentReferenceForSale(saleId: string) {
  return `PMZ${saleId.replace(/[^a-zA-Z0-9]/g, "")}`.slice(0, 20);
}

export function readGatewayTransactionId(payload: any): string | null {
  const value =
    payload?.transaction_id ??
    payload?.transactionId ??
    payload?.payment_id ??
    payload?.paymentId ??
    payload?.id ??
    payload?.data?.transaction_id ??
    payload?.data?.transactionId ??
    payload?.data?.payment_id ??
    payload?.data?.paymentId ??
    payload?.data?.id ??
    null;
  return value == null ? null : String(value);
}

export function readGatewayReference(payload: any): string | null {
  const value =
    payload?.reference ??
    payload?.external_reference ??
    payload?.merchant_reference ??
    payload?.data?.reference ??
    payload?.data?.external_reference ??
    payload?.data?.merchant_reference ??
    null;
  return value == null ? null : String(value);
}

export function normalizeGatewayStatus(payload: any, httpOk = true): NormalizedPaymentStatus {
  const raw = String(
    payload?.status ??
      payload?.payment_status ??
      payload?.state ??
      payload?.result ??
      payload?.data?.status ??
      payload?.data?.payment_status ??
      payload?.data?.state ??
      payload?.data?.result ??
      "",
  )
    .toLowerCase()
    .trim();

  if (PAID_STATUSES.has(raw)) return "paid";
  if (EXPIRED_STATUSES.has(raw)) return "expired";
  if (FAILED_STATUSES.has(raw)) return "failed";

  const message = String(payload?.message ?? payload?.error ?? payload?.detail ?? "").toLowerCase();
  if (payload?.success === true || payload?.ok === true) return "pending";
  if (
    payload?.success === false &&
    httpOk &&
    /(recus|reject|declin|cancel|fail|erro|expir)/i.test(message)
  ) {
    return message.includes("expir") ? "expired" : "failed";
  }

  return "pending";
}

async function fetchSaleById(saleId: string) {
  const { data, error } = await supabaseAdmin
    .from("sales")
    .select(
      "id, status, user_id, product_id, customer_name, customer_phone, amount, payment_method, transaction_id, payment_reference, traffic_page_id, products(name)",
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
        "id, status, user_id, product_id, customer_name, customer_phone, amount, payment_method, transaction_id, payment_reference, traffic_page_id, products(name)",
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
        "id, status, user_id, product_id, customer_name, customer_phone, amount, payment_method, transaction_id, payment_reference, traffic_page_id, products(name)",
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
}) {
  const { saleId, transactionId, reference, rawPayload } = options;

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
      await dispatchApprovedSideEffects(currentSale, rawPayload).catch((err) => {
        console.error("[payments] approved side-effects retry failed", err);
      });
    }
    return { sale: currentSale, becamePaid: false };
  }

  await dispatchApprovedSideEffects(updated, rawPayload).catch((err) => {
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
}) {
  const { saleId, status, transactionId, reference, reason } = options;
  const finalStatus = status === "expired" ? "failed" : "failed";
  const { data: updated, error } = await supabaseAdmin
    .from("sales")
    .update({
      status: finalStatus,
      transaction_id: transactionId ? transactionId.slice(0, 200) : undefined,
      payment_reference: reference
        ? reference.slice(0, 200)
        : reason
          ? reason.slice(0, 200)
          : undefined,
    })
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
  return { becameFailed: true };
}

async function dispatchApprovedSideEffects(sale: any, rawPayload: unknown) {
  const userId = sale.user_id as string | null;
  if (!userId) return;

  const { triggerSaleApprovedNotification } = await import("@/lib/api/notifications.server");
  const { enqueueWebhookEvent, processPendingForUser } =
    await import("@/lib/webhooks/dispatcher.server");
  const productName = (sale as any).products?.name ?? null;
  const payload = {
    sale_id: sale.id,
    product_id: sale.product_id,
    product_name: productName,
    customer_name: sale.customer_name,
    customer_phone: sale.customer_phone,
    amount: sale.amount,
    payment_method: sale.payment_method,
    status: "paid",
    transaction_id: sale.transaction_id,
    payment_reference: sale.payment_reference,
    paid_at: new Date().toISOString(),
    gateway_payload: rawPayload ?? null,
  };

  await triggerSaleApprovedNotification(sale.id);
  await enqueueWebhookEvent({
    userId,
    event: "payment.received",
    payload,
    productId: sale.product_id,
  });
  await enqueueWebhookEvent({
    userId,
    event: "sale.approved",
    payload,
    productId: sale.product_id,
  });
  await enqueueWebhookEvent({
    userId,
    event: "product.delivered",
    payload,
    productId: sale.product_id,
  });
  await processPendingForUser(userId);

  if (sale.traffic_page_id) {
    await supabaseAdmin.from("traffic_events").insert({
      page_id: sale.traffic_page_id,
      event_type: "purchase",
      metadata: { saleId: sale.id, productId: sale.product_id },
    });
  }
}
