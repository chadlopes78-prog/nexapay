import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_dashboard/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
        <p className="text-muted-foreground">Gerencie sua base de clientes e leads.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sua Base de Clientes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <Users className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-slate-500">Nenhum cliente cadastrado ainda.</p>
        </CardContent>
      </Card>
    </div>
  );
}
