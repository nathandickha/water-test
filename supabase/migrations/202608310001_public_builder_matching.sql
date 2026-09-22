begin;

-- Builder summaries are intentionally discoverable before a homeowner signs in.
-- The SECURITY DEFINER function exposes only active, verified builders and the
-- limited public fields in its declared return type; project/contact data remains
-- protected by the existing authenticated-only RPCs and RLS policies.
revoke all on function public.find_matching_builders(text, text, numeric, numeric, integer) from public;
grant execute on function public.find_matching_builders(text, text, numeric, numeric, integer) to anon, authenticated;

commit;

