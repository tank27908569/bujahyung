create table if not exists public.threads_imports (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null unique,
  permalink text,
  root_text text not null check (char_length(root_text) between 1 and 30000),
  replies jsonb not null default '[]'::jsonb check (jsonb_typeof(replies) = 'array'),
  combined_body text not null check (char_length(combined_body) between 1 and 30000),
  thread_timestamp timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'published', 'ignored')),
  published_post_id uuid references public.posts(id) on delete set null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists threads_imports_set_updated_at on public.threads_imports;
create trigger threads_imports_set_updated_at
before update on public.threads_imports
for each row execute function public.set_updated_at();

alter table public.threads_imports enable row level security;
revoke all on table public.threads_imports from anon, authenticated;

create index if not exists threads_imports_status_timestamp_idx
  on public.threads_imports (status, thread_timestamp desc);
