"use client";
import {useMemo,useState} from "react";
import {ArrowUp,BookOpenCheck,BrainCircuit,ChevronDown,FileText,LockKeyhole,MessageSquareText,ShieldCheck,Sparkles} from "lucide-react";
import type {Workspace} from "@/lib/types";
import {addUserMessage,previewProjectContext} from "@/lib/chat.mjs";
type Props={
 projectId:string;workspace:Workspace;onChange:(next:Workspace)=>void;disabled:boolean;
};
const draftStarters=[
 {label:"Capture an idea",value:"Idea: "},
 {label:"Record a decision",value:"Decision:\nContext: \nOutcome: \n"},
 {label:"Outline next steps",value:"Goal:\nNext steps:\n1. "}
];
export default function ChatPanel({projectId,workspace,onChange,disabled}:Props){
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const [error,setError]=useState("");
 const [contextOpen,setContextOpen]=useState(true);
 const active=workspace.projects.find(p=>p.id===projectId);
 const draft=projectId?drafts[projectId]||"":"";
 const setDraft=(value:string)=>{if(projectId)setDrafts(old=>({...old,[projectId]:value}))};
 const conversation=useMemo(()=>workspace.messages.filter(m=>m.projectId===projectId),[workspace.messages,projectId]);
 const context=useMemo(()=>active?previewProjectContext(workspace,projectId):null,[workspace,projectId,active]);
 function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(disabled||!active)return;
  try{
   const updated=addUserMessage(workspace,{
    id:crypto.randomUUID(),projectId,text:draft,createdAt:new Date().toISOString()
   });
   onChange(updated);setDraft("");setError("");
  }catch(e){setError(e instanceof Error?e.message:"Unable to store a local message")}
 }
 return <section className="chat-studio" aria-label="Local project conversation studio">
  <aside className="chat-context-rail">
   <div className="chat-rail-heading"><span className="chat-rail-icon"><BrainCircuit size={20}/></span>
    <span><strong>Project context</strong><small>LOCAL KNOWLEDGE</small></span>
   </div>
   <div className="chat-project-card"><span className="chat-context-caption">ACTIVE WORKSPACE</span>
    <strong>{active?.name||"No project selected"}</strong>
    <p>{active?.description||"Choose a project above to begin."}</p>
   </div>
   <button type="button" className="chat-context-toggle" aria-expanded={contextOpen}
    onClick={()=>setContextOpen(old=>!old)}>
    <span><BookOpenCheck size={16}/> Approved context</span><ChevronDown className={contextOpen?"":"closed"} size={15}/>
   </button>
   {contextOpen&&<div className="chat-context-list">
    {!active?<p className="chat-no-context">No active project.</p>:!context||context.memories.length===0?
     <p className="chat-no-context">Approved project notes will appear here.</p>:
     context.memories.map(memory=><article key={memory.id} className="chat-context-note">
      <FileText size={16}/><div><strong>{memory.title}</strong><p>{memory.body}</p>
       <small>{memory.source}</small></div>
     </article>)}
   </div>}
   <div className="chat-context-security"><ShieldCheck size={18}/><div>
    <strong>Project separation</strong><p>Only approved notes from this project appear in the context preview.</p>
   </div></div>
  </aside>
  <div className="chat-main">
   <header className="chat-main-header">
    <div><span className="chat-main-eyebrow">WORKSPACE / CONVERSATION</span>
     <h2>Project conversation</h2></div>
    <div className="chat-connection-label"><LockKeyhole size={13}/> AI EXECUTION DISABLED</div>
   </header>
   <div aria-label="Project message history" className="chat-conversation-history">
    {!active?<div className="chat-empty">
      <MessageSquareText size={34}/><h3>Select a project to start</h3>
      <p>Your local notes will remain scoped to the chosen project.</p></div>:
     conversation.length===0?<div className="chat-empty">
      <span className="chat-empty-glyph"><Sparkles size={28} strokeWidth={1.4}/></span>
      <span className="chat-empty-eyebrow">YOUR THINKING SPACE</span>
      <h3>Start with a thought.</h3>
      <p>Capture ideas, decisions and context. AI conversations will become available only after verified authorization and spending controls are connected.</p>
      <div className="chat-prompt-starters">{draftStarters.map(item=>
       <button key={item.label} type="button" disabled={disabled}
        onClick={()=>setDraft(item.value)}>{item.label}<ArrowUp size={13}/></button>)}</div>
     </div>:
     <div className="chat-message-list">{conversation.map(message=>
      <article key={message.id} className="chat-local-message">
       <div className="chat-message-avatar">U</div>
       <div><div className="chat-message-meta"><strong>You</strong>
        <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time></div>
        <p className="prewrap">{message.text}</p>
        <span className="chat-message-type">LOCAL NOTE · NOT SENT TO AI</span>
       </div>
      </article>)}</div>}
   </div>
   <footer className="chat-composer-wrap">
    {error&&<p role="alert" className="warning">{error}</p>}
    <form className="chat-composer" onSubmit={submit}>
     <label className="chat-composer-label" htmlFor="unity-message">Local conversation note</label>
     <textarea id="unity-message" maxLength={8000} value={draft}
      onChange={event=>setDraft(event.target.value)}
      onKeyDown={event=>{if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)){
       event.preventDefault();event.currentTarget.form?.requestSubmit();
      }}}
      placeholder={active?"Record a question, decision or idea for this project...":"Choose a project before writing"}
      disabled={!active||disabled}/>
     <div className="chat-composer-actions"><span>Local only · ⌘/Ctrl + Enter to save</span>
      <button type="submit" className="chat-composer-submit" disabled={!active||disabled||!draft.trim()}>
       Save note <ArrowUp size={17}/>
      </button>
     </div>
    </form>
    <p className="chat-privacy"><LockKeyhole size={12}/> Browser storage is unencrypted. Don't enter API keys, confidential client data or passwords.</p>
   </footer>
  </div>
 </section>;
}
