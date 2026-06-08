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

        // Fetch the sale first to get product_id and check current status
        let saleQuery = supabaseAdmin.from("sales").select("*, products(user_id)").single();
        if (transactionId) {
          saleQuery = saleQuery.eq("transaction_id", String(transactionId));
        } else {
          saleQuery = saleQuery.eq("payment_reference", String(reference));
        }

        const { data: saleData, error: saleFetchError } = await saleQuery;

        if (saleFetchError || !saleData) {
          console.error("Sale not found for webhook", { transactionId, reference });
          return new Response("Sale not found", { status: 404 });
        }

        // Only trigger push if status is changing to paid
        const isBecomingPaid = status === "paid" && saleData.status !== "paid";

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

        // Trigger push notification if paid
        if (isBecomingPaid) {
          const userId = (saleData.products as any)?.user_id;
          if (userId) {
            console.log("Triggering push notification for user:", userId);
            
            // Call the send-push edge function
            // We use the internal URL if possible, or the public one
            const supabaseUrl = process.env.SUPABASE_URL;
            const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

            if (supabaseUrl && supabaseServiceKey) {
              try {
                const amount = saleData.amount || 0;
                const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseServiceKey}`
                  },
                  body: JSON.stringify({
                    user_id: userId,
                    title: "Nova venda 🎉",
                    body: `Recebeste um pagamento de ${amount} MT`,
                    url: "/dashboard/sales"
                  })
                });
                
                if (!response.ok) {
                  const errorText = await response.text();
                  console.error("Failed to send push notification:", errorText);
                }
              } catch (err) {
                console.error("Error calling send-push function:", err);
              }
            }
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
