
ALTER TABLE public.checkouts
  ADD COLUMN IF NOT EXISTS timer_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS timer_minutes INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS timer_color TEXT NOT NULL DEFAULT '#ef4444',
  ADD COLUMN IF NOT EXISTS timer_message TEXT DEFAULT 'Oferta expira em',
  ADD COLUMN IF NOT EXISTS social_proof_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS social_proof_count INTEGER NOT NULL DEFAULT 127,
  ADD COLUMN IF NOT EXISTS social_proof_message TEXT DEFAULT 'pessoas já compraram este produto',
  ADD COLUMN IF NOT EXISTS order_bump_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS order_bump_title TEXT,
  ADD COLUMN IF NOT EXISTS order_bump_description TEXT,
  ADD COLUMN IF NOT EXISTS order_bump_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS order_bump_image_url TEXT,
  ADD COLUMN IF NOT EXISTS upsell_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS upsell_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS upsell_title TEXT,
  ADD COLUMN IF NOT EXISTS upsell_description TEXT,
  ADD COLUMN IF NOT EXISTS upsell_discount_percent INTEGER;
