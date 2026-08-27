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
  'auction-story-207-confidence',
  'auction-stories',
  207,
  '나는 왜 투자할 때마다 주저할까',
  $body$나는 왜 투자할 때마다 주저할까.

의심을 해소하면
확신이 된다.

처음부터 확신을 갖고 시작하는 일은
생각보다 많지 않다.

투자도,
사업도,
사람도
처음엔 늘 의심이 있다.

경매 물건을 볼 때도 그렇다.

권리는 괜찮은가.
시세는 정확한가.
명도는 가능한가.
수익은 충분한가.

하나씩 의심하고,
하나씩 확인해 나간다.

확신은 감으로 만들어지지 않는다.

의심을 하나씩 지워가며
만들어진다.

의심이 생겼다고 멈추지 마라.

확인해라.

확인할수록 의심은 줄고,
그 자리에 확신이 남는다.

투자에서 필요한 건
무모한 용기가 아니다.

확인하고 움직이는
확신이다.$body$,
  'assets/auction-story-207-confidence.png',
  null,
  true,
  now()
where not exists (
  select 1
  from public.posts
  where category = 'auction-stories'
    and source_no = 207
);
