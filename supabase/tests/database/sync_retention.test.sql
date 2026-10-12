begin;
create extension if not exists pgtap with schema extensions;
select plan(8);
insert into auth.users(id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('30000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','retention@example.test','',now(),now());
insert into public.sync_workspaces(id,owner_id) values ('c0000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003');
insert into public.sync_revisions(id,workspace_id,object_type,object_id,operation,client_sequence,idempotency_key,ciphertext,nonce)
select gen_random_uuid(),'c0000000-0000-4000-8000-000000000003','request','c1000000-0000-4000-8000-000000000003',case when n=22 then 'delete' else 'upsert' end,n,gen_random_uuid(),decode(repeat('ab',17),'hex'),decode(repeat('01',12),'hex') from generate_series(1,22) n;
set local role anon;
select throws_ok($$select public.prune_sync_revisions('c0000000-0000-4000-8000-000000000003',20)$$,'42501',null,'anonymous cannot invoke cleanup');
reset role;
select set_config('request.jwt.claims','{"sub":"40000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.prune_sync_revisions('c0000000-0000-4000-8000-000000000003',20)$$,'42501','Workspace unavailable','other owner cannot prune');
reset role;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.prune_sync_revisions('c0000000-0000-4000-8000-000000000003',0)$$,'P0001',null,'cannot remove latest tombstone with invalid retention');
select is(public.prune_sync_revisions('c0000000-0000-4000-8000-000000000003',20),2::bigint,'owner prunes oldest two');
select is((select count(*) from public.sync_revisions where workspace_id='c0000000-0000-4000-8000-000000000003'),20::bigint,'latest twenty retained');
select is((select operation from public.sync_revisions where workspace_id='c0000000-0000-4000-8000-000000000003' order by server_sequence desc limit 1),'delete','latest deletion marker retained');
select is(public.prune_sync_revisions('c0000000-0000-4000-8000-000000000003',20),0::bigint,'cleanup is idempotent');
select throws_ok($$insert into public.sync_revisions(id,workspace_id,object_type,object_id,operation,client_sequence,idempotency_key,ciphertext,nonce,server_sequence) values(gen_random_uuid(),'c0000000-0000-4000-8000-000000000003','request',gen_random_uuid(),'upsert',1,gen_random_uuid(),decode(repeat('aa',17),'hex'),decode(repeat('01',12),'hex'),999999)$$,'42501',null,'client cannot forge cursor sequence');
reset role;
select * from finish();
rollback;
