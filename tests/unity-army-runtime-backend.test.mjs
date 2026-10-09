import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration=fs.readFileSync(new URL("../supabase/migrations/0002_unity_army_runtime.sql",import.meta.url),"utf8");
const store=fs.readFileSync(new URL("../lib/army/store.ts",import.meta.url),"utf8");
const snapshotRoute=fs.readFileSync(new URL("../app/api/private/army/snapshot/route.ts",import.meta.url),"utf8");
const taskRoute=fs.readFileSync(new URL("../app/api/private/army/tasks/route.ts",import.meta.url),"utf8");
const heartbeatRoute=fs.readFileSync(new URL("../app/api/private/army/heartbeat/route.ts",import.meta.url),"utf8");

test("UNITY Army runtime persistence has trusted-write tables, owner scope and RLS",()=>{
 for(const table of ["army_agents","army_tasks","army_heartbeats","army_events"]){
  assert.match(migration,new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`));
 }
 assert.match(migration,/primary key \(owner_id, id\)/i);
 assert.match(migration,/foreign key \(owner_id, assigned_agent_id\)/i);
 assert.match(store,/onConflict:\"owner_id,id\"/);
 assert.match(migration,/No browser insert\/update\/delete policies by design/i);
 assert.doesNotMatch(migration,/create policy[^;]+for insert/is);
});

test("UNITY Army snapshot reads persisted runtime state",()=>{
 assert.match(snapshotRoute,/loadArmySnapshot\(user\.id\)/);
 assert.match(snapshotRoute,/source:\"supabase-runtime\"/);
 assert.match(snapshotRoute,/liveStateConnected:true/);
 assert.match(store,/army_tasks/);
 assert.match(store,/army_heartbeats/);
});

test("UNITY Army write routes enforce origin, authentication and bounded bodies",()=>{
 for(const route of [taskRoute,heartbeatRoute]){
  assert.match(route,/checkWriteOrigin/);
  assert.match(route,/readBoundedJson/);
  assert.match(route,/getVerifiedUser/);
  assert.match(route,/isSupabaseAdminConfigured/);
 }
});

test("UNITY Army assignments enforce specialty, project and parent ownership",()=>{
 assert.match(store,/canAgentAcceptArea\(agent,area\)/);
 assert.match(store,/Project not found for this UNITY owner/);
 assert.match(store,/Parent task not found for this UNITY owner/);
 assert.match(store,/TASK_ASSIGNED/);
 assert.match(store,/army_events/);
});

test("UNITY Army heartbeats cannot hijack another owner or agent task",()=>{
 assert.match(store,/Army task not found for this UNITY owner/);
 assert.match(store,/Army task is assigned to a different agent/);
 assert.match(store,/eq\(\"assigned_agent_id\",agentId\)/);
 assert.match(store,/HEARTBEAT/);
});
