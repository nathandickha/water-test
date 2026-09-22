begin;

-- The function returns a field named project_id, so target the invitation
-- uniqueness constraint by name instead of using ambiguous column names.
create or replace function public.submit_enquiry(p_project_id uuid, p_builder_ids uuid[])
returns table (project_id uuid, portal_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_token uuid;
  v_builder_ids uuid[];
  v_builder_id uuid;
  v_activity_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  select array_agg(distinct item) into v_builder_ids from unnest(p_builder_ids) item;
  if coalesce(cardinality(v_builder_ids), 0) not between 1 and 3 then
    raise exception 'Choose between one and three builders.';
  end if;
  perform 1 from public.projects p
  where p.id = p_project_id and p.client_id = v_user_id and p.status = 'draft'
    and p.current_design_version_id is not null
  for update;
  if not found then raise exception 'This draft is unavailable or has already been submitted.'; end if;
  if (select count(*) from public.builders b where b.id = any(v_builder_ids) and b.active and b.verified) <> cardinality(v_builder_ids) then
    raise exception 'One or more selected builders are unavailable.';
  end if;
  foreach v_builder_id in array v_builder_ids loop
    insert into public.project_builder_invitations (project_id, builder_id)
    values (p_project_id, v_builder_id)
    on conflict on constraint project_builder_invitations_project_id_builder_id_key
    do update set status = 'invited', invited_at = now(), responded_at = null, updated_at = now();
  end loop;
  update public.projects p set status = 'enquiry_submitted', submitted_at = now(), updated_at = now()
  where p.id = p_project_id returning p.portal_token into v_token;
  insert into public.project_activity (project_id, actor_id, audience, event_type, title, detail)
  values (p_project_id, v_user_id, 'all', 'enquiry_submitted', 'Enquiry submitted', 'The design brief was securely shared with the selected builders.')
  returning id into v_activity_id;
  return query select p_project_id, v_token;
end;
$$;

revoke all on function public.submit_enquiry(uuid, uuid[]) from public;
grant execute on function public.submit_enquiry(uuid, uuid[]) to authenticated;

commit;

