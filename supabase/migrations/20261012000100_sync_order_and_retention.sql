-- Assign sequence numbers AFTER locking the workspace. An identity default alone
-- can commit out of order and make an incremental cursor skip a late transaction.
alter table public.sync_revisions alter column server_sequence drop identity;
create sequence public.sync_revisions_server_sequence_seq as bigint;
select setval('public.sync_revisions_server_sequence_seq',
  coalesce((select max(server_sequence) from public.sync_revisions), 1),
  exists(select 1 from public.sync_revisions));
revoke all on sequence public.sync_revisions_server_sequence_seq from public, anon;
grant usage on sequence public.sync_revisions_server_sequence_seq to authenticated;

create function public.assign_sync_sequence() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.sync_workspaces where id = new.workspace_id for update;
  if not found then raise exception 'Workspace unavailable' using errcode = '42501'; end if;
  new.server_sequence := nextval('public.sync_revisions_server_sequence_seq');
  return new;
end;
$$;
revoke all on function public.assign_sync_sequence() from public, anon;
grant execute on function public.assign_sync_sequence() to authenticated;
create trigger assign_sync_sequence before insert on public.sync_revisions
for each row execute function public.assign_sync_sequence();

-- Cleanup is owner-initiated, never automatic. Keep the latest tombstone/upsert
-- for EVERY object so old/offline clients can still converge. Referenced parents
-- are retained; current clients do not create parent-linked revision chains.
create function public.prune_sync_revisions(workspace uuid, keep_per_object integer default 20)
returns bigint language plpgsql security definer set search_path = '' as $$
declare removed bigint;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if keep_per_object not between 20 and 1000 then raise exception 'Keep between 20 and 1000 revisions per object'; end if;
  perform 1 from public.sync_workspaces where id = workspace and owner_id = auth.uid() for update;
  if not found then raise exception 'Workspace unavailable' using errcode = '42501'; end if;
  with ranked as (
    select id, row_number() over(partition by object_type, object_id order by server_sequence desc) as rank
    from public.sync_revisions where workspace_id = workspace
  )
  delete from public.sync_revisions r using ranked
  where r.id = ranked.id and r.workspace_id = workspace and ranked.rank > keep_per_object
    and not exists(select 1 from public.sync_revisions child where child.workspace_id = workspace and child.parent_revision_id = r.id);
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.prune_sync_revisions(uuid, integer) from public, anon;
grant execute on function public.prune_sync_revisions(uuid, integer) to authenticated;

create function public.sync_protocol_version() returns integer
language sql stable security invoker set search_path = '' as $$ select 2 $$;
revoke all on function public.sync_protocol_version() from public, anon;
grant execute on function public.sync_protocol_version() to authenticated;
