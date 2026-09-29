create table public.sync_workspaces (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  format_version integer not null default 1 check (format_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sync_workspaces_owner_id_idx on public.sync_workspaces (owner_id);

create table public.sync_revisions (
  id uuid primary key,
  workspace_id uuid not null references public.sync_workspaces (id) on delete cascade,
  object_type text not null check (object_type in ('collection', 'request', 'environment')),
  object_id uuid not null,
  operation text not null check (operation in ('upsert', 'delete')),
  client_sequence bigint not null check (client_sequence > 0),
  parent_revision_id uuid,
  idempotency_key uuid not null,
  envelope_version integer not null default 1 constraint sync_revisions_envelope_version_check check (envelope_version = 1),
  ciphertext bytea not null constraint sync_revisions_ciphertext_size_check check (octet_length(ciphertext) between 17 and 1048592),
  nonce bytea not null constraint sync_revisions_nonce_size_check check (octet_length(nonce) = 12),
  algorithm text not null default 'AES-GCM-256-v1' constraint sync_revisions_algorithm_check check (algorithm = 'AES-GCM-256-v1'),
  author_device_id uuid,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, idempotency_key),
  constraint sync_revisions_parent_fk foreign key (workspace_id, parent_revision_id)
    references public.sync_revisions (workspace_id, id)
    deferrable initially deferred
);

create index sync_revisions_workspace_created_idx
  on public.sync_revisions (workspace_id, created_at);

alter table public.sync_workspaces enable row level security;
alter table public.sync_revisions enable row level security;

revoke all on public.sync_workspaces from anon, authenticated;
revoke all on public.sync_revisions from anon, authenticated;
grant select, insert, update, delete on public.sync_workspaces to authenticated;
grant select on public.sync_revisions to authenticated;
grant insert (
  id, workspace_id, object_type, object_id, operation, client_sequence,
  parent_revision_id, idempotency_key, envelope_version, ciphertext, nonce,
  algorithm, author_device_id
) on public.sync_revisions to authenticated;

create policy "owners can read their sync workspace"
  on public.sync_workspaces for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "owners can create their sync workspace"
  on public.sync_workspaces for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "owners can update their sync workspace"
  on public.sync_workspaces for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "owners can delete their sync workspace"
  on public.sync_workspaces for delete to authenticated
  using ((select auth.uid()) = owner_id);

create policy "owners can read their encrypted revisions"
  on public.sync_revisions for select to authenticated
  using (
    exists (
      select 1 from public.sync_workspaces workspace
      where workspace.id = sync_revisions.workspace_id
        and workspace.owner_id = (select auth.uid())
    )
  );

create policy "owners can append encrypted revisions"
  on public.sync_revisions for insert to authenticated
  with check (
    exists (
      select 1 from public.sync_workspaces workspace
      where workspace.id = sync_revisions.workspace_id
        and workspace.owner_id = (select auth.uid())
    )
  );

comment on table public.sync_revisions is
  'Append-only encrypted sync payloads. The browser must encrypt before insert; plaintext and active credentials do not belong here.';
