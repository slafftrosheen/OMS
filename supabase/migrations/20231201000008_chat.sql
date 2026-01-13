
-- Chat rooms
create table public.chat_rooms (
  id text primary key, -- Text ID to match existing usage (e.g. 'general')
  name text not null,
  room_type text default 'channel',
  is_private boolean default false,
  created_at timestamp with time zone default now()
);

-- Chat messages
create table public.chat_messages (
  id uuid default gen_random_uuid() primary key,
  room_id text references public.chat_rooms(id) on delete cascade,
  user_id uuid references auth.users(id),
  content text not null,
  attachments jsonb default '[]',
  created_at timestamp with time zone default now()
);

-- Index for chat messages
create index idx_chat_messages_room_id on public.chat_messages(room_id);
