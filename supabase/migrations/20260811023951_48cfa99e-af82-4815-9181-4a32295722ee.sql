ALTER FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) OWNER TO postgres;
ALTER FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) SECURITY INVOKER;

NOTIFY pgrst, 'reload schema';

COMMENT ON FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) IS 'Dashboard metrics with chart_json CTE - refreshed';