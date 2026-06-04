import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { processPayment } from "@/lib/api/payments.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ShieldCheck,
  CreditCard,
  Smartphone,
  CheckCircle2,
  Lock,
  ChevronRight,
  ShieldAlert,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/p/$productId")({
  component: CheckoutPage,
});
declare global {
  interface Window {
    fbq: any;
    _fbq: any;
  }
}


function CheckoutPage() {
  const payFn = useServerFn(processPayment);
  const { productId } = useParams({ from: "/p/$productId" });
  const [product, setProduct] = useState<any>(null);
  const [checkout, setCheckout] = useState<any>(null);
  const [trafficPageId, setTrafficPageId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"mpesa" | "emola">("mpesa");
  const [paymentStep, setPaymentStep] = useState<"info" | "reference">("info");

  useEffect(() => {
    // Get traffic page ID from URL
    const params = new URLSearchParams(window.location.search);
    const tp_id = params.get('tp_id');
    if (tp_id) {
      setTrafficPageId(tp_id);
      
      // If we have a tracking ID, record a click event
      // This ensures that even if the tracking script on the landing page 
      // didn't record the click (e.g. adblocker on the landing page but not here), 
      // we still count it.
      const recordClick = async () => {
        try {
          await supabase.functions.invoke('track-event', {
            body: {
              trackingId: tp_id,
              eventType: 'click',
              url: window.location.href,
              referrer: document.referrer,
              metadata: { productId }
            }
          });
        } catch (e) {
          console.error("Error recording click event:", e);
        }
      };
      recordClick();
    }
  }, [productId]);

  // Facebook Pixel integration
  useEffect(() => {
    if (product?.pixel_id) {
      // @ts-ignore
      if (window.fbq) {
        // @ts-ignore
        window.fbq('track', 'ViewContent', {
          content_name: product.name,
          content_category: product.category,
          content_ids: [product.id],
          content_type: 'product',
          value: product.price,
          currency: 'MZN'
        });
      }
    }
  }, [product]);

  const trackCheckout = () => {
    if (product?.pixel_id && window.fbq) {
      // @ts-ignore
      window.fbq('track', 'InitiateCheckout', {
        content_name: product.name,
        value: product.price,
        currency: 'MZN'
      });
    }
  };

  const trackPurchase = () => {
    if (product?.pixel_id && window.fbq) {
      // @ts-ignore
      window.fbq('track', 'Purchase', {
        content_name: product.name,
        value: product.price,
        currency: 'MZN'
      });
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: productData, error: productError } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .single();

      if (productError) {
        toast.error("Produto não encontrado");
        setLoading(false);
        return;
      }

      const { data: checkoutData } = await supabase
        .from("checkouts")
        .select("*")
        .eq("product_id", productId)
        .single();

      setProduct(productData);
      setCheckout(checkoutData);
      setLoading(false);
    };

    if (productId) fetchData();
  }, [productId]);

  useEffect(() => {
    if (product?.pixel_id) {
      // Initialize FB Pixel if it's not already there
      // @ts-ignore
      if (!window.fbq) {
        // @ts-ignore
        const initFB = (f,b,e,v,n,t,s) => {
          if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s);
        };
        initFB(window, document,'script','https://connect.facebook.net/en_US/fbevents.js', null, null, null);
      }
      window.fbq('init', product.pixel_id);
      window.fbq('track', 'PageView');
    }
  }, [product?.pixel_id]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone || phone.replace(/\D/g, "").length < 9) {
      toast.error("Por favor, insira um número de telefone válido.");
      return;
    }

    setLoading(true);
    trackCheckout();
    toast.info(`Enviando pedido de pagamento via ${paymentMethod.toUpperCase()}... Confirme no seu telefone.`);

    try {
      // Resolve traffic page id
      let finalTrafficPageId: string | null = null;
      if (trafficPageId) {
        const { data: pageData } = await supabase
          .from("traffic_pages")
          .select("id")
          .eq("tracking_id", trafficPageId)
          .single();
        if (pageData) finalTrafficPageId = pageData.id;
      }

      // Create pending sale first to get a stable reference
      const { data: sale, error: saleErr } = await supabase
        .from("sales")
        .insert({
          product_id: productId,
          customer_name: name,
          customer_phone: phone,
          amount: product.price,
          payment_method: paymentMethod,
          status: "pending",
          traffic_page_id: finalTrafficPageId,
        })
        .select()
        .single();

      if (saleErr) throw saleErr;

      // Call payment gateway
      const result = await payFn({
        data: {
          method: paymentMethod,
          msisdn: phone,
          amount: Number(product.price),
          reference: sale.id.slice(0, 16),
        },
      });

      if (!result.success) {
        await supabase
          .from("sales")
          .update({ status: "failed", payment_reference: result.error?.slice(0, 200) })
          .eq("id", sale.id);
        toast.error(result.error || "Pagamento recusado.");
        setLoading(false);
        return;
      }

      // Mark as paid
      const gatewayRef =
        (result.data && (result.data.transaction_id || result.data.reference || result.data.id)) ||
        sale.id;
      await supabase
        .from("sales")
        .update({ status: "paid", payment_reference: String(gatewayRef) })
        .eq("id", sale.id);

      if (finalTrafficPageId) {
        await supabase.from("traffic_events").insert({
          page_id: finalTrafficPageId,
          event_type: "purchase",
          metadata: { saleId: sale.id, productId },
        });
      }

      trackPurchase();
      toast.success("Pagamento confirmado!");

      setTimeout(() => {
        window.location.href = `/success?productId=${productId}&saleId=${sale.id}`;
      }, 800);
    } catch (error: any) {
      toast.error("Erro ao processar pagamento: " + error.message);
      setLoading(false);
    }
  };



  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground">Carregando checkout seguro...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Card className="max-w-md w-full text-center p-8">
          <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Produto não encontrado</h1>
          <p className="text-muted-foreground mt-2">
            Este link de checkout parece ser inválido ou expirou.
          </p>
          <Button className="mt-6" asChild>
            <a href="/">Voltar ao início</a>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-4 md:py-12 px-4">
      {/* Top Banner - Urgency */}
      <div className="w-full max-w-[500px] mb-4">
        <div className="bg-[#8B0000] text-white text-xs md:text-sm py-2 px-4 rounded-full flex items-center justify-center gap-2">
          <span className="animate-pulse">●</span>
          Oferta por tempo limitado — expira em 10:00
        </div>
      </div>

      <div className="w-full max-w-[500px] bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <form onSubmit={handlePayment} className="p-6 md:p-8 space-y-6">
          {/* Product Header */}
          <div className="flex gap-4 items-start border-b border-slate-50 pb-6">
            <div className="h-16 w-16 md:h-20 md:w-20 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300">
                  <Package className="h-8 w-8" />
                </div>
              )}
            </div>
            <div className="space-y-1">
              <h1 className="text-lg md:text-xl font-bold text-slate-900 leading-tight">
                {product.name}
              </h1>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
                <span>Compra segura</span>
              </div>
            </div>
          </div>

          {/* Price Box */}
          <div className="bg-[#F0F7FF] p-4 md:p-6 rounded-2xl flex justify-between items-center">
            <span className="text-slate-600 font-medium">TOTAL A PAGAR</span>
            <span className="text-2xl md:text-3xl font-black text-blue-600">
              {product.price.toLocaleString("pt-MZ")} MT
            </span>
          </div>

          <CardContent className="p-0 space-y-6">
            {paymentStep === "info" ? (
              <>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="checkout-name" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      NOME COMPLETO *
                    </Label>
                    <Input
                      id="checkout-name"
                      placeholder="Ex: João Silva"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-12 border-slate-200 rounded-xl focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="checkout-phone" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      NÚMERO DE TELEFONE (OPCIONAL)
                    </Label>
                    <Input
                      id="checkout-phone"
                      placeholder="840000000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="h-12 border-slate-200 rounded-xl focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    DESEJA PAGAR COM:
                  </Label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("mpesa")}
                      className={cn(
                        "flex flex-col items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all font-bold group",
                        paymentMethod === "mpesa"
                          ? "border-blue-600 bg-blue-50 text-blue-600"
                          : "border-slate-100 hover:border-slate-200 text-slate-500",
                      )}
                    >
                      <div className="h-12 w-12 rounded-lg overflow-hidden border border-slate-100 shadow-sm group-hover:scale-105 transition-transform">
                        <img src="/mpesa-logo.jpg" className="h-full w-full object-cover" alt="M-Pesa" />
                      </div>
                      <span className="text-sm">M-Pesa</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("emola")}
                      className={cn(
                        "flex flex-col items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all font-bold group",
                        paymentMethod === "emola"
                          ? "border-orange-500 bg-orange-50 text-orange-600"
                          : "border-slate-100 hover:border-slate-200 text-slate-500",
                      )}
                    >
                      <div className="h-12 w-12 rounded-lg overflow-hidden border border-slate-100 shadow-sm group-hover:scale-105 transition-transform">
                        <img src="/emola-logo.jpg" className="h-full w-full object-cover" alt="e-Mola" />
                      </div>
                      <span className="text-sm">e-Mola</span>
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full h-14 text-lg font-bold bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-200">
                  <Lock className="mr-2 h-5 w-5" /> Pagar {product.price.toLocaleString("pt-MZ")} MT
                </Button>
              </>
            ) : (
              <div className="space-y-6">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4 text-center">
                  <h4 className="font-bold text-slate-800">INSTRUÇÕES DE PAGAMENTO</h4>
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600">Transfira o valor exato para o número:</p>
                    <p className="text-2xl font-black text-slate-900 bg-white py-3 rounded-xl border border-slate-100">841234567</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-tighter">Beneficiário: SISTEMA AUTOMÁTICO</p>
                  </div>
                </div>

                <div className="space-y-2 text-center">
                  <Label htmlFor="payment-ref" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    CÓDIGO DE REFERÊNCIA
                  </Label>
                  <Input
                    id="payment-ref"
                    placeholder="Ex: 123456789"
                    required
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    className="h-14 text-xl text-center font-mono rounded-xl border-2 border-blue-100 focus:border-blue-500"
                  />
                  <p className="text-[10px] text-slate-400 px-4">
                    Copie a referência do SMS que você recebeu após a transferência
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <Button type="submit" className="w-full h-14 text-lg font-bold bg-green-600 hover:bg-green-700 rounded-xl shadow-lg shadow-green-100">
                    Confirmar Pagamento
                  </Button>
                  <button 
                    type="button" 
                    onClick={() => setPaymentStep("info")}
                    className="text-xs font-bold text-slate-400 uppercase hover:text-slate-600 transition-colors"
                  >
                    Voltar e alterar dados
                  </button>
                </div>
              </div>
            )}
          </CardContent>
          
          <div className="pt-4 flex flex-col items-center gap-4 border-t border-slate-50">
            <div className="flex items-center gap-6">
               <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <Lock className="h-3 w-3" />
                PAGAMENTO SEGURO
              </div>
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <ShieldCheck className="h-3 w-3" />
                DADOS PROTEGIDOS
              </div>
            </div>
            <p className="text-[10px] text-slate-300 text-center uppercase tracking-tighter">
              © 2026 Processado em nome de {product.merchant_id}
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

