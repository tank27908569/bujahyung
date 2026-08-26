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
  'life-stories-686',
  'life-stories',
  686,
  '돈장사 15년 한 사람의 조언',
  $body$돈장사 15년 한 사람의 조언.

너무 사람을 믿지 마라.

돈이 움직이면
마음도 움직인다.

---

좋은 사람도.

돈 앞에서는
달라질 수 있다.

평소에는 의리 있고.

약속을 잘 지키던 사람도.

큰돈이 걸리면
생각이 달라지기도 한다.

15년 동안
수없이 봤다.

---

그래서 돈거래에서는.

사람을 믿기 전에
구조를 믿어야 한다.

계약서를 쓰고.

담보를 확인하고.

상환 능력을 보고.

최악의 상황까지
계산해야 한다.

---

이건 사람을
의심하라는 말이 아니다.

좋은 관계를
오래 지키기 위해서라도.

돈에는 원칙이
필요하다는 말이다.

---

사람은 믿어라.

하지만.

돈까지 믿고
맡기지는 마라.

돈이 움직이면
마음도 움직인다.

돈장사 15년 하며
몸으로 배운 것이다.$body$,
  'assets/life-stories-686-money-and-trust.png',
  null,
  true,
  now()
where not exists (
  select 1
  from public.posts
  where category = 'life-stories'
    and source_no = 686
);
