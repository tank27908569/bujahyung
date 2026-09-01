-- 스레드에 올리는 물건 브리핑에는 사건번호가 없는 경우가 많아 선택 항목으로 바꿉니다.
-- 기존 check(char_length between 1 and 80)는 NULL이면 통과하므로 그대로 둡니다.
alter table public.auction_recommendations
  alter column case_number drop not null;
