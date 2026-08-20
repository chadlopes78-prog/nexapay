import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { DEBITOPAY_URLS, validateDebitoPayWallet, listDebitoPayWallets } from "./debitopay.server";

const DebitoPayCredentialsInput = z.object({
  environment: z.enum(["sandbox", "live"]),
  apiKey: z.string().min(1),
  walletZa: z.string().min(1),
  webhookSecret: z.string().optional(),
});

export const getDebitoPayConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: creds } = await supabaseAdmin
      .from("user_payment_credentials")
      .select("e2p_client_id, wallet_za, debitopay_za_webhook_secret")
      .eq("user_id", context.userId)
      .maybeSingle();

    const isConnected = !!creds?.e2p_client_id && !!creds?.wallet_za;
    const origin = process.env.VITE_SITE_URL || "https://nexapayio.com";

    return {
      connected: isConnected,
      environment: "live" as const,
      apiKeyMasked: creds?.e2p_client_id ? `••••••••${creds.e2p_client_id.slice(-4)}` : "",
      walletZa: creds?.wallet_za || "",
      webhookSecretMasked: creds?.debitopay_za_webhook_secret ? "••••••••" : "",
      webhookUrl: `${origin}/api/public/debito-webhook`,
    };
  });

export const testDebitoPayConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DebitoPayCredentialsInput.parse(input))
  .handler(async ({ data }) => {
    const auth = { apiKey: data.apiKey, environment: data.environment };
    
    const walletRes = await validateDebitoPayWallet(auth, data.walletZa);
    
    const debugLog = {
      httpStatus: walletRes.status,
      endpoint: walletRes.url,
      method: walletRes.method,
      response: walletRes.data,
      environment: data.environment.toUpperCase(),
      walletId: data.walletZa
    };

    if (walletRes.ok) {
      const walletData = walletRes.data?.data || walletRes.data;
      return {
        success: true,
        message: `✅ Conectado com sucesso!\nAmbiente: ${data.environment.toUpperCase()}\nMoeda: ${walletData.currency || "ZAR"}\nStatus: ${walletData.status || "Ativa"}\nWallet ID: ${data.walletZa}`,
        debug: debugLog
      };
    }

    // Se falhou, construir mensagem detalhada
    let detailedMessage = "❌ Falha na Integração\n\n";
    const status = walletRes.status;
    const errorData = walletRes.data;

    if (status === 401) {
      detailedMessage += `Motivo: API Key inválida ou não autorizada (HTTP 401)\n`;
      detailedMessage += `Dica: Verifique se a API Key está correta e pertence ao ambiente ${data.environment.toUpperCase()}.\n`;
    } else if (status === 404) {
      detailedMessage += `Motivo: Wallet não encontrada (HTTP 404)\n`;
      detailedMessage += `ID Enviado: ${data.walletZa}\n`;
      detailedMessage += "Dica: A wallet informada não existe nesta conta.\n";
    } else if (status === 0) {
      detailedMessage += `Motivo: Falha de Comunicação\n${errorData?.message || "Erro de rede"}\n`;
    } else {
      detailedMessage += `Motivo: Erro na API (HTTP ${status})\n`;
      detailedMessage += `${errorData?.message || "Erro desconhecido"}\n`;
    }

    detailedMessage += `\n--- LOG DE DIAGNÓSTICO ---\n`;
    detailedMessage += `HTTP: ${status || "N/A"}\n`;
    detailedMessage += `Endpoint: ${walletRes.url || "N/A"}\n`;
    detailedMessage += `Provider Code: ${errorData?.code || errorData?.error || "N/A"}\n`;
    detailedMessage += `Provider Msg: ${errorData?.message || "N/A"}\n`;

    return { 
      success: false, 
      message: detailedMessage,
      debug: {
        httpStatus: status,
        endpoint: walletRes.url,
        environment: data.environment.toUpperCase(),
        walletId: data.walletZa,
        providerCode: errorData?.code || errorData?.error,
        providerMessage: errorData?.message
      }
    };
  });

    if (walletFound) {
      return {
        success: true,
        message: `✅ Conectado com sucesso!\nAmbiente: ${data.environment.toUpperCase()}\nMoeda: ${walletData.currency}\nStatus: ${walletData.status || "Ativa"}\nWallet ID: ${data.walletZa}`,
        debug: debugLog
      };
    }

    // Se falhou, construir mensagem detalhada
    let detailedMessage = "❌ Falha na Integração\n\n";
    if (lastError?.type === "auth") {
      detailedMessage += `Motivo: Falha na Autenticação (HTTP ${lastError.status})\n`;
      detailedMessage += `Dica: Verifique se a API Key pertence ao ambiente ${data.environment.toUpperCase()}.\n`;
    } else if (lastError?.type === "wallet") {
      detailedMessage += `Motivo: Wallet Inválida/Não Encontrada (HTTP ${lastError.status})\n`;
      detailedMessage += `ID Enviado: ${data.walletZa}\n`;
      if (lastError.status === 404) detailedMessage += "Dica: A wallet informada não existe nesta conta.\n";
    } else if (lastError?.type === "network") {
      detailedMessage += `Motivo: Erro de Comunicação\n${lastError.message}\n`;
    }

    if (lastError) {
      detailedMessage += `\n--- LOG DE DIAGNÓSTICO ---\n`;
      detailedMessage += `HTTP: ${lastError.status || "N/A"}\n`;
      detailedMessage += `Endpoint: ${lastError.endpoint || "N/A"}\n`;
      detailedMessage += `Provider Code: ${lastError.code || "N/A"}\n`;
      detailedMessage += `Provider Msg: ${lastError.message || "N/A"}\n`;
    }

    return { 
      success: false, 
      message: detailedMessage,
      debug: {
        httpStatus: lastError?.status,
        endpoint: lastError?.endpoint,
        environment: data.environment.toUpperCase(),
        walletId: data.walletZa,
        providerCode: lastError?.code,
        providerMessage: lastError?.message
      }
    };
  });

export const fetchDebitoPayWallets = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ apiKey: z.string(), environment: z.enum(["sandbox", "live"]).optional() }).parse(input))
  .handler(async ({ data }) => {
     const auth = { apiKey: data.apiKey, environment: data.environment || "live" };
     
     try {
       const res = await listDebitoPayWallets(auth);
       if (res.ok) {
         const wallets = res.data?.data || res.data;
         return (wallets || [])
           .filter((w: any) => w.currency === "ZAR" || w.country === "ZA")
           .map((w: any) => ({
             id: w.id,
             name: w.name,
             country: w.country || "ZA",
             currency: w.currency || "ZAR",
             status: w.status || "active",
             label: `🇿🇦 ${w.name || "ZAR Wallet"} (${w.id}) - ${w.status || 'active'}`
           }));
       }
     } catch (e) {
       console.error("fetchDebitoPayWallets error", e);
     }
 
     return [];
  });

export const saveDebitoPayConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DebitoPayCredentialsInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("user_payment_credentials")
      .upsert({
        user_id: context.userId,
        e2p_client_id: data.apiKey,
        e2p_client_secret: data.apiKey, // DebitoPay API Key
        wallet_za: data.walletZa,
        debitopay_za_webhook_secret: data.webhookSecret || null,
      }, { onConflict: "user_id" });

    if (error) throw error;
    
    // Invalidate tokens for this user
    const { invalidateAccessToken } = await import("./payments.functions");
    invalidateAccessToken(data.apiKey);

    return { success: true };
  });
