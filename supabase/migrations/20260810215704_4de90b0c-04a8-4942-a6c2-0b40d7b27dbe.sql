ALTER TABLE public.sms_settings
  ADD COLUMN IF NOT EXISTS sms_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS messages jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.sms_settings
  DROP CONSTRAINT IF EXISTS sms_settings_sms_count_check;
ALTER TABLE public.sms_settings
  ADD CONSTRAINT sms_settings_sms_count_check CHECK (sms_count >= 1 AND sms_count <= 5);

CREATE TABLE IF NOT EXISTS public.sms_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  transaction_id text,
  customer_phone text NOT NULL,
  sms_sequence integer NOT NULL CHECK (sms_sequence >= 1 AND sms_sequence <= 5),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','sending','sent','failed')),
  message_id text,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_outbox_sale_sequence_key UNIQUE (sale_id, sms_sequence)
);

GRANT SELECT ON public.sms_outbox TO authenticated;
GRANT ALL ON public.sms_outbox TO service_role;

ALTER TABLE public.sms_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own sms outbox" ON public.sms_outbox;
CREATE POLICY "Users can view their own sms outbox"
ON public.sms_outbox FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS sms_outbox_due_idx ON public.sms_outbox (status, scheduled_for);
CREATE INDEX IF NOT EXISTS sms_outbox_user_idx ON public.sms_outbox (user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_sms_outbox_updated_at ON public.sms_outbox;
CREATE TRIGGER trg_sms_outbox_updated_at
BEFORE UPDATE ON public.sms_outbox
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();