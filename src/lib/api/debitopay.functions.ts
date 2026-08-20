import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { orderedE2payHosts, setE2payBaseUrl } from "@/lib/payments/e2pay-hosts";

const DebitoPayCredentialsInput = z.object({
  environment: z.enum(["sandbox", "live"]),
  apiKey: z.string().min(1),
  walletZa: z.string().min(1),
  webhookSecret: z.string().optional(),
});

export const getDebitoPayConfig = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: { user } } = await supabaseAdmin.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: creds } = await supabaseAdmin
      .from("user_payment_credentials")
      .select("e2p_client_id, wallet_za")
      .eq("user_id", user.id)
      .maybeSingle();

    const isConnected = !!creds?.e2p_client_id && !!creds?.wallet_za;

    return {
      connected: isConnected,
      environment: "live" as const, // Based on real usage preference
      apiKeyMasked: creds?.e2p_client_id ? `••••••••${creds.e2p_client_id.slice(-4)}` : "",
      walletZa: creds?.wallet_za || "",
      webhookUrl: `${window.location.origin}/api/public/debito-webhook`,
    };
  });

export const testDebitoPayConnection = createServerFn({ method: "POST" })
  .inputValidator((input) => DebitoPayCredentialsInput.parse(input))
  .handler(async ({ data }) => {
    // Implement validation against official API
    // https://debitopay.com/api-docs/
    
    const hosts = ["https://mpesaemolatech.com", "https://e2payments.explicador.co.mz"];
    let success = false;
    let message = "Não foi possível autenticar na Débito Pay";

    for (const host of hosts) {
        try {
            const res = await fetch(`${host}/oauth/token`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    grant_type: "client_credentials",
                    client_id: data.apiKey, // Assuming API Key is used as client_id or similar per E2Pay pattern
                    client_secret: data.apiKey, // Placeholder
                })
            });
            if (res.ok) {
                success = true;
                message = "Conexão com Débito Pay estabelecida";
                break;
            }
        } catch (e) {
            continue;
        }
    }

    return { success, message };
  });

export const fetchDebitoPayWallets = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ apiKey: z.string() }).parse(input))
  .handler(async ({ data }) => {
     // Mocking response based on "listar wallets" requirement
     return [
       { id: "wallet_zar_live_1", country: "South Africa", currency: "ZAR", status: "active", label: "🇿🇦 ZAR Wallet" }
     ];
  });

export const saveDebitoPayConfig = createServerFn({ method: "POST" })
  .inputValidator((input) => DebitoPayCredentialsInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: { user } } = await supabaseAdmin.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { error } = await supabaseAdmin
      .from("user_payment_credentials")
      .upsert({
        user_id: user.id,
        e2p_client_id: data.apiKey,
        e2p_client_secret: data.apiKey, // DebitoPay API Key
        wallet_za: data.walletZa,
      }, { onConflict: "user_id" });

    if (error) throw error;
    
    // Invalidate tokens for this user
    const { invalidateAccessToken } = await import("./payments.functions");
    invalidateAccessToken(data.apiKey);

    return { success: true };
  });
