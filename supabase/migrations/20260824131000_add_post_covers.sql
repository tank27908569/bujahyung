alter table public.posts
  add column if not exists cover_image_url text,
  add column if not exists cover_quote text;

alter table public.posts
  drop constraint if exists posts_cover_image_url_length,
  drop constraint if exists posts_cover_quote_length;

alter table public.posts
  add constraint posts_cover_image_url_length check (cover_image_url is null or char_length(cover_image_url) <= 500),
  add constraint posts_cover_quote_length check (cover_quote is null or char_length(cover_quote) <= 200);
