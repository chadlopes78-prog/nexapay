
-- 1) Orders: validate merchant_id matches product owner
DROP POLICY IF EXISTS "Public can create valid orders" ON public.orders;
CREATE POLICY "Public can create valid orders" ON public.orders
FOR INSERT
WITH CHECK (
  product_id IS NOT NULL
  AND merchant_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = orders.product_id AND p.user_id = orders.merchant_id
  )
  AND length(trim(customer_name)) BETWEEN 1 AND 100
  AND length(trim(customer_email)) BETWEEN 3 AND 255
  AND customer_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  AND customer_phone ~ '^\+?[0-9 ()-]{9,20}$'
  AND amount > 0 AND amount <= 500000
  AND payment_method = ANY (ARRAY['mpesa','emola'])
  AND COALESCE(status, 'pending') = ANY (ARRAY['pending','completed','failed','abandoned'])
);

-- 2) Pixel configs: drop duplicate ALL policy
DROP POLICY IF EXISTS "Users can manage their own pixel config" ON public.pixel_configs;

-- 3) Products: revoke sensitive columns from anon
REVOKE SELECT (facebook_access_token, delivery_file_url, delivery_link, access_link)
  ON public.products FROM anon;
