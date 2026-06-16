import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { processPayment, type PaymentResult } from "@/lib/api/payments.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  ShieldCheck,
  CheckCircle2,
  Lock,
  ShieldAlert,
  Package,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import mozFlag from "@/assets/moz-flag.png.asset.json";

export const Route = createFileRoute("/p/$productId")({
  loader: async ({ params: { productId } }) => {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId);
      const PUBLIC_PRODUCT_COLUMNS = "id, user_id, name, description, price, image_url, category, status, custom_url, warranty_days, delivery_type, facebook_pixel_id, support_number";

      // Single product fetch (by UUID or slug) — no wasted parallel query
      const productRes = await supabase
        .from("products")
        .select(PUBLIC_PRODUCT_COLUMNS)
        .eq(isUuid ? "id" : "custom_url", productId)
        .maybeSingle();

      let finalProduct = productRes.data as any;

      // Fallback: UUID-looking slug that's actually a custom_url
      if (!finalProduct && isUuid) {
        const fallbackRes = await supabase
          .from("products")
          .select(PUBLIC_PRODUCT_COLUMNS)
          .eq("custom_url", productId)
          .maybeSingle();
        finalProduct = fallbackRes.data;
      }

      if (!finalProduct) {
        return { product: null, checkout: null, defaultPixel: null };
      }

      // Parallel fetch of checkout + default pixel (only after we know the real product.id/user_id)
      const checkoutPromise = supabase
        .from("checkouts")
        .select("*")
        .eq("product_id", finalProduct.id)
        .maybeSingle();

      const pixelPromise = finalProduct.facebook_pixel_id
        ? Promise.resolve({ data: null })
        : supabase
            .from("pixel_configs")
            .select("fb_pixel_id, fb_access_token")
            .eq("user_id", finalProduct.user_id)
            .maybeSingle();

      const [checkoutRes, pixelRes] = await Promise.all([checkoutPromise, pixelPromise]);

      return {
        product: finalProduct,
        checkout: checkoutRes.data ?? null,
        defaultPixel: pixelRes.data ?? null,
      };
    } catch (err) {
      console.error("Loader error:", err);
      return { product: null, checkout: null, defaultPixel: null };
    }
  },
  head: ({ loaderData }) => {
    const product = loaderData?.product;
    if (!product) return {};
    const image = product.image_url || "";
    return {
      meta: [
        { title: `${product.name} | Paymentblack Mozambique` },
        { name: "description", content: product.description || "Checkout seguro via M-Pesa e e-Mola" },
        { property: "og:title", content: product.name },
        { property: "og:image", content: image },
      ],
      // Preload product image to improve LCP on the checkout page
      links: image
        ? [{ rel: "preload", as: "image", href: image, fetchpriority: "high" }]
        : [],
    };
  },
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
  const { product, checkout, defaultPixel } = Route.useLoaderData();
  
  const pixelId = product?.facebook_pixel_id || defaultPixel?.fb_pixel_id;
  const pixelToken = product?.facebook_access_token || defaultPixel?.fb_access_token;
  const [isRetrying, setIsRetrying] = useState(false);
  const isLoading = false;

  const handleRetry = async () => {
    setIsRetrying(true);
    window.location.reload();
  };

  
  const [trafficPageId, setTrafficPageId] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentStatusMessage, setPaymentStatusMessage] = useState<string | null>(null);
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"mpesa" | "emola">("mpesa");
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    // Get traffic page ID from URL
    const params = new URLSearchParams(window.location.search);
    const tp_id = params.get('tp_id');
    if (tp_id) {
      setTrafficPageId(tp_id);
      
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


  // Facebook Pixel: init + ViewContent in one effect (no race, no crash)
  useEffect(() => {
    if (!pixelId) return;
    try {
      // @ts-ignore
      if (!window.fbq) {
        // @ts-ignore
        const initFB = (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) => {
          if (f.fbq) return;
          n = f.fbq = function () {
            n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
          };
          if (!f._fbq) f._fbq = n;
          n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
          t = b.createElement(e); t.async = !0; t.src = v;
          s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
        };
        initFB(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      }
      window.fbq('init', pixelId);
      window.fbq('track', 'PageView');
      window.fbq('track', 'ViewContent', {
        content_name: product.name,
        content_category: product.category,
        content_ids: [product.id],
        content_type: 'product',
        value: product.price,
        currency: 'MZN'
      });
    } catch (e) {
      console.error('FB Pixel error:', e);
    }
  }, [pixelId, product?.id]);

  const trackCheckout = () => {
    try {
      if (pixelId && window.fbq) {
        window.fbq('track', 'InitiateCheckout', {
          content_name: product.name, value: product.price, currency: 'MZN',
        });
      }
    } catch (e) { console.error(e); }
  };

  const trackPurchase = () => {
    try {
      if (pixelId && window.fbq) {
        window.fbq('track', 'Purchase', {
          content_name: product.name, value: product.price, currency: 'MZN',
        });
      }
    } catch (e) { console.error(e); }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone || phone.replace(/\D/g, "").length < 9) {
      toast.error("Por favor, insira um número de telefone válido.");
      return;
    }

    setProcessingPayment(true);
    setPaymentErrorMessage(null);
    setPaymentStatusMessage(`Pedido enviado para ${paymentMethod === "mpesa" ? "M-Pesa" : "e-Mola"}. Confirme no seu telefone.`);
    trackCheckout();
    toast.info(`Enviando pedido de pagamento via ${paymentMethod.toUpperCase()}... Confirme no seu telefone.`);

    try {
      // Call payment gateway
      const result = (await payFn({
        data: {
          productId,
          method: paymentMethod,
          msisdn: phone,
          customerName: name,
          contactPhone: contactPhone || undefined,
          trafficPageTrackingId: trafficPageId,
        },
      })) as PaymentResult;

      if (!result.success) {
        setPaymentErrorMessage(result.error || "Pagamento recusado.");
        setPaymentStatusMessage(null);
        toast.error(result.error || "Pagamento recusado.");
        setProcessingPayment(false);
        return;
      }

      trackPurchase();
      setPaymentStatusMessage("Pagamento confirmado. A redirecionar...");
      toast.success("Pagamento confirmado!");

      setTimeout(() => {
        window.location.href = `/payment-success?productId=${productId}&saleId=${result.saleId}`;
      }, 800);
    } catch (error: any) {
      setPaymentErrorMessage(error?.message || "Erro inesperado ao processar pagamento.");
      setPaymentStatusMessage(null);
      toast.error("Erro ao processar pagamento: " + error.message);
      setProcessingPayment(false);
    }
  };




  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="relative mx-auto h-24 w-24">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
            <div className="absolute inset-0 rounded-full border-4 border-[#E30613] border-t-transparent animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Package className="h-8 w-8 text-slate-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900">A carregar o checkout...</h2>
            <p className="text-slate-500">Estamos a preparar a sua experiência de compra segura.</p>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#E30613] h-full w-1/2 animate-[loading_2s_ease-in-out_infinite]"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full text-center p-10 shadow-2xl border-none rounded-3xl animate-in fade-in zoom-in duration-500">
          <div className="h-20 w-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="h-10 w-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Produto Indisponível</h1>
          <p className="text-slate-500 mt-4 leading-relaxed">
            O link pode ter expirado ou o produto foi removido. Por favor, contacte o vendedor se achar que isto é um erro.
          </p>
          <div className="flex flex-col gap-3 mt-8">
            <Button 
              variant="outline" 
              className="h-12 rounded-xl font-bold"
              onClick={handleRetry}
              disabled={isRetrying}
            >
              {isRetrying ? "A tentar..." : "Tentar novamente"}
            </Button>
            <Button className="h-12 rounded-xl font-bold bg-black hover:bg-slate-900" asChild>
              <a href="/">Voltar ao início</a>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-4 md:py-12 px-4 transition-all duration-300">
      {/* Top Banner - Urgency with real logic or faster appearance */}
      <div className="w-full mb-4 -mx-4 md:-mx-0 md:-mt-12 md:mb-6 animate-in slide-in-from-top duration-500">
        <div className="bg-[#E30613] text-white text-sm md:text-xl py-4 px-6 md:py-5 md:px-8 flex items-center justify-center gap-2 md:gap-3 font-bold shadow-2xl rounded-none sticky top-0 z-50 uppercase tracking-tighter">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
            </span>
            <span className="flex items-center gap-2">
              <span className="animate-pulse">⚡</span>
              Finalize sua compra agora — Oferta expira em {formatTime(timeLeft)}
            </span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-[500px] bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden relative animate-in fade-in zoom-in-95 duration-500">
        <form onSubmit={handlePayment} className="p-6 md:p-8 space-y-6">
          {/* Product Header */}
          <div className="flex gap-4 items-start border-b border-slate-50 pb-6">
            <div className="h-16 w-16 md:h-20 md:w-20 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  loading="eager"
                  decoding="async"
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
              <div className="text-3xl md:text-4xl font-black text-black tracking-tighter">
                {product.price.toLocaleString("pt-MZ")}MT
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#E30613]" />
                <span>Compra 100% segura</span>
              </div>
            </div>
          </div>


          <CardContent className="p-0 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="checkout-name" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                NOME COMPLETO *
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="checkout-name"
                  placeholder="Nome completo"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-12 pl-10 border-slate-200 rounded-xl focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="checkout-contact-phone" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                NÚMERO DE WHATSAPP
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#25D366">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                  <span className="text-sm font-medium text-slate-600">+258</span>
                </div>
                <Input
                  id="checkout-contact-phone"
                  placeholder="84xxxxxxx"
                  inputMode="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="h-12 pl-20 border-slate-200 rounded-xl focus:ring-blue-500"
                />
              </div>
              <p className="text-[10px] text-slate-400">
                Usado apenas para contacto via WhatsApp. O número de pagamento é pedido a seguir.
              </p>
            </div>







            <div className="space-y-4">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                MÉTODOS DE PAGAMENTO
              </Label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => { setPaymentMethod("mpesa"); setPhone(""); }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all font-bold group relative overflow-hidden",
                    paymentMethod === "mpesa"
                      ? "border-[#E30613] bg-red-50 text-[#E30613] ring-4 ring-red-500/10"
                      : "border-slate-100 hover:border-slate-200 text-slate-500 bg-white",
                  )}
                >
                  {paymentMethod === "mpesa" && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle2 className="h-4 w-4 text-[#E30613]" />
                    </div>
                  )}
                  <div className="h-14 w-14 rounded-xl overflow-hidden border border-slate-100 shadow-md group-hover:scale-110 transition-transform">
                    <img src="/mpesa-logo.jpg" className="h-full w-full object-cover" alt="M-Pesa" loading="lazy" decoding="async" />
                  </div>
                  <span className="text-sm tracking-tight">M-Pesa</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setPaymentMethod("emola"); setPhone(""); }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all font-bold group relative overflow-hidden",
                    paymentMethod === "emola"
                      ? "border-orange-500 bg-orange-50 text-orange-600 ring-4 ring-orange-500/10"
                      : "border-slate-100 hover:border-slate-200 text-slate-500 bg-white",
                  )}
                >
                  {paymentMethod === "emola" && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle2 className="h-4 w-4 text-orange-600" />
                    </div>
                  )}
                  <div className="h-14 w-14 rounded-xl overflow-hidden border border-slate-100 shadow-md group-hover:scale-110 transition-transform">
                    <img src="/emola-logo.jpg" className="h-full w-full object-cover" alt="e-Mola" loading="lazy" decoding="async" />
                  </div>

                  <span className="text-sm tracking-tight">e-Mola</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="checkout-phone" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {paymentMethod === "mpesa" ? "NÚMERO M-PESA *" : "NÚMERO E-MOLA *"}
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                  <img src={mozFlag.url} alt="MZ" className="h-4 w-6 object-cover rounded-sm" />
                  <span className="text-sm font-medium text-slate-600">+258</span>
                </div>
                <Input
                  id="checkout-phone"
                  placeholder={paymentMethod === "mpesa" ? "84xxxxxxx ou 85xxxxxxx" : "86xxxxxxx ou 87xxxxxxx"}
                  required
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={cn(
                    "h-12 pl-24 border-slate-200 rounded-xl",
                    paymentMethod === "mpesa" ? "focus:ring-[#E30613]" : "focus:ring-orange-500",
                  )}
                />
              </div>
              <p className="text-[10px] text-slate-400">
                Você receberá uma notificação no telemóvel para confirmar o pagamento via {paymentMethod === "mpesa" ? "M-Pesa" : "e-Mola"}.
              </p>
            </div>

            {(paymentStatusMessage || paymentErrorMessage) && (
              <div
                className={cn(
                  "rounded-xl border p-4 text-sm font-medium animate-in fade-in slide-in-from-top-2",
                  paymentErrorMessage
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-primary/30 bg-primary/10 text-primary",
                )}
              >
                {paymentErrorMessage || paymentStatusMessage}
              </div>
            )}


            <div className="sticky bottom-0 bg-white/80 backdrop-blur-md pt-2 pb-2 md:relative md:bg-transparent md:p-0 z-20">
              <Button
                type="submit"
                disabled={processingPayment}
                className="w-full h-16 text-xl font-black bg-[#E30613] hover:bg-[#C20511] text-white rounded-2xl shadow-[0_20px_50px_rgba(227,6,19,0.3)] hover:shadow-[0_20px_50px_rgba(227,6,19,0.4)] disabled:opacity-60 transition-all active:scale-95 flex items-center justify-center gap-3 border-b-4 border-[#9E040D]"
              >
                {processingPayment ? (
                   <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Lock className="h-5 w-5" />
                )}
                {processingPayment ? "Processando pagamento..." : `PAGAR AGORA (${product.price.toLocaleString("pt-MZ")} MT)`}
              </Button>

            </div>


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

