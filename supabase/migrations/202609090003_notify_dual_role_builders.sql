begin;

-- A verified account may legitimately own the client project and also be linked
-- to a selected builder while the enquiry workflow is being tested. Builder
-- notifications for enquiry submissions and design variations must still be
-- queued in that case. Keep actor suppression for all other activity.
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
    where p.id = new.project_id
      and p.client_id is distinct from new.actor_id;
  end if;

  if new.audience in ('builder', 'all') then
    insert into public.notifications (user_id, builder_id, project_id, activity_id)
    select distinct bu.user_id, i.builder_id, new.project_id, new.id
    from public.project_builder_invitations i
    join public.builder_users bu on bu.builder_id = i.builder_id
    where i.project_id = new.project_id
      and i.status in ('invited', 'accepted')
      and (new.builder_id is null or i.builder_id = new.builder_id)
      and (
        bu.user_id is distinct from new.actor_id
        or new.event_type in ('enquiry_submitted', 'design_version_created')
      );

    insert into public.builder_contact_queue (builder_id, project_id, activity_id)
    select i.builder_id, new.project_id, new.id
    from public.project_builder_invitations i
    where i.project_id = new.project_id
      and i.status in ('invited', 'accepted')
      and (new.builder_id is null or i.builder_id = new.builder_id)
      and not exists (
        select 1
        from public.builder_users bu
        where bu.builder_id = i.builder_id
      )
    on conflict (builder_id, activity_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.enqueue_activity_notifications() from public;

commit;
