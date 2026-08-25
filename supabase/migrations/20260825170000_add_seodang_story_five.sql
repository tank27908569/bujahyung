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
  'thread-seodang-005',
  'thread-seodang',
  5,
  '修己治人 (수기치인)',
  $body$修己治人 (수기치인)

나를 먼저 다스린 뒤
사람을 대하라.

사람들은
상대를 바꾸려고 한다.

내 말을 듣게 하고,
내 뜻대로 움직이게 하고,
내가 원하는 결과를 얻으려 한다.

하지만
남을 움직이기 전에
먼저 다스려야 할 사람이 있다.

바로 나 자신이다.

경매도 마찬가지다.

특히 명도 현장에서는
상대보다
내 감정을 다스리는 것이 먼저다.

점유자가 화를 낸다고
나도 목소리를 높이고,

상대가 버틴다고
감정으로 맞서기 시작하면

협상은 점점 멀어진다.

고수는
상대를 이기려 하지 않는다.

먼저 자신의 감정을 낮추고,
상대의 이야기를 듣고,
서로의 퇴로를 찾는다.

말을 많이 하기보다 듣고,

몰아붙이기보다 기다리고,

내가 원하는 것을 말하기 전에
상대가 원하는 것이 무엇인지부터 본다.

사람을 움직이는 힘은
목소리의 크기에서 나오지 않는다.

자기 자신을
다스리는 힘에서 나온다.

투자도,
사업도,
인생도 같다.

욕심을 다스리지 못하면
좋은 물건 앞에서 무너지고,

감정을 다스리지 못하면
좋은 관계 앞에서 무너진다.

修己治人.

남을 바꾸려 하지 마라.

나를 먼저 다스리면
사람을 대하는 방법도 달라진다.

리더십의 시작은
언제나 자기 자신이다. 🌿$body$,
  'assets/seodang-05-sugichiin.png',
  null,
  true,
  now()
where not exists (
  select 1
  from public.posts
  where category = 'thread-seodang'
    and source_no = 5
);
