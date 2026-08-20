import { createFileRoute, Link } from "@tanstack/react-router";

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
                  Venda em Moçambique com M-Pesa e e-Mola
                </h1>
                <div className="mx-auto max-w-[800px] text-gray-500 text-sm md:text-base leading-relaxed text-left whitespace-pre-wrap font-mono bg-white p-6 rounded-lg border shadow-sm max-h-[500px] overflow-y-auto">
                  Quero integrar pagamentos da África do Sul 🇿🇦 através da API oficial da Débito Pay no meu gateway de pagamentos já existente.

IMPORTANTE: o sistema actual já possui lógica de pagamentos e integrações existentes. Não destrua, não substitua e não altere funcionalidades que já estão a funcionar. Faça esta implementação de forma modular, adicionando a África do Sul como um novo mercado.

1. DOCUMENTAÇÃO OFICIAL

Antes de implementar, analise e siga rigorosamente a documentação oficial da Débito Pay:

Débito Pay Payments API:
https://debitopay.com/developers/payments-api/

Não invente endpoints, parâmetros, payment_method, status, payloads ou respostas.

A implementação deve usar exactamente os endpoints e formatos actualmente exigidos pela Débito Pay.

2. NOVO MERCADO: ÁFRICA DO SUL

Adicionar suporte para:

País: África do Sul 🇿🇦
Country Code: ZA
Moeda: ZAR — South African Rand
Símbolo: R

A integração da África do Sul deve ser independente da configuração de Moçambique.

Estrutura:

Moçambique 🇲🇿
- MZN
- M-Pesa
- e-Mola
- outros métodos já existentes

África do Sul 🇿🇦
- Adicionar somente os métodos realmente disponibilizados pela Débito Pay para África do Sul e habilitados na wallet/merchant.
- Verificar especialmente suporte a: Visa, Mastercard, EFT, Instant Bank Payment / pagamentos bancários, outros métodos ZA retornados oficialmente pela API
- Não mostrar no checkout métodos que não estejam realmente disponíveis na API/conta.

3. CONFIGURAÇÃO DA DÉBITO PAY

Criar uma configuração segura para:
- DEBITO_API_KEY
- DEBITO_WALLET_ZA
- DEBITO_WEBHOOK_SECRET

Caso a Débito utilize outras credenciais obrigatórias conforme a documentação actual, adicioná-las.

Todas as informações sensíveis devem ficar exclusivamente no backend/Supabase Secrets.

NUNCA expor API Key, secret ou credenciais no frontend, JavaScript público, localStorage ou código enviado ao navegador.

4. WALLET DA ÁFRICA DO SUL

A integração deve identificar a wallet da África do Sul configurada para:
- country = ZA
- currency = ZAR

Utilizar o wallet_id correcto dessa wallet nas transações.

Se a API da Débito disponibilizar endpoint para listar wallets, utilizar a resposta oficial para identificar/validar a wallet ZAR.

Não colocar um wallet_id fictício.

Se ainda não existir uma wallet ZAR configurada, mostrar no painel administrativo:
“Wallet da África do Sul não configurada.”

5. CONFIGURAÇÃO NO PRODUTO

Na criação/edição de produto, adicionar:
- País do checkout: Moçambique 🇲🇿 ou África do Sul 🇿🇦

Ao selecionar África do Sul 🇿🇦:
- automaticamente definir country = ZA, currency = ZAR
- E permitir seleccionar somente métodos de pagamento realmente disponíveis para África do Sul.

O preço deve aparecer correctamente, por exemplo: R 197, R 499, R 1,250.
Não apresentar MT/MZN quando o produto estiver configurado para África do Sul.

6. CHECKOUT

Quando o produto for da África do Sul, o checkout deve mostrar os métodos ZA configurados.
Exemplo visual: 💳 Visa / Mastercard, 🏦 Pagamento Bancário / Instant Payment.
Mas utilize os nomes oficiais dos métodos retornados/definidos pela Débito Pay.
O cliente escolhe o método e clica: PAGAR R 197

7. CRIAÇÃO DO PAGAMENTO

Quando o cliente clicar em pagar:
Frontend → Backend/Supabase Edge Function → Débito Pay API

O frontend envia somente informações necessárias como product_id, customer, amount/product reference, payment method.
Por segurança, sempre que possível, o backend deve recuperar o valor real do produto directamente da base de dados, em vez de confiar no valor enviado pelo navegador.

O backend determina: country, currency, wallet_id, amount, payment method, reference.
Para África do Sul: country = ZA, currency = ZAR, wallet_id = wallet ZA.

8. TRANSAÇÕES

Cada tentativa deve gerar uma transação no banco contendo:
internal_transaction_id, debito_transaction_id, reference, product_id, customer, amount, currency, country, payment_method, wallet_id, status, provider_status, provider_message, failure_reason, created_at, updated_at.
Nunca misturar transações ZAR com MZN.

9. PAGAMENTO COM CARTÃO

Se Visa/Mastercard estiver disponível para a wallet ZA, utilizar o fluxo seguro oficialmente fornecido pela Débito Pay.
Não armazenar no Supabase: CVV, número completo do cartão, dados sensíveis de autenticação.
Se a Débito retornar uma URL/session/redirect para pagamento, utilizar exactamente esse fluxo.
Não considerar a venda aprovada apenas porque o utilizador voltou para a página.

10. PAGAMENTOS BANCÁRIOS

Se a API disponibilizar EFT/Instant Bank Payment para ZA, implementar utilizando o fluxo oficial retornado pela Débito.
Não simular aprovação ou criar métodos fictícios.

11. WEBHOOK

Criar ou adaptar endpoint seguro para receber webhooks da Débito Pay.
Validar obrigatoriamente a autenticidade/assinatura do webhook conforme documentação oficial.
Processar os estados reais retornados pela Débito (completed/paid, pending/processing, failed, cancelled, expired, refunded, chargeback).

12. CONFIRMAÇÃO DA VENDA

Uma venda só pode aparecer como APROVADA quando existir confirmação legítima da Débito Pay (Webhook autenticado ou Consulta oficial).
Nunca marcar como aprovado simplesmente porque o frontend recebeu HTTP 200.

13. STATUS EM TEMPO REAL

Acompanhar o estado utilizando o mecanismo recomendado pela Débito Pay. Preservar o código/motivo real retornado pelo provedor para logs administrativos.

14. IDEMPOTÊNCIA E DUPLICAÇÃO

Cada tentativa deve possuir uma referência única. Utilizar idempotency key se disponível.

15. PÁGINA DE SUCESSO

Pagamento aprovado ✓ -> Encaminhar para página de acesso.

16. DASHBOARD

Mostrar claramente País, Moeda, Valor, Método, Status, Transaction ID, Reference. Adicionar filtros.

17. SEGURANÇA

API Key somente backend, webhook autenticado, validação server-side, proteção contra manipulação de preço, separação das wallets MZN e ZAR.

18. NÃO QUEBRAR MOÇAMBIQUE

A integração da África do Sul deve ser adicionada sem alterar o comportamento actual dos pagamentos de Moçambique.

19. TESTES

Testar todos os fluxos (Aprovado, Recusado, Cancelado, Pendente) e garantir que MZN continua funcionando.

20. ANTES DE ALTERAR O CÓDIGO

Primeiro faça uma auditoria da implementação actual e da documentação da Débito Pay. Depois da auditoria, implemente a integração da África do Sul preservando toda a lógica existente do gateway.
                </div>
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
