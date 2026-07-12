CREATE OR REPLACE FUNCTION public.sweep_pushcut_paid_sales()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
  v_method text;
  v_brl_value text;
  v_body_text text;
  v_order_id text;
  v_log_id uuid;
  v_request_id bigint;
BEGIN
  DELETE FROM public.pushcut_logs
  WHERE status = 'processing'
    AND order_id LIKE 'pushcut:sale_approved:%'
    AND created_at < now() - interval '30 seconds';

  FOR r IN
    SELECT
      s.id,
      s.user_id,
      s.product_id,
      s.customer_name,
      s.amount,
      s.payment_method,
      p.name AS product_name,
      pi.url,
      pi.events
    FROM public.sales s
    JOIN public.pushcut_integrations pi ON pi.user_id = s.user_id AND pi.active = true
    LEFT JOIN public.products p ON p.id = s.product_id
    LEFT JOIN public.pushcut_logs l ON l.order_id = 'pushcut:sale_approved:' || s.id::text
    WHERE lower(coalesce(s.status, '')) IN ('paid', 'approved', 'success', 'completed')
      AND s.created_at >= now() - interval '6 hours'
      AND (l.id IS NULL OR l.status = 'failed')
      AND btrim(pi.url) <> ''
      AND NOT (
        jsonb_typeof(pi.events -> 'sale_approved') = 'boolean'
        AND (pi.events ->> 'sale_approved')::boolean = false
      )
    ORDER BY s.created_at DESC
    LIMIT 50
  LOOP
    v_order_id := 'pushcut:sale_approved:' || r.id::text;

    INSERT INTO public.pushcut_logs (order_id, user_id, status, sent_at, metadata)
    VALUES (
      v_order_id,
      r.user_id,
      'processing',
      NULL,
      jsonb_build_object(
        'source', 'db_pushcut_sweep',
        'event', 'sale_approved',
        'sale_id', r.id,
        'locked_at', now()
      )
    )
    ON CONFLICT (order_id) DO NOTHING
    RETURNING id INTO v_log_id;

    IF v_log_id IS NULL THEN
      CONTINUE;
    END IF;

    v_method := CASE
      WHEN lower(coalesce(r.payment_method, '')) LIKE '%emola%' THEN 'EMOLA'
      WHEN lower(coalesce(r.payment_method, '')) LIKE '%mpesa%' OR lower(coalesce(r.payment_method, '')) LIKE '%m-pesa%' THEN 'MPESA'
      ELSE upper(coalesce(r.payment_method, 'PAGAMENTO'))
    END;

    v_brl_value := replace(to_char(round((coalesce(r.amount, 0)::numeric * 0.085), 2), 'FM999999999990.00'), '.', ',');
    v_body_text := v_brl_value || ' R$ via ' || v_method;

    BEGIN
      SELECT net.http_post(
        url := btrim(r.url),
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object(
          'title', 'Venda Aprovada ✅',
          'text', v_body_text,
          'input', jsonb_build_object(
            'brl_value', v_brl_value,
            'payment_method', v_method,
            'product_name', r.product_name,
            'customer_name', r.customer_name,
            'sale_id', r.id
          )
        )
      ) INTO v_request_id;

      UPDATE public.pushcut_logs
      SET status = 'sent',
          sent_at = now(),
          metadata = jsonb_build_object(
            'source', 'db_pushcut_sweep',
            'event', 'sale_approved',
            'sale_id', r.id,
            'request_id', v_request_id,
            'data', jsonb_build_object(
              'brl_value', v_brl_value,
              'payment_method', v_method,
              'product_name', r.product_name,
              'customer_name', r.customer_name
            )
          )
      WHERE id = v_log_id;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pushcut_logs
      SET status = 'failed',
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('error', SQLERRM, 'source', 'db_pushcut_sweep')
      WHERE id = v_log_id;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_pushcut_paid_sales() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_pushcut_paid_sales() FROM anon;
REVOKE ALL ON FUNCTION public.sweep_pushcut_paid_sales() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_pushcut_paid_sales() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep-pushcut-notifications') THEN
    PERFORM cron.unschedule('sweep-pushcut-notifications');
  END IF;
END $$;

SELECT cron.schedule(
  'sweep-pushcut-notifications',
  '* * * * *',
  $$SELECT public.sweep_pushcut_paid_sales();$$
);