CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

DROP POLICY IF EXISTS "super admin reads audit" ON public.admin_audit_logs;
CREATE POLICY "super admin reads audit"
ON public.admin_audit_logs
FOR SELECT
TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "super admin writes audit" ON public.admin_audit_logs;
CREATE POLICY "super admin writes audit"
ON public.admin_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'super_admin') AND actor_id = auth.uid());

DROP POLICY IF EXISTS "super admin reads all profiles" ON public.profiles;
CREATE POLICY "super admin reads all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "super admin updates all profiles" ON public.profiles;
CREATE POLICY "super admin updates all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'))
WITH CHECK (private.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "super admin manages roles" ON public.user_roles;
CREATE POLICY "super admin manages roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'))
WITH CHECK (private.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'super_admin'));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;