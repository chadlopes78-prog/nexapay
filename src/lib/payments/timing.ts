// Duração única do ciclo de espera do PIN, reutilizada por frontend e backend
// para não termos prazos divergentes (checkout mostrava 4min mas backend só
// marcava expirado após 5min, criando janela de reconciliação inconsistente).
export const PAYMENT_WAIT_WINDOW_MS = 5 * 60_000;
