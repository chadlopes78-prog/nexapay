import { createFileRoute, Link } from "@tanstack/react-router";

// O erro mudou para:
// 
// HTTP 404 — Wallet não encontrada
// 
// Endpoint usado:
// 
// https://mpesaemolatech.com/v1/wallets/34471
// 
// Antes de concluir que a Wallet 34471 está errada, quero uma auditoria imediata.
// 
// Documentação obrigatória:
// 
// https://debitopay.com/developers/payments-api/
// 
// Não quero mais suposições.
// 
// CONFIRME no código e na documentação oficial:
// 
// Esse domínio mpesaemolatech.com é realmente um endpoint oficial da Débito Pay?
// 
// O endpoint /v1/wallets/{wallet_id} existe realmente na documentação oficial?
// 
// A autenticação usada nessa chamada é exactamente a indicada pela Débito Pay?
// 
// A Wallet ID da África do Sul deve mesmo ser validada desta forma?
// 
// Existe diferença entre Wallet ID, Merchant ID, Account ID ou outro identificador?
// 
// A API Key LIVE que estou usando tem acesso a wallets ZAR?
// 
// Se mpesaemolatech.com NÃO estiver explicitamente documentado pela Débito Pay, REMOVA imediatamente esse endpoint da integração ZA.
// 
// Não tente adivinhar outro endpoint.
// 
// Use apenas endpoints confirmados na documentação oficial.
// 
// Depois responda somente com:
// 
// Domínio oficial da API Débito Pay LIVE:
// [...]
// 
// Endpoint oficial para listar wallets:
// [...]
// 
// Endpoint oficial para consultar uma wallet:
// [...]
// 
// Método de autenticação:
// [...]
// 
// Formato esperado do Wallet ID:
// [...]
// 
// O ID 34471 foi realmente consultado na API oficial?
// Sim/Não
// 
// Motivo exacto do 404:
// [...]
// 
// Não diga “wallet inválida” sem antes provar que a chamada foi feita para a API oficial da Débito Pay.

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-4 lg:px-6 h-16 flex items-center border-b">
        <Link className="flex items-center justify-center gap-2 group" to="/">
          <div className="h-9 w-9 bg-black rounded-xl flex items-center justify-center group-hover:rotate-6 transition-all border border-slate-800 shadow-lg">
             <span className="text-white font-black text-lg">N</span>
          </div>
          <span className="font-black text-3xl tracking-tighter text-slate-900">NexaPay</span>
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
            <div className="flex flex-col items-center space-y-8 text-center max-w-4xl mx-auto">
              <div className="space-y-4">
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-black/10 text-black text-xs font-bold uppercase tracking-wider mb-2 animate-bounce">
                  Novo: Checkout Inteligente Disponível
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900">
                  Venda em Moçambique e África do Sul
                </h1>
                <p className="mx-auto max-w-[800px] text-gray-500 text-sm md:text-base leading-relaxed">
                  A plataforma de pagamentos mais rápida e segura para o seu negócio digital. Integre M-Pesa, e-Mola, EFT e cartões em minutos e comece a escalar suas vendas hoje mesmo.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                <Link
                  to="/auth"
                  className="inline-flex h-14 items-center justify-center rounded-xl bg-black px-10 text-base font-bold text-white shadow-xl shadow-black/20 transition-all hover:scale-105 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Começar Agora Grátis
                </Link>
                <Link
                  to="/auth"
                  className="inline-flex h-14 items-center justify-center rounded-xl border border-input bg-background px-10 text-base font-bold shadow-sm transition-all hover:bg-accent hover:text-accent-foreground"
                >
                  Ver Demonstração
                </Link>
              </div>
              <div className="flex items-center gap-8 pt-8 grayscale opacity-50">
                <img src="/mpesa-logo.jpg" alt="M-Pesa" className="h-8 md:h-12 w-auto object-contain" />
                <img src="/emola-logo.jpg" alt="e-Mola" className="h-8 md:h-12 w-auto object-contain" />
                <div className="flex items-center gap-2 text-slate-400 font-bold text-lg">
                  <span className="text-2xl">🇿🇦</span> ZAR
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-gray-500">© 2026 NexaPay. Todos os direitos reservados.</p>
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
