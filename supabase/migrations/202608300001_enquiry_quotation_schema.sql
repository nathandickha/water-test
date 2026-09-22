begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create type public.app_role as enum ('client', 'builder', 'administrator');
create type public.project_status as enum ('draft', 'enquiry_submitted', 'builder_review', 'quotes_received', 'quote_accepted', 'in_contract', 'closed', 'cancelled');
create type public.invitation_status as enum ('invited', 'accepted', 'declined', 'withdrawn');
create type public.equipment_source as enum ('standard', 'optional', 'design_required');
create type public.quote_status as enum ('draft', 'submitted', 'accepted', 'declined', 'withdrawn');
create type public.activity_audience as enum ('client', 'builder', 'all');

create sequence public.project_number_seq start 1001;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'client',
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null,
  first_name text not null,
  last_name text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clients_email_lower_key on public.clients(lower(email));

create table public.builders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  email text not null,
  phone text,
  website text,
  description text,
  logo_url text,
  address text,
  suburb text,
  state text,
  postcode text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  service_radius_km numeric(6,2) not null default 20 check (service_radius_km > 0 and service_radius_km <= 500),
  verified boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.builder_users (
  builder_id uuid not null references public.builders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (builder_id, user_id)
);

create table public.builder_service_areas (
  id uuid primary key default gen_random_uuid(),
  builder_id uuid not null references public.builders(id) on delete cascade,
  postcode text not null,
  suburb text,
  state text,
  created_at timestamptz not null default now(),
  unique (builder_id, postcode, suburb)
);
create index builder_service_areas_postcode_idx on public.builder_service_areas(postcode);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  project_number text not null unique default ('AT-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.project_number_seq')::text, 5, '0')),
  portal_token uuid not null unique default gen_random_uuid(),
  client_id uuid not null references public.clients(user_id) on delete restrict,
  status public.project_status not null default 'draft',
  contact_details jsonb not null default '{}'::jsonb,
  site_details jsonb not null default '{}'::jsonb,
  notes text,
  current_design_version_id uuid,
  accepted_quote_id uuid,
  submitted_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_active_project_per_client on public.projects(client_id)
  where status not in ('closed', 'cancelled');
create index projects_portal_token_idx on public.projects(portal_token);

create table public.design_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  change_summary text,
  preview_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, version_number),
  unique (id, project_id)
);
alter table public.projects add constraint projects_current_design_version_fkey
  foreign key (current_design_version_id, id) references public.design_versions(id, project_id);

