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
  'life-stories-684',
  'life-stories',
  684,
  '나 같은 고급 인력을 식당 서빙에 쓴다고? 😂',
  $body$회의 중인데 식당 하는 친구에게 전화가 왔다.

목소리가 다급해서 회의 중간에 받았다.

“오늘 예약 손님이 많은데 알바가 갑자기 못 온대. 서빙 좀 해주면 안 되냐?”

옆에서 듣던 우리 직원이 한마디 한다.

“대표님 같은 고급 인력을 그런 데 쓰신다고요?”

내가 말했다.

“얼마나 급하면 나한테까지 전화했겠냐.”

회의하다 말고 나 지금 식당 서빙하러 간다. ㅋㅋ

사람 사는 게 뭐 있나.
친구 힘들 때 손 한번 보태주는 거지.

오늘만큼은 경매하는 부자형 아니고,
서빙하는 부자형이다. 🤣

단, 울 와이프한테는 비밀이다.
알면 분명 한마디 한다.

“집에서는 그렇게 안 하면서?”$body$,
  'assets/life-stories-684-serving-bujahyung.png',
  null,
  true,
  now()
where not exists (
  select 1
  from public.posts
  where category = 'life-stories'
    and source_no = 684
);
