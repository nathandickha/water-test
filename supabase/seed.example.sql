-- Replace the example values before running this in the Supabase SQL editor.
-- The builder user must sign in once first so their auth.users/profiles row exists.

begin;

insert into public.builders (
  name, slug, email, phone, website, description,
  address, suburb, state, postcode, latitude, longitude,
  service_radius_km, verified, active
) values (
  'Example Pool Builder',
  'example-pool-builder',
  'builder@example.com',
  '02 0000 0000',
  'https://builder.example.com',
  'Licensed residential pool builder.',
  '1 Example Street',
  'Sydney',
  'NSW',
  '2000',
  -33.868800,
  151.209300,
  20,
  true,
  true
);

insert into public.builder_service_areas (builder_id, postcode, suburb, state)
select id, area.postcode, area.suburb, 'NSW'
from public.builders
cross join (
  values ('2000', 'Sydney'), ('2010', 'Surry Hills'), ('2021', 'Paddington')
) as area(postcode, suburb)
where slug = 'example-pool-builder';

insert into public.builder_users (builder_id, user_id, is_admin)
select id, 'REPLACE_WITH_AUTH_USER_UUID'::uuid, true
from public.builders where slug = 'example-pool-builder';

update public.profiles
set role = 'builder', updated_at = now()
where id = 'REPLACE_WITH_AUTH_USER_UUID'::uuid;

commit;
