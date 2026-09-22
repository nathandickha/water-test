begin;

create or replace function public.get_active_project()
returns table (project_id uuid, portal_token uuid, status public.project_status)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.portal_token, p.status
  from public.projects p
  where p.client_id = auth.uid()
    and p.status not in ('closed', 'cancelled')
  order by p.created_at desc
  limit 1;
$$;
revoke all on function public.get_active_project() from public;
grant execute on function public.get_active_project() to authenticated;

create or replace function public.find_matching_builders(
  p_postcode text,
  p_suburb text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_limit integer default 12
)
returns table (
  builder_id uuid,
  builder_name text,
  suburb text,
  state text,
  description text,
  logo_url text,
  distance_km numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select
      b.id,
      b.name,
      b.suburb,
      b.state,
      b.description,
      b.logo_url,
      case
        when p_latitude is not null and p_longitude is not null and b.latitude is not null and b.longitude is not null
        then round((
          6371 * acos(least(1, greatest(-1,
            cos(radians(p_latitude)) * cos(radians(b.latitude)) *
            cos(radians(b.longitude) - radians(p_longitude)) +
            sin(radians(p_latitude)) * sin(radians(b.latitude))
          )))
        )::numeric, 1)
        else null
      end as calculated_distance,
      exists (
        select 1 from public.builder_service_areas a
        where a.builder_id = b.id
          and a.postcode = trim(p_postcode)
          and (p_suburb is null or trim(p_suburb) = '' or a.suburb is null or lower(a.suburb) = lower(trim(p_suburb)))
      ) as exact_service_area
    from public.builders b
    where b.active and b.verified
  )
  select c.id, c.name, c.suburb, c.state, c.description, c.logo_url, c.calculated_distance
  from candidates c
  join public.builders b on b.id = c.id
  where c.exact_service_area
     or (c.calculated_distance is not null and c.calculated_distance <= b.service_radius_km)
     or (not exists (select 1 from public.builder_service_areas a where a.builder_id = c.id) and b.postcode = trim(p_postcode))
  order by c.exact_service_area desc, c.calculated_distance nulls last, c.name
  limit least(greatest(coalesce(p_limit, 12), 1), 30);
$$;
revoke all on function public.find_matching_builders(text, text, numeric, numeric, integer) from public;
grant execute on function public.find_matching_builders(text, text, numeric, numeric, integer) to authenticated;

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

create or replace function private.enqueue_activity_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.audience in ('client', 'all') then
    insert into public.notifications (user_id, project_id, activity_id)
    select p.client_id, new.project_id, new.id
    from public.projects p
    where p.id = new.project_id and p.client_id is distinct from new.actor_id;
  end if;
  if new.audience in ('builder', 'all') then
    insert into public.notifications (user_id, project_id, activity_id)
    select distinct bu.user_id, new.project_id, new.id
    from public.project_builder_invitations i
    join public.builder_users bu on bu.builder_id = i.builder_id
    where i.project_id = new.project_id
      and i.status in ('invited', 'accepted')
      and (new.builder_id is null or i.builder_id = new.builder_id)
      and bu.user_id is distinct from new.actor_id;
  end if;
  return new;
end;
$$;
revoke all on function private.enqueue_activity_notifications() from public;
create trigger enqueue_activity_notifications
after insert on public.project_activity
for each row execute function private.enqueue_activity_notifications();

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

create or replace function private.log_message_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_title text;
begin
  select p.client_id into v_client_id from public.projects p where p.id = new.project_id;
  v_title := case when new.sender_id = v_client_id then 'New client message' else 'New builder message' end;
  insert into public.project_activity (project_id, actor_id, builder_id, audience, event_type, title, detail, metadata)
  values (new.project_id, new.sender_id, new.builder_id, 'all', 'message_sent', v_title, left(new.body, 180), jsonb_build_object('message_id', new.id));
  return new;
end;
$$;
revoke all on function private.log_message_activity() from public;
create trigger log_message_activity after insert on public.messages
for each row execute function private.log_message_activity();

