
CREATE TABLE public.pushcut_integrations (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  events JSONB NOT NULL DEFAULT '{"sale_approved":true,"sale_refused":true,"payment_pending":true,"payment_processing":true,"refund":true,"checkout_abandoned":true,"daily_summary":true}'::jsonb,
  daily_summary_time TEXT NOT NULL DEFAULT '20:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pushcut_integrations TO authenticated;
GRANT ALL ON public.pushcut_integrations TO service_role;

ALTER TABLE public.pushcut_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pushcut integration"
  ON public.pushcut_integrations FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_pushcut_integrations_updated_at
  BEFORE UPDATE ON public.pushcut_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
