DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-webhook-queue') THEN
    PERFORM cron.unschedule('process-webhook-queue');
  END IF;

  PERFORM cron.schedule(
    'process-webhook-queue',
    '* * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://nexapay.lovable.app/api/public/hooks/process-webhook-queue',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
    $cron$
  );
END $$;