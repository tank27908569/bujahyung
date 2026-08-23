alter table public.posts
  add column if not exists category text not null default 'thread-seodang';

alter table public.posts
  drop constraint if exists posts_category_check;

alter table public.posts
  add constraint posts_category_check check (category in (
    'thread-seodang',
    'library',
    'love-auction-philosophy',
    'auction-stories',
    'life-stories'
  ));

alter table public.posts
  drop constraint if exists posts_source_no_key;

create unique index if not exists posts_category_source_no_key
  on public.posts (category, source_no)
  where source_no is not null;

create index if not exists posts_category_published_at_idx
  on public.posts (category, published_at desc);

insert into public.posts (category, source_no, title, body, is_published, published_at)
select
  'library',
  1,
  '안톤 체호프 《드라마》',
  $article$경매나 하는 사람이 갑자기 책 얘기를 한다.
어색하다는 거 안다.
학창시절엔 선생님 강요로, 시험 때문에 읽었다.
인생 좀 살아보니 느낌이 다르게 온다.
독서모임 10년 넘게 해오면서 책 읽을 때마다 노트에 정리해왔다.
그거 하나둘 꺼내볼 거야.
경매 얘기만 하면 재미없으니까.
오늘은 안톤 체호프 단편 「드라마」야.

유명 작가 파벨 바실리치.
조용히 쉬려던 참이다.
아마추어 극작가 무라슈키나가 희곡 원고를 들고 찾아온다.
“잠깐만 봐주세요.”

잠깐이 아니었다.
거절할 틈도 없이 원고를 읽기 시작한다.

파벨은 예의상 거절도 못하고 말을 끊지도 못한다.
몇 시간이 흐른다.
머리는 터질 것 같고 숨이 막혀온다.
여인이 마지막 막을 읽으려는 순간 그는 이성을 잃는다.
옆에 있던 묵직한 문학평론 서적을 든다.
여자를 내리친다.
여자는 죽는다.

배심원들은 그에게 무죄를 선고한다.
작품은 이렇게 끝나.
이유가 뭐냐면,
누구든 그 상황이면 그럴 수 있다고 본 거야.

체호프는 이 극단적인 결말로 한 가지를 풍자한다.

타인의 시간을 빼앗는 일도
폭력이 될 수 있다.

좋은 의도였다고
좋은 소통이 되는 건 아니다.

상대의 표정,
상대의 시간,
상대의 경계를
읽지 못하면 배려는 부담이 된다.

경매 현장에도 이런 사람들이 종종 있어.
물건 하나 설명하는데 본질은 안 짚고 곁가지만 파는 사람.
권리분석 한 줄이면 끝날 얘기를 30분 늘어놓는 사람.
임장 가서도 핵심 없이 변죽만 울리는 사람.

시간은
값을 매길 수 없는 자산이지.

숫자보다 먼저 계산해야 하는 게 시간이야.$article$,
  true,
  '2026-08-23T15:09:10+09:00'::timestamptz
where not exists (
  select 1 from public.posts
  where category = 'library' and source_no = 1
);
