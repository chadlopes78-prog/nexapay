import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useRef } from "react";
import { cancelPayment, startPayment, getSaleStatus, type PaymentResult } from "@/lib/api/payments.functions";
import { getPublicProduct } from "@/lib/api/product-public.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  CheckCircle2,
  Lock,
  ShieldAlert,
  Package,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import mozFlag from "@/assets/moz-flag.png.asset.json";

export const Route = createFileRoute("/p/$productId")({
  loader: async ({ params: { productId } }) => {
    try {
      return await getPublicProduct({ data: { productId } });
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
        { title: `${product.name} | NexaPay` },
        { name: "description", content: product.description || "Checkout seguro via M-Pesa e e-Mola" },
        { property: "og:title", content: product.name },
        { property: "og:image", content: image },
      ],
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
  const startPaymentFn = useServerFn(startPayment);
  const statusFn = useServerFn(getSaleStatus);
  const cancelPaymentFn = useServerFn(cancelPayment);
  const { productId } = useParams({ from: "/p/$productId" });
  const { product, checkout, defaultPixel } = Route.useLoaderData();
  const buttonLabel = (checkout?.button_text?.trim() || "Finalizar Compra");

  const pixelId = product?.facebook_pixel_id || defaultPixel?.fb_pixel_id;

  const [trafficPageId, setTrafficPageId] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [cancelingPayment, setCancelingPayment] = useState(false);
  const [showCancelButton, setShowCancelButton] = useState(false);
  const [currentSaleId, setCurrentSaleId] = useState<string | null>(null);
  const [pinSecondsLeft, setPinSecondsLeft] = useState(120);
  const [paymentStatusMessage, setPaymentStatusMessage] = useState<string | null>(null);
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | null>(null);
  const paymentRunRef = useRef(0);

  const [name, setName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"mpesa" | "emola">("mpesa");
  const [bumpAccepted, setBumpAccepted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600);

  const bumpPrice = checkout?.order_bump_enabled ? Number(checkout?.order_bump_price ?? 0) : 0;
  const totalPrice = (product?.price ?? 0) + (bumpAccepted ? bumpPrice : 0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Contador puramente visual (feedback ao usuário).
  // NÃO controla nem atrasa a chamada à API de pagamento.
  useEffect(() => {
    if (!processingPayment) {
      setShowCancelButton(false);
      return;
    }
    // Só mostra "Já cancelei no telefone" depois que o pop-up teve tempo de aparecer
    const t = setTimeout(() => setShowCancelButton(true), 15000);
    return () => clearTimeout(t);
  }, [processingPayment]);

  useEffect(() => {
    if (!processingPayment) return;
    setPinSecondsLeft(120);
    const t = setInterval(() => {
      setPinSecondsLeft((p) => (p > 0 ? p - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [processingPayment]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tp_id = params.get('tp_id');
    if (tp_id) {
      setTrafficPageId(tp_id);
      supabase.functions.invoke('track-event', {
        body: {
          trackingId: tp_id,
          eventType: 'click',
          url: window.location.href,
          referrer: document.referrer,
          metadata: { productId }
        }
      }).catch((e) => console.error("Error recording click event:", e));
    }
  }, [productId]);

  useEffect(() => {
    if (!pixelId || !product) return;
    try {
      if (!window.fbq) {
        // C6: preconnect to Facebook before injecting the script
        if (!document.querySelector('link[data-fb-preconnect]')) {
          const pre = document.createElement('link');
          pre.rel = 'preconnect';
          pre.href = 'https://connect.facebook.net';
          pre.crossOrigin = '';
          pre.setAttribute('data-fb-preconnect', '1');
          document.head.appendChild(pre);
        }
        const initFB = (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) => {
          if (f.fbq) return;
          n = f.fbq = function () {
            n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
          };
          if (!f._fbq) f._fbq = n;
          n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
          t = b.createElement(e); t.async = !0; t.defer = !0; t.src = v;
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

  const trackEvent = (event: string) => {
    try {
      if (pixelId && window.fbq) {
        window.fbq('track', event, {
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
    setCancelingPayment(false);
    setPaymentErrorMessage(null);
    setPaymentStatusMessage(`Pedido enviado para ${paymentMethod === "mpesa" ? "M-Pesa" : "e-Mola"}. Confirme no seu telefone.`);
    trackEvent('InitiateCheckout');

    const runId = paymentRunRef.current + 1;
    paymentRunRef.current = runId;
    let settled = false;
    const finishPaid = (link: string | null, saleId: string) => {
      if (settled || paymentRunRef.current !== runId) return;
      settled = true;
      setCurrentSaleId(null);
      trackEvent('Purchase');
      window.location.replace(link || `/payment-success?productId=${productId}&saleId=${saleId}`);
    };
    const finishFailed = (msg: string) => {
      if (settled || paymentRunRef.current !== runId) return;
      settled = true;
      setCurrentSaleId(null);
      setPaymentErrorMessage(msg);
      setPaymentStatusMessage(null);
      setProcessingPayment(false);
      setCancelingPayment(false);
    };

    const startPolling = (saleId: string) => {
      const deadlineAt = Date.now() + 120_000;
      const tick = async () => {
        if (settled || paymentRunRef.current !== runId) return;
        if (Date.now() >= deadlineAt) {
          await cancelPaymentFn({ data: { saleId, reason: "timeout" } }).catch(() => undefined);
          finishFailed("Não recebemos a confirmação. Cancelaste o pedido ou o tempo expirou. Desejas abandonar esta oportunidade?");
          return;
        }
        try {
          const s = await statusFn({ data: { saleId } });
          if (settled || paymentRunRef.current !== runId) return;
          if (s.status === "paid") return finishPaid(s.accessLink, saleId);
          if (s.status === "failed") return finishFailed(s.error || "Pagamento cancelado ou recusado.");
        } catch { /* transient */ }
        if (settled || paymentRunRef.current !== runId) return;
        const fastWindowActive = Date.now() < deadlineAt - 105_000;
        setTimeout(tick, fastWindowActive ? 300 : 1000);
      };
      // Primeira consulta IMEDIATA — sem atraso artificial.
      void tick();
    };

    try {
      // Stable idempotency key for this click — retries reuse it to avoid double-charging.
      const createClientId = () =>
        (typeof crypto !== "undefined" && "randomUUID" in crypto)
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const saleId = createClientId();
      const idempotencyKey = createClientId();
      setCurrentSaleId(saleId);

      let pollingStarted = false;
      const kickPolling = (currentSaleId: string) => {
        if (pollingStarted) return;
        pollingStarted = true;
        startPolling(currentSaleId);
      };

      // Uma ÚNICA chamada faz insert + OAuth + gateway em paralelo no servidor.
      // Isso elimina o segundo round-trip (chargeSale) e a recarga redundante
      // de venda/credenciais, reduzindo o tempo até o pop-up do PIN aparecer.
      const paymentPromise = startPaymentFn({
        data: {
          productId,
          method: paymentMethod,
          msisdn: phone,
          customerName: name,
          contactPhone: contactPhone || undefined,
          trafficPageTrackingId: trafficPageId,
          idempotencyKey,
          saleId,
        },
      }) as Promise<PaymentResult>;

      // Começa a observar imediatamente com o ID já conhecido pelo cliente.
      // As primeiras consultas podem retornar not_found até o insert concluir.
      kickPolling(saleId);

      void paymentPromise
        .then((result) => {
          if (settled) return;
          if (!result.success) {
            if (result.saleId) kickPolling(result.saleId);
            return finishFailed(result.error || "Pagamento cancelado ou recusado.");
          }
          kickPolling(result.saleId);
          if (result.status === "paid") finishPaid(result.accessLink ?? null, result.saleId);
        })
        .catch((error: any) => {
          finishFailed(error?.message || "Erro inesperado ao processar pagamento.");
        });
    } catch (error: any) {
      finishFailed(error?.message || "Erro inesperado ao processar pagamento.");
    }
  };

  const handleCancelPayment = async () => {
    if (!currentSaleId || cancelingPayment) return;
    setCancelingPayment(true);
    paymentRunRef.current += 1;
    try {
      const result = await cancelPaymentFn({ data: { saleId: currentSaleId, reason: "customer_cancelled" } });
      setPaymentErrorMessage(result.error || "Pagamento cancelado pelo cliente.");
      setPaymentStatusMessage(null);
      setProcessingPayment(false);
      setCurrentSaleId(null);
    } catch (error: any) {
      setPaymentErrorMessage(error?.message || "Não foi possível cancelar agora. Tenta novamente.");
    } finally {
      setCancelingPayment(false);
    }
  };

  if (!product) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full text-center p-8 shadow-xl border-none rounded-2xl">
          <div className="h-16 w-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Produto Indisponível</h1>
          <p className="text-slate-500 mt-3 text-sm">
            O link pode ter expirado ou o produto foi removido.
          </p>
          <Button className="mt-6 w-full h-11 rounded-xl font-bold bg-slate-900 hover:bg-black" asChild>
            <a href="/">Voltar ao início</a>
          </Button>
        </Card>
      </div>
    );
  }

  const accent = paymentMethod === "mpesa" ? "#E30613" : "#F97316";
  

  return (
    <div className="min-h-screen bg-white">
      {/* Top urgency bar */}
      <div className="w-full bg-gradient-to-r from-red-600 to-red-500 text-white">
        <div className="mx-auto max-w-6xl px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium">
          <Clock className="h-4 w-4" />
          <span>Oferta especial termina em:</span>
          <span className="font-mono font-bold tabular-nums bg-black/20 px-2 py-0.5 rounded">
            {formatTime(timeLeft)}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
          {/* LEFT: Product summary */}
          <div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex gap-4 items-center pb-4 border-b border-slate-100">
                <div className="h-20 w-20 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 ring-1 ring-slate-200">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-slate-300">
                      <Package className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-base font-bold text-slate-900 uppercase tracking-tight leading-tight">
                    {product.name}
                  </h1>
                  <div className="mt-1 text-2xl font-extrabold text-emerald-500 tracking-tight">
                    Mt {product.price.toLocaleString("pt-MZ")} MZN
                  </div>
                </div>
              </div>

              {checkout?.order_bump_enabled && (
                <div className="mt-4 relative">
                  {/* Seta animada apontando para o order bump */}
                  <div className="absolute -top-3 left-6 z-10 flex flex-col items-center pointer-events-none">
                    <span className="text-[10px] font-extrabold text-orange-600 bg-orange-100 border border-orange-300 rounded-full px-2 py-0.5 shadow-sm animate-pulse">
                      OFERTA ESPECIAL
                    </span>
                  </div>
                  <label
                    className={cn(
                      "block cursor-pointer rounded-xl border-2 border-dashed p-3 transition-all",
                      bumpAccepted
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-orange-400 bg-orange-50 hover:bg-orange-100 animate-[bump-wiggle_1.2s_ease-in-out_infinite]",
                    )}
                    style={{
                      // keyframes inline fallback
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={bumpAccepted}
                        onChange={(e) => setBumpAccepted(e.target.checked)}
                        className="mt-1 h-5 w-5 accent-emerald-500 flex-shrink-0"
                      />
                      {checkout?.order_bump_image_url && (
                        <img src={checkout.order_bump_image_url} alt="" className="h-14 w-14 rounded-lg object-cover border border-slate-200 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {/* Seta pequena abanando apontando para o título */}
                          <svg viewBox="0 0 24 24" className="h-4 w-4 text-orange-500 flex-shrink-0 animate-[bump-arrow_0.8s_ease-in-out_infinite]" fill="currentColor">
                            <path d="M4 12l6-6v4h10v4H10v4z" transform="rotate(180 12 12)" />
                          </svg>
                          <p className="text-sm font-bold text-slate-900 leading-tight">
                            {checkout?.order_bump_title || "Adicione uma oferta especial"}
                          </p>
                        </div>
                        {checkout?.order_bump_description && (
                          <p className="mt-1 text-xs text-slate-600 leading-snug">{checkout.order_bump_description}</p>
                        )}
                        {bumpPrice > 0 && (
                          <p className="mt-1 text-sm font-extrabold text-emerald-600">
                            + Mt {bumpPrice.toLocaleString("pt-MZ")} MZN
                          </p>
                        )}
                      </div>
                    </div>
                  </label>
                </div>
              )}

              <div className="pt-4 space-y-2 text-sm">
                <div className="pt-3 mt-2 border-t border-slate-100 flex justify-between items-center">
                  <span className="font-bold text-slate-900">Total:</span>
                  <span className="text-lg font-extrabold text-emerald-500">
                    Mt {totalPrice.toLocaleString("pt-MZ")} MZN
                  </span>
                </div>
              </div>

            </div>


            {checkout?.social_proof_enabled && (
              <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 flex items-center justify-center gap-2 text-sm text-slate-700">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>
                  <b className="text-emerald-600">{checkout?.social_proof_count ?? 127}</b> {checkout?.social_proof_message || "pessoas já compraram este produto"}
                </span>
              </div>
            )}


            {product.checkout_banner_url && (
              <img src={product.checkout_banner_url} alt="Oferta" className="mt-4 w-full rounded-xl border border-slate-200" loading="lazy" />
            )}
          </div>

          {/* RIGHT: Form */}
          <form onSubmit={handlePayment} className="space-y-5">
            <div>
              <label className="text-sm font-bold text-slate-900 mb-1.5 block">
                Nome completo <span className="text-red-500">*</span>
              </label>
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome completo"
                className="h-12 rounded-xl border-slate-200 bg-white text-sm"
              />
            </div>




            <div>
              <label className="text-sm font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#25D366">
                  <path d="M12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413A11.815 11.815 0 0012.05 0"/>
                </svg>
                WhatsApp (opcional)
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none border-r border-slate-200 pr-2">
                  <img src={mozFlag.url} alt="MZ" className="h-3.5 w-5 object-cover rounded-sm" />
                  <span className="text-xs font-semibold text-slate-500">+258</span>
                </div>
                <Input
                  inputMode="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="84 000 000 0"
                  className="h-12 pl-[78px] rounded-xl border-slate-200 bg-white text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-slate-900 mb-2 block">
                Selecione o método de pagamento <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setPaymentMethod("mpesa"); setPhone(""); }}
                  className={cn(
                    "relative flex items-center gap-2 p-3 rounded-xl border-2 transition-all bg-white",
                    paymentMethod === "mpesa" ? "border-[#E30613] shadow-[0_0_0_3px_rgba(227,6,19,0.08)]" : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <img src="/mpesa-logo.jpg" className="h-8 w-8 rounded-md object-cover" alt="M-Pesa" />
                  <span className="text-sm font-bold text-slate-900">M-Pesa</span>
                  {paymentMethod === "mpesa" && <CheckCircle2 className="absolute top-1.5 right-1.5 h-4 w-4 text-[#E30613] fill-white" />}
                </button>
                <button
                  type="button"
                  onClick={() => { setPaymentMethod("emola"); setPhone(""); }}
                  className={cn(
                    "relative flex items-center gap-2 p-3 rounded-xl border-2 transition-all bg-white",
                    paymentMethod === "emola" ? "border-orange-500 shadow-[0_0_0_3px_rgba(249,115,22,0.1)]" : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <img src="/emola-logo.jpg" className="h-8 w-8 rounded-md object-cover" alt="e-Mola" />
                  <span className="text-sm font-bold text-slate-900">e-Mola</span>
                  {paymentMethod === "emola" && <CheckCircle2 className="absolute top-1.5 right-1.5 h-4 w-4 text-orange-500 fill-white" />}
                </button>
              </div>

              <div className="mt-3 relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none border-r border-slate-200 pr-2">
                  <img src={mozFlag.url} alt="MZ" className="h-3.5 w-5 object-cover rounded-sm" />
                  <span className="text-xs font-semibold text-slate-500">+258</span>
                </div>
                <Input
                  placeholder={paymentMethod === "mpesa" ? "Número M-Pesa (84/85)" : "Número e-Mola (86/87)"}
                  required
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-12 pl-[78px] rounded-xl border-slate-200 bg-white text-sm"
                />
              </div>
            </div>

            {(paymentStatusMessage || paymentErrorMessage) && (
              <div className={cn(
                "rounded-xl border p-3 text-sm font-medium flex items-center gap-2",
                paymentErrorMessage ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700",
              )}>
                <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                {paymentErrorMessage || paymentStatusMessage}
              </div>
            )}

            <Button
              type="submit"
              disabled={processingPayment}
              className="w-full h-14 text-base font-bold rounded-xl text-white shadow-lg disabled:opacity-70 transition-all active:scale-[0.99] flex items-center justify-center gap-2"
              style={{
                background: `linear-gradient(180deg, ${accent} 0%, ${paymentMethod === "mpesa" ? "#B30410" : "#EA580C"} 100%)`,
                boxShadow: `0 10px 25px -5px ${accent}50`,
              }}
            >
              {processingPayment ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  {buttonLabel}
                </>
              )}
            </Button>




            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-xs text-slate-600 text-center">
              Ao clicar em <b>"{buttonLabel}"</b>, você concorda com os{" "}
              <a href="#" className="text-blue-600 underline">Termos de Uso</a> e{" "}
              <a href="#" className="text-blue-600 underline">Política de Privacidade</a>.
            </div>
          </form>
        </div>
      </div>

      {processingPayment && (
        <div className="fixed inset-0 z-50 backdrop-blur-md bg-slate-900/60 flex items-center justify-center px-4 animate-in fade-in duration-300">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
            <div
              className="px-6 py-5 text-white flex items-center gap-3"
              style={{ background: `linear-gradient(135deg, ${accent} 0%, ${paymentMethod === "mpesa" ? "#B30410" : "#EA580C"} 100%)` }}
            >
              <img
                src={paymentMethod === "mpesa" ? "/mpesa-logo.jpg" : "/emola-logo.jpg"}
                alt=""
                className="h-10 w-10 rounded-lg object-cover ring-2 ring-white/40"
              />
              <div className="flex-1">
                <div className="text-xs font-medium opacity-80">Pagamento via</div>
                <div className="text-lg font-extrabold leading-tight">
                  {paymentMethod === "mpesa" ? "M-Pesa" : "e-Mola"}
                </div>
              </div>
              <div className="h-9 w-9 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            </div>

            <div className="p-6 space-y-5 text-center">
              <div className="mx-auto h-16 w-16 rounded-full flex items-center justify-center" style={{ background: `${accent}15` }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" className="h-8 w-8">
                  <rect x="5" y="2" width="14" height="20" rx="2.5" />
                  <line x1="12" y1="18" x2="12" y2="18" />
                </svg>
              </div>

              <div>
                <h3 className="text-xl font-extrabold text-slate-900">
                  Confirme no seu telefone
                </h3>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                  Um pop-up foi enviado para <b className="text-slate-900">+258 {phone}</b>.
                  Insira o seu <b>PIN</b> para concluir o pagamento de{" "}
                  <b style={{ color: accent }}>Mt {product.price.toLocaleString("pt-MZ")}</b>.
                </p>
              </div>

              <div className="rounded-2xl border-2 border-dashed p-4" style={{ borderColor: `${accent}40`, background: `${accent}08` }}>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Tempo restante
                </div>
                <div className="mt-1 text-4xl font-mono font-extrabold tabular-nums" style={{ color: accent }}>
                  {String(Math.floor(pinSecondsLeft / 60)).padStart(2, "0")}:
                  {String(pinSecondsLeft % 60).padStart(2, "0")}
                </div>
              </div>

              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 font-medium flex items-start gap-2 text-left">
                <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  <b>Não feche esta aba.</b> Assim que confirmar o PIN no telefone, o acesso será liberado automaticamente.
                </span>
              </div>

              {showCancelButton && (
                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-800 font-medium text-left">
                    Se já não quer liberar o acesso ou não está mais interessado, clique no botão <b>cancelar</b> abaixo. Ou pode tentar novamente confirmando o PIN no telefone.
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={cancelingPayment}
                    onClick={handleCancelPayment}
                    className="h-12 w-full rounded-xl border-red-300 bg-red-50 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-70 animate-[cancel-pulse_1.4s_ease-in-out_infinite]"
                  >
                    {cancelingPayment ? "Cancelando..." : "Já cancelei no telefone"}
                  </Button>
                </div>
              )}

              {paymentErrorMessage && (
                <div className="text-sm font-medium text-red-600">{paymentErrorMessage}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
