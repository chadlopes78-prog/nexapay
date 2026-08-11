DROP FUNCTION IF EXISTS public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ);

CREATE FUNCTION public.get_dashboard_metrics(
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_stats JSONB;
    v_chart JSONB;
    v_recent_sales JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Aggregate stats
    SELECT row_to_json(s)::jsonb INTO v_stats
    FROM (
        SELECT
            COUNT(*)::int as total_transactions,
            COUNT(*) FILTER (WHERE status IN ('approved', 'paid', 'success'))::int as success_count,
            COUNT(*) FILTER (WHERE status IN ('failed', 'error', 'cancelled', 'canceled'))::int as failed_count,
            COALESCE(SUM(amount), 0)::numeric as total_value,
            COALESCE(SUM(amount) FILTER (WHERE status IN ('approved', 'paid', 'success')), 0)::numeric as received_value,
            COALESCE(SUM(amount) FILTER (WHERE status IN ('failed', 'error', 'cancelled', 'canceled')), 0)::numeric as lost_value
        FROM sales
        WHERE user_id = v_user_id
          AND created_at >= p_start_date
          AND created_at <= p_end_date
    ) s;

    -- Daily chart data
    SELECT COALESCE(json_agg(json_build_object(
        'day', day,
        'sucesso', day_success,
        'falha', day_failed
    )), '[]'::json)::jsonb INTO v_chart
    FROM (
        SELECT
            date_trunc('day', created_at) as day,
            COUNT(*) FILTER (WHERE status IN ('approved', 'paid', 'success'))::int as day_success,
            COUNT(*) FILTER (WHERE status IN ('failed', 'error', 'cancelled', 'canceled'))::int as day_failed
        FROM sales
        WHERE user_id = v_user_id
          AND created_at >= p_start_date
          AND created_at <= p_end_date
        GROUP BY 1
        ORDER BY 1
    ) daily_stats;

    -- Recent sales
    SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json)::jsonb INTO v_recent_sales
    FROM (
        SELECT
            s.id,
            s.customer_name,
            s.amount,
            s.status,
            s.created_at,
            p.name as product_name,
            s.payment_method
        FROM sales s
        LEFT JOIN products p ON s.product_id = p.id
        WHERE s.user_id = v_user_id
          AND s.created_at >= p_start_date
          AND s.created_at <= p_end_date
        ORDER BY s.created_at DESC
        LIMIT 10
    ) r;

    RETURN json_build_object(
        'stats', COALESCE(v_stats, '{"total_transactions": 0, "success_count": 0, "failed_count": 0, "total_value": 0, "received_value": 0, "lost_value": 0}'::jsonb),
        'chartData', v_chart,
        'recentSales', v_recent_sales
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;

NOTIFY pgrst, 'reload schema';