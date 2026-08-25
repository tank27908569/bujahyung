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
  'love-auction-philosophy-003',
  'love-auction-philosophy',
  3,
  '모든 인연에는 각자의 감정가가 있다',
  $body$모든 인연에는
각자의 ‘감정가’가 있다.

첫인상,
조건,
겉으로 보이는 모습.

사람들은 그것으로
쉽게 가치를 판단한다.

사람의 가치는
누군가 대신
평가해 줄 수 있는 것이 아니다.

시간을 두고
진심으로 대하다 보면

처음에는 보이지 않던
그 사람의 진짜 가치가
조금씩 보이기 시작한다.

누군가는
겉모습만 보고
입찰을 포기할 때,

남들이 보지 못한
그 사람의 가치를
알아보는 것.

그것이
사랑의 안목이고,

인생 최고의 안목이다.

감정가는
세상이 매기지만,

인생의 낙찰가는
마음이 결정한다.$body$,
  'assets/love-auction-03-true-appraisal.png',
  null,
  true,
  now()
where not exists (
  select 1
  from public.posts
  where category = 'love-auction-philosophy'
    and source_no = 3
);
