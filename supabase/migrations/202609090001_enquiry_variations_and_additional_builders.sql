begin;

create or replace function public.create_design_version_with_builders(
  p_project_id uuid,
  p_configuration jsonb,
  p_specification jsonb,
  p_equipment jsonb default '[]'::jsonb,
  p_change_summary text default 'Homeowner enquiry variation',
  p_builder_ids uuid[] default '{}'::uuid[]
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
  v_builder_ids uuid[];
  v_builder_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;

  perform 1 from public.projects p
  where p.id = p_project_id
    and p.client_id = auth.uid()
    and p.status not in ('closed', 'cancelled', 'quote_accepted')
  for update;
  if not found then raise exception 'This project cannot be updated.'; end if;

  select array_agg(distinct item) into v_builder_ids
  from unnest(coalesce(p_builder_ids, '{}'::uuid[])) item;

  if coalesce(cardinality(v_builder_ids), 0) not between 1 and 3 then
    raise exception 'Choose between one and three builders in total.';
  end if;

  if exists (
    select 1
    from public.project_builder_invitations i
    where i.project_id = p_project_id
      and i.status in ('invited', 'accepted')
      and not (i.builder_id = any(v_builder_ids))
  ) then
    raise exception 'Existing invited builders must remain on an enquiry variation.';
  end if;

  if (
    select count(*)
    from unnest(v_builder_ids) selected(builder_id)
    where not exists (
      select 1 from public.project_builder_invitations i
      where i.project_id = p_project_id and i.builder_id = selected.builder_id
    )
      and exists (
        select 1 from public.builders b
        where b.id = selected.builder_id and b.active and b.verified
      )
  ) <> (
    select count(*)
    from unnest(v_builder_ids) selected(builder_id)
    where not exists (
      select 1 from public.project_builder_invitations i
      where i.project_id = p_project_id and i.builder_id = selected.builder_id
    )
  ) then
    raise exception 'One or more additional builders are unavailable.';
  end if;

  foreach v_builder_id in array v_builder_ids loop
    insert into public.project_builder_invitations (project_id, builder_id)
    values (p_project_id, v_builder_id)
    on conflict on constraint project_builder_invitations_project_id_builder_id_key
    do nothing;
  end loop;

  select coalesce(max(d.version_number), 0) + 1 into v_version
  from public.design_versions d where d.project_id = p_project_id;

  insert into public.design_versions (project_id, version_number, created_by, change_summary)
  values (p_project_id, v_version, auth.uid(), nullif(trim(p_change_summary), ''))
  returning id into v_design_id;

  insert into public.designer_configurations (design_version_id, configuration)
  values (v_design_id, p_configuration);
  insert into public.project_specifications (design_version_id, specification)
  values (v_design_id, p_specification);

  for v_item in select value from jsonb_array_elements(coalesce(p_equipment, '[]'::jsonb))
  loop
    insert into public.equipment_selections (
      project_id, design_version_id, equipment_code, name, description, source, selected, details
    ) values (
      p_project_id,
      v_design_id,
      trim(v_item ->> 'code'),
      trim(v_item ->> 'name'),
      nullif(trim(v_item ->> 'description'), ''),
      coalesce(v_item ->> 'source', 'optional')::public.equipment_source,
      coalesce((v_item ->> 'selected')::boolean, true),
      coalesce(v_item -> 'details', '{}'::jsonb)
    );
  end loop;

  update public.projects
  set current_design_version_id = v_design_id,
      status = 'builder_review',
      updated_at = now()
  where id = p_project_id;

  insert into public.project_activity (
    project_id, actor_id, audience, event_type, title, detail, metadata
  ) values (
    p_project_id,
    auth.uid(),
    'all',
    'design_version_created',
    'Enquiry variation submitted',
    'The homeowner updated the enquiry. Review the latest design and project details.',
    jsonb_build_object('design_version_id', v_design_id, 'version_number', v_version)
  );

  return query select v_design_id, v_version;
end;
$$;

revoke all on function public.create_design_version_with_builders(uuid, jsonb, jsonb, jsonb, text, uuid[])
  from public;
grant execute on function public.create_design_version_with_builders(uuid, jsonb, jsonb, jsonb, text, uuid[])
  to authenticated;

drop trigger if exists send_project_notification_webhook on public.project_activity;
create trigger send_project_notification_webhook
after insert on public.project_activity
for each row
when (new.event_type in ('enquiry_submitted', 'design_version_created'))
execute function private.dispatch_project_notification();

commit;
