import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  confirmSalePayment,
  markSaleTerminalFailure,
  normalizeGatewayStatus,
  readGatewayFailureDetails,
  readGatewayReference,
  readGatewayTransactionId,
  saveGatewayIdentifiers,
} from "@/lib/payments/confirmation.server";

const E2PAY_BASE_URL = "https://e2payments.explicador.co.mz";
const HISTORY_LIMIT = 50;
const RECONCILIATION_INTERVAL_MS = 3_000;
const lastReconciliationAt = new Map<string, number>();
const reconciliationInFlight = new Map<string, Promise<"paid" | "cancelled" | "failed" | "expired" | "pending" | null>>();

type PendingSale = {
  id: string;
  user_id: string | null;
  payment_method: string | null;
  transaction_id: string | null;
  payment_reference: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function collectRecords(value: unknown, depth = 0): Array<Record<string, unknown>> {
  if (depth > 4) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const record = asRecord(entry);
      return record ? [record, ...collectRecords(record, depth + 1)] : [];
    });
  }
  const record = asRecord(value);
  if (!record) return [];
  return Object.values(record).flatMap((entry) => collectRecords(entry, depth + 1));
}

function findMatchingPayment(payload: unknown, sale: PendingSale) {
  const expectedTransaction = sale.transaction_id?.trim() || null;
  const expectedReference = sale.payment_reference?.trim() || null;
  return collectRecords(payload).find((record) => {
    const transactionId = readGatewayTransactionId(record);
    const reference = readGatewayReference(record);
    return Boolean(
      (expectedTransaction && transactionId === expectedTransaction) ||
        (expectedReference && reference === expectedReference),
    );
  }) ?? null;
}

async function requestHistory(sale: PendingSale) {
  if (!sale.user_id || !["mpesa", "emola"].includes(String(sale.payment_method))) return null;
  const { data: credentials } = await supabaseAdmin
    .from("user_payment_credentials")
    .select("e2p_client_id, e2p_client_secret")
    .eq("user_id", sale.user_id)
    .maybeSingle();
  if (!credentials?.e2p_client_id || !credentials.e2p_client_secret) return null;

  const tokenResponse = await fetch(`${E2PAY_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: credentials.e2p_client_id,
      client_secret: credentials.e2p_client_secret,
    }),
  });
  if (!tokenResponse.ok) return null;
  const tokenPayload = asRecord(await tokenResponse.json().catch(() => null));
  const accessToken = tokenPayload?.access_token;
  if (!accessToken) return null;

  const method = String(sale.payment_method);
  const historyResponse = await fetch(
    `${E2PAY_BASE_URL}/v1/payments/${method}/get/all/paginate/${HISTORY_LIMIT}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${String(accessToken)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ client_id: credentials.e2p_client_id }),
    },
  );
  if (!historyResponse.ok) return null;
  return historyResponse.json().catch(() => null);
}

export async function reconcilePendingSale(sale: PendingSale) {
  const existing = reconciliationInFlight.get(sale.id);
  if (existing) return existing;
  const lastAttempt = lastReconciliationAt.get(sale.id) ?? 0;
  if (Date.now() - lastAttempt < RECONCILIATION_INTERVAL_MS) return null;
  lastReconciliationAt.set(sale.id, Date.now());

  const task = (async () => {
    try {
      const history = await requestHistory(sale);
      if (!history) return null;
      const payment = findMatchingPayment(history, sale);
      if (!payment) return null;

      const transactionId = readGatewayTransactionId(payment);
      const reference = readGatewayReference(payment) ?? sale.payment_reference;
      await saveGatewayIdentifiers({ saleId: sale.id, transactionId, reference });

      const status = normalizeGatewayStatus(payment, true);
      if (status === "paid") {
        await confirmSalePayment({
          saleId: sale.id,
          transactionId,
          reference,
          rawPayload: payment,
          triggerPushcut: true,
        });
      } else if (status === "failed" || status === "expired" || status === "cancelled") {
        const failure = readGatewayFailureDetails(payment, status);
        await markSaleTerminalFailure({
          saleId: sale.id,
          status,
          transactionId,
          reference,
          reason: failure.message,
          code: failure.code,
          source: "e2payments_history",
        });
      }
      return status;
    } catch (error) {
      console.warn("[payments] reconciliation unavailable", {
        saleId: sale.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  })().finally(() => reconciliationInFlight.delete(sale.id));
  reconciliationInFlight.set(sale.id, task);
  return task;
}