begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

select has_table('public', 'sync_workspaces', 'sync workspaces table exists');
select has_table('public', 'sync_revisions', 'sync revisions table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.sync_workspaces'::regclass),
  'workspace RLS is enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.sync_revisions'::regclass),
  'revision RLS is enabled'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@example.test', '', now(), now()),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@example.test', '', now(), now());

insert into public.sync_workspaces (id, owner_id)
values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002');

insert into public.sync_revisions (
  id, workspace_id, object_type, object_id, operation, client_sequence, idempotency_key, ciphertext, nonce
)
values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'request', 'a2000000-0000-4000-8000-000000000001', 'upsert', 1, 'a5000000-0000-4000-8000-000000000001', decode(repeat('a1', 17), 'hex'), decode(repeat('01', 12), 'hex')),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'request', 'b2000000-0000-4000-8000-000000000002', 'upsert', 1, 'b5000000-0000-4000-8000-000000000002', decode(repeat('b2', 17), 'hex'), decode(repeat('02', 12), 'hex'));

set local role anon;
select throws_ok(
  $$ select count(*) from public.sync_workspaces $$,
  '42501',
  'permission denied for table sync_workspaces',
  'anonymous users cannot read workspaces'
);
select throws_ok(
  $$ select count(*) from public.sync_revisions $$,
  '42501',
  'permission denied for table sync_revisions',
  'anonymous users cannot read revisions'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select results_eq(
  $$ select id from public.sync_workspaces order by id $$,
  $$ values ('a0000000-0000-4000-8000-000000000001'::uuid) $$,
  'Alice sees only her workspace'
);
select results_eq(
  $$ select id from public.sync_revisions order by id $$,
  $$ values ('a1000000-0000-4000-8000-000000000001'::uuid) $$,
  'Alice sees only her encrypted revision'
);
select is_empty(
  $$ update public.sync_workspaces set format_version = 2
     where id = 'b0000000-0000-4000-8000-000000000002'
     returning id $$,
  'Alice cannot update Bob workspace'
);
select is_empty(
  $$ delete from public.sync_workspaces
     where id = 'b0000000-0000-4000-8000-000000000002'
     returning id $$,
  'Alice cannot delete Bob workspace'
);
select throws_ok(
  $$ insert into public.sync_revisions (
       id, workspace_id, object_type, object_id, operation, client_sequence, idempotency_key, ciphertext, nonce
     ) values (
       'a3000000-0000-4000-8000-000000000001',
       'b0000000-0000-4000-8000-000000000002',
       'request',
       'a4000000-0000-4000-8000-000000000001',
       'upsert', 2, 'a5000000-0000-4000-8000-000000000003', decode(repeat('aa', 17), 'hex'), decode(repeat('03', 12), 'hex')
     ) $$,
  '42501',
  'new row violates row-level security policy for table "sync_revisions"',
  'Alice cannot append to Bob workspace'
);
select lives_ok(
  $$ insert into public.sync_revisions (
       id, workspace_id, object_type, object_id, operation, client_sequence, idempotency_key, ciphertext, nonce
     ) values (
       'a3000000-0000-4000-8000-000000000002',
       'a0000000-0000-4000-8000-000000000001',
       'request',
       'a4000000-0000-4000-8000-000000000002',
       'upsert', 2, 'a5000000-0000-4000-8000-000000000004', decode(repeat('aa', 17), 'hex'), decode(repeat('03', 12), 'hex')
     ) $$,
  'Alice can append an encrypted revision to her workspace'
);
select throws_ok(
  $$ update public.sync_revisions set ciphertext = decode('ff', 'hex')
     where id = 'a1000000-0000-4000-8000-000000000001' $$,
  '42501',
  'permission denied for table sync_revisions',
  'authenticated clients cannot rewrite append-only revisions'
);
select lives_ok(
  $$ insert into public.sync_revisions (
       id, workspace_id, object_type, object_id, operation, client_sequence, idempotency_key, ciphertext, nonce
     ) values (
       'a3000000-0000-4000-8000-000000000005',
       'a0000000-0000-4000-8000-000000000001',
       'request', 'a4000000-0000-4000-8000-000000000005',
       'upsert', 2, 'a5000000-0000-4000-8000-000000000005', decode(repeat('ab', 17), 'hex'), decode(repeat('04', 12), 'hex')
     ) $$,
  'concurrent revisions may share a client sequence without overwriting each other'
);
select throws_ok(
  $$ insert into public.sync_revisions (
       id, workspace_id, object_type, object_id, operation, client_sequence, idempotency_key, ciphertext, nonce
     ) values (
       'a3000000-0000-4000-8000-000000000006',
       'a0000000-0000-4000-8000-000000000001',
       'request', 'a4000000-0000-4000-8000-000000000006',
       'upsert', 3, 'a5000000-0000-4000-8000-000000000004', decode(repeat('ac', 17), 'hex'), decode(repeat('05', 12), 'hex')
     ) $$,
  '23505', null,
  'an idempotency key cannot create duplicate revisions'
);
select throws_ok(
  $$ insert into public.sync_revisions (
       id, workspace_id, object_type, object_id, operation, client_sequence, idempotency_key, ciphertext, nonce
     ) values (
       'a3000000-0000-4000-8000-000000000007',
       'a0000000-0000-4000-8000-000000000001',
       'request', 'a4000000-0000-4000-8000-000000000007',
       'upsert', 3, 'a5000000-0000-4000-8000-000000000007', decode(repeat('ad', 17), 'hex'), decode('01', 'hex')
     ) $$,
  '23514', null,
  'non-standard AES-GCM nonces are rejected'
);
select throws_ok(
  $$ insert into public.sync_revisions (
       id, workspace_id, object_type, object_id, operation, client_sequence, idempotency_key, ciphertext, nonce, algorithm
     ) values (
       'a3000000-0000-4000-8000-000000000008',
       'a0000000-0000-4000-8000-000000000001',
       'request', 'a4000000-0000-4000-8000-000000000008',
       'upsert', 3, 'a5000000-0000-4000-8000-000000000008', decode(repeat('ae', 17), 'hex'), decode(repeat('06', 12), 'hex'), 'plaintext'
     ) $$,
  '23514', null,
  'unknown or plaintext algorithms are rejected'
);
select throws_ok(
  $$ insert into public.sync_revisions (
       id, workspace_id, object_type, object_id, operation, client_sequence, idempotency_key, ciphertext, nonce
     ) values (
       'a3000000-0000-4000-8000-000000000009',
       'a0000000-0000-4000-8000-000000000001',
       'request', 'a4000000-0000-4000-8000-000000000009',
       'upsert', 3, 'a5000000-0000-4000-8000-000000000009', decode(repeat('af', 1048593), 'hex'), decode(repeat('07', 12), 'hex')
     ) $$,
  '23514', null,
  'oversized encrypted revisions are rejected'
);
select throws_ok(
  $$ insert into public.sync_revisions (
       id, workspace_id, object_type, object_id, operation, client_sequence, idempotency_key, ciphertext, nonce, created_at
     ) values (
       'a3000000-0000-4000-8000-000000000010',
       'a0000000-0000-4000-8000-000000000001',
       'request', 'a4000000-0000-4000-8000-000000000010',
       'upsert', 3, 'a5000000-0000-4000-8000-000000000010', decode(repeat('b0', 17), 'hex'), decode(repeat('08', 12), 'hex'), '2000-01-01'
     ) $$,
  '42501', null,
  'clients cannot forge server revision timestamps'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select results_eq(
  $$ select id from public.sync_workspaces order by id $$,
  $$ values ('b0000000-0000-4000-8000-000000000002'::uuid) $$,
  'Bob sees only his workspace'
);
select results_eq(
  $$ select id from public.sync_revisions order by id $$,
  $$ values ('b1000000-0000-4000-8000-000000000002'::uuid) $$,
  'Bob sees only his encrypted revision'
);
select throws_ok(
  $$ insert into public.sync_workspaces (id, owner_id)
     values ('b3000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001') $$,
  '42501',
  'new row violates row-level security policy for table "sync_workspaces"',
  'Bob cannot create a workspace owned by Alice'
);
select is_empty(
  $$ delete from public.sync_workspaces
     where id = 'a0000000-0000-4000-8000-000000000001'
     returning id $$,
  'Bob cannot delete Alice workspace'
);

reset role;
select * from finish();
rollback;
