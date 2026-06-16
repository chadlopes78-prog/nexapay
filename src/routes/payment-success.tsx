import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { 
  CheckCircle2, 
  ArrowRight,
  MessageCircle,
  AlertCircle,
  Package,
  ShieldCheck,
  XCircle,
  Loader2
} from "lucide-react";
import { z } from "zod";

const successSearchSchema = z.object({
  saleId: z.string().optional(),
  productId: z.string().optional(),
});

export const Route = createFileRoute("/payment-success")({
  validateSearch: successSearchSchema,
  component: PaymentSuccessPage,
});

function PaymentSuccessPage() {
  const { saleId, productId } = Route.useSearch();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ sale: any; product: any } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!saleId) {
        setLoading(false);
        setError("Pagamento não identificado.");
        return;
      }

      try {
        const { data: saleData, error: saleError } = await supabase
          .from("sales")
          .select("*, products(id, name, image_url, price, access_link, delivery_link, support_phone, support_number, warranty_days, delivery_type)")
          .eq("id", saleId)
          .single();

        if (saleError || !saleData) {
          setData(null);
        } else {
          setData({
            sale: saleData,
            product: saleData.products,
          });
        }
      } catch (err) {
        console.error("Error fetching success data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [saleId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB]">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-[#E30613] mx-auto" />
          <p className="text-slate-500 font-bold">Validando seu acesso...</p>
        </div>
      </div>
    );
  }

  // Security check: Only paid sales allow access
  const isPaid = data?.sale?.status === "paid";
  const product = data?.product;
  const accessLink = product?.access_link || product?.delivery_link;
  const supportNumber = product?.support_number || product?.support_phone || "258840000000"; // Fallback number if none exists

  // Fallback UI if product is missing or payment not confirmed
  if (!data?.sale || !isPaid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB] p-4">
        <Card className="max-w-md w-full border-none shadow-2xl rounded-3xl overflow-hidden animate-in fade-in zoom-in duration-500">
          <CardHeader className="bg-amber-500 text-white p-8 text-center">
             <div className="flex justify-center mb-4">
                <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                  <AlertCircle className="h-10 w-10" />
                </div>
             </div>
             <CardTitle className="text-2xl font-black">Acesso em Processamento</CardTitle>
          </CardHeader>
          <CardContent className="p-8 text-center space-y-6">
            <p className="text-slate-600 font-bold text-lg">
              Seu acesso está sendo preparado. Caso o pagamento já tenha sido feito, entre em contacto com o suporte.
            </p>
            
            <Button 
              className="w-full h-16 rounded-2xl bg-[#25D366] hover:bg-[#20ba5a] text-lg font-black shadow-xl shadow-green-600/10 transition-all active:scale-[0.98]"
              asChild
            >
              <a href={`https://wa.me/${supportNumber.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                FALAR COM SUPORTE <MessageCircle className="ml-2 h-6 w-6" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] py-12 px-4 flex flex-col items-center">
      <div className="max-w-xl w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="text-center space-y-4">
          <div className="h-24 w-24 bg-emerald-50 rounded-full flex items-center justify-center mx-auto shadow-sm border border-emerald-100">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">
              Obrigado pela sua compra 🙏
            </h1>
            <p className="text-slate-500 font-bold text-lg">
              Pagamento confirmado com sucesso.
            </p>
          </div>
        </div>

        <Card className="border-none shadow-2xl rounded-3xl overflow-hidden bg-white">
          <CardHeader className="bg-black text-white p-8 text-center">
            <div className="flex justify-center mb-4">
               <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
                 <Package className="h-8 w-8" />
               </div>
            </div>
            <CardTitle className="text-2xl font-black tracking-tight">
              {product?.name || "Produto Adquirido"}
            </CardTitle>
            <p className="text-white/60 font-bold mt-1 uppercase tracking-widest text-[10px]">Acesso Liberado</p>
          </CardHeader>
          
          <CardContent className="p-8 space-y-6">
            {/* Action Buttons */}
            <div className="space-y-4">
              {accessLink && (
                <Button 
                  className="w-full h-16 rounded-2xl bg-[#E30613] hover:bg-[#c40510] text-lg font-black shadow-xl shadow-red-600/10 transition-all active:scale-[0.98]"
                  asChild
                >
                  <a href={accessLink} target="_blank" rel="noopener noreferrer">
                    ACESSAR PRODUTO <ArrowRight className="ml-2 h-6 w-6" />
                  </a>
                </Button>
              )}

              <Button 
                variant="outline"
                className="w-full h-16 rounded-2xl border-2 border-slate-100 hover:bg-slate-50 text-slate-600 text-lg font-black transition-all active:scale-[0.98]"
                asChild
              >
                <a href={`https://wa.me/${supportNumber.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                  FALAR COM SUPORTE <MessageCircle className="ml-2 h-6 w-6 text-[#25D366]" />
                </a>
              </Button>
            </div>
          </CardContent>
          
          <CardFooter className="bg-slate-50/50 p-6 flex items-center justify-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Compra 100% Segura e Verificada
            </span>
          </CardFooter>
        </Card>

        <p className="text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
          PaymentBlack • Todos os direitos reservados
        </p>
      </div>
    </div>
  );
}
