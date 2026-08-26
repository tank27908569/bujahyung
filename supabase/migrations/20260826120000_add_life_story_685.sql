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
  'life-stories-685',
  'life-stories',
  685,
  '우리나라는 명백하게 사계절입니다. 😂',
  $body$어제 재미있게 본 <신병4> 명대사. 😂

“우리나라는 명백하게 사계절입니다.”

덥고. 존나 덥고. 춥고. 존나 춥고.

ㅋㅋㅋㅋㅋㅋ 요즘 날씨 생각하면 반박을 못 하겠네.

스친들은 어때? 우리나라 아직 사계절 맞지? 😂$body$,
  'assets/life-stories-685-four-extreme-seasons.png',
  null,
  true,
  now()
where not exists (
  select 1
  from public.posts
  where category = 'life-stories'
    and source_no = 685
);
