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
// Cancelamento explícito do cliente/operadora — estado terminal próprio.
const CANCELLED_STATUSES = new Set([
  "cancel",
  "cancelled",
  "canceled",
  "customer_cancelled",
  "customer_canceled",
  "cancelled_by_user",
  "canceled_by_user",
  "user_cancelled",
  "user_canceled",
  "aborted",
  "rejected",
  "refused",
]);

const FAILED_STATUSES = new Set([
  "failed",
  "failure",
  "error",
  "unsuccessful",
  "declined",
  "denied",
]);

const EXPIRED_STATUSES = new Set(["expired", "timeout", "timed_out"]);

export type NormalizedPaymentStatus = "paid" | "cancelled" | "failed" | "expired" | "pending";
export type TerminalFailureStatus = "cancelled" | "failed" | "expired";

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
  products?: { name?: string | null } | Array<{ name?: string | null }> | null;
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

/**
 * Lê o CÓDIGO ESTRUTURADO devolvido pela gateway (prioridade sobre texto).
 * A E2Payments encaminha os códigos originais das carteiras:
 *   M-Pesa  -> INS-0, INS-1, INS-6, INS-9, INS-2001, INS-2006, INS-2051 ...
 *   e-Mola  -> códigos numéricos / strings curtas no campo `code`.
 */
export function readGatewayCode(input: unknown): string | null {
  const payload = asObject(input);
  const data = nestedObject(payload, "data");
  const value =
    payload.code ??
    payload.error_code ??
    payload.errorCode ??
    payload.response_code ??
    payload.responseCode ??
    payload.output_ResponseCode ??
    data.code ??
    data.error_code ??
    data.errorCode ??
    data.response_code ??
    data.responseCode ??
    data.output_ResponseCode ??
    null;
  const text = value == null ? "" : String(value).trim();
  return text.length > 0 ? text.slice(0, 80) : null;
}

/** Estado bruto (sem normalização) devolvido pela gateway, para auditoria. */
export function readGatewayRawStatus(input: unknown): string | null {
  const payload = asObject(input);
  const data = nestedObject(payload, "data");
  const value =
    payload.status ??
    payload.payment_status ??
    payload.state ??
    data.status ??
    data.payment_status ??
    data.state ??
    null;
  const text = value == null ? "" : String(value).trim();
  return text.length > 0 ? text.slice(0, 120) : null;
}

/**
 * Mapa CÓDIGO -> {estado normalizado, código interno}.
 * Tem prioridade sobre qualquer heurística de texto (requisito: não depender
 * de `message.includes("cancel")`, porque as mensagens mudam).
 */
const GATEWAY_CODE_MAP: Record<string, { status: NormalizedPaymentStatus; code: string }> = {
  // M-Pesa (Vodacom) — códigos oficiais encaminhados pela E2Payments
  "ins-0": { status: "paid", code: "success" },
  "ins-1": { status: "failed", code: "gateway_internal_error" },
  "ins-5": { status: "cancelled", code: "cancelled_by_user" },
  "ins-6": { status: "failed", code: "transaction_failed" },
  "ins-9": { status: "expired", code: "timeout" },
  "ins-10": { status: "failed", code: "duplicate_transaction" },
  "ins-13": { status: "failed", code: "invalid_shortcode" },
  "ins-2001": { status: "failed", code: "invalid_pin" },
  "ins-2006": { status: "failed", code: "insufficient_funds" },
  "ins-2051": { status: "failed", code: "invalid_msisdn" },
  // e-Mola / genéricos
  "insufficient_funds": { status: "failed", code: "insufficient_funds" },
  "insufficient_balance": { status: "failed", code: "insufficient_funds" },
  "cancelled_by_user": { status: "cancelled", code: "cancelled_by_user" },
  "user_cancelled": { status: "cancelled", code: "cancelled_by_user" },
  "invalid_pin": { status: "failed", code: "invalid_pin" },
  "wrong_pin": { status: "failed", code: "invalid_pin" },
  "timeout": { status: "expired", code: "timeout" },
  "expired": { status: "expired", code: "timeout" },
};

export function lookupGatewayCode(input: unknown) {
  const code = readGatewayCode(input);
  if (!code) return null;
  return GATEWAY_CODE_MAP[code.toLowerCase()] ?? null;
}

