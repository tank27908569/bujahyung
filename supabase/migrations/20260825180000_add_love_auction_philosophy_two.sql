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
  'love-auction-philosophy-002',
  'love-auction-philosophy',
  2,
  '사랑도 경매와 닮았다',
  $body$사랑도
경매와 닮았다.

가장 높은 가격을
써낸다고 해서
좋은 물건을 얻는 것은 아니다.

중요한 건
그 가치를 알아보는 눈이다.

사랑도 그렇다.

조건이 좋다고,
누군가와 경쟁해서 이겼다고
마음을 얻는 것은 아니다.

시간을 들여
진심을 보여주고,

신뢰를 쌓고,
마음을 지켜주는 사람.

사랑은
경쟁에서 이기는 사람이 아니라

서로의 가치를
끝까지 알아봐주는 사람이
낙찰받는 것이다. 😊$body$,
  'assets/love-auction-02-recognizing-value.png',
  null,
  true,
  now()
where not exists (
  select 1
  from public.posts
  where category = 'love-auction-philosophy'
    and source_no = 2
);
