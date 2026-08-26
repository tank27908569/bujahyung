update public.posts
set
  cover_image_url = 'assets/life-stories-675-makgeolli-1.webp|assets/life-stories-675-makgeolli-2.webp|assets/life-stories-675-makgeolli-3.webp',
  updated_at = now()
where category = 'life-stories'
  and source_no = 675;
