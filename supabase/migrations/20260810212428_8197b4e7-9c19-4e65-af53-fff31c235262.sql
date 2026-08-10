CREATE TABLE public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sms_logs_user_created ON public.sms_logs (user_id, created_at DESC);

GRANT SELECT ON public.sms_logs TO authenticated;
GRANT ALL ON public.sms_logs TO service_role;

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sms logs"
ON public.sms_logs FOR SELECT TO authenticated
USING (auth.uid() = user_id);