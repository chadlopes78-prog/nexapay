GRANT SELECT ON public.checkouts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkouts TO authenticated;
GRANT ALL ON public.checkouts TO service_role;