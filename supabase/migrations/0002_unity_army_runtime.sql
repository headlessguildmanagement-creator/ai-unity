-- UNITY Army runtime persistence.
-- Trusted backend code owns writes; browser clients remain read-only through private API routes.
-- Built-in agent keys are owner-scoped so multiple UNITY users can run the same roster safely.

create table if not exists public.army_agents (
  id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  department text not null,
  level text not null check (level in ('principal','lead','specialist','reviewer')),
  reports_to text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  foreign key (owner_id, reports_to) references public.army_agents(owner_id, id)
);

create table if not exists public.army_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  title text not null,
  area text not null,
  assigned_agent_id text,
  parent_task_id uuid references public.army_tasks(id),
  status text not null default 'ASSIGNED' check (status in ('IDLE','ASSIGNED','WORKING','WAITING','BLOCKED','REVIEWING','READY_FOR_REVIEW','PAUSED','FAILED','DONE','CANCELLED','STALE')),
  progress_current integer,
  progress_total integer,
  branch text,
  blocked_by jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_id, assigned_agent_id) references public.army_agents(owner_id, id)
);

create table if not exists public.army_heartbeats (
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id text not null,
  task_id uuid references public.army_tasks(id) on delete cascade,
  status text not null,
  last_action text,
  progress_current integer,
  progress_total integer,
  branch text,
  blocked_by jsonb not null default '[]'::jsonb,
  heartbeat_at timestamptz not null default now(),
  primary key (owner_id, agent_id),
  foreign key (owner_id, agent_id) references public.army_agents(owner_id, id) on delete cascade
);

create table if not exists public.army_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id text,
  task_id uuid references public.army_tasks(id),
  event_type text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (owner_id, agent_id) references public.army_agents(owner_id, id)
);

create index if not exists army_tasks_owner_status_idx on public.army_tasks(owner_id,status,updated_at desc);
create index if not exists army_events_owner_created_idx on public.army_events(owner_id,created_at desc);

alter table public.army_agents enable row level security;
alter table public.army_tasks enable row level security;
alter table public.army_heartbeats enable row level security;
alter table public.army_events enable row level security;

drop policy if exists army_agents_owner_read on public.army_agents;
drop policy if exists army_tasks_owner_read on public.army_tasks;
drop policy if exists army_heartbeats_owner_read on public.army_heartbeats;
drop policy if exists army_events_owner_read on public.army_events;

create policy army_agents_owner_read on public.army_agents for select using (auth.uid() = owner_id);
create policy army_tasks_owner_read on public.army_tasks for select using (auth.uid() = owner_id);
create policy army_heartbeats_owner_read on public.army_heartbeats for select using (auth.uid() = owner_id);
create policy army_events_owner_read on public.army_events for select using (auth.uid() = owner_id);

-- No browser insert/update/delete policies by design. The service-role backend performs state transitions.
