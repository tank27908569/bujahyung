update public.posts as target
set
  published_at = story_239.published_at - interval '1 second',
  updated_at = now()
from public.posts as story_239
where target.category = 'auction-stories'
  and target.source_no = 191
  and story_239.id = '68f0f339-1dc7-4616-ba8d-6c4cf99dfc81'
  and story_239.category = 'auction-stories';
