DROP TRIGGER IF EXISTS trg_notify_pushcut_on_paid_sale ON public.sales;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep-pushcut-notifications') THEN
    PERFORM cron.unschedule('sweep-pushcut-notifications');
  END IF;
END $$;