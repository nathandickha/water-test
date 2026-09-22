begin;

alter table public.builder_contact_queue
  add column if not exists delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'processing', 'sent', 'failed')),
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists last_attempt_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists provider_message_id text,
  add column if not exists last_error text;

create index if not exists builder_contact_queue_delivery_idx
  on public.builder_contact_queue (delivery_status, created_at)
  where delivery_status in ('pending', 'failed');

create or replace function public.claim_builder_contact_emails(p_activity_id uuid)
returns table (
  queue_id uuid,
  claimed_builder_id uuid,
  claimed_project_id uuid,
  builder_name text,
  builder_email text
)
language sql
volatile
security definer
set search_path = ''
as $$
  update public.builder_contact_queue q
  set
    delivery_status = 'processing',
    attempt_count = q.attempt_count + 1,
    last_attempt_at = now(),
    last_error = null,
    updated_at = now()
  from public.builders b
  where q.builder_id = b.id
    and q.activity_id = p_activity_id
    and q.delivery_status in ('pending', 'failed')
    and q.attempt_count < 5
    and b.active
    and nullif(trim(b.email), '') is not null
  returning q.id, q.builder_id, q.project_id, b.name, lower(trim(b.email));
$$;

revoke all on function public.claim_builder_contact_emails(uuid) from public, anon, authenticated;
grant execute on function public.claim_builder_contact_emails(uuid) to service_role;

commit;

