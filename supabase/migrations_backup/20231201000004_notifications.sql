
-- Notifications table
create table public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text,
  link text,
  is_read boolean default false,
  read_at timestamp with time zone,
  is_dismissed boolean default false,
  source_type text,
  source_id text,
  created_at timestamp with time zone default now()
);

-- RLS
alter table public.notifications enable row level security;

create policy "Users can view their own notifications"
  on public.notifications for select
  using ( auth.uid() = user_id );

create policy "Users can update their own notifications"
  on public.notifications for update
  using ( auth.uid() = user_id );

-- Allow inserting notifications for any user (server-side logic usually, but here RLS applies to client)
-- If we want users to send notifications to others, we need a policy.
-- For now, let's assume system sends them or we use service_role.
-- But if the client is creating notifications (e.g. chat), we need insert policy.

create policy "Users can insert notifications"
  on public.notifications for insert
  with check ( true ); -- Might want to restrict who can notify whom
