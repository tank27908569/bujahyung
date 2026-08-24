alter table public.posts
  add column if not exists external_id text;

create unique index if not exists posts_category_external_id_key
  on public.posts (category, external_id);
