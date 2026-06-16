import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight, MessageCircle, AlertCircle, Loader2 } from "lucide-react";
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
  const { saleId } = Route.useSearch();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ sale: any; product: any } | null>(null);

  useEffect(() => {
    if (!saleId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 40;

    const fetchSale = async () => {
      const { data: saleData } = await supabase
        .from("sales")
        .select("*, products(id, name, access_link, delivery_link, support_phone, support_number, thank_you_button_text)")
        .eq("id", saleId)
        .maybeSingle();
      if (!saleData) return null;
      return { sale: saleData, product: (saleData as any).products };
    };

    const poll = async () => {
      while (!cancelled && attempts < MAX_ATTEMPTS) {
        attempts++;
        const result = await fetchSale();
        if (cancelled) return;
        if (result) {
          setData(result);
          if (result.sale?.status === "paid" || result.sale?.status === "failed") {
            setLoading(false);
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (!cancelled) setLoading(false);
    };

    const channel = supabase
      .channel(`sale-${saleId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sales", filter: `id=eq.${saleId}` },
        async () => {
          const result = await fetchSale();
          if (cancelled || !result) return;
          setData(result);
          if (result.sale?.status === "paid" || result.sale?.status === "failed") {
            setLoading(false);
          }
        }
      )
      .subscribe();

    poll();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [saleId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-slate-400 mx-auto" />
          <p className="text-slate-500 text-sm font-medium">A confirmar o seu pagamento...</p>
        </div>
      </div>
    );
  }

  const isPaid = data?.sale?.status === "paid";
  const product = data?.product;
  const accessLink = product?.access_link || product?.delivery_link;
  const supportNumber = product?.support_number || product?.support_phone || "258840000000";
  const buttonText = (product?.thank_you_button_text || "Liberar acesso").trim();

  if (!isPaid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="h-16 w-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8 text-amber-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-slate-900">Acesso em processamento</h1>
            <p className="text-slate-500">
              Se já concluiu o pagamento, fale com o suporte para liberar o seu acesso.
            </p>
          </div>
          <a
            href={`https://wa.me/${supportNumber.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 h-14 px-8 rounded-full bg-[#25D366] hover:bg-[#1fb959] text-white font-semibold text-base shadow-lg shadow-emerald-200 transition-all active:scale-[0.98]"
          >
            Falar com suporte <MessageCircle className="h-5 w-5" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="space-y-6">
          <div className="h-20 w-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" strokeWidth={2.2} />
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              Obrigado por confiar na gente
            </h1>
            <p className="text-slate-500 text-base md:text-lg">
              Para liberar o seu acesso, clique no botão abaixo
            </p>
          </div>
        </div>

        {accessLink ? (
          <a
            href={accessLink}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex w-full items-center justify-center gap-2 h-16 px-8 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-lg font-semibold shadow-xl shadow-emerald-200/70 transition-all duration-200 active:scale-[0.98] animate-[pulse_2.4s_ease-in-out_infinite]"
          >
            {buttonText}
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          </a>
        ) : (
          <p className="text-slate-500 text-sm">
            O seu acesso será enviado em breve. Em caso de dúvida, contacte o suporte.
          </p>
        )}

        <a
          href={`https://wa.me/${supportNumber.replace(/\D/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <MessageCircle className="h-4 w-4" /> Precisa de ajuda? Falar com suporte
        </a>
      </div>
    </div>
  );
}
