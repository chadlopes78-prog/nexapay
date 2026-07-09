// Server-only helpers para enfileirar e enviar webhooks.
// NÃO importar diretamente a partir de rotas/componentes —
// usar via dynamic import dentro do handler de uma server fn / route.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { WebhookEventId } from "./events";

const MAX_ATTEMPTS = 6;
// Backoff: 30s, 2m, 10m, 30m, 2h, 6h
const BACKOFF_SECONDS = [30, 120, 600, 1800, 7200, 21600];

type WebhookEndpointRef = {
  url: string;
  secret: string | null;
  is_pushcut: boolean;
  active: boolean;
};

type DeliveryHttpResult = {
  success: boolean;
  responseCode: number | null;
  responseBody: string | null;
  errorMsg: string | null;
};

interface EnqueueOptions {
  userId: string;
  event: WebhookEventId;
  payload: Record<string, unknown>;
  /** If provided, only webhooks targeting this product (or all products) receive the event. */
  productId?: string | null;
}

/**
 * Insere uma delivery pendente para cada webhook do user que está
 * inscrito neste evento E que mira este produto (ou todos).
 */
export async function enqueueWebhookEvent({
  userId,
  event,
  payload,
  productId,
}: EnqueueOptions): Promise<void> {
  try {
    const saleId = typeof payload.sale_id === "string" ? payload.sale_id : null;
    const dedupeKey = saleId ? `${event}:${saleId}` : null;
    const { data: hooks, error } = await supabaseAdmin
      .from("webhook_endpoints")
      .select("id, events, active, product_ids")
      .eq("user_id", userId)
      .eq("active", true);

    if (error) {
      console.error("[webhooks] enqueue: list endpoints failed", error);
      return;
    }
    if (!hooks?.length) return;

    const targets = hooks.filter((h) => {
      if (!Array.isArray(h.events) || !h.events.includes(event)) return false;
      const productScope = h.product_ids as string[] | null;
      // empty/null array = all products
      if (!productScope || productScope.length === 0) return true;
      if (!productId) return false;
      return productScope.includes(productId);
    });
    if (!targets.length) return;

    const rows = targets.map((h) => ({
      webhook_id: h.id,
      user_id: userId,
      event,
      payload: payload as never,
      dedupe_key: dedupeKey,
    }));

    await Promise.all(
      rows.map(async (row) => {
        const { error: insertErr } = await supabaseAdmin.from("webhook_deliveries").insert(row);
        if (insertErr && insertErr.code !== "23505") {
          console.error("[webhooks] enqueue insert failed", insertErr);
        }
      }),
    );
  } catch (err) {
    console.error("[webhooks] enqueue critical error", err);
  }
}

/**
 * Envia UMA delivery. Atualiza a row com resultado (success/failed/pending+retry).
 */
export async function deliverOnce(deliveryId: string): Promise<void> {
  const { data: delivery, error } = await supabaseAdmin
    .from("webhook_deliveries")
    .update({ status: "processing" })
    .eq("id", deliveryId)
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .select(
      "id, webhook_id, user_id, event, payload, attempts, webhook_endpoints!inner(url, secret, is_pushcut, active)",
    )
    .maybeSingle();

  if (error || !delivery) {
    if (error) console.error("[webhooks] deliverOnce: claim failed", deliveryId, error);
    return;
  }

  const endpoint = delivery.webhook_endpoints as unknown as WebhookEndpointRef;

  if (!endpoint?.active) {
    await supabaseAdmin
      .from("webhook_deliveries")
      .update({
        status: "failed",
        error: "Endpoint desativado",
      })
      .eq("id", deliveryId);
    return;
  }

  const attempt = (delivery.attempts ?? 0) + 1;
  const payload = delivery.payload as Record<string, unknown>;

  if (endpoint.is_pushcut) {
    const orderId = readPushcutOrderId(payload);
    const paymentStatus = String(payload.payment_status ?? payload.status ?? "").toLowerCase().trim();
    const webhookOnlySource = payload.pushcut_source === "payment_webhook";
    const isTestEvent = payload.test === true || payload.event === "webhook.test" || delivery.event === "webhook.test";
    const isApprovedPayment = delivery.event === "sale.approved" && paymentStatus === "paid" && webhookOnlySource;

    console.log("[webhooks] pushcut webhook received", {
      deliveryId,
      orderId,
      paymentStatus,
      eventType: delivery.event,
      webhookOnlySource,
      isTestEvent,
    });

    if (!orderId) {
      await supabaseAdmin
        .from("webhook_deliveries")
        .update({ status: "failed", attempts: attempt, error: "Missing orderId for Pushcut" })
        .eq("id", deliveryId);
      return;
    }

    if (!isTestEvent && !isApprovedPayment) {
      console.log("[pushcut] blocked: invalid source/event/status", {
        deliveryId,
        orderId,
        eventType: delivery.event,
        paymentStatus,
        webhookOnlySource,
      });
      await supabaseAdmin
        .from("webhook_deliveries")
        .update({
          status: "success",
          attempts: attempt,
          response_code: 208,
          response_body: JSON.stringify({ blocked: true, reason: "webhook_only" }),
          error: null,
        })
        .eq("id", deliveryId);
      return;
    }

    const result = await postJsonWithTimeout(endpoint.url, {
      event: isTestEvent ? "webhook_test" : "sale_approved",
      orderId,
      sent_at: new Date().toISOString(),
      data: payload,
    });

    await updateDeliveryAfterAttempt(deliveryId, attempt, result);
    return;
  }

  const body = buildStandardBody(delivery.event, payload);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!endpoint.is_pushcut && endpoint.secret) {
    headers["X-Webhook-Secret"] = endpoint.secret;
  }
  headers["X-Webhook-Event"] = delivery.event;

  const result = await postJsonWithTimeout(endpoint.url, body, headers);
  await updateDeliveryAfterAttempt(deliveryId, attempt, result);
}

