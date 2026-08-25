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
  'love-auction-philosophy-004',
  'love-auction-philosophy',
  4,
  '사랑은 신뢰를 지키는 행동으로 완성된다',
  $body$경매에서 중요한 건
‘최고가’만이 아니다.

낙찰받았다면
잔금을 치러야
내 것이 된다.

사람 사이도
다르지 않다.

사랑한다는 말보다
그 말을 지키는 행동이 중요하다.

좋을 때만 곁에 있는 것이 아니라,

힘들 때도
묵묵히 자리를 지키고,

한번 건넨 마음을
끝까지 책임지는 사람.

사랑은
말로 낙찰받는 것이 아니다.

신뢰를 지키는 행동으로
완성되는 것이다.$body$,
  'assets/love-auction-04-trust-in-action.png',
  null,
  true,
  now()
where not exists (
  select 1
  from public.posts
  where category = 'love-auction-philosophy'
    and source_no = 4
);
