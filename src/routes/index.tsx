import { createFileRoute, Link } from "@tanstack/react-router";

// A auditoria foi realizada, mas antes de considerar a integração concluída quero uma VALIDAÇÃO REAL da API.
// 
// Não faça mais alterações visuais.
// 
// Não altere a homepage.
// 
// Utilize a implementação actual e execute testes reais no backend.
// 
// TESTE 1 — AUTENTICAÇÃO
// 
// Execute uma chamada REAL utilizando a API Key LIVE actualmente configurada.
// 
// Quero o resultado:
// 
// HTTP status
// 
// endpoint utilizado
// 
// método HTTP
// 
// autenticação utilizada
// 
// sucesso ou falha
// 
// NÃO mostrar API Key.
// 
// TESTE 2 — LISTAR WALLETS
// 
// Execute:
// 
// GET /v1/wallets
// 
// na API Débito Pay LIVE que você afirmou ser oficial.
// 
// Mostre o resultado REAL da API.
// 
// Quero saber:
// 
// HTTP status
// 
// quantas wallets foram retornadas
// 
// IDs das wallets
// 
// moedas
// 
// países
// 
// status
// 
// Não invente resultados.
// 
// TESTE 3 — WALLET 34471
// 
// Execute uma consulta REAL para:
// 
// Wallet ID:
// 
// 34471
// 
// Quero a resposta real da API.
// 
// Informar:
// 
// HTTP status:
// [...]
// 
// Wallet encontrada:
// SIM / NÃO
// 
// Wallet ID:
// [...]
// 
// Currency:
// [...]
// 
// Country:
// [...]
// 
// Status:
// [...]
// 
// Provider response:
// [...]
// 
// Somente considere a wallet válida para África do Sul se:
// 
// currency = ZAR
// 
// e estiver activa/utilizável.
// 
// TESTE 4 — NÃO CONFUNDIR 404
// 
// Se receber HTTP 404 novamente, mostre a resposta bruta sanitizada da API.
// 
// Não transforme automaticamente em mensagem genérica.
// 
// Quero saber se o 404 significa:
// 
// endpoint inexistente
// 
// wallet inexistente
// 
// recurso não autorizado
// 
// outro motivo
// 
// TESTE 5 — CRIAÇÃO DE PAGAMENTO
// 
// Se a wallet 34471 for validada como ZAR, NÃO cobre dinheiro real ainda.
// 
// Primeiro confirme qual endpoint oficial do código actual será usado para criar pagamento.
// 
// Mostrar:
// 
// Endpoint:
// [...]
// 
// Método HTTP:
// [...]
// 
// Campos obrigatórios:
// [...]
// 
// Wallet enviada:
// 34471
// 
// Currency:
// ZAR
// 
// Country:
// ZA
// 
// Métodos de pagamento disponíveis:
// [...]
// 
// IMPORTANTE
// 
// Você afirmou que utiliza:
// 
// Base URL:
// https://api.debitopay.com
// 
// Wallet list:
// GET /v1/wallets
// 
// Wallet detail:
// GET /v1/wallets/{id}
// 
// Authentication:
// Bearer Token
// 
// Agora quero que prove que esses valores estão efectivamente funcionando contra a API REAL.
// 
// Não responda somente com documentação ou código.
// 
// Execute a chamada e entregue os resultados reais.
// 
// A integração só pode ser marcada como:
// 
// 🟢 CONFIGURADA
// 
// depois que:
// 
// API Key autenticar;
// 
// API responder;
// 
// Wallet 34471 for encontrada;
// 
// Currency for ZAR;
// 
// Wallet estiver activa.
// 
// Caso qualquer um desses testes falhe, mantenha:
// 
// 🔴 NÃO CONFIGURADO
// 
// e mostre o erro real.

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
