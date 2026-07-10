ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS failure_code TEXT;

CREATE INDEX IF NOT EXISTS sales_failure_code_idx
  ON public.sales (failure_code)
  WHERE failure_code IS NOT NULL;