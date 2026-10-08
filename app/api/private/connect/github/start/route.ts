import {NextResponse} from "next/server";
import {z} from "zod";
import {isSupabaseConfigured} from "@/lib/supabase/config";
import {getVerifiedUser} from "@/lib/supabase/server";
import {createSupabaseAdmin,isSupabaseAdminConfigured} from "@/lib/supabase/admin";
import {isInfisicalConfigured} from "@/lib/security/infisical-config";
import {checkWriteOrigin} from "@/lib/security/origin.mjs";
import {readBoundedJson} from "@/lib/security/bounded-body.mjs";
import {createConnectionAuthSession} from "@/lib/security/connection-auth-session.mjs";
import {sealConnectionAuthSession,CONNECTION_AUTH_COOKIE} from "@/lib/security/connection-auth-cookie.mjs";
import {requireGitHubIntegrationConfig,isGitHubIntegrationConfigured} from "@/lib/infrastructure/github-integration-config";
import {buildGitHubAuthorizationUrl} from "@/lib/infrastructure/github-install-auth.mjs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const schema=z.object({projectId:z.string().uuid()}).strict();
function callbackUrl(){return new URL("/api/private/connect/github/callback",process.env.UNITY_APP_ORIGIN||"http://localhost:3000").toString()}
export async function POST(request:Request){
 if(!isSupabaseConfigured()||!isSupabaseAdminConfigured()||!isInfisicalConfigured()||!isGitHubIntegrationConfigured())return NextResponse.json({error:"Secure GitHub connection backend is not configured"},{status:503,headers});
 if(!checkWriteOrigin(request.headers.get("origin"),process.env.UNITY_APP_ORIGIN).allowed)return NextResponse.json({error:"Untrusted request origin"},{status:403,headers});
 let payload:unknown;try{payload=await readBoundedJson(request,{maxBytes:1000})}catch{return NextResponse.json({error:"Invalid request body"},{status:400,headers})}
 const parsed=schema.safeParse(payload);if(!parsed.success)return NextResponse.json({error:"Invalid project"},{status:400,headers});
 try{
  const {user}=await getVerifiedUser();if(!user)return NextResponse.json({error:"Authentication required"},{status:401,headers});
  const admin=createSupabaseAdmin();
  const {data:project,error}=await admin.from("projects").select("id").eq("id",parsed.data.projectId).eq("owner_id",user.id).maybeSingle();
  if(error)return NextResponse.json({error:"Project service unavailable"},{status:503,headers});if(!project)return NextResponse.json({error:"Project not found"},{status:404,headers});
  const sessionSecret=process.env.UNITY_CONNECTION_SESSION_SECRET;if(!sessionSecret)return NextResponse.json({error:"Connection session security is not configured"},{status:503,headers});
  const session=createConnectionAuthSession({service:"github",projectId:parsed.data.projectId});
  const {clientId}=requireGitHubIntegrationConfig();
  const response=NextResponse.json({authorizationUrl:buildGitHubAuthorizationUrl({clientId,state:session.state,redirectUri:callbackUrl()}),expiresAt:session.expiresAt},{headers});
  response.cookies.set(CONNECTION_AUTH_COOKIE.name,sealConnectionAuthSession(session,sessionSecret),{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:CONNECTION_AUTH_COOKIE.maxAge});
  return response;
 }catch{return NextResponse.json({error:"GitHub connection could not be started"},{status:503,headers})}
}
