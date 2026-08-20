ALTER TABLE public.products ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'MZ';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'MZN';
ALTER TABLE public.user_payment_credentials ADD COLUMN IF NOT EXISTS wallet_za TEXT;
