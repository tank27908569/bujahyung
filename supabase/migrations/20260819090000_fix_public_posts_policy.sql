drop policy if exists "Public can read published posts" on public.posts;

create policy "Public can read published posts"
on public.posts for select
to anon, authenticated
using (is_published = true);

drop policy if exists "Admin can read all posts" on public.posts;
create policy "Admin can read all posts"
on public.posts for select
to authenticated
using (
  exists (
    select 1 from public.admins
    where admins.user_id = (select auth.uid())
  )
);
