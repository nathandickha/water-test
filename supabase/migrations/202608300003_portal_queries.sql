begin;

create or replace function public.get_project_portal(p_portal_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_result jsonb;
begin
  select p.id into v_project_id
  from public.projects p
  where p.portal_token = p_portal_token and p.client_id = auth.uid();
  if v_project_id is null then return null; end if;

  select jsonb_build_object(
    'project', jsonb_build_object(
      'id', p.id,
      'project_number', p.project_number,
      'status', p.status,
      'contact_details', p.contact_details,
      'site_details', p.site_details,
      'notes', p.notes,
      'submitted_at', p.submitted_at,
      'created_at', p.created_at
    ),
    'design', case when dv.id is null then null else jsonb_build_object(
      'id', dv.id,
      'version_number', dv.version_number,
      'preview_path', dv.preview_path,
      'change_summary', dv.change_summary,
      'created_at', dv.created_at,
      'configuration', dc.configuration,
      'specification', ps.specification
    ) end,
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'status', i.status,
        'invited_at', i.invited_at,
        'responded_at', i.responded_at,
        'builder', jsonb_build_object(
          'id', b.id, 'name', b.name, 'description', b.description,
          'phone', b.phone, 'website', b.website, 'logo_url', b.logo_url
        ),
        'quote', (
          select jsonb_build_object(
            'id', q.id,
            'status', q.status,
            'currentVersion', case when qv.id is null then null else jsonb_build_object(
              'id', qv.id,
              'version_number', qv.version_number,
              'design_version_id', qv.design_version_id,
              'design_version_number', qdv.version_number,
              'currency', qv.currency,
              'subtotal', qv.subtotal,
              'tax_rate', qv.tax_rate,
              'tax_amount', qv.tax_amount,
              'total', qv.total,
              'valid_until', qv.valid_until,
              'notes', qv.notes,
              'submitted_at', qv.submitted_at,
              'line_items', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'id', li.id, 'position', li.position, 'description', li.description,
                  'quantity', li.quantity, 'unit', li.unit, 'unit_price', li.unit_price, 'amount', li.amount
                ) order by li.position)
                from public.quote_line_items li where li.quote_version_id = qv.id
              ), '[]'::jsonb)
            ) end
          )
          from public.quotes q
          left join public.quote_versions qv on qv.id = q.current_version_id
          left join public.design_versions qdv on qdv.id = qv.design_version_id
          where q.project_id = p.id and q.builder_id = i.builder_id and q.status <> 'draft'
        )
      ) order by b.name)
      from public.project_builder_invitations i
      join public.builders b on b.id = i.builder_id
      where i.project_id = p.id
    ), '[]'::jsonb),
    'equipment', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', e.equipment_code, 'name', e.name, 'description', e.description,
        'source', e.source, 'selected', e.selected, 'details', e.details
      ) order by e.source, e.name)
      from public.equipment_selections e where e.design_version_id = p.current_design_version_id
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'builder_id', m.builder_id, 'sender_id', m.sender_id,
        'sender_role', case when m.sender_id = p.client_id then 'client' else 'builder' end,
        'sender_name', coalesce(pr.full_name, 'Participant'), 'body', m.body, 'created_at', m.created_at
      ) order by m.created_at)
      from public.messages m left join public.profiles pr on pr.id = m.sender_id
      where m.project_id = p.id
    ), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', at.id, 'message_id', at.message_id, 'builder_id', at.builder_id,
        'storage_path', at.storage_path, 'file_name', at.file_name,
        'mime_type', at.mime_type, 'size_bytes', at.size_bytes, 'created_at', at.created_at
      ) order by at.created_at)
      from public.attachments at where at.project_id = p.id
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'event_type', a.event_type, 'title', a.title,
        'detail', a.detail, 'metadata', a.metadata, 'created_at', a.created_at
      ) order by a.created_at desc)
      from public.project_activity a
      where a.project_id = p.id and a.audience in ('client', 'all')
    ), '[]'::jsonb)
  ) into v_result
  from public.projects p
  left join public.design_versions dv on dv.id = p.current_design_version_id
  left join public.designer_configurations dc on dc.design_version_id = dv.id
  left join public.project_specifications ps on ps.design_version_id = dv.id
  where p.id = v_project_id;
  return v_result;
end;
$$;
revoke all on function public.get_project_portal(uuid) from public;
grant execute on function public.get_project_portal(uuid) to authenticated;

create or replace function public.get_builder_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_builder_id uuid;
  v_result jsonb;
