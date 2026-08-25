update public.posts
set
  cover_image_url = 'assets/library-10-great-gatsby.png',
  cover_quote = '돈으로 저택은 샀지만, 과거는 사지 못했다.'
where category = 'library'
  and source_no = 10;

