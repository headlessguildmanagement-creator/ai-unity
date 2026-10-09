"use client";
import {useState} from "react";
import {ArrowUpRight,BookOpenCheck,ChevronDown,ChevronRight,ClipboardCheck,LockKeyhole,ShieldAlert,ShieldCheck,Workflow} from "lucide-react";
import releaseGates from "@/config/release-gates.json";
import systemManifest from "@/config/system-manifest.json";
type Level="All"|"P0"|"P1"|"P2";
const filterLabels:{id:Level;label:string}[]=[
 {id:"All",label:"All gates"},{id:"P0",label:"Before Vercel"},
 {id:"P1",label:"Personal trial"},{id:"P2",label:"Commercial"}
];
export default function ReadinessPanel(){
 const [level,setLevel]=useState<Level>("P0");
 const [expanded,setExpanded]=useState<string[]>([]);
 const filtered=releaseGates.gates.filter(g=>level==="All"||g.level===level);
 const p0=releaseGates.gates.filter(g=>g.level==="P0").length;
 const local=systemManifest.modules.filter(m=>m.status==="local").length;
 const discovered=systemManifest.modules.filter(m=>m.status==="offline").length;
 function toggle(id:string){setExpanded(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id])}
 return <div className="readiness-console">
  <section className="readiness-banner">
   <div><span className="section-overline">PRE-DEPLOYMENT / VERIFICATION</span>
    <h2>Evidence before launch.</h2>
    <p>One release checklist for the entire UNITY platform. Code existing in GitHub does not prove that an external service, secret, cost restriction or database actually works.</p>
   </div>
   <span className="readiness-lock"><LockKeyhole size={26}/><strong>RELEASE LOCKED</strong></span>
  </section>
  <div className="readiness-numbers">
   <div><span>P0 RELEASE GATES</span><strong>0 / {p0}</strong><small>Verified in a real environment</small></div>
   <div><span>PRODUCT SUBSYSTEMS</span><strong>{systemManifest.modules.length}</strong><small>Defined in the architecture</small></div>
   <div><span>LOCAL SOURCE FEATURES</span><strong>{local}</strong><small>Browser functionality only</small></div>
   <div><span>DISCOVERY CONTRACTS</span><strong>{discovered}</strong><small>Not active provider access</small></div>
  </div>
  <div className="readiness-layout">
   <section className="readiness-list">
    <div className="section-heading"><div><span className="section-overline">VERIFICATION PLAN</span><h3>Release acceptance</h3></div>
     <span className="workspace-status"><span/> EVIDENCE REQUIRED</span></div>
    <div className="readiness-filters" role="group" aria-label="Release gate categories">
     {filterLabels.map(item=><button key={item.id} className={level===item.id?"active":""}
      aria-pressed={level===item.id} onClick={()=>setLevel(item.id)}>{item.label}</button>)}
    </div>
    <div className="readiness-gates">
     {filtered.map((gate,i)=><div key={gate.id} className="release-gate">
      <button type="button" className="release-gate-heading" aria-expanded={expanded.includes(gate.id)}
       onClick={()=>toggle(gate.id)}>
       <span className="release-gate-number">{String(i+1).padStart(2,"0")}</span>
       <span className="release-gate-main"><strong>{gate.name}</strong><small>{gate.category} / {gate.level}</small></span>
       <span className="release-need"><span/> NOT VERIFIED</span>
       {expanded.includes(gate.id)?<ChevronDown size={15}/>:<ChevronRight size={15}/>}
      </button>
      {expanded.includes(gate.id)&&<div className="release-gate-body">
       <p>{gate.description}</p>
       <span><BookOpenCheck size={15}/> Evidence required: {gate.verification}</span>
       <p className="muted">This public checklist cannot authorize its own completion. Verified evidence must come from the applicable independent test or owner.</p>
      </div>}
     </div>)}
    </div>
   </section>
   <aside className="readiness-rail">
    <section className="rail-panel">
     <div className="rail-panel-title"><span>DEPLOYMENT POLICY</span><ShieldCheck size={16}/></div>
     <div className="readiness-rule"><ShieldAlert size={19}/><span>Dedicated authenticated backend before client data</span></div>
     <div className="readiness-rule"><ShieldAlert size={19}/><span>Zero unapproved paid API charges</span></div>
     <div className="readiness-rule"><ShieldAlert size={19}/><span>Verified source and project isolation</span></div>
     <div className="readiness-rule"><ShieldAlert size={19}/><span>Explicit owner authorization before Vercel</span></div>
    </section>
    <section className="rail-panel readiness-link-panel">
     <ClipboardCheck size={26}/><h3>Full launch checklist</h3>
     <p>Detailed infrastructure requirements, connection-day testing and the ninety-day personal evaluation are maintained in the canonical repository.</p>
     <a href="https://github.com/headlessguildmanagement-creator/ai-unity/blob/main/docs/DEPLOYMENT_CHECKLIST.md"
       target="_blank" rel="noopener noreferrer">Open GitHub checklist <ArrowUpRight size={15}/></a>
    </section>
    <section className="rail-panel">
     <div className="rail-panel-title"><span>NEXT ENGINEERING PHASE</span><Workflow size={16}/></div>
     <p className="muted">Complete authenticated persistent knowledge, real connector grants, safe provider execution, durable worker integration and end-to-end security testing before requesting any hosted trial.</p>
    </section>
   </aside>
  </div>
 </div>;
}
