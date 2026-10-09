"use client";
import {useEffect,useState} from "react";
import {Clock3,PlayCircle,ShieldCheck,Workflow} from "lucide-react";
import type {Workspace,AutomationPlan} from "@/lib/types";

type Props={projectId:string;workspace:Workspace;onChange:(next:Workspace)=>void;disabled:boolean};

export default function AutomationRoom({projectId,workspace,onChange,disabled}:Props){
 const [name,setName]=useState("");
 const [trigger,setTrigger]=useState<AutomationPlan["trigger"]>("manual");
 const [action,setAction]=useState("");
 const project=workspace.projects.find(p=>p.id===projectId);
 const plans=workspace.automations.filter(a=>a.projectId===projectId);
 useEffect(()=>{setName("");setTrigger("manual");setAction("");},[projectId]);
 function create(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault(); if(!project||disabled)return;
  const title=name.trim(),step=action.trim();
  if(title.length<3||step.length<3)return;
  const now=new Date().toISOString();
  const plan:AutomationPlan={id:crypto.randomUUID(),projectId,title,trigger,action:step,status:"draft",createdAt:now,updatedAt:now};
  onChange({...workspace,automations:[...workspace.automations,plan]});
  setName("");setAction("");
 }
 function remove(id:string){onChange({...workspace,automations:workspace.automations.filter(a=>a.id!==id)});}
 return <div className="automation-room">
  <section className="panel automation-intro">
   <div className="automation-icon"><Workflow size={22}/></div>
   <div><span className="section-overline">AUTOMATIONS</span><h2>Repeatable work belongs here.</h2>
   <p>Design routines without mixing them into Projects or Tasks. These drafts do not run anything yet; live schedules and external actions will activate only after the relevant connectors and approval rules are verified.</p></div>
  </section>
  <div className="columns">
   <section className="panel"><h2>New automation draft</h2>
    {!project?<p className="muted">Choose a project first.</p>:<form onSubmit={create}>
     <label>Name<input minLength={3} maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="Morning client update"/></label>
     <label>Starts when<select value={trigger} onChange={e=>setTrigger(e.target.value as AutomationPlan["trigger"])}>
      <option value="manual">I run it</option><option value="schedule">A schedule happens</option><option value="event">A connected app event happens</option>
     </select></label>
     <label>What should happen<textarea minLength={3} maxLength={1000} value={action} onChange={e=>setAction(e.target.value)} placeholder="Collect yesterday's approved updates and prepare a briefing."/></label>
     <button className="primary" disabled={disabled||!name.trim()||!action.trim()}>Save draft</button>
    </form>}
   </section>
   <section className="panel"><h2>{project?.name||"Project"} automations</h2>
    {plans.length===0?<div className="room-empty"><Clock3 size={22}/><strong>No automation drafts yet.</strong><p>Recurring work, triggers and scheduled routines will stay organized here.</p></div>:
     plans.map(plan=><article className="entry" key={plan.id}><div className="entry-head"><strong>{plan.title}</strong><span className="pill">Draft</span></div>
      <p>{plan.action}</p><small>{plan.trigger==="manual"?"Manual start":plan.trigger==="schedule"?"Schedule trigger":"Connected-app trigger"} · Does not execute</small>
      <div className="controls"><button disabled title="Execution is not connected"><PlayCircle size={15}/> Run</button><button onClick={()=>remove(plan.id)}>Remove draft</button></div>
     </article>)}
   </section>
  </div>
  <section className="panel room-rule"><ShieldCheck size={19}/><div><strong>Automation is a room, not a permission shortcut.</strong><p>When execution is added, every automation still needs an authorized account, project scope, cost policy and approval rules.</p></div></section>
 </div>;
}
