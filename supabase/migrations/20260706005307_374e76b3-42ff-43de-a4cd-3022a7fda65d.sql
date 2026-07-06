
CREATE TABLE public.user_payment_credentials (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  e2p_client_id TEXT,
  e2p_client_secret TEXT,
  wallet_mpesa TEXT,
  wallet_emola TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_payment_credentials TO authenticated;
GRANT ALL ON public.user_payment_credentials TO service_role;
ALTER TABLE public.user_payment_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own payment credentials"
  ON public.user_payment_credentials FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_user_payment_credentials_updated_at
  BEFORE UPDATE ON public.user_payment_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
