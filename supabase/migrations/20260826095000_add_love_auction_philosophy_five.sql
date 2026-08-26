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
  'love-auction-philosophy-005',
  'love-auction-philosophy',
  5,
  '인연에도 낙찰되는 때가 있다',
  $body$모든 인연이
한 번에 낙찰되는 건 아니다.

어떤 인연은
때가 맞지 않아
스쳐 지나가기도 한다.

지금 누군가와
멀어졌다고 해서
자책할 필요는 없다.

경매에서 유찰은
실패가 아니다.

다시 기회를 기다리고,
가치를 바라보는 시간이다.

사랑도 그렇다.

지나간 인연이 있어야
내게 맞는 사람을 알게 되고,

멀어져 본 시간이 있어야
함께할 사람의 소중함도 알게 된다.

인생의 유찰은
끝이 아니다.

나와 더 맞는 사람,
더 깊은 인연,
더 좋은 타이밍을 만나기 위한
또 한 번의 기회다.

인연에도
낙찰되는 때가 있다.$body$,
  'assets/love-auction-05-right-timing.png',
  null,
  true,
  now()
where not exists (
  select 1
  from public.posts
  where category = 'love-auction-philosophy'
    and source_no = 5
);
