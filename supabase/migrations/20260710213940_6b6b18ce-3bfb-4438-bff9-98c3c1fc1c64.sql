DROP POLICY IF EXISTS "Public can create valid sales" ON public.sales;

CREATE POLICY "Public can create valid sales"
ON public.sales
FOR INSERT
WITH CHECK (
  product_id IS NOT NULL
  AND user_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = sales.product_id
      AND p.user_id = sales.user_id
      AND COALESCE(p.status, 'active') = 'active'
  )
  AND customer_name IS NOT NULL
  AND length(trim(customer_name)) BETWEEN 1 AND 100
  AND customer_phone IS NOT NULL
  AND customer_phone ~ '^\+?[0-9 ()-]{9,20}$'
  AND amount > 0
  AND amount <= 500000
  AND payment_method = ANY (ARRAY['mpesa','emola','m-pesa','e-mola'])
  AND COALESCE(status, 'pending') = ANY (ARRAY['pending','paid','failed','completed','abandoned'])
);