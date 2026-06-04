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

        let query = supabaseAdmin.from("sales").update({
          status,
          transaction_id: transactionId ? String(transactionId).slice(0, 200) : undefined,
        });

        if (transactionId) {
          query = query.eq("transaction_id", String(transactionId));
        } else if (reference) {
          query = query.eq("payment_reference", String(reference));
        }

        const { error } = await query;
        if (error) {
          console.error("webhook update error", error);
          return new Response("DB error", { status: 500 });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