create or replace function public.respond_to_invitation(p_invitation_id uuid, p_response text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.project_builder_invitations%rowtype;
  v_status public.invitation_status;
  v_builder_name text;
begin
  if p_response not in ('accepted', 'declined') then raise exception 'Invitation response must be accepted or declined.'; end if;
  v_status := p_response::public.invitation_status;
  select i.* into v_invitation from public.project_builder_invitations i
  where i.id = p_invitation_id and private.is_builder_member(i.builder_id) and i.status = 'invited'
  for update;
  if not found then raise exception 'This invitation is unavailable.'; end if;
  update public.project_builder_invitations
  set status = v_status, responded_at = now(), updated_at = now()
  where id = p_invitation_id;
  if v_status = 'accepted' then
    update public.projects set status = 'builder_review', updated_at = now()
    where id = v_invitation.project_id and status = 'enquiry_submitted';
  end if;
  select b.name into v_builder_name from public.builders b where b.id = v_invitation.builder_id;
  insert into public.project_activity (project_id, actor_id, builder_id, audience, event_type, title, detail)
  values (
    v_invitation.project_id,
    auth.uid(),
    v_invitation.builder_id,
    'client',
    'invitation_' || p_response,
    'Builder ' || p_response || ' invitation',
    v_builder_name || ' has ' || p_response || ' the project invitation.'
  );
end;
$$;
revoke all on function public.respond_to_invitation(uuid, text) from public;
grant execute on function public.respond_to_invitation(uuid, text) to authenticated;

create or replace function public.submit_quote(
  p_project_id uuid,
  p_design_version_id uuid,
  p_valid_until date,
  p_tax_rate numeric,
  p_notes text,
  p_line_items jsonb
)
returns table (quote_id uuid, quote_version_id uuid, version_number integer, total numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_builder_id uuid;
  v_invitation_id uuid;
  v_quote_id uuid;
  v_quote_version_id uuid;
  v_version integer;
  v_subtotal numeric(14,2);
  v_tax numeric(14,2);
  v_total numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  select i.builder_id, i.id into v_builder_id, v_invitation_id
  from public.project_builder_invitations i
  join public.builder_users bu on bu.builder_id = i.builder_id and bu.user_id = auth.uid()
  where i.project_id = p_project_id and i.status = 'accepted'
  limit 1;
  if v_builder_id is null then raise exception 'Accept the project invitation before quoting.'; end if;
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.current_design_version_id = p_design_version_id
      and p.status not in ('closed', 'cancelled', 'quote_accepted')
  ) then raise exception 'The design changed or this project is no longer open for quotations.'; end if;
  if p_valid_until < current_date then raise exception 'Quotation validity must end in the future.'; end if;
  if p_tax_rate not between 0 and 100 then raise exception 'Tax rate must be between 0 and 100.'; end if;
  if jsonb_typeof(p_line_items) <> 'array' or jsonb_array_length(p_line_items) < 1 then
    raise exception 'Add at least one quotation line.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_line_items) item
    where coalesce(trim(item ->> 'description'), '') = ''
      or coalesce((item ->> 'quantity')::numeric, 0) <= 0
      or coalesce((item ->> 'unit_price')::numeric, -1) < 0
  ) then raise exception 'Every quotation line needs a description, positive quantity and valid price.'; end if;
  select round(coalesce(sum((item ->> 'quantity')::numeric * (item ->> 'unit_price')::numeric), 0), 2)
  into v_subtotal from jsonb_array_elements(p_line_items) item;
  v_tax := round(v_subtotal * p_tax_rate / 100, 2);
  v_total := v_subtotal + v_tax;

  select q.id into v_quote_id from public.quotes q
  where q.project_id = p_project_id and q.builder_id = v_builder_id for update;
  if v_quote_id is null then
    insert into public.quotes (project_id, builder_id, invitation_id)
    values (p_project_id, v_builder_id, v_invitation_id) returning id into v_quote_id;
  end if;
  select coalesce(max(qv.version_number), 0) + 1 into v_version
  from public.quote_versions qv where qv.quote_id = v_quote_id;
  insert into public.quote_versions (
    quote_id, version_number, design_version_id, created_by, subtotal, tax_rate, tax_amount, total, valid_until, notes
  ) values (
    v_quote_id, v_version, p_design_version_id, auth.uid(), v_subtotal, p_tax_rate, v_tax, v_total, p_valid_until, nullif(trim(p_notes), '')
  ) returning id into v_quote_version_id;
  insert into public.quote_line_items (quote_version_id, position, description, quantity, unit, unit_price)
  select
    v_quote_version_id,
    ordinal::integer,
    trim(item ->> 'description'),
    (item ->> 'quantity')::numeric,
    coalesce(nullif(trim(item ->> 'unit'), ''), 'item'),
    (item ->> 'unit_price')::numeric
  from jsonb_array_elements(p_line_items) with ordinality as source(item, ordinal);
  update public.quotes set status = 'submitted', current_version_id = v_quote_version_id, updated_at = now()
  where id = v_quote_id;
  update public.projects set status = 'quotes_received', updated_at = now()
  where id = p_project_id and status in ('enquiry_submitted', 'builder_review', 'quotes_received');
  insert into public.project_activity (project_id, actor_id, builder_id, audience, event_type, title, detail, metadata)
  values (
    p_project_id, auth.uid(), v_builder_id, 'client', 'quote_submitted', 'Quotation submitted',
    'A builder submitted quotation version ' || v_version || '.',
    jsonb_build_object('quote_id', v_quote_id, 'quote_version_id', v_quote_version_id, 'total', v_total)
  );
  return query select v_quote_id, v_quote_version_id, v_version, v_total;
