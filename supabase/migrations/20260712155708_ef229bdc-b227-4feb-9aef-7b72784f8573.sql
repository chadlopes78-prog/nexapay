CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_pushcut_on_paid_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid_statuses text[] := ARRAY['paid', 'approved', 'success', 'completed'];
  v_url text;
  v_product_name text;
  v_method text;
  v_brl_value text;
  v_body_text text;
  v_order_id text;
  v_log_id uuid;
  v_request_id bigint;
  v_events jsonb;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF lower(coalesce(NEW.status, '')) <> ALL (v_paid_statuses) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND lower(coalesce(OLD.status, '')) = ANY (v_paid_statuses) THEN
    RETURN NEW;
  END IF;

  SELECT pi.url, pi.events
    INTO v_url, v_events
  FROM public.pushcut_integrations pi
  WHERE pi.user_id = NEW.user_id
    AND pi.active = true
  LIMIT 1;

  IF v_url IS NULL OR btrim(v_url) = '' THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(v_events -> 'sale_approved') = 'boolean'
     AND (v_events ->> 'sale_approved')::boolean = false THEN
    RETURN NEW;
  END IF;

  v_order_id := 'pushcut:sale_approved:' || NEW.id::text;

  INSERT INTO public.pushcut_logs (order_id, user_id, status, sent_at, metadata)
  VALUES (
    v_order_id,
    NEW.user_id,
    'processing',
    NULL,
    jsonb_build_object(
      'source', 'db_paid_sale_trigger',
      'event', 'sale_approved',
      'sale_id', NEW.id,
      'locked_at', now()
    )
  )
  ON CONFLICT (order_id) DO NOTHING
  RETURNING id INTO v_log_id;

  IF v_log_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.name INTO v_product_name
  FROM public.products p
  WHERE p.id = NEW.product_id;

  v_method := CASE
    WHEN lower(coalesce(NEW.payment_method, '')) LIKE '%emola%' THEN 'EMOLA'
    WHEN lower(coalesce(NEW.payment_method, '')) LIKE '%mpesa%' OR lower(coalesce(NEW.payment_method, '')) LIKE '%m-pesa%' THEN 'MPESA'
    ELSE upper(coalesce(NEW.payment_method, 'PAGAMENTO'))
  END;

  v_brl_value := replace(to_char(round((coalesce(NEW.amount, 0)::numeric * 0.085), 2), 'FM999999999990.00'), '.', ',');
  v_body_text := v_brl_value || ' R$ via ' || v_method;

  SELECT net.http_post(
    url := btrim(v_url),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'title', 'Venda Aprovada ✅',
      'text', v_body_text,
      'input', jsonb_build_object(
        'brl_value', v_brl_value,
        'payment_method', v_method,
        'product_name', v_product_name,
        'customer_name', NEW.customer_name,
        'sale_id', NEW.id
      )
    )
  ) INTO v_request_id;

  UPDATE public.pushcut_logs
  SET status = 'sent',
      sent_at = now(),
      metadata = jsonb_build_object(
        'source', 'db_paid_sale_trigger',
        'event', 'sale_approved',
        'sale_id', NEW.id,
        'request_id', v_request_id,
        'data', jsonb_build_object(
          'brl_value', v_brl_value,
          'payment_method', v_method,
          'product_name', v_product_name,
          'customer_name', NEW.customer_name
        )
      )
  WHERE id = v_log_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  IF v_log_id IS NOT NULL THEN
    UPDATE public.pushcut_logs
    SET status = 'failed',
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('error', SQLERRM, 'source', 'db_paid_sale_trigger')
    WHERE id = v_log_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_pushcut_on_paid_sale ON public.sales;
CREATE TRIGGER trg_notify_pushcut_on_paid_sale
AFTER INSERT OR UPDATE OF status ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.notify_pushcut_on_paid_sale();