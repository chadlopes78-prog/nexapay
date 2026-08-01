import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useRef, useMemo, memo, useCallback } from "react";
import { cancelPayment, startPayment, getSaleStatus, prewarmPaymentGateway, type PaymentResult } from "@/lib/api/payments.functions";
import { getPublicProduct } from "@/lib/api/product-public.functions";
import { PAYMENT_WAIT_WINDOW_MS } from "@/lib/payments/timing";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

// Intervalo de consulta do estado da venda enquanto pending (~1,5s).
const POLL_INTERVAL_MS = 1_500;

// Códigos terminais que representam cancelamento/recusa pelo cliente.
const CANCELLED_CODES = new Set([
  "cancelled_by_user",
  "canceled_by_user",
  "customer_cancelled",
  "customer_canceled",
  "user_cancelled",
  "cancelled",
  "canceled",
  "declined",
  "refused",
  "rejected",
]);



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
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "";
    const links: Array<Record<string, string>> = [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap" },
    ];
    // Preload APENAS da imagem principal do produto (acima da dobra).
    // O banner permanece lazy para não competir com o HTML/CSS críticos.
    if (image) {
      links.push({ rel: "preload", as: "image", href: image, fetchPriority: "high" });
    }
    if (supabaseUrl) {
      links.push({ rel: "preconnect", href: supabaseUrl, crossOrigin: "" });
      links.push({ rel: "dns-prefetch", href: supabaseUrl });
    }
    return {
      meta: [
        { title: `${product.name} | NexaPay` },
        { name: "description", content: product.description || "Checkout seguro via M-Pesa e e-Mola" },
        { property: "og:title", content: product.name },
        { property: "og:image", content: image },
      ],
      links,
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
  const prewarmGatewayFn = useServerFn(prewarmPaymentGateway);
  const { productId } = useParams({ from: "/p/$productId" });
  const { product, checkout, defaultPixel } = Route.useLoaderData();
  const buttonLabel = (checkout?.button_text?.trim() || "Finalizar Compra");

  const pixelId = product?.facebook_pixel_id || defaultPixel?.fb_pixel_id;

  const [trafficPageId, setTrafficPageId] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [cancelingPayment, setCancelingPayment] = useState(false);
  const [showCancelButton, setShowCancelButton] = useState(false);
  const [currentSaleId, setCurrentSaleId] = useState<string | null>(null);
  const [paymentStatusMessage, setPaymentStatusMessage] = useState<string | null>(null);
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | null>(null);
  const [paymentFailureCode, setPaymentFailureCode] = useState<string | null>(null);
  const paymentRunRef = useRef(0);

  // Guarda de desmontagem: se o cliente fecha a aba/rota durante o polling,
  // paramos as próximas iterações sem sobrescrever nenhum estado do backend.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Invalida qualquer polling em curso: o próximo tick vê runId antigo.
      paymentRunRef.current += 1;
      console.info("[checkout] polling terminated (unmount)", { at: new Date().toISOString() });
    };
  }, []);
  const prewarmedProductRef = useRef<string | null>(null);
  // Cooldown depois de cancelar: a operadora precisa liberar o número
  // (o STK anterior ainda pode estar ativo por alguns segundos). Sem isto
  // a gateway rejeita o novo pedido e cai em "Erro processando pagamento".
  const RETRY_COOLDOWN_MS = 8000;
  const [retryCooldownUntil, setRetryCooldownUntil] = useState(0);
  const [retryCooldownLeft, setRetryCooldownLeft] = useState(0);

  // Checkout deve ser SEMPRE claro, mesmo com o site/telemóvel em modo noturno.
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    const prevScheme = root.style.colorScheme;
    root.classList.remove("dark");
    root.style.colorScheme = "light";
    return () => {
      if (hadDark) root.classList.add("dark");
      root.style.colorScheme = prevScheme;
    };
  }, []);

  // Bloqueia o scroll do fundo enquanto o overlay/modal de processamento está aberto.
  useEffect(() => {
    if (!processingPayment) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [processingPayment]);

  useEffect(() => {
    if (!retryCooldownUntil) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((retryCooldownUntil - Date.now()) / 1000));
      setRetryCooldownLeft(left);
      if (left === 0) setRetryCooldownUntil(0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [retryCooldownUntil]);

  const [name, setName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"mpesa" | "emola">("mpesa");
  const [bumpAccepted, setBumpAccepted] = useState(false);


  const bumpPrice = checkout?.order_bump_enabled ? Number(checkout?.order_bump_price ?? 0) : 0;
  const totalPrice = (product?.price ?? 0) + (bumpAccepted ? bumpPrice : 0);
  const totalPriceFmt = useMemo(() => totalPrice.toLocaleString("pt-MZ"), [totalPrice]);
  const productPriceFmt = useMemo(() => (product?.price ?? 0).toLocaleString("pt-MZ"), [product?.price]);
  const bumpPriceFmt = useMemo(() => bumpPrice.toLocaleString("pt-MZ"), [bumpPrice]);

  useEffect(() => {
    if (prewarmedProductRef.current === productId) return;
    prewarmedProductRef.current = productId;
    void prewarmGatewayFn({ data: { productId } }).catch(() => undefined);
  }, [prewarmGatewayFn, productId]);

  // Contador puramente visual (feedback ao usuário).
  // NÃO controla nem atrasa a chamada à API de pagamento.
  useEffect(() => {
    if (!processingPayment) {
      setShowCancelButton(false);
      return;
    }
    // Só mostra "Já cancelei no telefone" DEPOIS de 60s — tempo médio do
    // cliente destravar o telefone, ler a notificação STK/PIN e digitar
    // os dígitos. Antes disso o botão apareceria ainda com o pop-up do PIN
    // aberto e confundiria o cliente.
    const t = setTimeout(() => setShowCancelButton(true), 60000);
    return () => clearTimeout(t);
  }, [processingPayment]);



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
    const run = () => {
      try {
        if (!window.fbq) {
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
    };
    // Defer to idle so pixel never blocks first paint on low-end devices.
    const w = window as any;
    const id = w.requestIdleCallback
      ? w.requestIdleCallback(run, { timeout: 2000 })
      : window.setTimeout(run, 800);
    return () => {
      if (w.cancelIdleCallback && w.requestIdleCallback) w.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, [pixelId, product?.id]);


  const trackEvent = (event: string) => {
    try {
      if (pixelId && window.fbq && product) {
        window.fbq('track', event, {
          content_name: product.name, value: product.price, currency: 'MZN',
        });
      }
    } catch (e) { console.error(e); }
  };

  const handlePayment = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (retryCooldownUntil && Date.now() < retryCooldownUntil) {
      const left = Math.ceil((retryCooldownUntil - Date.now()) / 1000);
      toast.error(`Aguarda ${left}s antes de tentar de novo — a operadora ainda está a libertar o número.`);
      return;
    }

    if (!phone || phone.replace(/\D/g, "").length < 9) {
      toast.error("Por favor, insira um número de telefone válido.");
      return;
    }

    setProcessingPayment(true);
    setCancelingPayment(false);
    setPaymentErrorMessage(null);
    setPaymentFailureCode(null);
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
    const finishFailed = (msg: string, code?: string | null) => {
      if (settled || paymentRunRef.current !== runId) return;
      settled = true;
      setCurrentSaleId(null);
      setPaymentErrorMessage(msg);
      setPaymentFailureCode(code ?? null);
      setPaymentStatusMessage(null);
      setProcessingPayment(false);
      setCancelingPayment(false);
      setRetryCooldownUntil(Date.now() + RETRY_COOLDOWN_MS);
    };

    const startPolling = (saleId: string) => {
      const deadlineAt = Date.now() + PAYMENT_WAIT_WINDOW_MS;
      let lastStatus: string | null = null;
      const stopReason = () =>
        !isMountedRef.current ? "unmount" : paymentRunRef.current !== runId ? "superseded" : "settled";
      const tick = async () => {
        if (settled || paymentRunRef.current !== runId || !isMountedRef.current) {
          console.info("[checkout][poll] stopped", { saleId, reason: stopReason() });
          return;
        }
        if (Date.now() >= deadlineAt) {
          await cancelPaymentFn({ data: { saleId, reason: "timeout" } }).catch(() => undefined);
          finishFailed("Não recebemos a confirmação. Cancelaste o pedido ou o tempo expirou. Desejas abandonar esta oportunidade?", "timeout");
          return;
        }
        try {
          const s = await statusFn({ data: { saleId } });
          if (settled || paymentRunRef.current !== runId || !isMountedRef.current) {
            console.info("[checkout][poll] stopped after status", { saleId, reason: stopReason() });
            return;
          }
          if (s.status !== lastStatus) {
            console.info("[checkout][poll] status", { saleId, source: "polling", from: lastStatus, to: s.status });
            lastStatus = s.status;
          }
          if (s.status === "paid") return finishPaid(s.accessLink, saleId);
          if (s.status === "failed") {
            const code = "failureCode" in s ? (s.failureCode ?? null) : null;
            console.info("[payment-cancellation-debug]", {
              saleId,
              source: "polling",
              normalizedStatus: s.status,
              gatewayCode: code,
              gatewayMessage: s.error ?? null,
            });
            return finishFailed(s.error || "Pagamento cancelado ou recusado.", code);
          }
        } catch { /* transient */ }
        if (settled || paymentRunRef.current !== runId || !isMountedRef.current) return;
        // Intervalo fixo de 1,5s enquanto pending — não encurta o tempo total
        // permitido para o cliente introduzir o PIN (PAYMENT_WAIT_WINDOW_MS).
        setTimeout(tick, POLL_INTERVAL_MS);
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
        .catch(async (error: any) => {
          // Erro real ao chamar startPayment (rede/servidor). O polling já
          // pode estar rodando com um saleId gerado no cliente. Confirmamos
          // se a venda foi realmente criada antes de encerrar — caso ainda
          // não exista, mostramos o erro em vez de deixar o cliente preso
          // em "A processar" até o deadline.
          if (settled) return;
          try {
            const check = await statusFn({ data: { saleId } });
            if (check.status === "paid") return finishPaid(check.accessLink, saleId);
            if (check.status === "failed") return finishFailed(check.error || "Pagamento cancelado ou recusado.");
            if (check.status === "pending") return; // deixa polling continuar
          } catch { /* ignorar — cai no finishFailed abaixo */ }
          finishFailed(error?.message || "Erro inesperado ao processar pagamento.");
        });
    } catch (error: any) {
      finishFailed(error?.message || "Erro inesperado ao processar pagamento.");
    }
  };

  const handleCancelPayment = async () => {
    if (!currentSaleId || cancelingPayment) return;
    const saleIdSnapshot = currentSaleId;
    setCancelingPayment(true);
    // Não incrementamos paymentRunRef ainda: se a cobrança já foi aprovada
    // no exato instante do clique, precisamos deixar o polling em curso
    // concluir o fluxo de sucesso (finishPaid → redirect).
    try {
      const result = await cancelPaymentFn({ data: { saleId: saleIdSnapshot, reason: "customer_cancelled" } });

      // Race: pagamento já foi confirmado pela operadora antes do cancelamento
      // chegar ao gateway. NÃO invalidar o sucesso — reproduzir o fluxo de
      // finishPaid usando o accessLink já persistido. Notificações, webhooks
      // e Pushcut já foram disparados pelo backend na confirmação da venda.
      if (!result.success && /j[áa]\s+confirmad/i.test(result.error || "")) {
        try {
          const s = await statusFn({ data: { saleId: saleIdSnapshot } });
          if (s.status === "paid") {
            setCurrentSaleId(null);
            trackEvent('Purchase');
            window.location.replace(
              s.accessLink || `/payment-success?productId=${productId}&saleId=${saleIdSnapshot}`,
            );
            return;
          }
        } catch { /* fallthrough para mensagem padrão */ }
      }

      // Só agora invalidamos o run — cancelamento efetivo.
      paymentRunRef.current += 1;
      setPaymentErrorMessage(result.error || "Pagamento cancelado. Aguarda alguns segundos antes de tentar de novo.");
      setPaymentStatusMessage(null);
      setProcessingPayment(false);
      setCurrentSaleId(null);
      setRetryCooldownUntil(Date.now() + RETRY_COOLDOWN_MS);
    } catch (error: any) {
      setPaymentErrorMessage(error?.message || "Não foi possível cancelar agora. Tenta novamente.");
    } finally {
      setCancelingPayment(false);
    }
  };

  // Ref-based stable callback so memoized PaymentModal doesn't re-render.
  const handleCancelRef = useRef(handleCancelPayment);
  handleCancelRef.current = handleCancelPayment;
  const onCancelPayment = useCallback(() => { void handleCancelRef.current(); }, []);

  // Cancelamento reconhecido pela gateway (não é erro de comunicação).
  const wasCancelledByCustomer =
    !!paymentFailureCode && CANCELLED_CODES.has(paymentFailureCode.toLowerCase());

  // Nova tentativa: limpa o estado anterior e cria um pedido totalmente novo
  // (novo saleId + nova idempotencyKey geradas dentro de handlePayment).
  const handleRetryRef = useRef<() => void>(() => {});
  handleRetryRef.current = () => {
    if (processingPayment) return;
    setPaymentFailureCode(null);
    setPaymentErrorMessage(null);
    setPaymentStatusMessage(null);
    setCurrentSaleId(null);
    void handlePayment();
  };
  const onRetryPayment = useCallback(() => handleRetryRef.current(), []);





  if (!product) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full text-center p-8 shadow-xl border-none rounded-2xl bg-white">
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
        </div>
      </div>
    );
  }

  // Paleta Cloud White + azul (redesign minimalist stack). O accent do submit
  // é SEMPRE azul — não muda com o método selecionado (mantém identidade
  // "Cloud White"). Cores oficiais M-Pesa/e-Mola aparecem só nos ícones das tiles.
  const BRAND = "#3b82f6";
  const BRAND_DARK = "#2563eb";
  const submitStyle = {
    background: BRAND,
    boxShadow: `0 10px 25px -5px ${BRAND}55`,
  };
  const fontHeading = { fontFamily: "'Sora', system-ui, sans-serif" };
  const fontBody = { fontFamily: "'Manrope', system-ui, sans-serif" };

  return (
    <div
      className="min-h-screen bg-[#fafbfc] flex items-start sm:items-center justify-center p-4 py-6"
      style={fontBody}
    >
      <div className="w-full max-w-[560px] space-y-3">
        {/* Barra de urgência — alto contraste, estilo checkout de alta conversão */}
        <div className="rounded-2xl bg-[#ef4444] px-6 py-3.5 text-center text-white shadow-[0_8px_20px_rgba(239,68,68,0.25)]">
          <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] opacity-90">
            <Clock className="h-3 w-3" />
            Oferta expira em
          </div>
          <div className="mt-0.5 text-2xl font-extrabold tabular-nums tracking-tight" style={fontHeading}>
            <CountdownTimer initialSeconds={(checkout?.timer_minutes ?? 10) * 60} />
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-[#64748b]">
          <Lock className="h-3.5 w-3.5 text-[#3b82f6]" />
          Checkout seguro · NexaPay
        </div>

        <div className="w-full bg-white rounded-3xl border border-[#e8ecf1] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="p-5 sm:p-7 space-y-6">
          {/* Produto em destaque: banner + nome + preço */}
          <div className="rounded-2xl border border-[#e8ecf1] overflow-hidden bg-white">
            {product.checkout_banner_url && (
              <div className="w-full bg-[#f1f5f9]" style={{ aspectRatio: "16 / 9" }}>
                <img
                  src={product.checkout_banner_url}
                  alt="Oferta"
                  className="w-full h-full object-cover opacity-0 transition-opacity duration-200"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  ref={(el) => { if (el?.complete && el.naturalWidth > 0) el.style.opacity = "1"; }}
                  onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "1"; }}
                  onError={(e) => {
                    // Falha no banner NUNCA pode derrubar o checkout: apenas removemos o elemento.
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}
            <div className="p-4 flex items-center gap-3">
              <div className="relative h-12 w-12 rounded-xl overflow-hidden bg-[#f1f5f9] flex-shrink-0 ring-1 ring-[#e8ecf1]">
                <div className="absolute inset-0 grid place-items-center text-[#cbd5e1]">
                  <Package className="h-5 w-5" />
                </div>
                {product.image_url && (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    width={48}
                    height={48}
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    className="relative w-full h-full object-cover opacity-0 transition-opacity duration-200"
                    ref={(el) => { if (el?.complete && el.naturalWidth > 0) el.style.opacity = "1"; }}
                    onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "1"; }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-sm font-bold text-[#1e293b] uppercase tracking-tight leading-tight truncate" style={fontHeading}>
                  {product.name}
                </h1>
                <p className="text-2xl font-extrabold text-[#3b82f6] leading-tight" style={fontHeading}>
                  {productPriceFmt} <span className="text-sm font-bold">MZN</span>
                </p>
              </div>
            </div>
          </div>

          {/* Order bump + total */}
          <div className="bg-[#fafbfc] rounded-2xl p-5 border border-[#e8ecf1]">
            {checkout?.order_bump_enabled && (
              <div className="mb-4">
                <label
                  className={cn(
                    "block cursor-pointer rounded-xl border-2 border-dashed p-3 transition-all",
                    bumpAccepted
                      ? "border-[#3b82f6] bg-[#3b82f6]/5"
                      : "border-[#cbd5e1] bg-white hover:border-[#3b82f6]/40",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={bumpAccepted}
                      onChange={(e) => setBumpAccepted(e.target.checked)}
                      className="mt-1 h-5 w-5 accent-[#3b82f6] flex-shrink-0"
                    />
                    {checkout?.order_bump_image_url && (
                      <img src={checkout.order_bump_image_url} alt="" width={48} height={48} loading="lazy" decoding="async" className="h-12 w-12 rounded-lg object-cover border border-[#e8ecf1] flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[#1e293b] leading-tight" style={fontHeading}>
                        {checkout?.order_bump_title || "Adicione uma oferta especial"}
                      </p>
                      {checkout?.order_bump_description && (
                        <p className="mt-1 text-xs text-[#64748b] leading-snug">{checkout.order_bump_description}</p>
                      )}
                      {bumpPrice > 0 && (
                        <p className="mt-1 text-sm font-bold text-[#3b82f6]">
                          + Mt {bumpPriceFmt} MZN
                        </p>
                      )}
                    </div>
                  </div>
                </label>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-[#64748b]">Total</span>
              <span className="text-lg font-bold text-[#1e293b]" style={fontHeading}>
                Mt {totalPriceFmt} MZN
              </span>
            </div>
          </div>

          {checkout?.social_proof_enabled && (
            <div className="rounded-xl bg-[#3b82f6]/5 border border-[#3b82f6]/15 px-4 py-2.5 flex items-center justify-between gap-3 text-[12px] text-[#1e293b]">
              <span className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="h-4 w-4 text-[#3b82f6] flex-shrink-0" />
                <span className="truncate">
                  <b className="text-[#3b82f6]">{checkout?.social_proof_count ?? 127}</b>{" "}
                  {checkout?.social_proof_message || "pessoas já compraram este produto"}
                </span>
              </span>
              <span className="flex items-center gap-1.5 flex-shrink-0 text-[#64748b] font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                online
              </span>
            </div>
          )}


          {/* Form */}
          <form onSubmit={handlePayment} className="space-y-6">
            {/* Dados do comprador */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-[#1e293b] uppercase tracking-wide" style={fontHeading}>
                Dados do comprador
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[#94a3b8] mb-1.5 ml-1">
                    Nome completo <span className="text-[#3b82f6]">*</span>
                  </label>
                  <Input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Como no seu documento"
                    className="h-12 rounded-xl border-[#e8ecf1] bg-white text-sm focus-visible:ring-2 focus-visible:ring-[#3b82f6]/20 focus-visible:border-[#3b82f6]"
                  />
                </div>
              </div>
            </section>



            {/* Método de Pagamento */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-[#1e293b] uppercase tracking-wide" style={fontHeading}>
                Método de Pagamento
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setPaymentMethod("mpesa"); setPhone(""); }}
                  className={cn(
                    "relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all bg-white",
                    paymentMethod === "mpesa"
                      ? "border-[#3b82f6] bg-[#3b82f6]/5"
                      : "border-[#e8ecf1] hover:border-[#3b82f6]/30",
                  )}
                >
                  {paymentMethod === "mpesa" && (
                    <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-[#3b82f6]" />
                  )}
                  <div className="w-11 h-11 rounded-full bg-white shadow-sm mb-2 flex items-center justify-center overflow-hidden ring-1 ring-[#e8ecf1]">
                    <img src="/mpesa-logo.jpg" width={44} height={44} loading="lazy" decoding="async" className="h-full w-full object-cover" alt="M-Pesa" />
                  </div>
                  <span className="text-sm font-bold text-[#1e293b]">M-Pesa</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-[#94a3b8] mt-0.5">Vodacom</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setPaymentMethod("emola"); setPhone(""); }}
                  className={cn(
                    "relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all bg-white",
                    paymentMethod === "emola"
                      ? "border-[#3b82f6] bg-[#3b82f6]/5"
                      : "border-[#e8ecf1] hover:border-[#3b82f6]/30",
                  )}
                >
                  {paymentMethod === "emola" && (
                    <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-[#3b82f6]" />
                  )}
                  <div className="w-11 h-11 rounded-full bg-white shadow-sm mb-2 flex items-center justify-center overflow-hidden ring-1 ring-[#e8ecf1]">
                    <img src="/emola-logo.jpg" width={44} height={44} loading="lazy" decoding="async" className="h-full w-full object-cover" alt="e-Mola" />
                  </div>
                  <span className="text-sm font-bold text-[#1e293b]">e-Mola</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-[#94a3b8] mt-0.5">Movitel</span>
                </button>
              </div>

              {/* Número de pagamento em destaque */}
              <div className="rounded-2xl border border-[#3b82f6]/20 bg-[#3b82f6]/5 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-[#3b82f6] grid place-items-center text-white flex-shrink-0">
                    <Lock className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#1e293b]">
                      Número para fazer o pagamento
                    </p>
                    <p className="text-[10px] text-[#64748b]">
                      {paymentMethod === "mpesa" ? "M-Pesa · 84 ou 85" : "e-Mola · 86 ou 87"}
                    </p>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none border-r border-[#e8ecf1] pr-2">
                    <img src={mozFlag.url} alt="MZ" width={20} height={14} loading="lazy" decoding="async" className="h-3.5 w-5 object-cover rounded-sm" />
                    <span className="text-xs font-semibold text-[#64748b]">+258</span>
                  </div>
                  <Input
                    placeholder={paymentMethod === "mpesa" ? "84 / 85 xxx xxxx" : "86 / 87 xxx xxxx"}
                    required
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-13 pl-[78px] rounded-xl border-[#3b82f6]/25 bg-white text-base font-semibold tracking-wide focus-visible:ring-2 focus-visible:ring-[#3b82f6]/20 focus-visible:border-[#3b82f6]"
                  />
                </div>
                <p className="mt-2 text-[10px] text-[#94a3b8] text-center">
                  Nunca partilhamos o seu número. Débito seguro e instantâneo.
                </p>
              </div>

            </section>

            {(paymentStatusMessage || paymentErrorMessage) && (
              <div className={cn(
                "rounded-xl border p-3 text-sm font-medium flex items-center gap-2",
                paymentErrorMessage ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700",
              )}>
                <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                {paymentErrorMessage || paymentStatusMessage}
              </div>
            )}

            <div className="space-y-3 pt-1">
              <Button
                type="submit"
                disabled={processingPayment || retryCooldownLeft > 0}
                className="w-full h-14 text-base font-bold rounded-2xl text-white disabled:opacity-70 transition-all active:scale-[0.98] flex items-center justify-center gap-2 hover:brightness-110"
                style={{ ...submitStyle, ...fontHeading }}
              >
                {retryCooldownLeft > 0 ? (
                  <>
                    <Clock className="h-4 w-4" />
                    Aguarda {retryCooldownLeft}s para tentar de novo
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    {buttonLabel}
                  </>
                )}
              </Button>

              <p className="text-center text-[11px] text-[#94a3b8] leading-relaxed px-2">
                Ao clicar em <b>"{buttonLabel}"</b>, você concorda com os{" "}
                <a href="#" className="text-[#3b82f6] hover:underline">Termos de Uso</a> e{" "}
                <a href="#" className="text-[#3b82f6] hover:underline">Política de Privacidade</a>.
              </p>
            </div>
          </form>
        </div>
        </div>
      </div>


      {wasCancelledByCustomer && !processingPayment && (
        <CancelledOverlay
          cooldownLeft={retryCooldownLeft}
          onRetry={onRetryPayment}
        />
      )}

      {processingPayment && !showCancelButton && (
        <ProcessingOverlay
          phase={paymentErrorMessage ? "error" : "processing"}
        />
      )}


      {processingPayment && showCancelButton && (
        <PaymentModal
          paymentMethod={paymentMethod}
          phone={phone}
          productPriceFmt={productPriceFmt}
          showCancelButton={showCancelButton}
          cancelingPayment={cancelingPayment}
          paymentErrorMessage={paymentErrorMessage}
          onCancel={onCancelPayment}
        />
      )}
    </div>
  );
}

const CountdownTimer = memo(function CountdownTimer({ initialSeconds }: { initialSeconds: number }) {
  const [t, setT] = useState(initialSeconds);
  useEffect(() => {
    const id = setInterval(() => setT((p) => (p > 0 ? p - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return <>{`${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`}</>;
});

type PaymentModalProps = {
  paymentMethod: "mpesa" | "emola";
  phone: string;
  productPriceFmt: string;
  showCancelButton: boolean;
  cancelingPayment: boolean;
  paymentErrorMessage: string | null;
  onCancel: () => void;
};

const PaymentModal = memo(function PaymentModal({
  paymentMethod,
  phone,
  productPriceFmt,
  showCancelButton,
  cancelingPayment,
  paymentErrorMessage,
  onCancel,
}: PaymentModalProps) {
  const accent = paymentMethod === "mpesa" ? "#E30613" : "#F97316";
  const accentDark = paymentMethod === "mpesa" ? "#B30410" : "#EA580C";
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
        <div
          className="px-6 py-5 text-white flex items-center gap-3"
          style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accentDark} 100%)` }}
        >
          <img
            src={paymentMethod === "mpesa" ? "/mpesa-logo.jpg" : "/emola-logo.jpg"}
            alt=""
            width={40}
            height={40}
            decoding="async"
            className="h-10 w-10 rounded-lg object-cover ring-2 ring-white/40"
          />
          <div className="flex-1">
            <div className="text-xs font-medium opacity-80">Pagamento via</div>
            <div className="text-lg font-extrabold leading-tight">
              {paymentMethod === "mpesa" ? "M-Pesa" : "e-Mola"}
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5 text-center">
          <div className="mx-auto h-16 w-16 rounded-full flex items-center justify-center" style={{ background: `${accent}15` }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" className="h-8 w-8">
              <rect x="5" y="2" width="14" height="20" rx="2.5" />
              <line x1="12" y1="18" x2="12" y2="18" />
            </svg>
          </div>

          <div>
            <h3 className="text-xl font-extrabold text-slate-900">Confirme no seu telefone</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Um pop-up foi enviado para <b className="text-slate-900">+258 {phone}</b>.
              Insira o seu <b>PIN</b> para concluir o pagamento de{" "}
              <b style={{ color: accent }}>Mt {productPriceFmt}</b>.
            </p>
          </div>


          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 font-medium flex items-start gap-2 text-left">
            <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              <b>Não feche esta aba.</b> Assim que confirmar o PIN no telefone, o acesso será liberado automaticamente.
            </span>
          </div>

          {showCancelButton && (
            <div className="space-y-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-800 font-medium text-left">
                Se já não quer liberar o acesso ou não está mais interessado, clique no botão <b>cancelar</b> abaixo. Ou pode tentar novamente confirmando o PIN no telefone.
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={cancelingPayment}
                onClick={onCancel}
                className="h-12 w-full rounded-xl border-red-300 bg-red-50 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-70 motion-safe:animate-[cancel-pulse_1.4s_ease-in-out_infinite]"
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
  );
});

const ProcessingOverlay = memo(function ProcessingOverlay({ phase }: { phase: "processing" | "error" }) {
  // Camada visual pura: NÃO cria pagamento, NÃO chama gateway, NÃO faz polling.
  // Apenas reflete o estado já controlado por `processingPayment` no pai.
  if (phase === "error") return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pay-overlay-title"
      aria-describedby="pay-overlay-desc"
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-slate-900/70 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-6 text-center">
        <div
          aria-hidden="true"
          className="mx-auto h-12 w-12 rounded-full border-4 border-slate-200 border-t-[#3b82f6] motion-safe:animate-spin motion-reduce:opacity-70"
        />
        <span className="sr-only">A processar pagamento</span>
        <h2 id="pay-overlay-title" className="mt-5 text-lg font-extrabold text-slate-900" style={{ fontFamily: "'Sora', system-ui, sans-serif" }}>
          Pedido enviado à operadora
        </h2>
        <p id="pay-overlay-desc" className="mt-2 text-sm font-semibold text-slate-800 leading-relaxed">
          Não feche esta página.
        </p>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          Vai receber uma aba no seu telemóvel para confirmar o pagamento.
        </p>
        <p className="mt-3 text-xs text-slate-500 leading-relaxed">
          Introduza o PIN nessa aba para concluir a compra.
        </p>

      </div>
    </div>
  );
});
