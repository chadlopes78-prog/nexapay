import { listDebitoPayWallets, validateDebitoPayWallet } from "./src/lib/api/debitopay.server";
import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function runAudit() {
  console.log("--- INICIANDO AUDITORIA REAL DÉBITO PAY ZA ---");
  
  const { data: creds, error: dbError } = await supabaseAdmin
    .from("user_payment_credentials")
    .select("user_id, e2p_client_id, wallet_za, debitopay_za_webhook_secret")
    .not("wallet_za", "is", null)
    .limit(1)
    .maybeSingle();

  if (dbError || !creds) {
    console.error("ERRO: Nenhuma credencial ZA encontrada no banco para teste.", dbError);
    process.exit(1);
  }

  const auth = {
    apiKey: creds.e2p_client_id,
    environment: "live" as const
  };
  const walletZaId = creds.wallet_za;

  console.log(`TESTE 1 — AUTENTICAÇÃO`);
  console.log(`Método: GET`);
  console.log(`Endpoint: https://api.debitopay.com/v1/wallets`);
  console.log(`Autenticação: Bearer [MASKED]`);

  const listRes = await listDebitoPayWallets(auth);
  
  console.log(`HTTP Status: ${listRes.status}`);
  console.log(`Sucesso: ${listRes.ok ? "SIM" : "NÃO"}`);

  console.log(`\nTESTE 2 — LISTAR WALLETS`);
  if (listRes.ok) {
    const wallets = listRes.data?.data || listRes.data || [];
    console.log(`Quantas wallets: ${Array.isArray(wallets) ? wallets.length : 1}`);
    if (Array.isArray(wallets)) {
      wallets.forEach(w => {
        console.log(`- ID: ${w.id}, Currency: ${w.currency}, Country: ${w.country}, Status: ${w.status}`);
      });
    } else {
       console.log(`- ID: ${wallets.id}, Currency: ${wallets.currency}, Country: ${wallets.country}, Status: ${wallets.status}`);
    }
  } else {
    console.log("Falha ao listar wallets.");
    console.log("Resposta Sanitizada:", JSON.stringify(listRes.data).replace(new RegExp(auth.apiKey, 'g'), "MASKED"));
  }

  console.log(`\nTESTE 3 — WALLET ${walletZaId}`);
  const valRes = await validateDebitoPayWallet(auth, walletZaId);
  console.log(`HTTP Status: ${valRes.status}`);
  
  const walletData = valRes.data?.data || valRes.data;
  const found = valRes.ok && !!walletData && !valRes.data.error;
  console.log(`Wallet encontrada: ${found ? "SIM" : "NÃO"}`);

  if (found) {
    console.log(`Wallet ID: ${walletData.id}`);
    console.log(`Currency: ${walletData.currency}`);
    console.log(`Country: ${walletData.country}`);
    console.log(`Status: ${walletData.status}`);
    
    const isZaValid = walletData.currency === "ZAR" && (walletData.status === "active" || walletData.status === "active");
    console.log(`Válida para África do Sul (ZAR & Activa): ${isZaValid ? "SIM" : "NÃO"}`);
  }

  console.log(`\nTESTE 4 — ANÁLISE DE ERRO (Se aplicável)`);
  if (!valRes.ok || valRes.data?.error) {
     console.log(`Resposta Bruta Sanitizada:`, JSON.stringify(valRes.data).replace(new RegExp(auth.apiKey, 'g'), "MASKED"));
     if (valRes.status === 404) {
       console.log("Significado do 404: Wallet inexistente no domínio oficial api.debitopay.com");
     } else if (valRes.status === 401) {
       console.log("Significado do 401: Recurso não autorizado / API Key inválida");
     }
  }

  console.log(`\nTESTE 5 — ESTRUTURA DE PAGAMENTO`);
  console.log(`Endpoint: https://api.debitopay.com/v1/c2b/debitopay-payment/${walletZaId}`);
  console.log(`Método: POST`);
  console.log(`Wallet enviada: ${walletZaId}`);
  console.log(`Currency: ZAR`);
  console.log(`Country: ZA`);
  
  console.log("\n--- FIM DA AUDITORIA ---");
}

runAudit();
