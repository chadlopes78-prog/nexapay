CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('sweep-sms') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep-sms');

SELECT cron.schedule(
  'sweep-sms',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nexapay.lovable.app/api/public/hooks/sweep-sms',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZ3J1cWl4cWZyeGZja2pscGhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NDQxMjYsImV4cCI6MjA5NjEyMDEyNn0.6nZwl3ZfSoLf86LraGHrGLmdj7Qq3t9qC06IwckZyGE"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);