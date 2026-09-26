-- Organization membership is set by the signup trigger. A signed-in user must
-- not be able to change profiles.org_id, because auth_org_id() trusts it for RLS.
-- This migration also protects existing deployments that already ran 0001.
drop policy if exists "users can update their own profile" on public.profiles;

revoke update on table public.profiles from public, anon, authenticated;
