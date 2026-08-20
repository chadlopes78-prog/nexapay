ALTER TABLE public.user_payment_credentials ADD COLUMN IF NOT EXISTS debitopay_za_webhook_secret TEXT;
GRANT SELECT, UPDATE ON public.user_payment_credentials TO authenticated;
GRANT ALL ON public.user_payment_credentials TO service_role;