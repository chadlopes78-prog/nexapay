import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_dashboard/sales")({
  component: SalesPage,
});

function SalesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Vendas</h1>
        <p className="text-muted-foreground">Monitore todas as transações da sua conta.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Vendas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <CreditCard className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-slate-500">Nenhuma venda realizada ainda.</p>
        </CardContent>
      </Card>
    </div>
  );
}
