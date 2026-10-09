import "server-only";
import roster from "@/config/unity-army-roster.json";
import {createSupabaseAdmin} from "@/lib/supabase/admin";
import {buildArmySnapshot,canAgentAcceptArea,validateArmyRoster} from "@/lib/army/control-plane.mjs";

const VALID_STATUSES=new Set(["IDLE","ASSIGNED","WORKING","WAITING","BLOCKED","REVIEWING","READY_FOR_REVIEW","PAUSED","FAILED","DONE","CANCELLED","STALE"]);

function cleanText(value: unknown,name:string,max=240):string{
 if(typeof value!=="string"||!value.trim())throw new TypeError(`${name} must be a non-empty string`);
 const result=value.trim();
 if(result.length>max)throw new TypeError(`${name} is too long`);
 return result;
}

export async function ensureArmyRoster(ownerId:string){
 validateArmyRoster(roster);
 const admin=createSupabaseAdmin();
 const rows=roster.agents.map((agent:any)=>({
  id:agent.id,
  owner_id:ownerId,
  name:agent.name,
  department:agent.department,
  level:agent.level,
  reports_to:agent.reportsTo,
  enabled:true,
  updated_at:new Date().toISOString()
 }));
 const {error}=await admin.from("army_agents").upsert(rows,{onConflict:"owner_id,id"});
 if(error)throw new Error(`Unable to sync UNITY Army roster: ${error.message}`);
}

export async function loadArmySnapshot(ownerId:string){
 await ensureArmyRoster(ownerId);
 const admin=createSupabaseAdmin();
 const [{data:tasks,error:taskError},{data:heartbeats,error:heartbeatError}]=await Promise.all([
  admin.from("army_tasks").select("id,title,assigned_agent_id,status,progress_current,progress_total,branch,blocked_by,updated_at").eq("owner_id",ownerId).not("assigned_agent_id","is",null).order("updated_at",{ascending:false}),
  admin.from("army_heartbeats").select("agent_id,task_id,status,last_action,progress_current,progress_total,branch,blocked_by,heartbeat_at").eq("owner_id",ownerId)
 ]);
 if(taskError)throw new Error(`Unable to load Army tasks: ${taskError.message}`);
 if(heartbeatError)throw new Error(`Unable to load Army heartbeats: ${heartbeatError.message}`);
 const latestTaskByAgent=new Map<string,any>();
 for(const task of tasks??[]){if(task.assigned_agent_id&&!latestTaskByAgent.has(task.assigned_agent_id))latestTaskByAgent.set(task.assigned_agent_id,task);}
 const heartbeatByAgent=new Map((heartbeats??[]).map((row:any)=>[row.agent_id,row]));
 const states=roster.agents.map((agent:any)=>{
  const task=latestTaskByAgent.get(agent.id);
  const heartbeat=heartbeatByAgent.get(agent.id);
  return {
   agentId:agent.id,
   status:heartbeat?.status??task?.status??"IDLE",
   taskId:heartbeat?.task_id??task?.id??null,
   taskTitle:task?.title??null,
   progressCurrent:heartbeat?.progress_current??task?.progress_current??null,
   progressTotal:heartbeat?.progress_total??task?.progress_total??null,
   lastHeartbeatAt:heartbeat?.heartbeat_at??null,
   lastAction:heartbeat?.last_action??null,
   blockedBy:heartbeat?.blocked_by??task?.blocked_by??[],
   branch:heartbeat?.branch??task?.branch??null
  };
 });
 return buildArmySnapshot(roster,states);
}

