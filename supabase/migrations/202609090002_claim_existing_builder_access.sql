begin;

-- Builder contact emails can belong to Auth users that already existed before
-- the builder directory was imported (for example, a user who also tested the
-- client portal). Link those verified users when they open the builder portal.
create or replace function public.claim_builder_access()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_confirmed_at timestamptz;
  v_builder_id uuid;
  v_builder_name text;
begin
  if v_user_id is null then
    raise exception 'Sign in before opening the builder dashboard.';
  end if;

  select lower(trim(u.email)), u.email_confirmed_at
  into v_email, v_confirmed_at
  from auth.users u
  where u.id = v_user_id;

  if v_email is null or v_confirmed_at is null then
    raise exception 'Verify your builder email before opening the dashboard.';
  end if;

  select b.id, b.name
  into v_builder_id, v_builder_name
  from public.builders b
  where b.active
    and nullif(trim(b.email), '') is not null
    and lower(trim(b.email)) = v_email
  order by b.verified desc, b.created_at
  limit 1;

  if v_builder_id is null then
    return null;
  end if;

  insert into public.builder_users (builder_id, user_id, is_admin)
  values (v_builder_id, v_user_id, true)
  on conflict (builder_id, user_id) do nothing;

  update public.profiles
  set role = case when role = 'administrator' then role else 'builder'::public.app_role end,
      updated_at = now()
  where id = v_user_id;

  return jsonb_build_object('builder_id', v_builder_id, 'builder_name', v_builder_name);
end;
$$;

revoke all on function public.claim_builder_access() from public, anon;
grant execute on function public.claim_builder_access() to authenticated;

commit;