function readPushcutOrderId(payload: Record<string, unknown>): string | null {
  const value = payload.orderId ?? payload.order_id ?? payload.sale_id ?? payload.saleId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function postJsonWithTimeout(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = { "Content-Type": "application/json" },
): Promise<DeliveryHttpResult> {
  let responseCode: number | null = null;
  let responseBody: string | null = null;
  let errorMsg: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    responseCode = res.status;
    responseBody = (await res.text().catch(() => "")).slice(0, 2000);
    if (!res.ok) errorMsg = `HTTP ${res.status}`;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  const success = !errorMsg && responseCode !== null && responseCode >= 200 && responseCode < 300;
  return { success, responseCode, responseBody, errorMsg };
}

async function updateDeliveryAfterAttempt(
  deliveryId: string,
  attempt: number,
  result: DeliveryHttpResult,
): Promise<void> {
  if (result.success) {
    await supabaseAdmin
      .from("webhook_deliveries")
      .update({
        status: "success",
        attempts: attempt,
        response_code: result.responseCode,
        response_body: result.responseBody,
        error: null,
      })
      .eq("id", deliveryId);
    return;
  }

  const isPermanentClientError =
    result.responseCode !== null &&
    result.responseCode >= 400 &&
    result.responseCode < 500 &&
    result.responseCode !== 408 &&
    result.responseCode !== 429;

  if (attempt >= MAX_ATTEMPTS || isPermanentClientError) {
    await supabaseAdmin
      .from("webhook_deliveries")
      .update({
        status: "failed",
        attempts: attempt,
        response_code: result.responseCode,
        response_body: result.responseBody,
        error: result.errorMsg,
      })
      .eq("id", deliveryId);
    return;
  }

  const delaySec = BACKOFF_SECONDS[Math.min(attempt - 1, BACKOFF_SECONDS.length - 1)];
  const nextAt = new Date(Date.now() + delaySec * 1000).toISOString();
  await supabaseAdmin
    .from("webhook_deliveries")
    .update({
      status: "pending",
      attempts: attempt,
      response_code: result.responseCode,
      response_body: result.responseBody,
      error: result.errorMsg,
      next_attempt_at: nextAt,
    })
    .eq("id", deliveryId);
}

function buildStandardBody(event: string, payload: Record<string, unknown>) {
  return {
    event,
    sent_at: new Date().toISOString(),
    data: payload,
  };
}

/**
 * Dispara fire-and-forget para todas as deliveries que acabaram de ser enfileiradas
 * para este user/evento. Usado para entrega quase-imediata sem esperar o cron.
 */
export async function processPendingForUser(userId: string): Promise<void> {
  await supabaseAdmin
    .from("webhook_deliveries")
    .update({ status: "pending" })
    .eq("user_id", userId)
    .eq("status", "processing")
    .lt("updated_at", new Date(Date.now() - 5 * 60_000).toISOString());

  const { data, error } = await supabaseAdmin
    .from("webhook_deliveries")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(20);
  if (error || !data?.length) return;
  await Promise.all(
    data.map((d) => deliverOnce(d.id).catch((e) => console.error("[webhooks] deliver err", e))),
  );
}
