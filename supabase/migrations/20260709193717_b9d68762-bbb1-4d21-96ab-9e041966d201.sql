REVOKE EXECUTE ON FUNCTION public.handle_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_setup() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics(timestamp with time zone, timestamp with time zone) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_sale_notification() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_product_publicly_visible(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;