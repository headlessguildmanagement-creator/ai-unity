"use client";
import {useState} from "react";
import type {Workspace,LocalTask} from "@/lib/types";
import {createTask,transitionTask} from "@/lib/runtime/tasks.mjs";
type Props={projectId:string;workspace:Workspace;onChange:(next:Workspace)=>void;disabled:boolean};
const availableCapabilities=["research","coding","content","quality-assurance","operations"];
export default function TaskBoard({projectId,workspace,onChange,disabled}:Props){
 const [title,setTitle]=useState("");
 const [capability,setCapability]=useState("research");
 const [evidenceByTask,setEvidenceByTask]=useState<Record<string,string>>({});
 const [error,setError]=useState("");
 const project=workspace.projects.find(p=>p.id===projectId);
 const tasks=workspace.tasks.filter(t=>t.projectId===projectId);
 function create(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!project||disabled)return;
  if(title.trim().length<3||title.trim().length>160){setError("Task title must be 3–160 characters.");return;}
  try{
   const task=createTask({id:crypto.randomUUID(),projectId,title:title.trim(),requiredCapability:capability});
   onChange({...workspace,tasks:[...workspace.tasks,task]});
   setTitle("");setError("");
  }catch(e){setError(e instanceof Error?e.message:"Could not create task")}
 }
 function move(task:LocalTask,state:LocalTask["state"],approvalId:string|null=null){
  if(disabled||!project)return;
  try{
   const evidence=evidenceByTask[task.id]||"";
   const refs=state==="completed"?evidence.split("\n").map(x=>x.trim()).filter(Boolean):[];
   const next=transitionTask(task,{state,actor:"local-user",reason:"Manually changed in local preview",
    expectedRevision:task.revision,evidence:refs,approvalId});
   onChange({...workspace,tasks:workspace.tasks.map(t=>t.id===task.id?next:t)});
   if(state==="completed"||state==="cancelled")setEvidenceByTask(old=>{const copy={...old};delete copy[task.id];return copy});
   setError("");
  }catch(e){setError(e instanceof Error?e.message:"Could not change task state")}
 }
 return <section className="panel">
  <h2>Task planning</h2>
  <p className="muted">Local-only task board. Tasks do not activate AI agents or make external changes. Approval IDs here are demonstrations; a live system will require authenticated, scoped server-side approvals.</p>
  {!project?<p>Select or create a project to manage its tasks.</p>:<>
   <form onSubmit={create}>
    <label>New task<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={160} placeholder="Inspect repository structure"/></label>
    <label>Needed capability<select value={capability} onChange={e=>setCapability(e.target.value)}>{availableCapabilities.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    <button className="primary" disabled={disabled||!title.trim()}>Add draft task</button>
   </form>
   {error&&<p role="alert" className="warning">{error}</p>}
   <div className="entry"><strong>{tasks.length} local tasks for {project.name}</strong></div>
   {tasks.length===0?<p className="muted">No tasks yet.</p>:tasks.map(task=>{const evidence=evidenceByTask[task.id]||"";return <article className="entry" key={task.id}>
    <div className="entry-head"><strong>{task.title}</strong><span className="pill">{task.state}</span></div>
    <p className="muted">Capability: {task.requiredCapability} · Revision {task.revision}</p>
    {task.state==="running"&&<label>Completion evidence reference(s), one per line<textarea value={evidence} onChange={e=>setEvidenceByTask(old=>({...old,[task.id]:e.target.value}))} placeholder="e.g. GitHub commit SHA, test run URL"/></label>}
    <div className="controls">
      {task.state==="draft"&&<button disabled={disabled} onClick={()=>move(task,"queued")}>Queue locally</button>}
      {task.state==="queued"&&<button disabled={disabled} onClick={()=>move(task,"running")}>Mark in progress</button>}
      {task.state==="running"&&<><button disabled={disabled} onClick={()=>move(task,"awaiting_approval")}>Request approval</button><button disabled={disabled} onClick={()=>move(task,"failed")}>Mark failed</button><button disabled={disabled||!evidence.trim()} onClick={()=>move(task,"completed")}>Mark complete with evidence</button></>}
      {task.state==="awaiting_approval"&&<button disabled={disabled} onClick={()=>move(task,"queued",crypto.randomUUID())}>Approve local resumption</button>}
      {task.state==="failed"&&<button disabled={disabled} onClick={()=>move(task,"queued")}>Retry locally</button>}
      {!["cancelled","completed"].includes(task.state)&&<button disabled={disabled} onClick={()=>move(task,"cancelled")}>Cancel</button>}
    </div>
    {task.evidence.length>0&&<p className="muted">Recorded evidence references: {task.evidence.join(", ")}</p>}
    {task.history.length>0&&<small>{task.history.length} recorded state transition(s)</small>}
   </article>})}
  </>}
 </section>;
}
