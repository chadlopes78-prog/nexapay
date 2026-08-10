ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS gateway_raw_status text,
  ADD COLUMN IF NOT EXISTS gateway_error_code text,
  ADD COLUMN IF NOT EXISTS gateway_message text,
  ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;