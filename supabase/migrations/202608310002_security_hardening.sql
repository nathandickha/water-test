begin;

-- Security hardening for builder invitations and project file isolation.
-- An invitation grants access only to the invitation summary. Full project,
-- message, quote and file access starts after the builder accepts it.

create or replace function private.project_has_accepted_builder(p_project_id uuid, p_builder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_builder_invitations i
    where i.project_id = p_project_id
      and i.builder_id = p_builder_id
      and i.status = 'accepted'
  );
$$;

create or replace function private.is_invited_project_builder(p_project_id uuid, p_builder_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_builder_invitations i
    join public.builder_users bu on bu.builder_id = i.builder_id
    where i.project_id = p_project_id
      and bu.user_id = auth.uid()
      and (p_builder_id is null or i.builder_id = p_builder_id)
      and i.status = 'invited'
  );
$$;

create or replace function private.is_project_builder(p_project_id uuid, p_builder_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_builder_invitations i
    join public.builder_users bu on bu.builder_id = i.builder_id
    where i.project_id = p_project_id
      and bu.user_id = auth.uid()
      and (p_builder_id is null or i.builder_id = p_builder_id)
      and i.status = 'accepted'
  );
$$;

create or replace function private.can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_project_owner(p_project_id) or private.is_project_builder(p_project_id);
$$;

create or replace function private.safe_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function private.attachment_scope_is_valid(
  p_project_id uuid,
  p_builder_id uuid,
  p_message_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_message_id is null or exists (
    select 1
    from public.messages m
    where m.id = p_message_id
      and m.project_id = p_project_id
      and m.builder_id = p_builder_id
  );
$$;

create or replace function private.can_read_project_file(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_project_id uuid := private.safe_uuid(split_part(p_name, '/', 1));
begin
  if v_project_id is null then return false; end if;
  if private.is_project_owner(v_project_id) then return true; end if;
  if not private.is_project_builder(v_project_id) then return false; end if;

  if exists (
    select 1
    from public.design_versions d
    where d.project_id = v_project_id
      and d.preview_path = p_name
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.attachments a
    where a.project_id = v_project_id
      and a.storage_path = p_name
      and (
        a.builder_id is null
        or private.is_project_builder(v_project_id, a.builder_id)
      )
  );
end;
$$;

create or replace function private.can_insert_project_file(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_project_id uuid := private.safe_uuid(split_part(p_name, '/', 1));
  v_message_id uuid := private.safe_uuid(split_part(p_name, '/', 3));
begin
  if v_project_id is null then return false; end if;
  if private.is_project_owner(v_project_id) then return true; end if;

  -- Builders may upload only into an existing message thread belonging to
  -- their accepted invitation. The attachment row created afterwards controls
  -- which files they can subsequently read.
  if split_part(p_name, '/', 2) <> 'messages' or v_message_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.messages m
    where m.id = v_message_id
      and m.project_id = v_project_id
      and private.is_project_builder(v_project_id, m.builder_id)
  );
end;
$$;

revoke all on function private.project_has_accepted_builder(uuid, uuid) from public;
revoke all on function private.is_invited_project_builder(uuid, uuid) from public;
revoke all on function private.is_project_builder(uuid, uuid) from public;
revoke all on function private.can_access_project(uuid) from public;
revoke all on function private.safe_uuid(text) from public;
revoke all on function private.attachment_scope_is_valid(uuid, uuid, uuid) from public;
revoke all on function private.can_read_project_file(text) from public;
revoke all on function private.can_insert_project_file(text) from public;

grant execute on function private.project_has_accepted_builder(uuid, uuid) to authenticated;
grant execute on function private.is_invited_project_builder(uuid, uuid) to authenticated;
grant execute on function private.is_project_builder(uuid, uuid) to authenticated;
grant execute on function private.can_access_project(uuid) to authenticated;
grant execute on function private.safe_uuid(text) to authenticated;
grant execute on function private.attachment_scope_is_valid(uuid, uuid, uuid) to authenticated;
grant execute on function private.can_read_project_file(text) to authenticated;
grant execute on function private.can_insert_project_file(text) to authenticated;

-- A homeowner and the accepted builder may read/send only within that accepted
-- builder thread. This also prevents stale or fabricated builder IDs.
drop policy if exists messages_read_participant on public.messages;
create policy messages_read_participant on public.messages for select to authenticated
  using (
    private.project_has_accepted_builder(project_id, builder_id)
    and (private.is_project_owner(project_id) or private.is_project_builder(project_id, builder_id))
  );

drop policy if exists messages_insert_participant on public.messages;
create policy messages_insert_participant on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and private.project_has_accepted_builder(project_id, builder_id)
    and (private.is_project_owner(project_id) or private.is_project_builder(project_id, builder_id))
  );

-- Shared project attachments (builder_id null) are visible to every accepted
-- builder. Builder-specific/message attachments are visible only to that builder.
drop policy if exists attachments_read_participant on public.attachments;
create policy attachments_read_participant on public.attachments for select to authenticated
  using (
    private.is_project_owner(project_id)
    or (builder_id is null and private.is_project_builder(project_id))
    or (builder_id is not null and private.is_project_builder(project_id, builder_id))
  );

drop policy if exists attachments_insert_participant on public.attachments;
create policy attachments_insert_participant on public.attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and private.attachment_scope_is_valid(project_id, builder_id, message_id)
    and (
      (
        private.is_project_owner(project_id)
        and (builder_id is null or private.project_has_accepted_builder(project_id, builder_id))
      )
      or (
        builder_id is not null
        and private.is_project_builder(project_id, builder_id)
      )
    )
  );

-- Builders may see quotation records only for projects whose invitation they
-- accepted. Homeowners still see submitted/non-draft quotations for comparison.
drop policy if exists quotes_read_participant on public.quotes;
create policy quotes_read_participant on public.quotes for select to authenticated using (
  (private.is_project_owner(project_id) and status <> 'draft')
  or private.is_project_builder(project_id, builder_id)
);

drop policy if exists quote_versions_read_participant on public.quote_versions;
create policy quote_versions_read_participant on public.quote_versions for select to authenticated using (
  exists (
    select 1 from public.quotes q
    where q.id = quote_id
      and (
        (private.is_project_owner(q.project_id) and q.status <> 'draft')
        or private.is_project_builder(q.project_id, q.builder_id)
      )
  )
);

drop policy if exists quote_items_read_participant on public.quote_line_items;
create policy quote_items_read_participant on public.quote_line_items for select to authenticated using (
  exists (
    select 1
    from public.quote_versions qv
    join public.quotes q on q.id = qv.quote_id
    where qv.id = quote_version_id
      and (
        (private.is_project_owner(q.project_id) and q.status <> 'draft')
        or private.is_project_builder(q.project_id, q.builder_id)
      )
  )
);

-- Storage is no longer project-wide for builders. A builder can sign only the
-- current design preview, shared project attachments, or attachments for its
-- own accepted builder thread.
drop policy if exists project_files_read_participant on storage.objects;
create policy project_files_read_participant on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and private.can_read_project_file(name));

drop policy if exists project_files_insert_participant on storage.objects;
create policy project_files_insert_participant on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and private.can_insert_project_file(name));

commit;
