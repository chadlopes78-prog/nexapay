import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { orderedE2payHosts, setE2payBaseUrl } from "@/lib/payments/e2pay-hosts";

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
    // A documentação oficial aponta para mpesaemolatech.com ou explicador.co.mz
    const hosts = data.environment === "live" 
      ? ["https://mpesaemolatech.com", "https://e2payments.explicador.co.mz"]
      : ["https://sandbox.mpesaemolatech.com"]; // Sandbox costuma ter prefixo ou host diferente
      
    let lastError: any = null;
    let authSuccess = false;
    let walletFound = false;
    let walletData: any = null;
    let debugLog: any = null;

    for (const host of hosts) {
      const endpoint = `${host}/oauth/token`;
      const method = "POST";
      
      try {
        const tokenRes = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_type: "client_credentials",
            client_id: data.apiKey,
            client_secret: data.apiKey,
          }),
        });

        const status = tokenRes.status;
        const body = await tokenRes.text();
        let json: any = {};
        try { json = JSON.parse(body); } catch {}

        if (tokenRes.ok) {
          authSuccess = true;
          const { access_token } = json;
          
          const walletEndpoint = `${host}/v1/wallets/${data.walletZa}`;
          const walletRes = await fetch(walletEndpoint, {
            method: "GET",
            headers: { "Authorization": `Bearer ${access_token}` },
          });

          const wStatus = walletRes.status;
          const wBody = await walletRes.text();
          let wJson: any = {};
          try { wJson = JSON.parse(wBody); } catch {}

          debugLog = {
            httpStatus: wStatus,
            endpoint: walletEndpoint.replace(host, host), // Proteção visual se necessário
            method: "GET",
            response: wJson,
            environment: data.environment.toUpperCase(),
            walletId: data.walletZa
          };

          if (walletRes.ok) {
            walletFound = true;
            walletData = wJson.data || wJson;
            break;
          } else {
            lastError = {
              type: "wallet",
              status: wStatus,
              code: wJson.error || wJson.code || "unknown",
              message: wJson.message || "Wallet não encontrada ou erro na consulta",
              endpoint: walletEndpoint
            };
          }
        } else {
          lastError = {
            type: "auth",
            status,
            code: json.error || "unauthorized",
            message: json.message || (status === 401 ? "API Key inválida" : "Falha na autenticação"),
            endpoint
          };
        }
      } catch (e: any) {
        lastError = {
          type: "network",
          message: e.message || "Erro de conexão (DNS/Timeout)",
          endpoint
        };
      }
    }

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
  .inputValidator((input) => z.object({ apiKey: z.string() }).parse(input))
  .handler(async ({ data }) => {
     const hosts = ["https://mpesaemolatech.com", "https://e2payments.explicador.co.mz"];
     
     for (const host of hosts) {
       try {
         const tokenRes = await fetch(`${host}/oauth/token`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({
             grant_type: "client_credentials",
             client_id: data.apiKey,
             client_secret: data.apiKey,
           }),
         });
         
         if (tokenRes.ok) {
           const { access_token } = await tokenRes.json();
           const walletRes = await fetch(`${host}/v1/wallets`, {
             headers: { "Authorization": `Bearer ${access_token}` },
           });
           
           if (walletRes.ok) {
             const { data: wallets } = await walletRes.json();
             return (wallets || [])
               .filter((w: any) => w.currency === "ZAR" || w.country === "ZA")
               .map((w: any) => ({
                 id: w.id,
                 country: w.country || "ZA",
                 currency: w.currency || "ZAR",
                 status: w.status || "active",
                 label: `🇿🇦 ${w.name || "ZAR Wallet"} (${w.currency})`
               }));
           }
         }
       } catch (e) {
         continue;
       }
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
