Auditoria e Otimização do SaaS:

1. **Responsividade e UX:**
   - Padronizar os botões em todo o sistema (produtos, vendas, settings) para garantir área de toque suficiente e estado hover/active correto.
   - Revisar componentes de formulário em dispositivos mobile (tamanho de input, alinhamento, padding).
   - Ajustar o Dashboard para não sofrer com quebras de layout em resoluções menores.

2. **Otimização de Desempenho:**
   - Revisar carregamento de dados nas rotas do dashboard (usar `prefetch` e garantir cache eficiente).
   - Implementar `React.lazy` e `Suspense` para rotas pesadas.
   - Otimizar renderização de tabelas grandes (uso de `memo`).
   - Corrigir erros de console e avisos de React.

3. **Interface Premium:**
   - Adicionar ícone e branding visual consistente em todas as páginas (favicon, logos).
   - Refinar o esquema de cores e espaçamentos seguindo diretrizes de SaaS moderno.
   - Melhorar estados de loading e feedback de ações (toasts, placeholders).

4. **Funcionalidades e Segurança:**
   - Auditoria de todas as rotas `_dashboard` para garantir que botões e links estejam vinculados a ações funcionais.
   - Corrigir eventuais bugs de segurança (verificar policies do Supabase via código se possível).
   - Implementar tratamento de erro robusto em todas as chamadas de API.
   - Garantir que nenhum botão fique inativo (adicionar feedback visual de "em breve" ou desabilitar se necessário).

5. **Notificações:**
   - Refinar o estilo visual das notificações (PWA e toast).
   - Garantir entrega confiável em mobile.
