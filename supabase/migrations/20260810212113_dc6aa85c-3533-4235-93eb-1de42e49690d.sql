CREATE TABLE public.sms_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  sender text NOT NULL DEFAULT '11480',
  message_paid text NOT NULL DEFAULT 'Olá {nome}, recebemos o seu pagamento de {valor} MT referente a {produto}. O seu pagamento foi confirmado com sucesso.',
  test_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_settings TO authenticated;
GRANT ALL ON public.sms_settings TO service_role;

ALTER TABLE public.sms_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own sms settings"
ON public.sms_settings FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_sms_settings_updated_at
BEFORE UPDATE ON public.sms_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();