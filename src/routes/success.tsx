import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  CheckCircle2, 
  Download, 
  ExternalLink, 
  ArrowRight,
  Package,
  Calendar,
  CreditCard,
  Hash
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/success")({
  loader: async ({ search }) => {
    const productId = search.productId as string;
    const saleId = search.saleId as string;
    
    if (!productId || !saleId) return { sale: null, product: null };
    
    const { data: saleData } = await supabase
      .from("sales")
      .select("*, products(*)")
      .eq("id", saleId)
      .single();
      
    if (!saleData) return { sale: null, product: null };
    
    return {
      sale: saleData,
      product: saleData.products,
    };
  },
  component: SuccessPage,
});

function SuccessPage() {
  const { sale, product } = Route.useLoaderData();
  const [loading, setLoading] = useState(false);


  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!sale || !product) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Card className="max-w-md w-full p-8 text-center">
          <h1 className="text-2xl font-bold text-red-600">Erro ao carregar recibo</h1>
          <p className="text-muted-foreground mt-2">Não conseguimos encontrar os detalhes da sua compra.</p>
          <Button className="mt-6" asChild>
            <a href="/">Voltar ao Início</a>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Pagamento Aprovado!</h1>
          <p className="text-muted-foreground">Obrigado pela sua compra. Seus detalhes estão abaixo.</p>
        </div>

        <Card className="border-none shadow-lg overflow-hidden">
          <CardHeader className="bg-primary text-white p-6">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" /> {product.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1"><Hash className="h-3 w-3" /> Transação</p>
                  <p className="font-mono font-medium">{sale.id.split("-")[0].toUpperCase()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Data</p>
                  <p className="font-medium">{new Date(sale.created_at).toLocaleDateString("pt-MZ")}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1"><CreditCard className="h-3 w-3" /> Valor Pago</p>
                  <p className="font-bold text-lg text-primary">{sale.amount.toLocaleString("pt-MZ")} MT</p>
                </div>
              </div>

              {(product.delivery_type === 'file' || product.delivery_type === 'both') && product.delivery_file_url && (
                <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Download className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold">Seu arquivo digital</p>
                      <p className="text-xs text-muted-foreground">Clique para baixar agora</p>
                    </div>
                  </div>
                  <Button asChild>
                    <a href={product.delivery_file_url} download target="_blank" rel="noopener noreferrer">
                      Download <Download className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </div>
              )}

              {(product.delivery_type === 'link' || product.delivery_type === 'both') && product.delivery_link && (
                <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <ExternalLink className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-semibold">Acesso ao conteúdo</p>
                      <p className="text-xs text-muted-foreground">Link externo ou área de membros</p>
                    </div>
                  </div>
                  <Button variant="outline" asChild>
                    <a href={product.delivery_link} target="_blank" rel="noopener noreferrer">
                      Acessar Agora <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Seu pedido foi registrado e está em processamento.
          </p>
        </div>
      </div>
    </div>
  );
}
