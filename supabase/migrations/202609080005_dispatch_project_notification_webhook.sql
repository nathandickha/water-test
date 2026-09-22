begin;

create extension if not exists pg_net with schema extensions;

grant select on public.project_activity, public.projects, public.notifications, public.profiles
  to service_role;
grant update (status, sent_at) on public.notifications to service_role;
grant select on public.builder_contact_queue to service_role;
grant update (
  status,
  delivery_status,
  delivered_at,
  provider_message_id,
  last_error,
  updated_at
) on public.builder_contact_queue to service_role;

create or replace function private.dispatch_project_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'project_notification_webhook_secret'
  order by created_at desc
  limit 1;

  if v_secret is null then
    raise warning 'Project notification webhook secret is not configured';
    return new;
  end if;

  perform net.http_post(
    url := 'https://uigioamqtgfgjtamxelp.supabase.co/functions/v1/send-project-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-pool-designer-webhook-secret', v_secret
    ),
    body := jsonb_build_object('activity_id', new.id),
    timeout_milliseconds := 5000
  );

  return new;
exception when others then
  raise warning 'Unable to queue project notification webhook: %', sqlerrm;
  return new;
end;
$$;

revoke all on function private.dispatch_project_notification() from public, anon, authenticated;

drop trigger if exists send_project_notification_webhook on public.project_activity;
create trigger send_project_notification_webhook
after insert on public.project_activity
for each row
when (new.event_type = 'enquiry_submitted')
execute function private.dispatch_project_notification();

commit;
