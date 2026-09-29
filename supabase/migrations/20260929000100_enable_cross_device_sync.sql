alter table public.sync_workspaces
  add column wrapped_key text,
  add column key_nonce text,
  add column key_salt text,
  add column key_iterations integer,
  add constraint sync_workspaces_owner_unique unique (owner_id),
  add constraint sync_workspace_wrapped_key_complete check (
    (wrapped_key is null and key_nonce is null and key_salt is null and key_iterations is null)
    or
    (wrapped_key is not null and key_nonce is not null and key_salt is not null and key_iterations between 100000 and 2000000)
  );

alter table public.sync_revisions
  add column server_sequence bigint generated always as identity;

drop index public.sync_revisions_workspace_created_idx;
create index sync_revisions_workspace_sequence_idx
  on public.sync_revisions (workspace_id, server_sequence);

comment on column public.sync_workspaces.wrapped_key is
  'Workspace key encrypted in the browser by a passphrase-derived key; never plaintext.';
comment on column public.sync_revisions.server_sequence is
  'Database-assigned total order used for deterministic latest-write-wins selection.';
