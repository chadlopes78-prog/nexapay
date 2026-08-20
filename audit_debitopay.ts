import { listDebitoPayWallets, validateDebitoPayWallet } from "./src/lib/api/debitopay.server";

async function runAudit() {
  console.log("--- INICIANDO AUDITORIA REAL DÉBITO PAY ZA (FORCED) ---");
  
  // Utilizando a API Key encontrada no banco e o Wallet ID solicitado pelo usuário
  const auth = {
    apiKey: "a18ed7c5-0f3f-476a-8dfc-30cd75effb42",
    environment: "live" as const
  };
  const walletZaId = "34471";

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
    } else if (wallets && typeof wallets === 'object' && wallets.id) {
       console.log(`- ID: ${wallets.id}, Currency: ${wallets.currency}, Country: ${wallets.country}, Status: ${wallets.status}`);
    } else {
       console.log("Formato de resposta inesperado ou lista vazia.");
       console.log(JSON.stringify(wallets));
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
