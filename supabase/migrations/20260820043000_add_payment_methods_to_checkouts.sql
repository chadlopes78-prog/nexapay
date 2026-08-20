ALTER TABLE public.checkouts ADD COLUMN IF NOT EXISTS payment_methods JSONB DEFAULT '["mpesa", "emola", "payfast"]'::jsonb;
COMMENT ON COLUMN public.checkouts.payment_methods IS 'List of enabled payment methods for this checkout (mpesa, emola, payfast)';
