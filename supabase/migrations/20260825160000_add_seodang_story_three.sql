insert into public.posts (
  external_id,
  category,
  source_no,
  title,
  body,
  cover_image_url,
  cover_quote,
  is_published,
  published_at
)
select
  'thread-seodang-003',
  'thread-seodang',
  3,
  '欲速不達 (욕속부달)',
  $article$欲速不達 (욕속부달)

빨리 가려 하면
도착이 늦어진다.

사람들은
남보다 늦어지는 것을 두려워한다.

그래서 서두른다.

빨리 돈을 벌고 싶고,
빨리 성과를 내고 싶고,
빨리 부자가 되고 싶어 한다.

조급함은
지름길처럼 보여도
대부분 돌아가는 길이다.

경매도 마찬가지다.

빨리 낙찰받고 싶은 마음에
권리분석을 대충 하고,

싸 보인다는 이유만으로 입찰하고,

수익에 눈이 멀어
출구전략도 없이 뛰어든다.

한 번의 성급한 선택이
오랫동안 모은 돈과
시간을 잃게 만들기도 한다.

수많은 경매 현장을 지켜보며
한 가지를 배웠다.

오래 살아남는 사람은
가장 빨리 가는 사람이 아니었다.

물건이 없으면 기다리고,

수익이 안 나오면 포기하고,

기준에 맞지 않으면
입찰하지 않았다.

느린 것이
문제가 아니다.

방향이 틀린 채
빨리 가는 것이 문제다.

欲速不達.

빨리 가려고
원칙을 건너뛰지 마라.

느려도
방향이 맞으면
앞선다. 🌿$article$,
  'assets/seodang-03-yoksokbudal.png',
  null,
  true,
  now()
where not exists (
  select 1
  from public.posts
  where category = 'thread-seodang'
    and source_no = 3
);

