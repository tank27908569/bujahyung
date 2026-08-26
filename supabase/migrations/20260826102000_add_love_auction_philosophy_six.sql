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
  'love-auction-philosophy-006',
  'love-auction-philosophy',
  6,
  '신뢰는 오래 보유하게 만든다',
  $body$좋은 배우자는
첫눈에 높은 감정가를 받는
사람이 아니다.

오래 함께할수록
가치가 더 보이는 사람이다.

처음부터
화려할 필요는 없다.

경매도
좋은 물건은 오래 들여다볼수록
보이지 않던 가치가 보인다.

사랑도 그렇다.

배려가 쌓이고,
약속을 지키고,
어려운 순간에도 곁을 지키면서

서로에 대한
신뢰가 쌓인다.

설렘은
입찰하게 만들지만,

신뢰는
오래 보유하게 만든다.

좋은 인연은
처음 만났을 때보다
10년 후,
20년 후가
더 좋은 사람이다.

사랑에서
가장 좋은 낙찰은

다시 경매에
내놓고 싶지 않은 사람을
만나는 것이다. 🌿$body$,
  'assets/love-auction-06-lasting-trust.png',
  null,
  true,
  now()
where not exists (
  select 1
  from public.posts
  where category = 'love-auction-philosophy'
    and source_no = 6
);
