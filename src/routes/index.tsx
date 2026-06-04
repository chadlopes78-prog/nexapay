import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  Smartphone,
  BarChart3,
  Zap,
  Users,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CheckoutPro Mozambique | SaaS Profissional de Checkout" },
      {
        name: "description",
        content:
          "A plataforma de checkout mais completa para Moçambique. Aceite M-Pesa e e-Mola com facilidade.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Navigation */}
      <header className="px-4 lg:px-6 h-16 flex items-center border-b sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <Link to="/" className="flex items-center justify-center space-x-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <ShieldCheck className="text-white h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">
            CheckoutPro <span className="text-primary">MZ</span>
          </span>
        </Link>
        <nav className="ml-auto flex gap-4 sm:gap-6">
          <Link
            to="/auth"
            className="text-sm font-medium hover:text-primary transition-colors py-2 px-4 rounded-md"
          >
            Entrar
          </Link>
          <Link
            to="/auth"
            className="text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-colors py-2 px-4 rounded-md"
          >
            Criar Conta
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-slate-50">
          <div className="container px-4 md:px-6 mx-auto">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="space-y-2">
                <div className="inline-block rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-4">
                  #1 Plataforma de Checkout em Moçambique
                </div>
                <h1 className="text-4xl font-extrabold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl">
                  Transforme suas vendas com <br />
                  <span className="text-primary">M-Pesa e e-Mola</span>
                </h1>
                <p className="mx-auto max-w-[700px] text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed dark:text-gray-400 mt-4">
                  Checkout de alta conversão, gestão de vendas completa e integrações locais. A
                  solução profissional para infoprodutores e e-commerce em Moçambique.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 mt-8">
                <Button size="lg" className="px-8 h-12 text-base" asChild>
                  <Link to="/auth">
                    Começar Agora <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="px-8 h-12 text-base">
                  Ver Demonstração
                </Button>
              </div>
              <div className="mt-12 flex items-center justify-center gap-8 opacity-50 grayscale transition-all hover:grayscale-0">
                <div className="font-bold text-xl italic">M-Pesa</div>
                <div className="font-bold text-xl italic text-red-600">e-Mola</div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="w-full py-12 md:py-24 lg:py-32">
          <div className="container px-4 md:px-6 mx-auto">
            <div className="grid gap-12 lg:grid-cols-3">
              <div className="flex flex-col items-center space-y-4 text-center p-6 rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md">
                <div className="p-3 bg-primary/10 rounded-full">
                  <Smartphone className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold">Pagamentos Locais</h3>
                <p className="text-gray-500">
                  Integração nativa com M-Pesa e e-Mola. Seus clientes pagam como estão acostumados.
                </p>
              </div>
              <div className="flex flex-col items-center space-y-4 text-center p-6 rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md">
                <div className="p-3 bg-primary/10 rounded-full">
                  <Zap className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold">Checkout de Alta Conversão</h3>
                <p className="text-gray-500">
                  Páginas otimizadas para mobile e carregamento instantâneo. Venda mais com menos
                  esforço.
                </p>
              </div>
              <div className="flex flex-col items-center space-y-4 text-center p-6 rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md">
                <div className="p-3 bg-primary/10 rounded-full">
                  <BarChart3 className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold">Dashboard Completo</h3>
                <p className="text-gray-500">
                  Acompanhe suas vendas, receita e carrinhos abandonados em tempo real com gráficos
                  profissionais.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Social Proof / Stats */}
        <section className="w-full py-12 md:py-24 bg-primary text-white">
          <div className="container px-4 md:px-6 mx-auto text-center">
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <h2 className="text-4xl font-bold">98%</h2>
                <p className="text-primary-foreground/80">Taxa de Aprovação</p>
              </div>
              <div className="space-y-2">
                <h2 className="text-4xl font-bold">+10k</h2>
                <p className="text-primary-foreground/80">Vendas Mensais</p>
              </div>
              <div className="space-y-2">
                <h2 className="text-4xl font-bold">2min</h2>
                <p className="text-primary-foreground/80">Setup de Produto</p>
              </div>
              <div className="space-y-2">
                <h2 className="text-4xl font-bold">24/7</h2>
                <p className="text-primary-foreground/80">Suporte Local</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="w-full py-12 md:py-24 lg:py-32 bg-slate-50">
          <div className="container px-4 md:px-6 mx-auto max-w-4xl text-center">
            <div className="space-y-4">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                Pronto para profissionalizar suas vendas?
              </h2>
              <p className="text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Junte-se a centenas de empreendedores em Moçambique que já usam o CheckoutPro para
                gerir seus negócios.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4 mt-8">
                <Button size="lg" className="px-8 h-12" asChild>
                  <Link to="/auth">Criar minha conta grátis</Link>
                </Button>
              </div>
              <div className="flex items-center justify-center gap-4 mt-6 text-sm text-gray-500">
                <span className="flex items-center">
                  <CheckCircle2 className="h-4 w-4 mr-1 text-green-500" /> Sem mensalidade
                </span>
                <span className="flex items-center">
                  <CheckCircle2 className="h-4 w-4 mr-1 text-green-500" /> Ativação na hora
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full py-6 border-t px-4 md:px-6">
        <div className="container flex flex-col md:flex-row justify-between items-center gap-4 mx-auto">
          <p className="text-xs text-gray-500">
            © 2026 CheckoutPro Mozambique. Todos os direitos reservados.
          </p>
          <nav className="flex gap-4 sm:gap-6">
            <Link className="text-xs hover:underline underline-offset-4" to="/">
              Termos de Serviço
            </Link>
            <Link className="text-xs hover:underline underline-offset-4" to="/">
              Privacidade
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
