import { listDebitoPayWallets, validateDebitoPayWallet, initiateDebitoPayPayment } from "./src/lib/api/debitopay.server";

async function runAudit() {
  console.log("--- INICIANDO AUDITORIA REAL DÉBITO PAY ZA (SANDBOX TEST) ---");
  
  // Utilizando a API Key encontrada no banco mas apontando para SANDBOX para testar conectividade
  const auth = {
    apiKey: "a18ed7c5-0f3f-476a-8dfc-30cd75effb42",
    environment: "sandbox" as const
  };
  const walletZaId = "34471";

  console.log(`TESTE 1 — AUTENTICAÇÃO (SANDBOX)`);
  const listRes = await listDebitoPayWallets(auth);
  console.log(`HTTP Status: ${listRes.status}`);
  console.log(`Sucesso: ${listRes.ok ? "SIM" : "NÃO"}`);

  if (!listRes.ok) {
     console.log(`Resposta Sanitizada:`, JSON.stringify(listRes.data).replace(new RegExp(auth.apiKey, 'g'), "MASKED"));
  }

  console.log(`\nTESTE 3 — WALLET ${walletZaId} (SANDBOX)`);
  const valRes = await validateDebitoPayWallet(auth, walletZaId);
  console.log(`HTTP Status: ${valRes.status}`);
  
  console.log("\n--- FIM DA AUDITORIA ---");
}

runAudit();
