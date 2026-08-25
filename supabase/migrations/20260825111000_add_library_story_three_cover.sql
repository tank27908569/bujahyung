update public.posts
set
  cover_image_url = 'assets/library-03-grasshopper.png',
  cover_quote = '사랑은 잃고 나서 증명하는 것이 아니라, 곁에 있을 때 표현하는 것.'
where category = 'library'
  and source_no = 3;

