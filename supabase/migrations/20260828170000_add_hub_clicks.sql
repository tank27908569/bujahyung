-- 허브(hub.html) 링크 클릭 집계.
-- 어떤 카드가 실제로 눌리는지만 남깁니다. 개인정보는 저장하지 않습니다.
create table if not exists public.hub_clicks (
  id uuid primary key default gen_random_uuid(),
  link_id text not null check (char_length(link_id) between 1 and 60),
  source text not null default 'direct' check (char_length(source) <= 120),
  created_at timestamptz not null default now()
);

alter table public.hub_clicks enable row level security;
revoke all on table public.hub_clicks from anon, authenticated;

-- 익명 사용자는 기록만 남길 수 있고, 조회는 할 수 없습니다.
grant insert on table public.hub_clicks to anon;

drop policy if exists hub_clicks_anon_insert on public.hub_clicks;
create policy hub_clicks_anon_insert on public.hub_clicks
for insert to anon with check (true);

create index if not exists hub_clicks_created_at_idx on public.hub_clicks (created_at desc);
create index if not exists hub_clicks_link_idx on public.hub_clicks (link_id, created_at desc);
