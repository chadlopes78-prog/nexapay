import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/debito-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const bodyText = await request.text();
        const signature = request.headers.get("x-debitopay-signature");

        const { 
          confirmSalePayment, 
          findSaleForGatewayEvent, 
          normalizeGatewayStatus, 
          readGatewayReference, 
          readGatewayTransactionId 
        } = await import("@/lib/payments/confirmation.server");
        
        let payload: any;
        try {
          payload = JSON.parse(bodyText);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const transactionId = readGatewayTransactionId(payload);
        const reference = readGatewayReference(payload);
        const saleData = await findSaleForGatewayEvent(transactionId, reference);
        
        if (!saleData) return new Response("Sale not found", { status: 404 });

        // Security: Validate signature if Webhook Secret is configured for the user
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: creds } = await supabaseAdmin
          .from("user_payment_credentials")
          .select("debitopay_za_webhook_secret")
          .eq("user_id", saleData.user_id)
          .maybeSingle();

        if (creds?.debitopay_za_webhook_secret) {
          const { createHmac, timingSafeEqual } = await import("node:crypto");
          const expected = createHmac("sha256", creds.debitopay_za_webhook_secret)
            .update(bodyText)
            .digest("hex");
            
          if (!signature || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
            console.error("[debito-webhook] Invalid signature", { saleId: saleData.id });
            return new Response("Invalid signature", { status: 401 });
          }
        }

        const status = normalizeGatewayStatus(payload, true);
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
