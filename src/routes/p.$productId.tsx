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


function CheckoutPage() {
  const { productId } = useParams({ from: "/p/$productId" } as any);
  const [product, setProduct] = useState<any>(null);
  const [checkout, setCheckout] = useState<any>(null);

  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"mpesa" | "emola">("mpesa");

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

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.info(`Iniciando pagamento via ${paymentMethod.toUpperCase()}...`);

    // Simulate payment process
    setTimeout(() => {
      toast.success("Pagamento solicitado! Verifique seu celular.");
    }, 1500);
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
            <span className="font-bold text-xl">CheckoutPro</span>
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

          <div className="space-y-3 pt-6">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 className="h-4 w-4 text-green-500" /> Acesso imediato após confirmação
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 className="h-4 w-4 text-green-500" /> {product.warranty_days} dias de
              garantia
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 className="h-4 w-4 text-green-500" /> Suporte 24/7 especializado
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="checkout-email">Email</Label>
                    <Input
                      id="checkout-email"
                      type="email"
                      placeholder="seu@email.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="checkout-phone">Celular (84/85/82/87)</Label>
                    <Input
                      id="checkout-phone"
                      placeholder="840000000"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
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
                    Pagar Agora <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              </CardContent>
            </form>
          </Card>

          <div className="text-center space-y-2 text-xs text-slate-400">
            <p>© 2026 CheckoutPro Mozambique. Todos os direitos reservados.</p>
            <p>
              Seu pagamento está sendo processado por CheckoutPro em nome de {product.merchant_id}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

