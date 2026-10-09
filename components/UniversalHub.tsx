"use client";
import {useMemo,useState} from "react";
import {ArrowRight,CalendarDays,FolderSearch,LockKeyhole,Search,ShieldCheck} from "lucide-react";
import catalog from "@/config/integration-categories.json";
import connectionCatalog from "@/config/connection-services.json";
import VercelConnectPanel from "@/components/VercelConnectPanel";
import type {Workspace} from "@/lib/types";
type Props={workspace:Workspace;onNavigate:(destination:"Connections"|"Projects")=>void};

export function IntegrationCatalog(){
 const [query,setQuery]=useState("");
 const filtered=useMemo(()=>catalog.categories.map(group=>({...group,providers:group.providers.filter(item=>(item+" "+group.category).toLowerCase().includes(query.toLowerCase()))})).filter(group=>group.providers.length>0),[query]);
 const connectionReady=useMemo(()=>connectionCatalog.services.filter(item=>(item.name+" "+item.category+" "+item.connection+" "+item.signIn).toLowerCase().includes(query.toLowerCase())),[query]);
 return <>
 <section className="panel universal-catalog" aria-label="Cross-platform integration roadmap">
  <div className="entry-head"><h2>Universal connections</h2><span className="pill">CONNECTION PLANS ONLY</span></div>
  <p className="muted">UNITY is organized around your projects, not GitHub. These are not installed integrations. The services below have a documented connection plan, but each account still needs a supported API and separate permission before UNITY can read or act on anything.</p>
  <label className="universal-search"><Search size={17}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search integrations or categories" aria-label="Search planned integrations"/></label>
  <div className="model-list" aria-label="Services prepared for account setup">{connectionReady.map(item=><article className="entry" key={item.id}><div className="entry-head"><strong>{item.name}</strong><span className="pill">{item.state}</span></div><p>{item.category} · {item.connection}</p><small>Website sign-in: {item.signIn}. This does not authorize UNITY.</small></article>)}</div>
  {connectionReady.length===0&&<p role="status">No prepared connection plan matches this search.</p>}
  <details><summary>See the wider integration roadmap</summary><div className="universal-groups">{filtered.map(group=><div key={group.category} className="universal-group"><strong>{group.category}</strong><div className="universal-tags">{group.providers.map(name=><span key={name}>{name}</span>)}</div></div>)}</div>{filtered.length===0&&<p role="status">No matching provider in the wider roadmap. A standards-based connector can be evaluated later.</p>}</details>
  <div className="universal-policy"><ShieldCheck size={18}/><span>Read-only first. Exact account, project scope, revocation and specific approval for external changes are mandatory. API keys and passwords never belong in project records.</span></div>
 </section>
 <VercelConnectPanel/>
 <section className="panel" aria-label="Connection rules"><div className="entry-head"><h2>Connection rules</h2><span className="pill">SAFE DEFAULTS</span></div><div className="model-list">{connectionCatalog.rules.map(rule=><div className="entry" key={rule}><p>{rule}</p></div>)}</div></section>
 </>;
}

export function DailyBriefPanel({workspace,onNavigate}:Props){
 const [expanded,setExpanded]=useState(false);
 return <div className="briefing-page"><section className="panel"><span className="section-overline">UNIFIED ACTIVITY / MORNING BRIEFING</span><h2>Everything that happened. One place to start.</h2><p>UNITY's briefing will merge authorized updates from project tools, workspaces, email, calendars, meetings, marketing, CRM, development, and permitted local files. Actions and claims must retain original source links.</p><div className="briefing-state"><LockKeyhole size={22}/><div><strong>No live sources are connected.</strong><p>There are no verified events to summarize. We won't fabricate yesterday's activity or imply that an unconnected tool synchronized.</p></div></div><div className="briefing-facts"><div><strong>{workspace.projects.length}</strong><span>Local projects</span></div><div><strong>0</strong><span>Authorized live feeds</span></div><div><strong>0</strong><span>Verified updates</span></div></div><div className="controls"><button className="primary" onClick={()=>onNavigate("Connections")}>View integration roadmap <ArrowRight size={15}/></button><button onClick={()=>setExpanded(value=>!value)} aria-expanded={expanded}>How briefings will work</button></div>{expanded&&<div className="briefing-explainer"><p><CalendarDays size={16}/> Events are normalized by source and by project, then grouped by your selected calendar day and timezone.</p><p><FolderSearch size={16}/> Missing or disconnected sources are shown as coverage gaps. Reports never claim completeness without actual synchronization receipts.</p><p><ShieldCheck size={16}/> Suggested follow-ups and external actions are separate from observed facts and require the appropriate permissions.</p></div>}</section><IntegrationCatalog/></div>;
}
