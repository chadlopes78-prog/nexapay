import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/debito-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const bodyText = await request.text();
        // Implement official DebitoPay signature verification
        // https://debitopay.com/api-docs/#webhooks
        
        const { confirmSalePayment, findSaleForGatewayEvent, normalizeGatewayStatus, readGatewayFailureDetails, readGatewayReference, readGatewayTransactionId } = await import("@/lib/payments/confirmation.server");
        
        let payload: any;
        try {
          payload = JSON.parse(bodyText);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const transactionId = readGatewayTransactionId(payload);
        const reference = readGatewayReference(payload);
        const status = normalizeGatewayStatus(payload, true);

        const saleData = await findSaleForGatewayEvent(transactionId, reference);
        if (!saleData) return new Response("Sale not found", { status: 404 });

        if (status === "paid") {
          await confirmSalePayment({
            saleId: saleData.id,
            transactionId,
            reference,
            rawPayload: payload,
            triggerPushcut: true,
          });
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  }
});