/**
 * Log estruturado e SEGURO das transições de estado (sem PIN, sem tokens,
 * sem credenciais). É a fonte para descobrirmos os códigos reais que cada
 * carteira devolve em cancelamento / saldo insuficiente / expiração.
 */
export function logPaymentTransition(entry: {
  saleId: string;
  source: string;
  provider?: string | null;
  internalStatus: string;
  gatewayStatus?: string | null;
  gatewayCode?: string | null;
  gatewayMessage?: string | null;
  transactionId?: string | null;
  httpStatus?: number | null;
}) {
  console.info("[payment-state]", {
    timestamp: new Date().toISOString(),
    sale_id: entry.saleId,
    source: entry.source,
    provider: entry.provider ?? null,
    internal_status: entry.internalStatus,
    gateway_status: entry.gatewayStatus ?? null,
    gateway_code: entry.gatewayCode ?? null,
    gateway_message: entry.gatewayMessage ? String(entry.gatewayMessage).slice(0, 200) : null,
    transaction_id: entry.transactionId ?? null,
    http_status: entry.httpStatus ?? null,
  });
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
    // Mensagem real da operadora (a E2Payments devolve o motivo verdadeiro
    // dentro destes campos, enquanto `error` fica genérico).
    payload.emola_response,
    payload.mpesa_response,
    payload.provider_response,
    payload.gateway_response,
    data.message,
    data.error,
    data.detail,
    data.description,
    data.status,
    data.payment_status,
    data.state,
    data.result,
    data.emola_response,
    data.mpesa_response,
    data.provider_response,
    data.gateway_response,
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

/**
 * Justificativas amigáveis por código interno. A interface mostra este texto;
 * a resposta original da gateway continua guardada em gateway_message.
 */
const JUSTIFICATION_BY_CODE: Record<string, string> = {
  insufficient_funds: "Saldo insuficiente na conta do cliente.",
  cancelled_by_user: "Pagamento cancelado pelo cliente.",
  invalid_pin: "PIN ou autorização do pagamento não foi aceite.",
  timeout: "A solicitação de pagamento expirou antes da confirmação.",
  duplicate_transaction: "Já existe um pedido igual em processamento.",
  invalid_msisdn: "O número de telefone não é válido para esta carteira.",
  invalid_shortcode: "Configuração da carteira do vendedor inválida.",
  transaction_failed: "A operadora não concluiu o pagamento.",
  gateway_internal_error: "Não foi possível comunicar com o serviço de pagamento.",
  gateway_unavailable: "Não foi possível comunicar com o serviço de pagamento.",
  gateway_auth_error: "Não foi possível comunicar com o serviço de pagamento.",
  msisdn_busy: "Este número tem outro pagamento em curso. Aguarde ~30s e tente novamente.",
};

export function getPaymentJustification(code: string | null | undefined, fallback?: string | null) {
  const key = String(code ?? "").toLowerCase();
  return JUSTIFICATION_BY_CODE[key] ?? fallback ?? "Não foi possível concluir o pagamento.";
}

export function readGatewayFailureDetails(
  input: unknown,
  fallbackStatus: TerminalFailureStatus = "failed",
): GatewayFailureDetails {
  const { rawMessage, combined } = collectGatewayText(input);

  // PRIORIDADE 1 — código estruturado devolvido pela gateway.
  const mapped = lookupGatewayCode(input);
  if (mapped && mapped.code !== "success") {
    return { code: mapped.code, message: JUSTIFICATION_BY_CODE[mapped.code] ?? rawMessage?.slice(0, 200) ?? "Não foi possível concluir o pagamento.", rawMessage };
  }



  // Bloqueio temporário do próprio número: a operadora ainda tem uma
  // sessão STK ativa do pedido anterior (ex.: cliente pagou noutra aba).
  // Só afeta este MSISDN — outros clientes continuam a pagar normalmente.
  if (/(isdn\s+is\s+in\s+other\s+process|in\s+other\s+process|other\s+process|em\s+outro\s+processo|already\s+in\s+progress)/i.test(combined)) {
    return {
      code: "msisdn_busy",
      message: "Este número tem outro pagamento em curso. Aguarde ~30s e tente novamente.",
      rawMessage,
    };
  }


  // Inclui a formulação usada pela e-Mola: "O teu saldo nao e suficiente...".
  if (
    /(saldo\s+insuf|insufficient|not\s+enough|sem\s+saldo|funds|balance)/i.test(combined) ||
    /saldo[^.]{0,40}(n[aã]o\s+(e|é|esta|está)\s+)?sufici/i.test(combined)
  ) {

    return {
      code: "insufficient_funds",
      message: "Saldo insuficiente na conta do cliente.",
      rawMessage,
    };
  }

  if (/(customer\s+did\s+not\s+enter\s+pin|did\s+not\s+enter\s+pin|n[aã]o\s+introduziu\s+pin|n[aã]o\s+digitou\s+pin|cancel|cancelad|cancelou|anulad|recus|refus|reject|declin|denied|deny)/i.test(combined)) {
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

export function normalizeGatewayStatus(
  input: unknown,
  httpOk = true,
  httpStatus?: number,
): NormalizedPaymentStatus {
  // PRIORIDADE 1 — código estruturado (não depende de texto livre).
  const mappedCode = lookupGatewayCode(input);
  if (mappedCode) return mappedCode.status;

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
  if (CANCELLED_STATUSES.has(raw)) return "cancelled";
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
  const paidOrFailText = `${combinedSuccessMessage} ${raw}`;
  if (
    /(customer\s+did\s+not\s+enter\s+pin|recus|refus|reject|cancel|anulad|abort)/i.test(paidOrFailText)
  ) {
    return "cancelled";
  }
  if (
    /(pin\s+incorret|declin|denied|deny|insufficient|saldo\s+insuficiente)/i.test(paidOrFailText)
  ) {
    return "failed";
  }
  // Gateway devolveu HTTP 200 mas sinalizou `success: false` (ou "false").
  // Isso cobre cancelamentos da operadora (M-Pesa/e-Mola) cuja `message`
  // vem em códigos não mapeados (ex.: INS-*, SDS*) ou vazia. Sem esta
  // regra o status caía em "pending" e o checkout ficava preso em
  // "Processando pagamento..." até o timeout de 4 min.
  if (
    httpOk &&
    (successValue === false || successText === "false")
  ) {
    if (/expir|timeout|timed\s*out/i.test(message)) return "expired";
    if (/recus|refus|reject|cancel|anulad|abort/i.test(message)) return "cancelled";
    return "failed";
  }

  // HTTP não-OK (502/503/504/timeout/corpo vazio/etc.) NÃO prova falha do
  // pagamento — a operadora pode ter recebido e processado. Só marcamos
  // terminal quando a resposta contém uma mensagem que confirma o estado.
  // Caso contrário devolvemos "pending" e deixamos o polling reconciliar
  // com a fonte da verdade (getSaleStatus) até o cutoff central.
  if (!httpOk) {
    const combined = `${message} ${raw} ${combinedSuccessMessage}`;
    if (/expir|timeout|timed\s*out/i.test(combined)) return "expired";
    if (/(recus|refus|reject|cancel|anulad|abort|customer\s+did\s+not\s+enter\s+pin)/i.test(combined)) {
      return "cancelled";
    }
    if (
      /(declin|denied|insufficient|saldo\s+insuficiente|pin\s+incorret|invalid\s+pin|other\s+process|em\s+outro\s+processo)/i.test(
        combined,
      )
    ) {
      return "failed";
    }
    // Respostas 4xx da gateway (400/401/402/403/422/...) são recusas
    // definitivas do pedido — inclui o cliente cancelar o pop-up de PIN.
    // Não faz sentido manter a venda "pending" até o timeout de 4 min.
    if (
      typeof httpStatus === "number" &&
      httpStatus >= 400 &&
      httpStatus < 500 &&
      ![408, 409, 425, 429].includes(httpStatus)
    ) {
      return "failed";
    }
    return "pending";
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

export async function saveGatewayIdentifiers(options: {
  saleId: string;
  transactionId?: string | null;
  reference?: string | null;
}) {
  const update: { transaction_id?: string; payment_reference?: string } = {};
  if (options.transactionId) update.transaction_id = options.transactionId.slice(0, 200);
  if (options.reference) update.payment_reference = options.reference.slice(0, 200);
  if (Object.keys(update).length === 0) return;
  const { error } = await supabaseAdmin.from("sales").update(update).eq("id", options.saleId);
  if (error) throw error;
}

export async function confirmSalePayment(options: {
  saleId: string;
  transactionId?: string | null;
  reference?: string | null;
  rawPayload?: unknown;
  triggerPushcut?: boolean;
}) {
  const { saleId, transactionId, reference, rawPayload, triggerPushcut = false } = options;

  const updatePayload: Record<string, unknown> = {
    status: "paid",
    payment_reference: reference ? reference.slice(0, 200) : paymentReferenceForSale(saleId),
    paid_at: new Date().toISOString(),
    gateway_raw_status: readGatewayRawStatus(rawPayload),
    gateway_error_code: readGatewayCode(rawPayload),
    gateway_message: collectGatewayText(rawPayload).rawMessage?.slice(0, 500) ?? null,
  };
  if (transactionId) updatePayload.transaction_id = transactionId.slice(0, 200);

  logPaymentTransition({
    saleId,
    source: "confirmSalePayment",
    internalStatus: "paid",
    gatewayStatus: readGatewayRawStatus(rawPayload),
    gatewayCode: readGatewayCode(rawPayload),
    gatewayMessage: collectGatewayText(rawPayload).rawMessage,
    transactionId: transactionId ?? null,
  });

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("sales")
    .update(updatePayload as never)
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

  // SMS automática ao comprador — EFEITO SECUNDÁRIO. Nunca pode atrasar a
  // resposta que informa o checkout de que a venda está paga: a BulkSMS pode
  // demorar segundos. Corre fora do caminho crítico via waitUntil.
  try {
    const { enqueueSalesSms, processDueSms } = await import("@/lib/sms/dispatch.server");
    // O agendamento é apenas uma escrita rápida na BD: tem de ser garantido
    // aqui, porque tarefas em background podem ser descartadas pelo Worker.
    const queued = await enqueueSalesSms(updated);
    if (queued > 0) {
      // O envio (BulkSMS) pode demorar: sai do caminho crítico, com o cron
      // `sweep-sms` como rede de segurança caso o isolate seja reciclado.
      const sendTask = processDueSms(10).catch((e) =>
        console.error("[sms] envio imediato suprimido", e),
      );
      const { waitUntil } = await import("@/lib/runtime-context.server");
      if (!waitUntil(sendTask)) void sendTask;
    }
  } catch (e) {
    console.error("[sms] agendamento pós-pagamento suprimido", e);
  }



  // Diagnóstico: venda aprovada sem link de acesso configurado. O cliente
  // vai cair no fallback /payment-success e ficar sem o produto. Não bloqueia
  // a aprovação (dinheiro já foi cobrado), apenas alerta para investigação.
  try {
    const { data: prod } = await supabaseAdmin
      .from("products")
      .select("id, access_link, delivery_link")
      .eq("id", updated.product_id ?? "")
      .maybeSingle();
    if (prod && !prod.access_link && !prod.delivery_link) {
      console.error("[payments] paid sale without access/delivery link", {
        saleId: updated.id,
        productId: prod.id,
      });
    }
  } catch (e) {
    console.warn("[payments] link check failed", e);
  }

  return { sale: updated, becamePaid: true };
}

export async function markSaleTerminalFailure(options: {
  saleId: string;
  status: TerminalFailureStatus;
  transactionId?: string | null;
  reference?: string | null;
  reason?: string | null;
  code?: string | null;
  source?: string;
}): Promise<{ becameFailed: boolean; alreadyPaid?: boolean; currentStatus?: string }> {
  const { saleId, status, transactionId, reference, reason, code, source = "unknown" } = options;
  // Preserve the real terminal reason ("expired" vs "failed") instead of
  // collapsing everything to "failed". Webhooks and UI need to distinguish
  // timeouts from gateway refusals.
  const finalStatus: TerminalFailureStatus =
    status === "expired" ? "expired" : status === "cancelled" ? "cancelled" : "failed";
  const updatePayload = {
    status: finalStatus,
    transaction_id: transactionId ? transactionId.slice(0, 200) : undefined,
    payment_reference: reference ? reference.slice(0, 200) : undefined,
    failure_reason: reason ? reason.slice(0, 500) : undefined,
    failure_code: code ? code.slice(0, 80) : status,
    gateway_error_code: code ? code.slice(0, 80) : null,
    gateway_message: reason ? reason.slice(0, 500) : null,
  };
  logPaymentTransition({
    saleId,
    source,
    internalStatus: finalStatus,
    gatewayCode: code ?? null,
    gatewayMessage: reason ?? null,
    transactionId: transactionId ?? null,
  });
  const { data: updated, error } = await supabaseAdmin
    .from("sales")
    .update(updatePayload as never)
    .eq("id", saleId)
    // Idempotency: don't overwrite an already-terminal sale
    .not("status", "in", "(paid,approved,failed,expired,cancelled,canceled)")
    .select(
      "id, status, user_id, product_id, customer_name, customer_phone, amount, payment_method",
    )
    .maybeSingle();

  if (error) throw error;

  if (!updated) {
    // UPDATE não afetou nenhuma linha: ou a venda já era terminal, ou não
    // existe. Re-consulta para distinguir "já pago" (preservar sucesso) de
    // "já falhado" (idempotente) — evitando corrida onde webhook aprova
    // milissegundos antes de um cancelamento/timeout/erro de gateway.
    const current = await fetchSaleById(saleId);
    const currentStatus = String(current?.status ?? "").toLowerCase();
    if (["paid", "approved", "success", "completed"].includes(currentStatus)) {
      console.info("[payments][race] skip terminal failure — sale already paid", {
        saleId,
        source,
        attemptedStatus: finalStatus,
        currentStatus,
      });
      return { becameFailed: false, alreadyPaid: true, currentStatus };
    }
    console.info("[payments] terminal failure noop", {
      saleId,
      source,
      attemptedStatus: finalStatus,
      currentStatus: currentStatus || "not_found",
    });
    return { becameFailed: false, currentStatus };
  }

  if (!updated.user_id) return { becameFailed: false };

  console.info("[payments] sale marked terminal", {
    saleId,
    source,
    newStatus: finalStatus,
    code: code ?? status,
  });

  void dispatchFailureSideEffects({
    sale: updated,
    event:
      status === "expired"
        ? "payment.expired"
        : status === "cancelled"
          ? "sale.cancelled"
          : "payment.refused",
    finalStatus,
    reason: reason?.slice(0, 200) ?? status,
  }).catch((e) => console.error("[payments] failure side-effects failed", e));

  return { becameFailed: true };
}

async function dispatchFailureSideEffects(options: {
  sale: Pick<
    SaleForConfirmation,
    | "id"
    | "user_id"
    | "product_id"
    | "customer_name"
    | "customer_phone"
    | "amount"
    | "payment_method"
  >;
  event: "payment.expired" | "payment.refused" | "sale.cancelled";
  finalStatus: string;
  reason: string;
}) {
  const { sale, event, finalStatus, reason } = options;
  const userId = sale.user_id as string | null;
  if (!userId) return;

  const { enqueueWebhookEvent, processPendingForUser } =
    await import("@/lib/webhooks/dispatcher.server");
  await enqueueWebhookEvent({
    userId,
    productId: sale.product_id,
    event,
    payload: {
      sale_id: sale.id,
      product_id: sale.product_id,
      customer_name: sale.customer_name,
      customer_phone: sale.customer_phone,
      amount: sale.amount,
      payment_method: sale.payment_method,
      status: finalStatus,
      reason,
    },
  });
  await processPendingForUser(userId);

  try {
    const { sendPushToUser } = await import("@/lib/push/sender.server");
    const method = sale.payment_method ?? "pagamento";
    await sendPushToUser(userId, {
      event: "sale.failed",
      body: `${method} — ${reason.slice(0, 80)}`,
      url: "/transactions",
      metadata: { saleId: sale.id },
    });
  } catch (e) {
    console.error("[push][sale.failed] error (suppressed)", e);
  }
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
  const rawProducts = sale.products;
  const product = Array.isArray(rawProducts) ? rawProducts[0] ?? null : rawProducts;
  const productName = product?.name ?? null;
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
  // Processa também retries/dedupes pendentes, mas não deixa webhooks lentos
  // bloquear Web Push/Pushcut da venda aprovada.
  const webhookProcessing = processPendingForUser(userId).catch((err) =>
    console.error("[webhooks] background deliver failed", err),
  );
  const amountNum = sale.amount != null ? Number(sale.amount) : 0;
  const rawMethod = (sale.payment_method ?? "").toString().toLowerCase();
  const method = rawMethod.includes("emola")
    ? "EMOLA"
    : rawMethod.includes("mpesa") || rawMethod.includes("m-pesa")
      ? "MPESA"
      : (sale.payment_method ?? "").toString().toUpperCase() || "PAGAMENTO";

  // Taxa fixa/fallback local: notificação de venda aprovada não pode depender
  // de uma API externa de câmbio antes de tocar no iPhone do vendedor.
  let mznToBrl = Number(process.env.MZN_TO_BRL_RATE || "0.085");
  if (!Number.isFinite(mznToBrl) || mznToBrl <= 0) mznToBrl = 0.085;

  const brlValue = (amountNum * mznToBrl).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const bodyText = `${brlValue} R$ via ${method}`;

  // Web Push e Pushcut são independentes e rodam em paralelo: uma falha ou
  // lentidão em uma via não pode impedir a outra notificação aprovada.
  const webPushTask = (async () => {
    try {
      const { data: existingNotification } = await supabaseAdmin
        .from("notifications_log")
        .select("id")
        .eq("user_id", userId)
        .contains("metadata", { saleId: sale.id })
        .limit(1);
      if (!existingNotification?.length) {
        const { sendPushToUser } = await import("@/lib/push/sender.server");
        await sendPushToUser(userId, {
          event: "sale.approved",
          body: bodyText,
          url: "/transactions",
          metadata: { saleId: sale.id },
        });
      }
    } catch (e) {
      console.error("[push][sale.approved] error (suppressed)", e);
    }
  })();

  const pushcutTask = (async () => {
    try {
      const { PushcutService } = await import("@/lib/pushcut/service.server");
      const pushcutResult = await PushcutService.sendEvent({
        userId,
        event: "sale_approved",
        // Não reutilizar o order_id do trigger SQL. Esse trigger registra
        // "sent" quando o pedido pg_net é enfileirado, mas isso não prova que
        // o Pushcut recebeu. A via do app precisa ter o próprio idempotency key
        // para garantir o envio real via fetch após pagamento aprovado.
        dedupeKey: `pushcut:app:sale_approved:${sale.id}`,
        text: bodyText,
        data: {
          brl_value: brlValue,
          payment_method: method,
          product_name: productName,
          customer_name: sale.customer_name,
        },
      });
      if (!pushcutResult.ok) {
        console.warn("[pushcut][sale.approved] not sent", {
          saleId: sale.id,
          skipped: pushcutResult.skipped ?? null,
          status: pushcutResult.status ?? null,
          error: pushcutResult.error ?? null,
        });
      }
    } catch (e) {
      console.error("[pushcut][sale.approved] error (suppressed)", e);
    }
  })();

  // Pushcut precisa sobreviver à resposta HTTP. Registamos PRIMEIRO em
  // waitUntil (para o Worker manter o isolate vivo mesmo se o cliente
  // abortar a fetch após ver "paid"/redirect) e SÓ DEPOIS fazemos o await
  // inline curto para tentar entregar antes do redirect quando dá.
  // A ordem invertida antes causava perda: se o isolate era reciclado
  // durante o await inline, nunca chegávamos a registar o waitUntil e o
  // fetch ao Pushcut era abortado deixando o log preso em "processing".
  const { waitUntil: scheduleAfterResponse } = await import("@/lib/runtime-context.server");
  const notificationTasks = Promise.allSettled([webPushTask, pushcutTask, webhookProcessing]);
  const scheduled = scheduleAfterResponse(notificationTasks);

  const pushcutBounded = Promise.race([
    pushcutTask,
    new Promise<void>((resolve) => setTimeout(resolve, 6_000)),
  ]);
  await pushcutBounded.catch(() => {});

  if (!scheduled) {
    // Ambiente sem waitUntil (dev/SSR local): garante que web push + webhook
    // completam antes de devolver, senão morrem com o handler.
    await notificationTasks;
  }


  // Silence unused warning for helper kept for non-approved flows.
  void enqueueWebhookEvent;


  if (sale.traffic_page_id) {
    const { data: existingTrafficEvent } = await supabaseAdmin
      .from("traffic_events")
      .select("id")
      .eq("page_id", sale.traffic_page_id)
      .eq("event_type", "purchase")
      .contains("metadata", { saleId: sale.id })
      .limit(1);
    if (!existingTrafficEvent?.length) {
      await supabaseAdmin.from("traffic_events").insert({
        page_id: sale.traffic_page_id,
        event_type: "purchase",
        metadata: { saleId: sale.id, productId: sale.product_id },
      });
    }
  }

  await Promise.race([
    webhookProcessing,
    new Promise((resolve) => setTimeout(resolve, inserted > 0 ? 3_000 : 500)),
  ]);
}
