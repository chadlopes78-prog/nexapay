import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { 
  CheckCircle2, 
  Download, 
  ExternalLink, 
  ArrowRight,
  Package,
  Calendar,
  CreditCard,
  Hash,
  ShieldCheck,
  LayoutDashboard,
  MessageCircle,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";

import { z } from "zod";

const successSearchSchema = z.object({
  productId: z.string().optional(),
  saleId: z.string().optional(),
});

export const Route = createFileRoute("/success")({
  validateSearch: successSearchSchema,
  loaderDeps: ({ search }) => ({ productId: search.productId, saleId: search.saleId }),
  loader: async ({ deps: { productId, saleId } }) => {


    
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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If we land here without a sale, redirect to dashboard as a fallback
    if (!sale || !product) {
      const timer = setTimeout(() => {
        navigate({ to: "/dashboard" });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [sale, product, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#E30613]"></div>
      </div>
    );
  }

  if (!sale || !product) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB] p-4">
        <Card className="max-w-md w-full p-8 text-center border-none shadow-2xl rounded-3xl">
          <div className="h-16 w-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Hash className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">Recibo não encontrado</h1>
          <p className="text-slate-500 mt-2 font-medium">Não conseguimos validar os detalhes da sua compra.</p>
          <Button className="mt-8 h-12 w-full rounded-xl font-bold bg-black" onClick={() => navigate({ to: "/dashboard" })}>
            Ir para o Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  // Determine destination URL
  // We prioritize delivery_link (or access_link if we want to call it that)
  const destinationUrl = product.delivery_link || product.access_link || null;
  const isExternal = !!destinationUrl;

  return (
    <div className="min-h-screen bg-[#F9FAFB] py-12 px-4 flex flex-col items-center">
      <div className="max-w-xl w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="text-center space-y-4">
          <div className="h-24 w-24 bg-emerald-50 rounded-full flex items-center justify-center mx-auto shadow-sm border border-emerald-100">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">
              Obrigado por confiar na gente 🙏
            </h1>
            <p className="text-slate-500 font-bold text-lg">
              Seu pagamento foi confirmado com sucesso.
            </p>
          </div>
        </div>

        <Card className="border-none shadow-2xl rounded-3xl overflow-hidden bg-white">
          <CardHeader className="bg-[#E30613] text-white p-8 text-center">
            <div className="flex justify-center mb-4">
               <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                 <Package className="h-8 w-8" />
               </div>
            </div>
            <CardTitle className="text-2xl font-black tracking-tight">
              {product.name}
            </CardTitle>
            <p className="text-white/80 font-bold mt-1 uppercase tracking-widest text-xs">Acesso Liberado</p>
          </CardHeader>
          
          <CardContent className="p-8 space-y-8">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Hash className="h-3 w-3" /> ID DA VENDA
                </p>
                <p className="font-bold text-slate-900 text-sm">{sale.id.split("-")[0].toUpperCase()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> DATA
                </p>
                <p className="font-bold text-slate-900 text-sm">{new Date(sale.created_at).toLocaleDateString("pt-MZ")}</p>
              </div>
              <div className="col-span-2 space-y-1 pt-2 border-t border-slate-50">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <CreditCard className="h-3 w-3" /> VALOR TOTAL
                </p>
                <p className="text-3xl font-black text-[#E30613] tabular-nums">
                  {sale.amount.toLocaleString("pt-MZ")} <span className="text-lg">MT</span>
                </p>
              </div>
            </div>

            {/* Main Action Button */}
            <div className="pt-4 space-y-4">
              {destinationUrl ? (
                <Button 
                  className="w-full h-16 rounded-2xl bg-black hover:bg-slate-900 text-lg font-black shadow-xl shadow-black/10 transition-all active:scale-[0.98]"
                  asChild
                >
                  <a href={destinationUrl} target={destinationUrl.startsWith('http') ? "_blank" : "_self"} rel="noopener noreferrer">
                    ACESSAR CONTEÚDO <ArrowRight className="ml-2 h-6 w-6" />
                  </a>
                </Button>
              ) : (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-700 font-medium">
                      Seu acesso ainda está sendo configurado. Entre em contato pelo suporte.
                    </p>
                  </div>
                  <Button 
                    className="w-full h-16 rounded-2xl bg-[#25D366] hover:bg-[#20ba5a] text-lg font-black shadow-xl shadow-green-600/10 transition-all active:scale-[0.98]"
                    asChild
                  >
                    <a href={`https://wa.me/258${product.support_phone?.replace(/\D/g, '') || ''}`} target="_blank" rel="noopener noreferrer">
                      FALAR NO WHATSAPP <MessageCircle className="ml-2 h-6 w-6" />
                    </a>
                  </Button>
                </div>
              )}
            </div>

            {/* Extra delivery options if they exist */}
            {(product.delivery_type === 'file' || product.delivery_type === 'both') && product.delivery_file_url && (
              <div className="bg-slate-50 p-5 rounded-2xl border border-dashed border-slate-200 flex items-center justify-between group hover:border-[#E30613]/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 bg-white rounded-xl flex items-center justify-center shadow-sm text-blue-600">
                    <Download className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-black text-slate-900 text-sm">Download do Arquivo</p>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-tight">Conteúdo Digital</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-white hover:text-blue-600 transition-all" asChild>
                  <a href={product.delivery_file_url} download target="_blank" rel="noopener noreferrer">
                    <Download className="h-5 w-5" />
                  </a>
                </Button>
              </div>
            )}
          </CardContent>
          
          <CardFooter className="bg-slate-50/50 p-6 flex items-center justify-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Pagamento Verificado por PaymentBlack
            </span>
          </CardFooter>
        </Card>

        <div className="text-center">
          <Button variant="link" className="text-slate-400 font-bold" onClick={() => navigate({ to: "/dashboard" })}>
            Voltar para minha conta
          </Button>
        </div>
      </div>
    </div>
  );
}