export async function createArmyTask(ownerId:string,input:any){
 await ensureArmyRoster(ownerId);
 const title=cleanText(input?.title,"title");
 const area=cleanText(input?.area,"area",120);
 const agentId=cleanText(input?.agentId,"agentId",120);
 const agent=(roster.agents as any[]).find((item)=>item.id===agentId);
 if(!agent)throw new Error("Unknown UNITY Army agent");
 const scope=canAgentAcceptArea(agent,area);
 if(!scope.allowed)throw new Error(scope.reason);
 const admin=createSupabaseAdmin();
 const projectId=typeof input?.projectId==="string"&&input.projectId.trim()?input.projectId.trim():null;
 if(projectId){
  const {data:project,error:projectError}=await admin.from("projects").select("id").eq("id",projectId).eq("owner_id",ownerId).maybeSingle();
  if(projectError)throw new Error(`Unable to validate project: ${projectError.message}`);
  if(!project)throw new Error("Project not found for this UNITY owner");
 }
 const now=new Date().toISOString();
 const payload={
  owner_id:ownerId,
  project_id:projectId,
  title,
  area,
  assigned_agent_id:agentId,
  parent_task_id:typeof input?.parentTaskId==="string"&&input.parentTaskId.trim()?input.parentTaskId.trim():null,
  status:"ASSIGNED",
  progress_current:0,
  progress_total:Number.isFinite(input?.progressTotal)?Math.max(0,Math.floor(input.progressTotal)):null,
  branch:typeof input?.branch==="string"&&input.branch.trim()?input.branch.trim().slice(0,240):null,
  blocked_by:[],
  updated_at:now
 };
 const {data,error}=await admin.from("army_tasks").insert(payload).select("*").single();
 if(error)throw new Error(`Unable to create Army task: ${error.message}`);
 await Promise.all([
  admin.from("army_heartbeats").upsert({owner_id:ownerId,agent_id:agentId,task_id:data.id,status:"ASSIGNED",last_action:`Assigned: ${title}`,progress_current:0,progress_total:payload.progress_total,branch:payload.branch,blocked_by:[],heartbeat_at:now},{onConflict:"owner_id,agent_id"}),
  admin.from("army_events").insert({owner_id:ownerId,agent_id:agentId,task_id:data.id,event_type:"TASK_ASSIGNED",message:title,payload:{area,projectId:payload.project_id}})
 ]);
 return data;
}

export async function recordArmyHeartbeat(ownerId:string,input:any){
 const agentId=cleanText(input?.agentId,"agentId",120);
 const agent=(roster.agents as any[]).find((item)=>item.id===agentId);
 if(!agent)throw new Error("Unknown UNITY Army agent");
 const status=cleanText(input?.status,"status",40);
 if(!VALID_STATUSES.has(status))throw new Error("Invalid Army status");
 const admin=createSupabaseAdmin();
 const now=new Date().toISOString();
 const row={
  owner_id:ownerId,
  agent_id:agentId,
  task_id:typeof input?.taskId==="string"&&input.taskId.trim()?input.taskId.trim():null,
  status,
  last_action:typeof input?.lastAction==="string"?input.lastAction.trim().slice(0,500)||null:null,
  progress_current:Number.isFinite(input?.progressCurrent)?Math.max(0,Math.floor(input.progressCurrent)):null,
  progress_total:Number.isFinite(input?.progressTotal)?Math.max(0,Math.floor(input.progressTotal)):null,
  branch:typeof input?.branch==="string"?input.branch.trim().slice(0,240)||null:null,
  blocked_by:Array.isArray(input?.blockedBy)?input.blockedBy.filter((v:any)=>typeof v==="string").slice(0,20):[],
  heartbeat_at:now
 };
 const {error}=await admin.from("army_heartbeats").upsert(row,{onConflict:"owner_id,agent_id"});
 if(error)throw new Error(`Unable to record Army heartbeat: ${error.message}`);
 if(row.task_id){
  const {error:taskError}=await admin.from("army_tasks").update({status:row.status,progress_current:row.progress_current,progress_total:row.progress_total,branch:row.branch,blocked_by:row.blocked_by,updated_at:now}).eq("id",row.task_id).eq("owner_id",ownerId);
  if(taskError)throw new Error(`Unable to update Army task: ${taskError.message}`);
 }
 await admin.from("army_events").insert({owner_id:ownerId,agent_id:agentId,task_id:row.task_id,event_type:"HEARTBEAT",message:row.last_action??status,payload:{status,progressCurrent:row.progress_current,progressTotal:row.progress_total}});
 return row;
}
