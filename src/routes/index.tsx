import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-4 lg:px-6 h-16 flex items-center border-b">
        <Link className="flex items-center justify-center" to="/">
          <span className="font-bold text-2xl tracking-tighter text-primary">CheckoutPro</span>
        </Link>
        <nav className="ml-auto flex gap-4 sm:gap-6">
          <Link className="text-sm font-medium hover:underline underline-offset-4" to="/auth">
            Entrar
          </Link>
          <Link className="text-sm font-medium hover:underline underline-offset-4" to="/auth">
            Criar Conta
          </Link>
        </nav>
      </header>
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-slate-50">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
                  Venda em Moçambique com M-Pesa e e-Mola
                </h1>
                <p className="mx-auto max-w-[700px] text-gray-500 md:text-xl">
                  A plataforma de checkout mais completa para empreendedores moçambicanos. 
                  Segurança, facilidade e conversão em um só lugar.
                </p>
              </div>
              <div className="space-x-4">
                <Link
                  to="/auth"
                  className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  Começar Agora
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-gray-500">© 2026 CheckoutPro Mozambique. Todos os direitos reservados.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link className="text-xs hover:underline underline-offset-4" to="/">
            Termos de Serviço
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" to="/">
            Privacidade
          </Link>
        </nav>
      </footer>
    </div>
  );
}
