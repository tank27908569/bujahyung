-- 스레드 물건 브리핑을 그대로 가져오기 위한 준비.
-- 글에는 소재지가 적히지 않는 경우가 많아 선택 항목으로 바꿉니다.
alter table public.auction_recommendations
  alter column address drop not null;

-- 같은 글이 두 번 들어오지 않도록 원문 글 번호를 기록합니다.
alter table public.auction_recommendations
  add column if not exists source_thread_id text;

create unique index if not exists auction_recommendations_source_thread_id_key
  on public.auction_recommendations (source_thread_id)
  where source_thread_id is not null;
