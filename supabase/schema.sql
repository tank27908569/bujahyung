create extension if not exists pgcrypto;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  source_no integer unique,
  title text not null check (char_length(title) between 1 and 300),
  body text not null check (char_length(body) between 1 and 30000),
  is_published boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

alter table public.admins enable row level security;
alter table public.posts enable row level security;

drop policy if exists "Admin can verify own role" on public.admins;
create policy "Admin can verify own role"
on public.admins for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Public can read published posts" on public.posts;
create policy "Public can read published posts"
on public.posts for select
to anon, authenticated
using (
  is_published = true
  or exists (
    select 1 from public.admins
    where admins.user_id = (select auth.uid())
  )
);

drop policy if exists "Admin can create posts" on public.posts;
create policy "Admin can create posts"
on public.posts for insert
to authenticated
with check (
  exists (
    select 1 from public.admins
    where admins.user_id = (select auth.uid())
  )
);

drop policy if exists "Admin can update posts" on public.posts;
create policy "Admin can update posts"
on public.posts for update
to authenticated
using (
  exists (
    select 1 from public.admins
    where admins.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admins
    where admins.user_id = (select auth.uid())
  )
);

drop policy if exists "Admin can delete posts" on public.posts;
create policy "Admin can delete posts"
on public.posts for delete
to authenticated
using (
  exists (
    select 1 from public.admins
    where admins.user_id = (select auth.uid())
  )
);

revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;
grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;

create index if not exists posts_published_at_idx on public.posts (published_at desc);
create index if not exists posts_source_no_idx on public.posts (source_no);


create table if not exists public.admin_login_attempts (
  identifier text primary key,
  failures integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.admin_login_attempts enable row level security;
revoke all on table public.admin_login_attempts from anon, authenticated;