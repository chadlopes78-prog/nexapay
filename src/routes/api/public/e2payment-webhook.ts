import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/e2payment-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const bodyText = await request.text();
        let payload: any = null;
        try {
          payload = bodyText ? JSON.parse(bodyText) : null;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        // Optional shared-secret verification (header sent by e2payment)
        const expectedSecret = process.env.E2PAYMENT_WEBHOOK_SECRET;
        if (expectedSecret) {
          const sent =
            request.headers.get("x-webhook-secret") ||
            request.headers.get("x-e2payment-secret") ||
            "";
          if (sent !== expectedSecret) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

        const transactionId =
          payload?.transaction_id ?? payload?.id ?? payload?.data?.transaction_id ?? null;
        const reference =
          payload?.reference ?? payload?.data?.reference ?? null;
        const rawStatus = String(
          payload?.status ?? payload?.data?.status ?? "",
        ).toLowerCase();

        if (!transactionId && !reference) {
          return new Response("Missing transaction id/reference", { status: 400 });
        }

        const status = ["success", "paid", "completed", "approved"].includes(rawStatus)
          ? "paid"
          : ["failed", "error", "cancelled", "canceled"].includes(rawStatus)
            ? "failed"
            : "pending";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { triggerSaleApprovedNotification } = await import("@/lib/api/notifications.server");
        const { enqueueWebhookEvent, processPendingForUser } = await import("@/lib/webhooks/dispatcher.server");

        // Fetch the sale first to get current status + context
        let saleQuery = supabaseAdmin.from("sales").select(
          "id, status, user_id, product_id, customer_name, customer_phone, amount, payment_method, products(name)",
        );
        if (transactionId) {
          saleQuery = saleQuery.eq("transaction_id", String(transactionId));
        } else {
          saleQuery = saleQuery.eq("payment_reference", String(reference));
        }

        const { data: saleData, error: saleFetchError } = await saleQuery.maybeSingle();

        if (saleFetchError || !saleData) {
          console.error("Sale not found for webhook", { transactionId, reference });
          return new Response("Sale not found", { status: 404 });
        }

        const isBecomingPaid = status === "paid" && saleData.status !== "paid";
        const isBecomingFailed = status === "failed" && saleData.status !== "failed";

        const { error: updateError } = await supabaseAdmin
          .from("sales")
          .update({
            status,
            transaction_id: transactionId ? String(transactionId).slice(0, 200) : undefined,
          })
          .eq("id", saleData.id);

        if (updateError) {
          console.error("webhook update error", updateError);
          return new Response("DB error", { status: 500 });
        }

        const userId = saleData.user_id;

        if (isBecomingPaid) {
          console.log("[Webhook] Sale became paid:", saleData.id);
          triggerSaleApprovedNotification(saleData.id).catch(err =>
            console.error("Error triggering sale notification:", err)
          );

          if (userId) {
            void (async () => {
              const payload = {
                sale_id: saleData.id,
                product_id: saleData.product_id,
                product_name: (saleData as any).products?.name ?? null,
                customer_name: saleData.customer_name,
                customer_phone: saleData.customer_phone,
                amount: saleData.amount,
                payment_method: saleData.payment_method,
                status: "paid",
                transaction_id: transactionId ? String(transactionId) : null,
                paid_at: new Date().toISOString(),
              };
              await enqueueWebhookEvent({ userId, event: "payment.received", payload, productId: saleData.product_id });
              await enqueueWebhookEvent({ userId, event: "sale.approved", payload, productId: saleData.product_id });
              await enqueueWebhookEvent({ userId, event: "product.delivered", payload, productId: saleData.product_id });
              await processPendingForUser(userId);
            })().catch((e) => console.error("[webhooks] paid events err", e));
          }
        } else if (isBecomingFailed && userId) {
          console.log("[Webhook] Sale failed:", saleData.id);
          void (async () => {
            await enqueueWebhookEvent({
              userId,
              productId: saleData.product_id,
              event: "payment.refused",
              payload: {
                sale_id: saleData.id, product_id: saleData.product_id,
                customer_name: saleData.customer_name, customer_phone: saleData.customer_phone,
                amount: saleData.amount, payment_method: saleData.payment_method,
                status: "failed",
              },
            });
            await processPendingForUser(userId);
          })().catch((e) => console.error("[webhooks] refused err", e));
        }

        return Response.json({ ok: true });
      },
    },
  },
});
