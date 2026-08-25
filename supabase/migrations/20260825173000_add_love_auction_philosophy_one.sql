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
  'love-auction-philosophy-001',
  'love-auction-philosophy',
  1,
  '사랑은 같은 방향을 함께 바라보는 것',
  $body$사랑은

서로의 얼굴만
바라보는 게 아니다.

같은 방향을
함께 바라보는 것이다.

돈도,
인생도,
꿈도 마찬가지다.

서로 좋아하는 마음만으로
오래 함께하기는 어렵다.

어디로 가고 싶은지,
무엇을 중요하게 생각하는지,
어떤 삶을 살고 싶은지.

시선이 맞아야
사람은 오래
함께 걸어갈 수 있다.

같은 속도로
걸을 필요는 없다.

조금 앞서기도 하고,
조금 뒤처지기도 한다.

그래도
바라보는 방향이 같다면
다시 나란히 걸을 수 있다.

오늘은

나와 같은 방향을 바라봐주는
사람들에게

조용히 감사해보자. 😊$body$,
  'assets/love-auction-01-same-direction.png',
  null,
  true,
  now()
where not exists (
  select 1
  from public.posts
  where category = 'love-auction-philosophy'
    and source_no = 1
);
