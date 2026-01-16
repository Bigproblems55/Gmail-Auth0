alter table app_users
  add column if not exists username text,
  add column if not exists bio text,
  add column if not exists phone text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists address_postal text,
  add column if not exists address_country text,
  add column if not exists role text default 'user',
  add column if not exists google_sub text;
