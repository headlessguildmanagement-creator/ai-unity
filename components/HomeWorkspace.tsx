"use client";

import {FormEvent,useMemo,useState} from "react";
import Image from "next/image";
import {
 ArrowRight,BookOpen,Folder,MessageCircle,Plus,
 Search,ShieldCheck,Sparkles,Workflow,Zap
} from "lucide-react";
import type {Workspace} from "@/lib/types";
import type {Area} from "@/lib/navigation";

type Props={
 workspace:Workspace;
 selectedProjectId:string;
 onSelectProject:(id:string)=>void;
 onNavigate:(area:Area)=>void;
 onNewProject:()=>void;
};

function normalize(value:string){
 return value.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

export default function HomeWorkspace({
 workspace,selectedProjectId,onSelectProject,onNavigate,onNewProject
}:Props){
 const [intent,setIntent]=useState("");
 const [routeNotice,setRouteNotice]=useState("");
 const current=workspace.projects.find(project=>project.id===selectedProjectId);
 const recent=useMemo(()=>[...workspace.projects]
  .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,4),[workspace.projects]);
 const attention=useMemo(()=>workspace.tasks.filter(task=>
  !["completed","cancelled"].includes(task.state) &&
  (!selectedProjectId||task.projectId===selectedProjectId)
 ).slice(0,4),[workspace.tasks,selectedProjectId]);

 function routeIntent(event:FormEvent){
  event.preventDefault();
  const raw=intent.trim();
  const value=normalize(raw);
  if(!value)return;

  const matchedProjects=workspace.projects.filter(project=>{
   const name=normalize(project.name);
   return name.length>=2 && (` ${value} `).includes(` ${name} `);
  });

  if(matchedProjects.length>1){
   setRouteNotice("I found more than one matching project. Choose the project first so UNITY does not guess.");
   onNavigate("Projects");
   return;
  }

  const matchedProject=matchedProjects[0];
  if(matchedProject){
   onSelectProject(matchedProject.id);
   setRouteNotice(`Using ${matchedProject.name} for this request.`);
  }else if(!selectedProjectId&&workspace.projects.length===1){
   onSelectProject(workspace.projects[0].id);
   setRouteNotice(`Using ${workspace.projects[0].name} for this request.`);
  }else{
   setRouteNotice("");
  }

  if(/\b(new|create|add)\b.*\b(project|workspace|client)\b/.test(value))onNavigate("Projects");
  else if(/remember|knowledge|note|brain|document/.test(value))onNavigate("Memory");
  else if(/automation|automate|repeat|schedule|trigger|recurring/.test(value))onNavigate("Automations");
  else if(/task|plan|todo|mission|work/.test(value))onNavigate("Tasks");
  else if(/yesterday|brief|update|morning/.test(value))onNavigate("Briefing");
  else if(/connect|integration|notion|asana|calendar|gmail|email|crm/.test(value))onNavigate("Connections");
  else onNavigate("Chat");
  setIntent("");
 }

 return <section className="unity-home" aria-label="UNITY home">
  <section className="home-hero">
   <div className="home-terrain" aria-hidden="true">
    <img className="home-terrain-light" src="/unity-brand/terrain-light.svg" alt=""/>
    <img className="home-terrain-dark" src="/unity-brand/terrain-dark.svg" alt=""/>
   </div>
   <div className="home-hero-content">
    <span className="home-eyebrow">YOUR WORKSPACE</span>
    <h2>Welcome to <span>UNITY.</span></h2>
    <p>One calm place for your projects, knowledge, conversations, automations and the tools you choose to connect.{current?<> You’re currently working in <strong>{current.name}</strong>.</>:null}</p>
    <form className="intent-composer" onSubmit={routeIntent}>
     <Search size={19} aria-hidden="true"/>
     <label>
      <span className="sr-only">What would you like to work on?</span>
      <input value={intent} onChange={event=>setIntent(event.target.value)}
       placeholder="What would you like to work on?"
       aria-describedby="intent-help"/>
     </label>
     <button type="submit" disabled={!intent.trim()} aria-label="Go to the best matching workspace">
      <ArrowRight size={18}/>
     </button>
    </form>
    <p id="intent-help" className="home-hint">This routes you to an existing workspace. Name a project and UNITY will select it when the match is clear. AI replies and external actions stay locked until authorized.</p>
    {routeNotice&&<p className="home-hint" role="status">{routeNotice}</p>}
    <div className="home-actions" aria-label="Quick actions">
     <button className="primary" onClick={onNewProject}><Plus size={18}/> New project</button>
     <button onClick={()=>onNavigate("Chat")}><MessageCircle size={18}/> Conversations</button>
     <button onClick={()=>onNavigate("Memory")}><BookOpen size={18}/> Knowledge</button>
     <button onClick={()=>onNavigate("Automations")}><Zap size={18}/> Automations</button>
    </div>
   </div>
  </section>

  <div className="home-grid">
   <section className="home-section">
    <div className="home-section-head">
     <div><span className="home-eyebrow">CONTINUE</span><h3>Where you left off</h3></div>
     <button className="text-action" onClick={()=>onNavigate("Projects")}>All projects <ArrowRight size={15}/></button>
    </div>
    {recent.length===0?<div className="home-empty">
     <Folder size={25}/><h4>Your projects will live here.</h4>
     <p>Keep client work, personal ideas and future integrations separated from the start.</p>
     <button onClick={onNewProject}>Create your first project</button>
    </div>:<div className="project-cards">{recent.map(project=>{
     const notes=workspace.memories.filter(memory=>memory.projectId===project.id).length;
     const tasks=workspace.tasks.filter(task=>task.projectId===project.id&&!["completed","cancelled"].includes(task.state)).length;
     return <button className="project-card" key={project.id} onClick={()=>{onSelectProject(project.id);onNavigate("Projects")}}>
      <div className="project-card-icon"><Folder size={19}/></div>
      <strong>{project.name}</strong>
      <p>{project.description||"No description yet."}</p>
      <small>{notes} {notes===1?"note":"notes"} · {tasks} open {tasks===1?"task":"tasks"}</small>
     </button>;
    })}</div>}
   </section>

   <aside className="home-aside">
    <section className="attention-card">
     <div className="home-section-head compact"><div><span className="home-eyebrow">NEEDS YOUR ATTENTION</span><h3>{attention.length?"Local follow-ups":"Nothing urgent here"}</h3></div><Workflow size={19}/></div>
     {attention.length?<div className="attention-list">{attention.map(task=><button key={task.id} onClick={()=>onNavigate("Tasks")}>
      <span className="attention-dot"/><span><strong>{task.title}</strong><small>{task.state.replaceAll("_"," ")}</small></span><ArrowRight size={14}/>
     </button>)}</div>:<p className="muted">UNITY only surfaces real local task data. Connected-app activity will appear after those accounts are authorized.</p>}
    </section>
    <section className="connection-note">
     <ShieldCheck size={20}/><div><strong>You stay in control.</strong><p>Nothing is assumed connected. You choose each account, permission and project scope.</p><button className="text-action" onClick={()=>onNavigate("Connections")}>Review connections <ArrowRight size={14}/></button></div>
    </section>
    <section className="alpha-note">
     <Sparkles size={18}/><p><strong>Personal alpha:</strong> local projects, notes and task planning work now. Cloud sync, model execution and app automation remain disabled until configured and verified.</p>
    </section>
   </aside>
  </div>
 </section>;
}
