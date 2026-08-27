update public.posts as target
set
  published_at = story_652.published_at
    + ((story_653.published_at - story_652.published_at) / 2),
  updated_at = now()
from public.posts as story_653,
     public.posts as story_652
where target.id = 'cc59e3fc-7f01-4583-b00c-a08927fd419a'
  and target.category = 'life-stories'
  and story_653.category = 'life-stories'
  and story_653.source_no = 653
  and story_652.category = 'life-stories'
  and story_652.source_no = 652;
