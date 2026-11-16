-- MakerWire AI — Supabase schema and Row Level Security
--
-- Run this once in the Supabase SQL editor (Project → SQL → New query → Run).
-- The app uses the *public* anon / publishable key only. Every row is scoped to
-- the signed-in user via auth.uid(); anonymous requests can read and write
-- nothing. Never put a service-role or secret key in the browser.

create table if not exists public.makerwire_workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  client_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.makerwire_workspaces is
  'One MakerWire workspace snapshot per authenticated user.';
comment on column public.makerwire_workspaces.data is
  'WorkspaceData v1: { version, projects, activeProjectId, customComponents }.';
comment on column public.makerwire_workspaces.client_updated_at is
  'Newest project updatedAt inside the snapshot, used for remote-newer detection.';

alter table public.makerwire_workspaces enable row level security;
-- Force RLS for table owners too (defence in depth).
alter table public.makerwire_workspaces force row level security;

-- Recreate policies safely when this script is re-run.
drop policy if exists "makerwire_select_own" on public.makerwire_workspaces;
drop policy if exists "makerwire_insert_own" on public.makerwire_workspaces;
drop policy if exists "makerwire_update_own" on public.makerwire_workspaces;
drop policy if exists "makerwire_delete_own" on public.makerwire_workspaces;

create policy "makerwire_select_own"
  on public.makerwire_workspaces
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "makerwire_insert_own"
  on public.makerwire_workspaces
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "makerwire_update_own"
  on public.makerwire_workspaces
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "makerwire_delete_own"
  on public.makerwire_workspaces
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Keep updated_at fresh on every write.
create or replace function public.makerwire_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists makerwire_workspaces_touch on public.makerwire_workspaces;
create trigger makerwire_workspaces_touch
  before update on public.makerwire_workspaces
  for each row execute function public.makerwire_touch_updated_at();

-- The app never issues DELETE except for an explicit account/workspace reset,
-- and the anon role has no table privileges beyond what RLS allows.
revoke all on public.makerwire_workspaces from anon;
grant select, insert, update, delete on public.makerwire_workspaces to authenticated;

-- Verification (optional): after signing in, this should return only your row.
-- select user_id, client_updated_at, updated_at from public.makerwire_workspaces;
