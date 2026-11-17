-- Run in the Supabase SQL editor after `supabase db push`.
-- Every row should show ok = true.

select 'app schema exists' as check_name,
       exists (select 1 from pg_namespace where nspname = 'app') as ok
union all
select 'RLS on profiles',
       (select relrowsecurity from pg_class where oid = 'app.profiles'::regclass)
union all
select 'RLS on user_preferences',
       (select relrowsecurity from pg_class where oid = 'app.user_preferences'::regclass)
union all
select 'RLS on trips',
       (select relrowsecurity from pg_class where oid = 'app.trips'::regclass)
union all
select 'anon cannot use app schema',
       not has_schema_privilege('anon', 'app', 'usage')
union all
select 'authenticated cannot delete trips',
       not has_table_privilege('authenticated', 'app.trips', 'delete')
union all
-- The API connects as `postgres` and switches to `authenticated` per request.
select 'postgres can switch to authenticated',
       pg_has_role('postgres', 'authenticated', 'member')
union all
select 'every auth user has a profile',
       not exists (
         select 1 from auth.users u
         left join app.profiles p on p.id = u.id
         where p.id is null
       );
