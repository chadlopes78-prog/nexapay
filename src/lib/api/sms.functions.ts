import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Configuração de SMS (BulkSMS Moçambique).
 *
 * IMPORTANTE: a API Key NUNCA é guardada em base de dados nem devolvida ao
 * frontend. Vive apenas como secret de backend `BULKSMS_API_KEY`.
 * Esta camada é puramente aditiva — não toca em pagamentos, webhooks ou checkout.
 */

export type SmsSettings = {
  user_id: string;
  enabled: boolean;
  sender: string;
  message_paid: string;
  test_phone: string | null;
};

const DEFAULT_SENDER = "11480";
const DEFAULT_MESSAGE =
  "Olá {nome}, recebemos o seu pagamento de {valor} MT referente a {produto}. O seu pagamento foi confirmado com sucesso.";

export const getSmsSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sms_settings")
      .select("user_id, enabled, sender, message_paid, test_phone")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Apenas booleano — o valor do secret nunca é exposto.
    const hasApiKey = Boolean(process.env["BULKSMS_API_KEY"]);
    const hasEndpoint = Boolean(process.env["BULKSMS_ENDPOINT"]);

    return {
      settings:
        (data as SmsSettings | null) ??
        ({
          user_id: context.userId,
          enabled: false,
          sender: DEFAULT_SENDER,
          message_paid: DEFAULT_MESSAGE,
          test_phone: null,
        } satisfies SmsSettings),
      exists: Boolean(data),
      hasApiKey,
      hasEndpoint,
    };
  });

export const saveSmsSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    enabled?: boolean;
    sender?: string;
    message_paid?: string;
    test_phone?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const sender = String(data.sender ?? DEFAULT_SENDER).trim().slice(0, 20);
    if (!sender) throw new Error("O sender não pode estar vazio.");

    const message = String(data.message_paid ?? DEFAULT_MESSAGE).trim().slice(0, 1000);
    if (!message) throw new Error("A mensagem não pode estar vazia.");

    const testPhone = data.test_phone ? String(data.test_phone).replace(/\D/g, "").slice(0, 15) : null;

    const { data: saved, error } = await context.supabase
      .from("sms_settings")
      .upsert(
        {
          user_id: context.userId,
          enabled: data.enabled ?? false,
          sender,
          message_paid: message,
          test_phone: testPhone,
        },
        { onConflict: "user_id" },
      )
      .select("user_id, enabled, sender, message_paid, test_phone")
      .single();
    if (error) throw new Error(error.message);
    return saved as SmsSettings;
  });
