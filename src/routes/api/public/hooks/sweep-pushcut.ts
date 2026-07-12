import { createFileRoute } from "@tanstack/react-router";

// Auto-recuperação de notificações Pushcut de venda aprovada.
// Chamado por pg_cron a cada minuto. Objetivos:
//   1. Reprocessar linhas em pushcut_logs travadas em "processing" > 30s.
//   2. Redisparar Pushcut para vendas pagas nos últimos 30 min que ainda
//      não tenham log correspondente (Worker morreu antes do lock).
export const Route = createFileRoute("/api/public/hooks/sweep-pushcut")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { confirmSalePayment } = await import("@/lib/payments/confirmation.server");

        const cutoffProcessing = new Date(Date.now() - 30_000).toISOString();
        const cutoffSales = new Date(Date.now() - 30 * 60_000).toISOString();

        // 1. Locks travados: apagar para PushcutService reinserir na retentativa.
        const { data: stuck } = await supabaseAdmin
          .from("pushcut_logs")
          .select("id, order_id")
          .eq("status", "processing")
          .lt("created_at", cutoffProcessing);

        const stuckIds = (stuck ?? []).map((r) => r.id);
        if (stuckIds.length > 0) {
          await supabaseAdmin.from("pushcut_logs").delete().in("id", stuckIds);
        }

        // 2. Vendas pagas recentes sem log Pushcut confiável correspondente.
        // O log antigo `pushcut:sale_approved:*` pode ser criado pelo trigger
        // SQL quando apenas enfileirou pg_net; a via confiável da app usa
        // `pushcut:app:sale_approved:*`, gravada só depois do fetch real.
        const { data: paidSales } = await supabaseAdmin
          .from("sales")
          .select("id")
          .eq("status", "paid")
          .gte("created_at", cutoffSales)
          .limit(50);

        let retried = 0;
        for (const s of paidSales ?? []) {
          const orderId = `pushcut:app:sale_approved:${s.id}`;
          const { data: existing } = await supabaseAdmin
            .from("pushcut_logs")
            .select("status")
            .eq("order_id", orderId)
            .maybeSingle();
          if (existing?.status === "sent") continue;
          try {
            await confirmSalePayment({ saleId: s.id, triggerPushcut: true });
            retried++;
          } catch (e) {
            console.error("[sweep-pushcut] retry failed", { saleId: s.id, err: e });
          }
        }

        return Response.json({ ok: true, cleared: stuckIds.length, retried });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to sweep" }),
    },
  },
});
