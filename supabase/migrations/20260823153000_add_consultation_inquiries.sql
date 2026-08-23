create table if not exists public.consultation_inquiries (
  id uuid primary key default gen_random_uuid(),
  service_type text not null check (service_type in ('auction-consulting', 'lending-business', 'other')),
  name text not null check (char_length(name) between 1 and 50),
  phone text not null check (char_length(phone) between 8 and 20),
  preferred_contact_time text not null default '' check (char_length(preferred_contact_time) <= 100),
  message text not null check (char_length(message) between 1 and 2000),
  status text not null default 'new' check (status in ('new', 'contacted', 'completed', 'archived')),
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists consultation_inquiries_set_updated_at on public.consultation_inquiries;
create trigger consultation_inquiries_set_updated_at
before update on public.consultation_inquiries
for each row execute function public.set_updated_at();

alter table public.consultation_inquiries enable row level security;
revoke all on table public.consultation_inquiries from anon, authenticated;
create index if not exists consultation_inquiries_created_at_idx on public.consultation_inquiries (created_at desc);
create index if not exists consultation_inquiries_status_idx on public.consultation_inquiries (status, created_at desc);
create index if not exists consultation_inquiries_ip_hash_idx on public.consultation_inquiries (ip_hash, created_at desc);
