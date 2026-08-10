import { createFileRoute } from "@tanstack/react-router";

// Processa SMS agendadas (SMS 2..5 com atraso) cujo momento já chegou e
// recupera vendas aprovadas que ficaram sem agendamento.
// Chamado por pg_cron. Totalmente isolado do fluxo de pagamentos.
export const Route = createFileRoute("/api/public/hooks/sweep-sms")({
  server: {
    handlers: {
      POST: async () => {
        const { processDueSms, enqueueMissingSalesSms } = await import("@/lib/sms/dispatch.server");
        const recovered = await enqueueMissingSalesSms(25);
        const result = await processDueSms(50);
        return Response.json({ ok: true, recovered, ...result });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to sweep" }),
    },
  },
});
