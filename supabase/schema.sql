create extension if not exists pgcrypto;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  source_no integer,
  category text not null default 'thread-seodang' check (category in ('thread-seodang', 'library', 'love-auction-philosophy', 'auction-stories', 'life-stories')),
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
create unique index if not exists posts_category_source_no_key on public.posts (category, source_no) where source_no is not null;
create index if not exists posts_category_published_at_idx on public.posts (category, published_at desc);

create table if not exists public.auction_recommendations (
  id uuid primary key default gen_random_uuid(), title text not null, case_number text not null,
  court text, property_type text not null default '기타', address text not null,
  appraisal_price bigint, minimum_price bigint, bid_date date,
  recommendation_reason text not null, risk_note text, image_url text, detail_url text,
  status text not null default 'open' check (status in ('open', 'closed')),
  is_featured boolean not null default false, is_published boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
drop trigger if exists auction_recommendations_set_updated_at on public.auction_recommendations;
create trigger auction_recommendations_set_updated_at before update on public.auction_recommendations for each row execute function public.set_updated_at();
alter table public.auction_recommendations enable row level security;
drop policy if exists "Public can read published auction recommendations" on public.auction_recommendations;
create policy "Public can read published auction recommendations" on public.auction_recommendations for select to anon, authenticated using (is_published = true);
revoke all on public.auction_recommendations from anon, authenticated;
grant select on public.auction_recommendations to anon, authenticated;
create index if not exists auction_recommendations_public_idx on public.auction_recommendations (is_published, is_featured desc, bid_date, created_at desc);
insert into public.auction_recommendations (id,title,case_number,court,property_type,address,appraisal_price,minimum_price,bid_date,recommendation_reason,risk_note,image_url,detail_url,is_featured,is_published)
values ('7c91f2c4-f020-4c1e-8ff7-d7ff3ce1a203','판교원마을 12단지 35평 아파트','2025타경51854','수원지방법원 성남지원','아파트','경기도 성남시 분당구 서판교로 165, 1203동 3층 304호',1780000000,1246000000,'2026-09-14','감정가에서 한 번 유찰되어 70%까지 내려왔습니다. 비슷한 저층 실거래가 16억 6천만 원과 비교하면 최저가 기준 약 4억 1천만 원의 차이가 있고, 최근 전세 거래도 9억 원대 중반부터 10억 5천만 원까지 확인됩니다.','임차인과 권리관계가 깔끔한 것으로 보이지만 입찰 전 매각물건명세서·현황조사서·등기부와 점유 상태를 다시 확인해야 합니다.','https://bujahyung.vercel.app/assets/auction-pick-pangyo-1203.jpg','https://www.threads.com/@richbro.kr/post/DcpqG3ZkbRk',true,true)
on conflict (id) do nothing;


create table if not exists public.admin_login_attempts (
  identifier text primary key,
  failures integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.admin_login_attempts enable row level security;
revoke all on table public.admin_login_attempts from anon, authenticated;