create table public.designer_configurations (
  design_version_id uuid primary key references public.design_versions(id) on delete cascade,
  configuration jsonb not null,
  schema_version integer not null default 1 check (schema_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_specifications (
  design_version_id uuid primary key references public.design_versions(id) on delete cascade,
  specification jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_builder_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  builder_id uuid not null references public.builders(id) on delete restrict,
  status public.invitation_status not null default 'invited',
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (project_id, builder_id)
);
create index project_builder_invitations_builder_idx on public.project_builder_invitations(builder_id, status);

create table public.equipment_selections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  design_version_id uuid not null references public.design_versions(id) on delete cascade,
  equipment_code text not null,
  name text not null,
  description text,
  source public.equipment_source not null,
  selected boolean not null default true,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (design_version_id, equipment_code)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  builder_id uuid not null references public.builders(id) on delete restrict,
  sender_id uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_project_builder_idx on public.messages(project_id, builder_id, created_at);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  builder_id uuid references public.builders(id) on delete restrict,
  message_id uuid references public.messages(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  created_at timestamptz not null default now()
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  builder_id uuid not null references public.builders(id) on delete restrict,
  invitation_id uuid not null references public.project_builder_invitations(id) on delete restrict,
  status public.quote_status not null default 'draft',
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, builder_id),
  unique (id, project_id)
);
alter table public.projects add constraint projects_accepted_quote_fkey
  foreign key (accepted_quote_id, id) references public.quotes(id, project_id);

create table public.quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  design_version_id uuid not null references public.design_versions(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  currency text not null default 'AUD' check (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  tax_rate numeric(6,3) not null default 10 check (tax_rate >= 0 and tax_rate <= 100),
  tax_amount numeric(14,2) not null check (tax_amount >= 0),
  total numeric(14,2) not null check (total >= 0),
  valid_until date not null,
  notes text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (quote_id, version_number)
);
alter table public.quotes add constraint quotes_current_version_fkey
  foreign key (current_version_id) references public.quote_versions(id);

create table public.quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_version_id uuid not null references public.quote_versions(id) on delete cascade,
  position integer not null check (position > 0),
  description text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit text not null,
  unit_price numeric(14,2) not null check (unit_price >= 0),
  amount numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  unique (quote_version_id, position)
);

create table public.project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  builder_id uuid references public.builders(id) on delete set null,
  audience public.activity_audience not null default 'all',
  event_type text not null,
  title text not null,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index project_activity_project_idx on public.project_activity(project_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  activity_id uuid references public.project_activity(id) on delete cascade,
  channel text not null default 'email' check (channel in ('email', 'in_app')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'read')),
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.is_project_owner(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.client_id = auth.uid()
  );
$$;

create or replace function private.is_builder_member(p_builder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.builder_users bu
    where bu.builder_id = p_builder_id and bu.user_id = auth.uid()
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
      and i.status in ('invited', 'accepted')
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

revoke all on function private.is_project_owner(uuid) from public;
revoke all on function private.is_builder_member(uuid) from public;
revoke all on function private.is_project_builder(uuid, uuid) from public;
revoke all on function private.can_access_project(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_project_owner(uuid) to authenticated;
grant execute on function private.is_builder_member(uuid) to authenticated;
grant execute on function private.is_project_builder(uuid, uuid) to authenticated;
grant execute on function private.can_access_project(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.builders enable row level security;
alter table public.builder_users enable row level security;
alter table public.builder_service_areas enable row level security;
alter table public.projects enable row level security;
alter table public.design_versions enable row level security;
alter table public.designer_configurations enable row level security;
alter table public.project_specifications enable row level security;
alter table public.project_builder_invitations enable row level security;
alter table public.equipment_selections enable row level security;
alter table public.messages enable row level security;
alter table public.attachments enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_versions enable row level security;
alter table public.quote_line_items enable row level security;
alter table public.project_activity enable row level security;
alter table public.notifications enable row level security;

create policy profiles_read_self on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy clients_read_self on public.clients for select to authenticated using (user_id = auth.uid());
create policy builders_read_active on public.builders for select to authenticated using (active and verified);
create policy builder_users_read_self on public.builder_users for select to authenticated using (user_id = auth.uid());
create policy service_areas_read_active on public.builder_service_areas for select to authenticated
  using (exists (select 1 from public.builders b where b.id = builder_id and b.active and b.verified));
create policy projects_read_participant on public.projects for select to authenticated using (private.can_access_project(id));
create policy design_versions_read_participant on public.design_versions for select to authenticated using (private.can_access_project(project_id));
create policy design_versions_client_preview_update on public.design_versions for update to authenticated
  using (private.is_project_owner(project_id)) with check (private.is_project_owner(project_id));
create policy configurations_read_participant on public.designer_configurations for select to authenticated
  using (exists (select 1 from public.design_versions d where d.id = design_version_id and private.can_access_project(d.project_id)));
create policy specifications_read_participant on public.project_specifications for select to authenticated
  using (exists (select 1 from public.design_versions d where d.id = design_version_id and private.can_access_project(d.project_id)));
create policy invitations_read_participant on public.project_builder_invitations for select to authenticated
  using (private.is_project_owner(project_id) or private.is_builder_member(builder_id));
create policy equipment_read_participant on public.equipment_selections for select to authenticated using (private.can_access_project(project_id));
create policy messages_read_participant on public.messages for select to authenticated
  using (private.is_project_owner(project_id) or private.is_project_builder(project_id, builder_id));
create policy messages_insert_participant on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and (private.is_project_owner(project_id) or private.is_project_builder(project_id, builder_id)));
create policy attachments_read_participant on public.attachments for select to authenticated using (private.can_access_project(project_id));
create policy attachments_insert_participant on public.attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and private.can_access_project(project_id));
create policy quotes_read_participant on public.quotes for select to authenticated using (
  (private.is_project_owner(project_id) and status <> 'draft') or private.is_builder_member(builder_id)
);
create policy quote_versions_read_participant on public.quote_versions for select to authenticated using (
  exists (
    select 1 from public.quotes q
    where q.id = quote_id
      and ((private.is_project_owner(q.project_id) and q.status <> 'draft') or private.is_builder_member(q.builder_id))
  )
);
create policy quote_items_read_participant on public.quote_line_items for select to authenticated using (
  exists (
    select 1 from public.quote_versions qv join public.quotes q on q.id = qv.quote_id
    where qv.id = quote_version_id
      and ((private.is_project_owner(q.project_id) and q.status <> 'draft') or private.is_builder_member(q.builder_id))
  )
);
create policy activity_read_audience on public.project_activity for select to authenticated using (
  (private.is_project_owner(project_id) and audience in ('client', 'all'))
  or (private.is_project_builder(project_id, builder_id) and audience in ('builder', 'all'))
  or (builder_id is null and private.is_project_builder(project_id) and audience in ('builder', 'all'))
);
create policy notifications_read_self on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update_self on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.profiles, public.clients, public.builders, public.builder_users, public.builder_service_areas,
  public.projects, public.design_versions, public.designer_configurations, public.project_specifications,
  public.project_builder_invitations, public.equipment_selections, public.messages, public.attachments,
  public.quotes, public.quote_versions, public.quote_line_items, public.project_activity, public.notifications
  from anon, authenticated;
grant select, update(full_name, phone, updated_at) on public.profiles to authenticated;
grant select on public.clients, public.builders, public.builder_users, public.builder_service_areas, public.projects,
  public.designer_configurations, public.project_specifications, public.project_builder_invitations,
  public.equipment_selections, public.quotes, public.quote_versions, public.quote_line_items, public.project_activity
  to authenticated;
grant select, update(preview_path, updated_at) on public.design_versions to authenticated;
grant select, insert on public.messages, public.attachments to authenticated;
grant select, update(status, read_at) on public.notifications to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files',
  'project-files',
  false,
  26214400,
  array['image/jpeg','image/png','application/pdf','image/webp','text/plain']::text[]
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy project_files_read_participant on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and private.can_access_project(((storage.foldername(name))[1])::uuid));
create policy project_files_insert_participant on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and private.can_access_project(((storage.foldername(name))[1])::uuid));
create policy project_files_update_owner on storage.objects for update to authenticated
  using (bucket_id = 'project-files' and private.is_project_owner(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'project-files' and private.is_project_owner(((storage.foldername(name))[1])::uuid));

commit;
