import { createFileRoute } from "@tanstack/react-router";

// Chamado por pg_cron a cada minuto. Encerra vendas "pending" antigas
// (cliente nunca introduziu o PIN / gateway nunca confirmou) marcando-as
// como expiradas com justificativa clara. Sem isto, vendas ficam
// "pending" por horas quando ninguém abre o polling do checkout.
export const Route = createFileRoute("/api/public/hooks/sweep-pending-sales")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Cutoff: 5 minutos. STK push + PIN humano cabe em ~2min; após 5min
        // é seguro assumir timeout definitivo.
        const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();

        const { data, error } = await supabaseAdmin
          .from("sales")
          .update({
            status: "expired",
            failure_reason:
              "Cliente não introduziu o PIN a tempo (timeout automático após 5min sem confirmação da gateway).",
            failure_code: "timeout_sweep",
          })
          .eq("status", "pending")
          .lt("created_at", cutoff)
          .select("id");

        if (error) {
          console.error("[sweep-pending-sales] error", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return Response.json({ ok: true, expired: data?.length ?? 0 });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to sweep" }),
    },
  },
});