begin
  select bu.builder_id into v_builder_id
  from public.builder_users bu
  join public.builders b on b.id = bu.builder_id
  where bu.user_id = auth.uid() and b.active
  order by bu.is_admin desc, bu.created_at
  limit 1;
  if v_builder_id is null then return null; end if;

  select jsonb_build_object(
    'builder', jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug, 'logo_url', b.logo_url),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'status', i.status,
        'invited_at', i.invited_at,
        'project', jsonb_build_object(
          'id', p.id, 'project_number', p.project_number,
          'suburb', p.site_details ->> 'suburb', 'state', p.site_details ->> 'state',
          'summary', coalesce(ps.specification ->> 'dimensions', '') || ' ' || coalesce(ps.specification ->> 'shape', 'pool')
        )
      ) order by i.invited_at desc)
      from public.project_builder_invitations i
      join public.projects p on p.id = i.project_id
      left join public.project_specifications ps on ps.design_version_id = p.current_design_version_id
      where i.builder_id = b.id and i.status = 'invited'
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'project_id', p.id,
        'project_number', p.project_number,
        'suburb', p.site_details ->> 'suburb',
        'state', p.site_details ->> 'state',
        'project_status', p.status,
        'invitation_status', i.status,
        'design_version_number', dv.version_number,
        'quote_status', q.status,
        'updated_at', greatest(p.updated_at, i.updated_at, coalesce(q.updated_at, p.updated_at))
      ) order by greatest(p.updated_at, i.updated_at, coalesce(q.updated_at, p.updated_at)) desc)
      from public.project_builder_invitations i
      join public.projects p on p.id = i.project_id
      left join public.design_versions dv on dv.id = p.current_design_version_id
      left join public.quotes q on q.project_id = p.id and q.builder_id = b.id
      where i.builder_id = b.id and i.status = 'accepted' and p.status not in ('closed', 'cancelled')
    ), '[]'::jsonb)
  ) into v_result
  from public.builders b where b.id = v_builder_id;
  return v_result;
end;
$$;
revoke all on function public.get_builder_dashboard() from public;
grant execute on function public.get_builder_dashboard() to authenticated;

create or replace function public.get_builder_project(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_builder_id uuid;
  v_result jsonb;
begin
  select i.builder_id into v_builder_id
  from public.project_builder_invitations i
  join public.builder_users bu on bu.builder_id = i.builder_id
  where i.project_id = p_project_id and i.status = 'accepted' and bu.user_id = auth.uid()
  limit 1;
  if v_builder_id is null then return null; end if;

  select jsonb_build_object(
    'builder', jsonb_build_object('id', b.id, 'name', b.name),
    'invitation', jsonb_build_object('id', i.id, 'status', i.status, 'invited_at', i.invited_at, 'responded_at', i.responded_at),
    'project', jsonb_build_object(
      'id', p.id, 'project_number', p.project_number, 'status', p.status,
      'contact_details', p.contact_details, 'site_details', p.site_details,
      'notes', p.notes, 'submitted_at', p.submitted_at
    ),
    'design', jsonb_build_object(
      'id', dv.id, 'version_number', dv.version_number, 'preview_path', dv.preview_path,
      'change_summary', dv.change_summary, 'created_at', dv.created_at,
      'configuration', dc.configuration, 'specification', ps.specification
    ),
    'equipment', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', e.equipment_code, 'name', e.name, 'description', e.description,
        'source', e.source, 'details', e.details
      ) order by e.source, e.name)
      from public.equipment_selections e where e.design_version_id = dv.id
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'sender_id', m.sender_id,
        'sender_role', case when m.sender_id = p.client_id then 'client' else 'builder' end,
        'sender_name', coalesce(pr.full_name, 'Participant'), 'body', m.body, 'created_at', m.created_at
      ) order by m.created_at)
      from public.messages m left join public.profiles pr on pr.id = m.sender_id
      where m.project_id = p.id and m.builder_id = b.id
    ), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', at.id, 'message_id', at.message_id, 'storage_path', at.storage_path,
        'file_name', at.file_name, 'mime_type', at.mime_type,
        'size_bytes', at.size_bytes, 'created_at', at.created_at
      ) order by at.created_at)
      from public.attachments at
      where at.project_id = p.id
        and (at.builder_id = b.id or at.message_id is null)
    ), '[]'::jsonb),
    'quote', (
      select jsonb_build_object(
        'id', q.id, 'status', q.status,
        'currentVersion', case when qv.id is null then null else jsonb_build_object(
          'id', qv.id, 'version_number', qv.version_number, 'design_version_id', qv.design_version_id,
          'valid_until', qv.valid_until, 'notes', qv.notes, 'subtotal', qv.subtotal,
          'tax_rate', qv.tax_rate, 'tax_amount', qv.tax_amount, 'total', qv.total,
          'line_items', coalesce((
            select jsonb_agg(jsonb_build_object(
              'position', li.position, 'description', li.description, 'quantity', li.quantity,
              'unit', li.unit, 'unit_price', li.unit_price, 'amount', li.amount
            ) order by li.position)
            from public.quote_line_items li where li.quote_version_id = qv.id
          ), '[]'::jsonb)
        ) end
      )
      from public.quotes q left join public.quote_versions qv on qv.id = q.current_version_id
      where q.project_id = p.id and q.builder_id = b.id
    )
  ) into v_result
  from public.projects p
  join public.project_builder_invitations i on i.project_id = p.id and i.builder_id = v_builder_id
  join public.builders b on b.id = i.builder_id
  join public.design_versions dv on dv.id = p.current_design_version_id
  join public.designer_configurations dc on dc.design_version_id = dv.id
  join public.project_specifications ps on ps.design_version_id = dv.id
  where p.id = p_project_id;
  return v_result;
end;
$$;
revoke all on function public.get_builder_project(uuid) from public;
grant execute on function public.get_builder_project(uuid) to authenticated;

commit;
