import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState, useEffect } from "react";
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
  const { productId } = useParams({ from: "/p/$productId" });
  const [product, setProduct] = useState<any>(null);
  const [checkout, setCheckout] = useState<any>(null);

  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"mpesa" | "emola">("mpesa");
  const [paymentStep, setPaymentStep] = useState<"info" | "reference">("info");

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
    
    if (paymentStep === "info") {
      setPaymentStep("reference");
      trackCheckout();
      return;
    }

    if (!paymentReference) {
      toast.error("Por favor, insira o código de referência do pagamento.");
      return;
    }

    setLoading(true);
    toast.info(`Processando pagamento via ${paymentMethod.toUpperCase()}...`);

    try {
      const { data, error } = await supabase.from("sales").insert({
        product_id: productId,
        customer_name: name,
        customer_phone: phone,
        amount: product.price,
        payment_method: paymentMethod,
        payment_reference: paymentReference,
        status: "pending",
      }).select().single();

      if (error) throw error;

      trackPurchase();
      toast.success("Pagamento enviado para verificação!");
      
      setTimeout(() => {
        window.location.href = `/success?productId=${productId}&saleId=${data.id}`;
      }, 1000);
    } catch (error: any) {
      toast.error("Erro ao processar pedido: " + error.message);
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
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Product Summary - Visible on top for Mobile, Left for Desktop */}
      <div className="w-full md:w-2/5 lg:w-1/3 bg-white p-6 md:p-12 border-b md:border-b-0 md:border-r">
        <div className="max-w-sm mx-auto space-y-8">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 bg-primary rounded-lg flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <span className="font-bold text-xl">Checkout Seguro</span>
          </div>

          <div className="space-y-4">
            <div className="aspect-video bg-slate-100 rounded-xl overflow-hidden">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300">
                  <Package className="h-12 w-12" />
                </div>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
            <p className="text-slate-500">{product.description}</p>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="flex justify-between items-center text-lg font-bold">
              <span>Total a pagar</span>
              <span className="text-primary">{product.price.toLocaleString("pt-MZ")} MT</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Lock className="h-3 w-3" /> Pagamento criptografado e seguro
            </div>
          </div>

        </div>
      </div>

      {/* Checkout Form */}
      <div className="flex-1 p-6 md:p-12 overflow-y-auto">
        <div className="max-w-lg mx-auto space-y-8">
          <Card className="border-none shadow-lg md:shadow-none bg-white">
            <form onSubmit={handlePayment}>
              <CardHeader>
                <CardTitle className="text-xl">Informações de Contato</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {paymentStep === "info" ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="checkout-name">Nome Completo</Label>
                      <Input
                        id="checkout-name"
                        placeholder="Seu nome"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="checkout-phone">Celular (Opcional)</Label>
                      <Input
                        id="checkout-phone"
                        placeholder="840000000"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>

                    <div className="pt-6">
                      <h3 className="text-lg font-semibold mb-4">Forma de Pagamento</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod("mpesa")}
                          className={cn(
                            "flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all",
                            paymentMethod === "mpesa"
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-slate-100 hover:border-slate-200",
                          )}
                        >
                          <CreditCard className="h-5 w-5" />
                          <span className="font-bold italic">M-Pesa</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod("emola")}
                          className={cn(
                            "flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all",
                            paymentMethod === "emola"
                              ? "border-red-600 bg-red-50 text-red-600"
                              : "border-slate-100 hover:border-slate-200",
                          )}
                        >
                          <Smartphone className="h-5 w-5" />
                          <span className="font-bold italic">e-Mola</span>
                        </button>
                      </div>
                    </div>

                    <div className="pt-8">
                      <Button type="submit" className="w-full h-14 text-lg font-bold">
                        Prosseguir <ChevronRight className="ml-2 h-5 w-5" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                      <h4 className="font-bold text-center">Instruções de Pagamento</h4>
                      <div className="space-y-2 text-sm">
                        <p>1. Transfira <strong>{product.price.toLocaleString("pt-MZ")} MT</strong> para o número:</p>
                        <p className="text-xl font-mono font-bold text-center bg-white p-2 rounded border">841234567</p>
                        <p className="text-xs text-muted-foreground text-center">(Número de exemplo - substitua pelo real)</p>
                        <p>2. Após o pagamento, copie o <strong>Código de Referência</strong> da transação.</p>
                        <p>3. Insira o código abaixo e clique em confirmar.</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="payment-ref">Referência da Transação</Label>
                      <Input
                        id="payment-ref"
                        placeholder="Ex: 123456789"
                        required
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        className="h-12 text-lg text-center font-mono"
                      />
                    </div>

                    <div className="flex gap-3 pt-4">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setPaymentStep("info")}
                        className="h-14"
                      >
                        Voltar
                      </Button>
                      <Button type="submit" className="flex-1 h-14 text-lg font-bold">
                        Confirmar Pagamento
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </form>
          </Card>

          <div className="text-center space-y-2 text-xs text-slate-400">
            <p>© 2026 Pagamento Seguro. Todos os direitos reservados.</p>
            <p>
              Seu pagamento está sendo processado em nome de {product.merchant_id}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

