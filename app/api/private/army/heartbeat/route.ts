import {NextResponse} from "next/server";
import {z} from "zod";
import {isSupabaseConfigured} from "@/lib/supabase/config";
import {isSupabaseAdminConfigured} from "@/lib/supabase/admin";
import {getVerifiedUser} from "@/lib/supabase/server";
import {checkWriteOrigin} from "@/lib/security/origin.mjs";
import {readBoundedJson} from "@/lib/security/bounded-body.mjs";
import {recordArmyHeartbeat} from "@/lib/army/store";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const status=z.enum(["IDLE","ASSIGNED","WORKING","WAITING","BLOCKED","REVIEWING","READY_FOR_REVIEW","PAUSED","FAILED","DONE","CANCELLED","STALE"]);
const schema=z.object({
 agentId:z.string().min(1).max(120),
 taskId:z.string().uuid().nullable().optional(),
 status,
 lastAction:z.string().max(500).nullable().optional(),
 progressCurrent:z.number().int().nonnegative().nullable().optional(),
 progressTotal:z.number().int().nonnegative().nullable().optional(),
 branch:z.string().max(240).nullable().optional(),
 blockedBy:z.array(z.string().max(240)).max(20).optional()
}).strict();

export async function POST(request:Request){
 if(!isSupabaseConfigured()||!isSupabaseAdminConfigured())return NextResponse.json({error:"Army runtime backend not configured"},{status:503,headers});
 const originCheck=checkWriteOrigin(request.headers.get("origin"),process.env.UNITY_APP_ORIGIN);
 if(!originCheck.allowed)return NextResponse.json({error:"Untrusted request origin"},{status:403,headers});
 let payload:unknown;
 try{payload=await readBoundedJson(request,{maxBytes:12000})}catch{return NextResponse.json({error:"Invalid request body"},{status:400,headers})}
 const parsed=schema.safeParse(payload);
 if(!parsed.success)return NextResponse.json({error:"Invalid Army heartbeat"},{status:400,headers});
 try{
  const {user}=await getVerifiedUser();
  if(!user)return NextResponse.json({error:"Authentication required"},{status:401,headers});
  const heartbeat=await recordArmyHeartbeat(user.id,parsed.data);
  return NextResponse.json({heartbeat},{headers});
 }catch(error){
  const message=error instanceof Error?error.message:"Army heartbeat failed";
  const httpStatus=/unknown|invalid/i.test(message)?400:503;
  return NextResponse.json({error:message},{status:httpStatus,headers});
 }
}