end;
$$;
revoke all on function public.submit_quote(uuid, uuid, date, numeric, text, jsonb) from public;
grant execute on function public.submit_quote(uuid, uuid, date, numeric, text, jsonb) to authenticated;

create or replace function public.accept_quote(p_quote_version_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote_id uuid;
  v_project_id uuid;
  v_builder_id uuid;
  v_design_id uuid;
  v_total numeric;
begin
  select q.id, q.project_id, q.builder_id, qv.design_version_id, qv.total
  into v_quote_id, v_project_id, v_builder_id, v_design_id, v_total
  from public.quote_versions qv
  join public.quotes q on q.id = qv.quote_id
  join public.projects p on p.id = q.project_id
  where qv.id = p_quote_version_id
    and q.current_version_id = qv.id
    and q.status = 'submitted'
    and p.client_id = auth.uid()
    and p.current_design_version_id = qv.design_version_id
  for update of q, p;
  if v_quote_id is null then raise exception 'This quotation is unavailable, outdated or already resolved.'; end if;
  update public.quotes set status = case when id = v_quote_id then 'accepted'::public.quote_status else 'declined'::public.quote_status end, updated_at = now()
  where project_id = v_project_id and status = 'submitted';
  update public.projects set accepted_quote_id = v_quote_id, status = 'quote_accepted', updated_at = now()
  where id = v_project_id;
  insert into public.project_activity (project_id, actor_id, builder_id, audience, event_type, title, detail, metadata)
  values (
    v_project_id, auth.uid(), v_builder_id, 'all', 'quote_accepted', 'Quotation accepted',
    'The homeowner accepted the quotation.',
    jsonb_build_object('quote_id', v_quote_id, 'quote_version_id', p_quote_version_id, 'total', v_total)
  );
end;
$$;
revoke all on function public.accept_quote(uuid) from public;
grant execute on function public.accept_quote(uuid) to authenticated;

create or replace function public.create_design_version(
  p_project_id uuid,
  p_configuration jsonb,
  p_specification jsonb,
  p_equipment jsonb default '[]'::jsonb,
  p_change_summary text default 'Design updated'
)
returns table (design_version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
  v_design_id uuid;
  v_item jsonb;
begin
  perform 1 from public.projects p
  where p.id = p_project_id and p.client_id = auth.uid() and p.status not in ('closed', 'cancelled', 'quote_accepted')
  for update;
  if not found then raise exception 'This project cannot be updated.'; end if;
  select coalesce(max(d.version_number), 0) + 1 into v_version from public.design_versions d where d.project_id = p_project_id;
  insert into public.design_versions (project_id, version_number, created_by, change_summary)
  values (p_project_id, v_version, auth.uid(), nullif(trim(p_change_summary), '')) returning id into v_design_id;
  insert into public.designer_configurations (design_version_id, configuration) values (v_design_id, p_configuration);
  insert into public.project_specifications (design_version_id, specification) values (v_design_id, p_specification);
  for v_item in select value from jsonb_array_elements(coalesce(p_equipment, '[]'::jsonb))
  loop
    insert into public.equipment_selections (project_id, design_version_id, equipment_code, name, description, source, selected, details)
    values (
      p_project_id, v_design_id, trim(v_item ->> 'code'), trim(v_item ->> 'name'),
      nullif(trim(v_item ->> 'description'), ''), coalesce(v_item ->> 'source', 'optional')::public.equipment_source,
      coalesce((v_item ->> 'selected')::boolean, true), coalesce(v_item -> 'details', '{}'::jsonb)
    );
  end loop;
  update public.projects set current_design_version_id = v_design_id, status = 'builder_review', updated_at = now() where id = p_project_id;
  insert into public.project_activity (project_id, actor_id, audience, event_type, title, detail, metadata)
  values (p_project_id, auth.uid(), 'all', 'design_version_created', 'Design updated', 'A new design version is ready for review.', jsonb_build_object('design_version_id', v_design_id, 'version_number', v_version));
  return query select v_design_id, v_version;
end;
$$;
revoke all on function public.create_design_version(uuid, jsonb, jsonb, jsonb, text) from public;
grant execute on function public.create_design_version(uuid, jsonb, jsonb, jsonb, text) to authenticated;

commit;

