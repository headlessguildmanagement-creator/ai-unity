import {NextResponse} from "next/server";
import {z} from "zod";
import {getVerifiedUser} from "@/lib/supabase/server";
import {createSupabaseAdmin,isSupabaseAdminConfigured} from "@/lib/supabase/admin";
import {isSupabaseConfigured} from "@/lib/supabase/config";
import {requireInfisicalBootstrap,isInfisicalConfigured} from "@/lib/security/infisical-config";
import {createInfisicalLocation,createInfisicalLocationRegistry,createInfisicalVault} from "@/lib/security/infisical-vault.mjs";
import {checkWriteOrigin} from "@/lib/security/origin.mjs";
import {readBoundedJson} from "@/lib/security/bounded-body.mjs";
import {listGitHubUserInstallations,listGitHubUserInstallationRepositories} from "@/lib/infrastructure/github-install-auth.mjs";
import {githubOAuthSecretName,githubOAuthSecretPath,githubOAuthSecretRef} from "@/lib/infrastructure/github-vault-location.mjs";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const schema=z.object({projectId:z.string().uuid(),installationId:z.number().int().positive(),repositoryId:z.number().int().positive()}).strict();
type GitHubInstallation={id:number;accountLogin:string;accountType:string;repositorySelection:string};
type GitHubRepository={id:number;fullName:string;private:boolean;defaultBranch:string|null};

export async function POST(request:Request){
 if(!isSupabaseConfigured()||!isSupabaseAdminConfigured()||!isInfisicalConfigured())return NextResponse.json({error:"Secure GitHub connection backend is not configured"},{status:503,headers});
 if(!checkWriteOrigin(request.headers.get("origin"),process.env.UNITY_APP_ORIGIN).allowed)return NextResponse.json({error:"Untrusted request origin"},{status:403,headers});
 let payload:unknown;try{payload=await readBoundedJson(request,{maxBytes:1200})}catch{return NextResponse.json({error:"Invalid request body"},{status:400,headers})}
 const parsed=schema.safeParse(payload);if(!parsed.success)return NextResponse.json({error:"Invalid GitHub repository selection"},{status:400,headers});
 try{
  const {user}=await getVerifiedUser();if(!user)return NextResponse.json({error:"Authentication required"},{status:401,headers});
  const admin=createSupabaseAdmin();
  const {data:project}=await admin.from("projects").select("id").eq("id",parsed.data.projectId).eq("owner_id",user.id).maybeSingle();if(!project)return NextResponse.json({error:"Project not found"},{status:404,headers});
  const expected=githubOAuthSecretRef(parsed.data.projectId);
  const {data:account}=await admin.from("account_connections").select("id,credential_reference,status").eq("owner_id",user.id).eq("provider","github").eq("connection_key",`github:${parsed.data.projectId}`).maybeSingle();
  if(!account||account.status!=="ready"||account.credential_reference!==expected)return NextResponse.json({error:"Connect GitHub first"},{status:409,headers});
  const bootstrap=requireInfisicalBootstrap();
  const registry=createInfisicalLocationRegistry([createInfisicalLocation({secretRef:expected,secretName:githubOAuthSecretName(parsed.data.projectId),projectId:bootstrap.projectId,environment:bootstrap.environment,secretPath:githubOAuthSecretPath(bootstrap.secretPath)})]);
  const vault=createInfisicalVault({locations:registry,getBootstrapCredentials:async()=>({clientId:bootstrap.clientId,clientSecret:bootstrap.clientSecret})});
  const selected=await vault.useSecret(expected,async (raw:string)=>{
   const bundle=JSON.parse(raw);if(!bundle?.accessToken||bundle.version!==1)throw Error("invalid");if(bundle.expiresAt&&Date.parse(bundle.expiresAt)<=Date.now())throw Error("expired");
   const installations=await listGitHubUserInstallations({token:bundle.accessToken}) as GitHubInstallation[];
   const installation=installations.find((item:GitHubInstallation)=>item.id===parsed.data.installationId);if(!installation)throw Error("unauthorized");
   const repositories=await listGitHubUserInstallationRepositories({token:bundle.accessToken,installationId:installation.id}) as GitHubRepository[];
   const repo=repositories.find((item:GitHubRepository)=>item.id===parsed.data.repositoryId);if(!repo)throw Error("unauthorized");
   return {installation,repo};
  }) as {installation:GitHubInstallation;repo:GitHubRepository};
  const {error:updateError}=await admin.from("account_connections").update({account_label:`GitHub · ${selected.installation.accountLogin}`,external_account_id:String(selected.installation.id),updated_at:new Date().toISOString()}).eq("id",account.id).eq("owner_id",user.id);
  if(updateError)return NextResponse.json({error:"GitHub connection could not be saved"},{status:503,headers});
  const {data:bindings}=await admin.from("project_account_bindings").select("id,resource_id").eq("project_id",parsed.data.projectId).eq("account_connection_id",account.id).limit(50);
  const existing=(bindings??[]).find((item:{id:string;resource_id:string})=>item.resource_id==="github:account"||item.resource_id.startsWith("github:repo:"));
  const resourceId=`github:repo:${selected.repo.fullName}`;let writeError;
  if(existing)({error:writeError}=await admin.from("project_account_bindings").update({resource_id:resourceId,permission_mode:"read",updated_at:new Date().toISOString()}).eq("id",existing.id));
  else ({error:writeError}=await admin.from("project_account_bindings").insert({project_id:parsed.data.projectId,account_connection_id:account.id,resource_id:resourceId,permission_mode:"read"}));
  if(writeError)return NextResponse.json({error:"GitHub repository binding could not be saved"},{status:503,headers});
  return NextResponse.json({selected:{id:selected.repo.id,fullName:selected.repo.fullName,private:selected.repo.private},installation:{id:selected.installation.id,accountLogin:selected.installation.accountLogin},permissionMode:"read"},{headers});
 }catch(error){const expired=error instanceof Error&&error.message==="expired";return NextResponse.json({error:expired?"GitHub authorization expired. Reconnect GitHub.":"GitHub repository selection failed"},{status:expired?409:503,headers})}
}
