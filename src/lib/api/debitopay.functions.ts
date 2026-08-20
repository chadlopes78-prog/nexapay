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
  .handler(async ({ data, context }) => {
    const hosts = ["https://mpesaemolatech.com", "https://e2payments.explicador.co.mz"];
    let success = false;
    let details = {
      apiKey: "inválida",
      environment: data.environment === "live" ? "Live" : "Sandbox",
      wallet: "inválida",
      currency: "ZAR",
      status: "integração inactiva"
    };

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
          details.apiKey = "válida";
          const { access_token } = await tokenRes.json();
          
          // Verify Wallet
          const walletRes = await fetch(`${host}/v1/wallets/${data.walletZa}`, {
            headers: { "Authorization": `Bearer ${access_token}` },
          });

          if (walletRes.ok) {
            const wallet = await walletRes.json();
            // DebitoPay returns the wallet in a 'data' property usually, but check structure
            const w = wallet.data || wallet;
            if (w.id === data.walletZa) {
              details.wallet = "válida";
              details.currency = w.currency || "ZAR";
              details.status = "integração activa";
              success = true;
              break;
            }
          }
        }
      } catch (e) {
        continue;
      }
    }

    const message = success 
      ? `API Key: ${details.apiKey}\nAmbiente: ${details.environment}\nWallet ZAR: ${details.wallet}\nMoeda: ${details.currency}\nStatus: ${details.status}`
      : "❌ Falha na comunicação com Débito Pay ou Wallet inválida.";

    return { success, message };
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
