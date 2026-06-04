import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Search, ExternalLink, MoreHorizontal, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/sales")({
  component: SalesPage,
});

function SalesPage() {
  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, products(name)")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendas</h1>
          <p className="text-muted-foreground">Monitore todas as transações da sua conta.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filtrar
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar vendas..." className="pl-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Comprador</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">Carregando vendas...</TableCell>
                </TableRow>
              ) : !sales || sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Sem vendas registradas ainda.
                  </TableCell>
                </TableRow>
              ) : (
                sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{sale.customer_name || "Desconhecido"}</span>
                        <span className="text-xs text-muted-foreground">{sale.customer_phone}</span>
                      </div>
                    </TableCell>
                    <TableCell>{(sale.products as any)?.name || "Produto Removido"}</TableCell>
                    <TableCell>{Number(sale.amount).toLocaleString("pt-MZ")} MT</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {sale.payment_method}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(sale.created_at).toLocaleDateString("pt-MZ")}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={sale.status === "approved" ? "secondary" : "outline"}
                        className={sale.status === "approved" ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}
                      >
                        {sale.status === "approved" ? "Aprovado" : sale.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Ações</DropdownMenuLabel>
                          <DropdownMenuItem>
                            <ExternalLink className="mr-2 h-4 w-4" /> Detalhes
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
