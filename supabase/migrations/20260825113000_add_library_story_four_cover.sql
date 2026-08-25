update public.posts
set
  cover_image_url = 'assets/library-04-life-is-now.png',
  cover_quote = '인생은 쌓인 설거지가 아니야. 지금도 흘러가고 있잖아.'
where category = 'library'
  and source_no = 4;

