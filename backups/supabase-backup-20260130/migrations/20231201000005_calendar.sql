
-- Calendar events
create table public.calendar_events (
  id uuid default gen_random_uuid() primary key,
  kind text not null check (kind in ('loading', 'meeting', 'reminder')),
  date date not null,
  title text,
  note text,
  created_at timestamp with time zone default now()
);

-- Loading events (inherits/extends calendar_events)
create table public.loading_events (
  id uuid references public.calendar_events(id) on delete cascade primary key,
  carrier text,
  window_start time,
  window_end time
);

-- Meeting events (inherits/extends calendar_events)
create table public.meeting_events (
  id uuid references public.calendar_events(id) on delete cascade primary key,
  start_time time,
  end_time time,
  location text,
  attendees text[] default array[]::text[]
);

-- Loading event POs (join table)
create table public.loading_event_pos (
  id uuid default gen_random_uuid() primary key,
  loading_event_id uuid references public.loading_events(id) on delete cascade,
  draft_order_id uuid references public.draft_orders(id) on delete cascade
);
