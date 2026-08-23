alter table public.consultation_inquiries
  drop constraint if exists consultation_inquiries_service_type_check;

alter table public.consultation_inquiries
  add constraint consultation_inquiries_service_type_check
  check (service_type in (
    'auction-consulting',
    'auction-course',
    'property-recommendation',
    'property-consulting',
    'winning-bid-consulting',
    'lending-business',
    'other'
  ));
