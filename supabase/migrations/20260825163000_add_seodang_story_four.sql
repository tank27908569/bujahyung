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
  'thread-seodang-004',
  'thread-seodang',
  4,
  '先勝求戰 (선승구전)',
  $body$先勝求戰 (선승구전)

이길 준비를 한 뒤
싸운다.

경매장에서 가장 위험한 사람은
용감한 사람이 아니다.
준비 없이
‘용감한’ 사람이다.

권리분석도 없이 입찰하고,
현장도 제대로 보지 않고 낙찰부터 받고,
출구전략도 없이 자금을 쏟아붓는다.

용기가 없어서 진 게 아니다.

‘준비’가 없어서
진 것이다.

고수는
입찰장에서 승부를 보지 않는다.

입찰표를 내기 전에
승부를 끝내놓는다.

이 물건을 낙찰받아야 하는지,

얼마에 받아야 수익이 나는지,

명도는 어떻게 풀 것인지,

세금과 비용을 빼고도
남는 것이 있는지,

어떻게 빠져나올 것인지.

그리고 마지막으로
자신이 지켜야 할
‘최종 가격’을 정한다.

준비가 끝나면
입찰장에서 할 일은 단순하다.

정해놓은 가격을 쓰고
결과를 기다리는 것이다.

낙찰받고 싶은 욕심에
현장에서 가격을 올리는 순간,

승부의 기준은
‘수익’에서 ‘단순 낙찰’로 바뀐다.

낙찰은
승리가 아니다.

수익을 남기고
안전하게 빠져나오는 것까지가
진짜 승부다.

투자도,
인생도 같다.

기회가 왔을 때
준비하는 사람이 아니라,

기회가 오기 전에
준비해둔 사람이 잡는다.

先勝求戰.

준비 없는 용기는
무모함이다.

입찰장에서
이기려고 하지 마라.

싸우기 전에
이미 이겨놓아라.

준비가 곧 실력이다. 🌿$body$,
  'assets/seodang-04-seonseunggijeon.png',
  null,
  true,
  now()
where not exists (
  select 1
  from public.posts
  where category = 'thread-seodang'
    and source_no = 4
);
