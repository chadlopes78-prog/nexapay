import { z } from "zod";

export const DEBITOPAY_URLS = {
  live: "https://mpesaemolatech.com", // Base URL para API de pagamentos real da Débito Pay
  sandbox: "https://sandbox.mpesaemolatech.com",
};

export type DebitoPayEnv = "sandbox" | "live";

export interface DebitoPayAuth {
  apiKey: string;
  environment: DebitoPayEnv;
}

export interface DebitoPayRequestOptions {
  auth: DebitoPayAuth;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: any;
}

export async function callDebitoPay(options: DebitoPayRequestOptions) {
  const { auth, method = "GET", path, body } = options;
  const baseUrl = DEBITOPAY_URLS[auth.environment];
  
  // A Débito Pay usa a API Key diretamente no header de Autorização como Bearer token
  // ou conforme especificado na integração direta. 
  // NOTA: Para C2B (pagamentos), a API exige o token via /oauth/token para E2Payments, 
  // mas para ZA (South Africa) via Débito Pay, estamos unificando a chamada.
  
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Authorization": `Bearer ${auth.apiKey}`, // Uso direto da API Key
  };

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const responseText = await response.text();
    let responseData: any = null;
    try {
      responseData = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseData = { message: responseText };
    }

    return {
      ok: response.ok,
      status: response.status,
      data: responseData,
      url,
      method,
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      data: { message: error.message || "Erro de conexão" },
      url,
      method,
    };
  }
}

/**
 * Valida uma wallet específica.
 */
export async function validateDebitoPayWallet(auth: DebitoPayAuth, walletId: string) {
  return callDebitoPay({
    auth,
    method: "GET",
    path: `/v1/wallets/${walletId}`,
  });
}

/**
 * Lista wallets da conta.
 */
export async function listDebitoPayWallets(auth: DebitoPayAuth) {
  return callDebitoPay({
    auth,
    method: "GET",
    path: "/v1/wallets",
  });
}

/**
 * Inicia um pagamento C2B.
 */
export async function initiateDebitoPayPayment(auth: DebitoPayAuth, walletId: string, payload: any) {
  return callDebitoPay({
    auth,
    method: "POST",
    path: `/v1/c2b/debitopay-payment/${walletId}`,
    body: payload,
  });
}

/**
 * Consulta o status de uma transação.
 */
export async function getDebitoPayTransactionStatus(auth: DebitoPayAuth, transactionId: string) {
  // A Débito Pay usa o endpoint de pagamentos para consultar status
  return callDebitoPay({
    auth,
    method: "GET",
    path: `/v1/payments/${transactionId}`,
  });
}
