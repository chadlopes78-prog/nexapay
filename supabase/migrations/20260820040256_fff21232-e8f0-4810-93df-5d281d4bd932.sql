ALTER TABLE public.user_payment_credentials ADD COLUMN IF NOT EXISTS debitopay_merchant_id UUID;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_payment_credentials TO authenticated;
GRANT ALL ON public.user_payment_credentials TO service_role;