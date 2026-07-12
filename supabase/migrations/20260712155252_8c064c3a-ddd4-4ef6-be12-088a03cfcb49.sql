CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('sweep-pushcut-notifications');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'sweep-pushcut-notifications',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--4fb7a44a-76ae-40f5-b7af-384c8a31cb3b.lovable.app/api/public/hooks/sweep-pushcut',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZ3J1cWl4cWZyeGZja2pscGhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NDQxMjYsImV4cCI6MjA5NjEyMDEyNn0.6nZwl3ZfSoLf86LraGHrGLmdj7Qq3t9qC06IwckZyGE"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);