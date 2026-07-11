CREATE OR REPLACE FUNCTION public.is_product_publicly_visible(_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.products
    WHERE id = _product_id AND COALESCE(status, 'active') = 'active'
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.is_product_publicly_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_product_publicly_visible(uuid) TO anon, authenticated, service_role;