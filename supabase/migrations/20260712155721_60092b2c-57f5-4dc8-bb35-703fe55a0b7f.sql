REVOKE ALL ON FUNCTION public.notify_pushcut_on_paid_sale() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_pushcut_on_paid_sale() FROM anon;
REVOKE ALL ON FUNCTION public.notify_pushcut_on_paid_sale() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.notify_pushcut_on_paid_sale() TO service_role;