import { createFileRoute, Link } from "@tanstack/react-router";

// EXISTE UM BUG CRÍTICO NA INTEGRAÇÃO DÉBITO PAY.
// 
// Actualmente acontece isto:
// 
// Eu preencho API Key, Wallet ZAR e demais dados.
// 
// Clico em Salvar configuração.
// 
// O sistema informa que foi salvo.
// 
// Dou refresh na página.
// 
// Todos os campos ficam vazios novamente.
// 
// A página de Integrações volta para a tela vazia ou perde o card da Débito Pay.
// 
// Isso significa que a configuração NÃO está sendo persistida correctamente ou NÃO está sendo carregada novamente do banco.
// 
// Quero corrigir isso de forma definitiva.
// 
// 1. AUDITAR O SALVAMENTO
// 
// Verifique o botão:
// 
// Salvar configuração
// 
// Ele deve realmente gravar a configuração no backend/Supabase.
// 
// Não quero apenas:
// 
// state React
// 
// localStorage
// 
// variável temporária
// 
// toast “salvo”
// 
// objeto em memória
// 
// Quero persistência real.
// 
// 2. CRIAR/USAR TABELA DE CONFIGURAÇÃO
// 
// Utilize a arquitectura existente do projecto.
// 
// Se já existe tabela de integrações/gateways, reutilize.
// 
// Se não existir, criar uma estrutura persistente para guardar algo equivalente a:
// 
// provider
// 
// country
// 
// currency
// 
// environment
// 
// wallet_id
// 
// api_key_reference/encrypted_secret
// 
// webhook_secret_reference
// 
// is_active
// 
// created_at
// 
// updated_at
// 
// Para esta integração:
// 
// provider = debitopay
// 
// country = ZA
// 
// currency = ZAR
// 
// 3. API KEY
// 
// API Key não deve ficar exposta no frontend.
// 
// Guardar com segurança utilizando a estrutura de secrets/backend do projecto.
// 
// Na base de dados pode existir apenas referência/configuração necessária, nunca a API Key em texto público.
// 
// 4. CARREGAR CONFIGURAÇÃO AO ABRIR A PÁGINA
// 
// Quando abrir:
// 
// /integrations
// 
// o frontend deve fazer uma consulta ao backend e recuperar a configuração já salva.
// 
// Se a integração existir, mostrar automaticamente:
// 
// Débito Pay 🇿🇦
// 
// Status:
// 🟢 Conectado
// 
// Ambiente:
// Live / Produção
// 
// Wallet:
// 34471 ou versão mascarada
// 
// API Key:
// ••••••••••••
// 
// Webhook:
// configurado
// 
// NÃO exigir que eu preencha novamente depois de refresh.
// 
// 5. NÃO APAGAR VALORES NO REFRESH
// 
// Refresh do navegador NÃO pode:
// 
// apagar API Key
// 
// apagar Wallet
// 
// apagar status
// 
// remover card da integração
// 
// voltar para “não configurado”
// 
// A integração deve continuar exactamente no estado persistido no backend.
// 
// 6. VERIFICAR O CARD DE INTEGRAÇÃO
// 
// O card da Débito Pay deve aparecer sempre que existir configuração no banco.
// 
// Não esconder o card por causa de um estado frontend temporário.
// 
// A renderização deve depender da configuração persistida.
// 
// 7. SALVAR E DEPOIS RECARREGAR
// 
// Depois de salvar, faça imediatamente:
// 
// SAVE
// → backend
// → confirmação
// → nova consulta ao banco
// → atualizar interface com dados persistidos
// 
// Não use somente o objeto que já estava no formulário.
// 
// 8. TESTE OBRIGATÓRIO
// 
// Depois de corrigir, execute este teste:
// 
// preencher configuração
// 
// salvar
// 
// confirmar registro no banco
// 
// recarregar /integrations
// 
// confirmar que os dados continuam carregados
// 
// fechar a página
// 
// abrir novamente
// 
// confirmar que continuam carregados
// 
// logout/login
// 
// confirmar que continuam carregados para o mesmo utilizador/admin
// 
// 9. NÃO DUPLICAR CONFIGURAÇÕES
// 
// Não criar um novo registro toda vez que eu clicar Salvar.
// 
// Use upsert/update para a integração:
// 
// debitopay + ZA
// 
// Deve existir uma única configuração activa por conta/merchant, salvo se a arquitectura actual exigir outra lógica.
// 
// 10. STATUS “CONECTADO”
// 
// Só mostrar:
// 
// 🟢 Conectado
// 
// quando existir configuração persistida e validada.
// 
// Não depender apenas de uma variável como:
// 
// setConnected(true)
// 
// Depois de refresh o sistema deve calcular o status baseado no backend.
// 
// 11. INVESTIGAR O BUG ACTUAL
// 
// Quero que identifique exactamente:
// 
// onde o formulário salva;
// 
// em qual tabela;
// 
// se o insert/update está realmente acontecendo;
// 
// se existe erro silencioso;
// 
// se RLS está bloqueando;
// 
// se o registro está associado ao utilizador/admin correcto;
// 
// como os dados são carregados ao iniciar a página;
// 
// por que desaparecem após refresh.
// 
// Corrija a causa raiz.
// 
// 12. RELATÓRIO FINAL
// 
// Depois da correção, responda:
// 
// Tabela utilizada:
// [...]
// 
// Registro criado/atualizado:
// [...]
// 
// Chave lógica da integração:
// [...]
// 
// API Key armazenada como:
// [...]
// 
// Função usada para salvar:
// [...]
// 
// Função usada para carregar:
// [...]
// 
// RLS verificada:
// Sim/Não
// 
// Teste após refresh:
// Passou/Falhou
// 
// Teste após sair e entrar novamente:
// Passou/Falhou
// 
// Card permanece visível:
// Sim/Não
// 
// NÃO diga apenas “corrigido”.
// 
// Quero confirmação de persistência real no backend.

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
