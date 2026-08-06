import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/e2payment-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const bodyText = await request.text();
        let payload: unknown = null;
        try {
          payload = bodyText ? JSON.parse(bodyText) : null;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        // Shared-secret verification. In produção o secret é OBRIGATÓRIO
        // — sem ele qualquer origem poderia forjar aprovação de venda.
        // Em dev/preview aceitamos ausência para não bloquear testes locais.
        const expectedSecret = process.env.E2PAYMENT_WEBHOOK_SECRET;
        const isProd = process.env.NODE_ENV === "production";
        if (!expectedSecret) {
          if (isProd) {
            console.error("[Webhook] E2PAYMENT_WEBHOOK_SECRET missing in production — rejecting request");
            return new Response("Server misconfigured", { status: 500 });
          }
        } else {
          const sent =
            request.headers.get("x-webhook-secret") ||
            request.headers.get("x-e2payment-secret") ||
            "";
          // Comparação em tempo constante para evitar timing oracle.
          const a = new TextEncoder().encode(sent);
          const b = new TextEncoder().encode(expectedSecret);
          let equal = a.length === b.length;
          const len = Math.max(a.length, b.length);
          for (let i = 0; i < len; i++) equal = equal && a[i] === b[i];
          if (!equal) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

        const {
          confirmSalePayment,
          findSaleForGatewayEvent,
          markSaleTerminalFailure,
          normalizeGatewayStatus,
          readGatewayFailureDetails,
          readGatewayReference,
          readGatewayTransactionId,
        } = await import("@/lib/payments/confirmation.server");

        const transactionId = readGatewayTransactionId(payload);
        const reference = readGatewayReference(payload);

        if (!transactionId && !reference) {
          return new Response("Missing transaction id/reference", { status: 400 });
        }

        const status = normalizeGatewayStatus(payload, true);
        const saleData = await findSaleForGatewayEvent(transactionId, reference);
        if (!saleData) {
          console.error("Sale not found for webhook", { transactionId, reference });
          return new Response("Sale not found", { status: 404 });
        }

        if (status === "paid") {
          console.log("[Webhook] payment webhook received", {
            orderId: saleData.id,
            paymentStatus: status,
            transactionId,
            reference,
          });
          await confirmSalePayment({
            saleId: saleData.id,
            transactionId,
            reference,
            rawPayload: payload,
            triggerPushcut: true,
          });
        } else if (status === "failed" || status === "expired" || status === "cancelled") {
          const failure = readGatewayFailureDetails(payload, status);
          console.info("[payment-cancellation-debug]", {
            saleId: saleData.id,
            source: "webhook",
            normalizedStatus: status,
            transactionId,
            reference,
            gatewayCode: failure.code,
            gatewayMessage: failure.rawMessage,
          });
          await markSaleTerminalFailure({
            saleId: saleData.id,
            status,
            transactionId,
            reference,
            reason: failure.message,
            code: failure.code,
            source: "e2payments_webhook",
          });
        }

        return Response.json({ ok: true, status });
      },
    },
  },
});
