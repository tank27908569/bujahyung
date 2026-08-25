update public.posts
set
  cover_image_url = 'assets/library-02-clerks-death.png',
  cover_quote = '사람은 실수 때문에 무너지지 않는다. 그 실수를 붙잡는 마음 때문에 무너진다.'
where category = 'library'
  and source_no = 2;

