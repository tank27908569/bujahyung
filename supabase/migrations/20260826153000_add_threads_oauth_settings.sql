create table if not exists public.threads_integration (
  id smallint primary key default 1 check (id = 1),
  app_id text not null,
  app_secret_encrypted text,
  access_token_encrypted text,
  token_expires_at timestamptz,
  oauth_state text,
  oauth_state_expires_at timestamptz,
  connected_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists threads_integration_set_updated_at on public.threads_integration;
create trigger threads_integration_set_updated_at
before update on public.threads_integration
for each row execute function public.set_updated_at();

alter table public.threads_integration enable row level security;
revoke all on table public.threads_integration from anon, authenticated;
