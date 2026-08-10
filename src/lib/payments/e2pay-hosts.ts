// A E2Payments serve a mesma API em dois domínios: o histórico
// (e2payments.explicador.co.mz) e o novo (mpesaemolatech.com).
// Algumas contas só autenticam num deles, por isso resolvemos o host
// dinamicamente por client_id e memorizamos o que funcionou.

export const E2PAY_HOSTS = [
  "https://e2payments.explicador.co.mz",
  "https://mpesaemolatech.com",
] as const;

export const E2PAY_DEFAULT_HOST = E2PAY_HOSTS[0];

const resolvedHostByClient = new Map<string, string>();

/** Host já confirmado para este client_id (ou o padrão). */
export function getE2payBaseUrl(clientId: string | null | undefined): string {
  if (!clientId) return E2PAY_DEFAULT_HOST;
  return resolvedHostByClient.get(clientId) ?? E2PAY_DEFAULT_HOST;
}

/** Memoriza o host que autenticou com sucesso para este client_id. */
export function setE2payBaseUrl(clientId: string, baseUrl: string): void {
  if (!clientId || !baseUrl) return;
  resolvedHostByClient.set(clientId, baseUrl);
}

/** Ordem de tentativa: host conhecido primeiro, depois os restantes. */
export function orderedE2payHosts(clientId: string | null | undefined): string[] {
  const preferred = clientId ? resolvedHostByClient.get(clientId) : undefined;
  if (!preferred) return [...E2PAY_HOSTS];
  return [preferred, ...E2PAY_HOSTS.filter((host) => host !== preferred)];
}
