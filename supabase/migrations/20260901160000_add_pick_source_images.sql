-- 스레드 글에 붙은 사진을 모두 보관합니다.
-- 소재지·입찰일·사건번호는 글이 아니라 명세 사진에 적혀 있어서,
-- 검토할 때 그 사진을 보면서 채울 수 있어야 합니다.
alter table public.auction_recommendations
  add column if not exists source_images jsonb not null default '[]'::jsonb
  check (jsonb_typeof(source_images) = 'array');
