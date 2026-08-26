update public.posts
set
  cover_image_url = 'assets/life-stories-679-flounder.webp',
  updated_at = now()
where category = 'life-stories'
  and source_no = 679;
