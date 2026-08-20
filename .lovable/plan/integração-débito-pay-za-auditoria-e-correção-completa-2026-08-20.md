# Integração Débito Pay ZA — Auditoria e Correção Completa

O sistema ZA estava reutilizando o mecanismo de autenticação OAuth da E2Payments Moçambique, o que gerava erros 401 (invalid_client). A integração da África do Sul será migrada para a API oficial da Débito Pay, utilizando autenticação via API Key diretamente e endpoints específicos.

## Mudanças

### Backend (Domínio e Autenticação)
- **Novo Arquivo:** `src/lib/api/debitopay.server.ts` para isolar a lógica de comunicação com a API Débito Pay (API Key auth, base URLs sandbox/live).
- **Refatoração:** `src/lib/api/debitopay.functions.ts` para remover dependências de `orderedE2payHosts` e chamadas a `/oauth/token` na integração ZA.
- **Isolamento:** A integração Moçambique (E2Payments) continuará em `src/lib/api/payments.functions.ts` e `src/lib/payments/e2pay-hosts.ts` sem alterações que impactem seu funcionamento atual.

### Checkout e Pagamentos
- **Checkout Backend:** `src/lib/api/payments.functions.ts` detectará se o produto é ZA/ZAR e desviará a chamada para a API Débito Pay em vez de tentar obter OAuth token da E2Payments.
- **Reconciliação:** `src/lib/payments/reconciliation.server.ts` será atualizado para usar os endpoints de consulta de status da Débito Pay quando a venda for ZA.
- **Normalização:** Mapeamento de estados da Débito Pay para o sistema interno, garantindo que "Paid", "Pending", "Cancelled", "Failed" e "Expired" sejam reconhecidos corretamente.

### Webhook
- **Segurança:** O webhook em `src/routes/api/public/debito-webhook.ts` será validado para garantir que processa apenas assinaturas válidas da Débito Pay usando o Webhook Secret configurado.

### Dashboard
- **Diagnóstico:** Melhoria na exibição de erros na aba de integrações, reportando falhas reais da API (Key inválida, Wallet não encontrada, Erro de rede).

## Detalhes Técnicos

### Endpoints Débito Pay
- **Live Base URL:** `https://debitopay.com/api/v1` (ou conforme verificado na documentação)
- **Autenticação:** Header `Authorization: Bearer <API_KEY>` ou `X-API-KEY`, conforme DOC.
- **Criar Pagamento:** `POST /c2b/debitopay-payment/{wallet_id}`.
- **Status:** `GET /payments/{transaction_id}`.

### Fluxo de Correção
1. Criar helper server-side para Débito Pay.
2. Atualizar funções de teste de conexão e busca de wallets.
3. Corrigir o `getAccessToken` no checkout para ignorar ZA (ZA não usa OAuth /token).
4. Implementar chamada direta de débito no checkout ZA.
5. Ajustar a reconciliação e o webhook.
