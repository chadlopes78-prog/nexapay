import { createFileRoute, Link } from "@tanstack/react-router";

// Existe um erro na integração real da Débito Pay.
// Ao tentar validar a Wallet ZAR 34471, o sistema apresenta apenas:
// “Falha na comunicação com Débito Pay ou Wallet inválida.”
// ESSA MENSAGEM É GENÉRICA E NÃO É SUFICIENTE.
// Não altere a homepage. Trabalhe directamente no backend da integração.
// Documentação obrigatória:
// https://debitopay.com/developers/payments-api/
// Quero que faça DEBUG da chamada REAL realizada quando clico em Validar.
// 1. MOSTRAR O ERRO REAL
// Actualmente vocês estão agrupando erro de comunicação, autenticação e wallet inválida na mesma mensagem.
// Isso deve ser corrigido.
// O backend deve identificar e registrar:
// HTTP status retornado
// endpoint chamado
// método HTTP
// resposta da Débito Pay
// código de erro da Débito
// mensagem retornada pela Débito
// ambiente utilizado
// NUNCA registrar/exibir a API Key completa.
// 2. DIFERENCIAR OS ERROS
// Por exemplo:
// 401
// → API Key/autenticação inválida
// 403
// → acesso não autorizado
// 404
// → wallet/endpoint não encontrado
// 422
// → parâmetros inválidos
// 5xx
// → erro do servidor/provedor
// Falha de DNS/timeout
// → erro de comunicação
// Utilize os códigos e mensagens REAIS da Débito Pay; os exemplos acima são apenas orientação de tratamento HTTP.
// Não transforme tudo em:
// “Wallet inválida.”
// 3. AUDITAR O BOTÃO VALIDAR
// Quero confirmar que:
// Wallet ID ZAR = 34471
// está realmente sendo enviado ao backend.
// Depois confirme que o backend está consultando a Débito Pay através do endpoint OFICIAL definido na documentação.
// Não invente endpoint.
// 4. VERIFICAR AUTENTICAÇÃO
// Confirme na documentação oficial:
// URL base de produção
// URL base sandbox
// formato exacto da API Key
// header exacto de autenticação
// endpoint de wallets
// formato/ID esperado para uma wallet
// Compare isso com o código actualmente implementado.
// Corrija qualquer divergência.
// 5. AMBIENTE
// Estou usando:
// Live / Produção
// Portanto NÃO envie a requisição para endpoint Sandbox.
// API Key Live + endpoint Live + Wallet Live precisam pertencer ao mesmo ambiente.
// 6. BOTÃO “BUSCAR WALLETS”
// Também teste o botão Buscar.
// Ele deve consultar a API REAL e retornar as wallets da minha conta.
// Não quero wallets hardcoded.
// Se a API retornar uma wallet ZAR, mostrar:
// Nome
// Wallet ID
// Currency
// Status
// e permitir seleccioná-la.
// 7. LOG ADMINISTRATIVO
// Temporariamente, durante o diagnóstico, quando eu clicar Validar, mostrar algo como:
// Status da validação
// HTTP: [status real]
// Endpoint: [endpoint utilizado, sem secrets]
// Environment: LIVE
// Wallet ID: 34471
// Provider code: [código real]
// Provider message: [mensagem real]
// NUNCA mostrar:
// API Key completa
// Webhook Secret
// Authorization header completo
// 8. NÃO INVENTAR A RESPOSTA
// Se a chamada nem sequer estiver chegando à Débito Pay, diga:
// “Requisição não chegou à Débito Pay.”
// Se a autenticação falhar, diga isso.
// Se 34471 não existir, diga isso.
// Se a wallet existir mas não for ZAR, diga isso.
// Se a wallet estiver inactiva, diga isso.
// Quero o motivo REAL.
// 9. DEPOIS DO DEBUG
// Responda-me com:
// Endpoint chamado:
// [...]
// Método:
// [...]
// HTTP status:
// [...]
// Resposta da Débito Pay:
// [...]
// Ambiente:
// LIVE
// Wallet enviada:
// 34471
// Resultado da autenticação:
// [...]
// Motivo exacto da falha:
// [...]
// Ficheiro/Edge Function responsável:
// [...]
// NÃO diga apenas “corrigido”.
// Quero os dados técnicos da chamada que está falhando.

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
