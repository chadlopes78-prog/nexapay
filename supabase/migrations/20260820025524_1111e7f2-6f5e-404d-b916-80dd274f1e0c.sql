-- Migração para adicionar suporte ao mercado da África do Sul (ZA)

-- 1. Adicionar colunas 'country' e 'currency' na tabela 'sales'
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'country') THEN
        ALTER TABLE public.sales ADD COLUMN country TEXT DEFAULT 'MZ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'currency') THEN
        ALTER TABLE public.sales ADD COLUMN currency TEXT DEFAULT 'MZN';
    END IF;
END $$;

-- 2. Adicionar coluna 'wallet_za' na tabela 'user_payment_credentials'
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_payment_credentials' AND column_name = 'wallet_za') THEN
        ALTER TABLE public.user_payment_credentials ADD COLUMN wallet_za TEXT;
    END IF;
END $$;

-- 3. Adicionar coluna 'country' na tabela 'products'
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'country') THEN
        ALTER TABLE public.products ADD COLUMN country TEXT DEFAULT 'MZ';
    END IF;
END $$;

-- 4. Garantir privilégios
GRANT ALL ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
GRANT ALL ON public.user_payment_credentials TO authenticated;
GRANT ALL ON public.user_payment_credentials TO service_role;
GRANT ALL ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

-- 5. Comentários para documentação
COMMENT ON COLUMN public.sales.country IS 'País da venda (MZ ou ZA)';
COMMENT ON COLUMN public.sales.currency IS 'Moeda da venda (MZN ou ZAR)';
COMMENT ON COLUMN public.user_payment_credentials.wallet_za IS 'ID da wallet ZAR na Débito Pay';
COMMENT ON COLUMN public.products.country IS 'Mercado destino do produto (MZ ou ZA)';
