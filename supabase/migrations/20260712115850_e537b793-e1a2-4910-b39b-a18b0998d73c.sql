
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep-pending-sales') THEN
    PERFORM cron.unschedule('sweep-pending-sales');
  END IF;

  PERFORM cron.schedule(
    'sweep-pending-sales',
    '* * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://nexapay.lovable.app/api/public/hooks/sweep-pending-sales',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"source":"pg_cron"}'::jsonb
    );
    $cron$
  );
END $$;
