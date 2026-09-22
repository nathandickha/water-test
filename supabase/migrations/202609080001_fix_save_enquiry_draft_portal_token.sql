begin;

-- The function returns a column named portal_token. In PL/pgSQL that output
-- column is also a variable, so an unqualified `returning portal_token` is
-- ambiguous. Qualify the INSERT target and its RETURNING columns explicitly.
create or replace function public.save_enquiry_draft(
  p_project_id uuid,
  p_contact_details jsonb,
  p_site_details jsonb,
  p_configuration jsonb,
  p_specification jsonb,
  p_equipment jsonb default '[]'::jsonb,
  p_notes text default null
)
returns table (project_id uuid, portal_token uuid, design_version_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_auth_email text;
  v_confirmed_at timestamptz;
  v_project_id uuid;
  v_token uuid;
  v_design_id uuid;
  v_item jsonb;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  select u.email, u.email_confirmed_at into v_auth_email, v_confirmed_at
  from auth.users u where u.id = v_user_id;
  if v_confirmed_at is null then raise exception 'Verify your email before saving an enquiry.'; end if;
  if lower(trim(coalesce(p_contact_details ->> 'email', ''))) <> lower(v_auth_email) then
    raise exception 'The enquiry email must match your verified sign-in email.';
  end if;
  if coalesce(trim(p_contact_details ->> 'firstName'), '') = ''
     or coalesce(trim(p_contact_details ->> 'lastName'), '') = ''
     or coalesce(trim(p_contact_details ->> 'phone'), '') = ''
     or coalesce(trim(p_site_details ->> 'address'), '') = ''
     or coalesce(trim(p_site_details ->> 'suburb'), '') = ''
     or coalesce(trim(p_site_details ->> 'state'), '') = ''
     or coalesce(trim(p_site_details ->> 'postcode'), '') !~ '^[0-9]{4}$'
  then raise exception 'Complete the required contact and site details.'; end if;
  if jsonb_typeof(p_configuration) <> 'object' or jsonb_typeof(p_specification) <> 'object' then
    raise exception 'A valid 3D design configuration and specification are required.';
  end if;

  insert into public.profiles (id, role, full_name, phone, updated_at)
  values (
    v_user_id,
    'client',
    trim(p_contact_details ->> 'firstName') || ' ' || trim(p_contact_details ->> 'lastName'),
    trim(p_contact_details ->> 'phone'),
    now()
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    updated_at = now();

  insert into public.clients (user_id, email, first_name, last_name, phone, updated_at)
  values (
    v_user_id,
    lower(v_auth_email),
    trim(p_contact_details ->> 'firstName'),
    trim(p_contact_details ->> 'lastName'),
    trim(p_contact_details ->> 'phone'),
    now()
  )
  on conflict (user_id) do update set
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    phone = excluded.phone,
    updated_at = now();

  if p_project_id is null then
    select p.id into v_project_id
    from public.projects p
    where p.client_id = v_user_id and p.status = 'draft'
    order by p.created_at desc limit 1
    for update;
    if v_project_id is null and exists (
      select 1 from public.projects p
      where p.client_id = v_user_id and p.status not in ('closed', 'cancelled')
    ) then raise exception 'Only one active enquiry is allowed for each verified email.'; end if;
  else
    select p.id into v_project_id
    from public.projects p
    where p.id = p_project_id and p.client_id = v_user_id and p.status = 'draft'
    for update;
    if v_project_id is null then raise exception 'This draft is unavailable or has already been submitted.'; end if;
  end if;

  if v_project_id is null then
    insert into public.projects as inserted_project (client_id, contact_details, site_details, notes)
    values (v_user_id, p_contact_details, p_site_details, nullif(trim(p_notes), ''))
    returning inserted_project.id, inserted_project.portal_token into v_project_id, v_token;
  else
    update public.projects p set
      contact_details = p_contact_details,
      site_details = p_site_details,
      notes = nullif(trim(p_notes), ''),
      updated_at = now()
    where p.id = v_project_id
    returning p.portal_token into v_token;
  end if;

  select p.current_design_version_id into v_design_id from public.projects p where p.id = v_project_id;
  if v_design_id is null then
    insert into public.design_versions (project_id, version_number, created_by, change_summary)
    values (v_project_id, 1, v_user_id, 'Initial homeowner design')
    returning id into v_design_id;
    insert into public.designer_configurations (design_version_id, configuration) values (v_design_id, p_configuration);
    insert into public.project_specifications (design_version_id, specification) values (v_design_id, p_specification);
    update public.projects set current_design_version_id = v_design_id, updated_at = now() where id = v_project_id;
  else
    update public.design_versions set updated_at = now() where id = v_design_id;
    insert into public.designer_configurations (design_version_id, configuration)
      values (v_design_id, p_configuration)
      on conflict on constraint designer_configurations_pkey
      do update set configuration = excluded.configuration, updated_at = now();
    insert into public.project_specifications (design_version_id, specification)
      values (v_design_id, p_specification)
      on conflict on constraint project_specifications_pkey
      do update set specification = excluded.specification, updated_at = now();
  end if;

  delete from public.equipment_selections e where e.design_version_id = v_design_id;
  for v_item in select value from jsonb_array_elements(coalesce(p_equipment, '[]'::jsonb))
  loop
    insert into public.equipment_selections (
      project_id, design_version_id, equipment_code, name, description, source, selected, details
    ) values (
      v_project_id,
      v_design_id,
      trim(v_item ->> 'code'),
      trim(v_item ->> 'name'),
      nullif(trim(v_item ->> 'description'), ''),
      coalesce(v_item ->> 'source', 'optional')::public.equipment_source,
      coalesce((v_item ->> 'selected')::boolean, true),
      coalesce(v_item -> 'details', '{}'::jsonb)
    );
  end loop;

  return query select v_project_id, v_token, v_design_id;
end;
$$;

revoke all on function public.save_enquiry_draft(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text) from public;
grant execute on function public.save_enquiry_draft(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text) to authenticated;

commit;

