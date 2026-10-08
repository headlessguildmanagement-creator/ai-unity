import {NextResponse} from "next/server";
import {getVerifiedUser} from "@/lib/supabase/server";
import {createSupabaseAdmin,isSupabaseAdminConfigured} from "@/lib/supabase/admin";
import {isSupabaseConfigured} from "@/lib/supabase/config";
import {requireInfisicalBootstrap,isInfisicalConfigured} from "@/lib/security/infisical-config";
import {createInfisicalLocation,createInfisicalLocationRegistry,createInfisicalVault} from "@/lib/security/infisical-vault.mjs";
import {listGitHubUserInstallations,listGitHubUserInstallationRepositories} from "@/lib/infrastructure/github-install-auth.mjs";
import {githubOAuthSecretName,githubOAuthSecretPath,githubOAuthSecretRef} from "@/lib/infrastructure/github-vault-location.mjs";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const UUID=/^[0-9a-f-]{36}$/i;
type GitHubInstallation={id:number;accountLogin:string;accountType:string;repositorySelection:string};
type GitHubRepository={id:number;fullName:string;private:boolean;defaultBranch:string|null};

export async function GET(request:Request){
 if(!isSupabaseConfigured()||!isSupabaseAdminConfigured()||!isInfisicalConfigured())return NextResponse.json({error:"Secure GitHub connection backend is not configured"},{status:503,headers});
 const url=new URL(request.url),projectId=url.searchParams.get("projectId")||"",installationId=Number(url.searchParams.get("installationId"));
 if(!UUID.test(projectId)||!Number.isSafeInteger(installationId)||installationId<=0)return NextResponse.json({error:"Invalid GitHub repository request"},{status:400,headers});
 try{
  const {user}=await getVerifiedUser();if(!user)return NextResponse.json({error:"Authentication required"},{status:401,headers});
  const admin=createSupabaseAdmin();
  const {data:project}=await admin.from("projects").select("id").eq("id",projectId).eq("owner_id",user.id).maybeSingle();if(!project)return NextResponse.json({error:"Project not found"},{status:404,headers});
  const expected=githubOAuthSecretRef(projectId);
  const {data:account}=await admin.from("account_connections").select("credential_reference,status").eq("owner_id",user.id).eq("provider","github").eq("connection_key",`github:${projectId}`).maybeSingle();
  if(!account||account.status!=="ready"||account.credential_reference!==expected)return NextResponse.json({error:"Connect GitHub first"},{status:409,headers});
  const bootstrap=requireInfisicalBootstrap();
  const registry=createInfisicalLocationRegistry([createInfisicalLocation({secretRef:expected,secretName:githubOAuthSecretName(projectId),projectId:bootstrap.projectId,environment:bootstrap.environment,secretPath:githubOAuthSecretPath(bootstrap.secretPath)})]);
  const vault=createInfisicalVault({locations:registry,getBootstrapCredentials:async()=>({clientId:bootstrap.clientId,clientSecret:bootstrap.clientSecret})});
  const repositories=await vault.useSecret(expected,async (raw:string)=>{
   const bundle=JSON.parse(raw);if(!bundle?.accessToken||bundle.version!==1)throw Error("invalid");if(bundle.expiresAt&&Date.parse(bundle.expiresAt)<=Date.now())throw Error("expired");
   const installations=await listGitHubUserInstallations({token:bundle.accessToken}) as GitHubInstallation[];
   if(!installations.some((item:GitHubInstallation)=>item.id===installationId))throw Error("unauthorized");
   return await listGitHubUserInstallationRepositories({token:bundle.accessToken,installationId}) as GitHubRepository[];
  });
  return NextResponse.json({repositories},{headers});
 }catch(error){const expired=error instanceof Error&&error.message==="expired";return NextResponse.json({error:expired?"GitHub authorization expired. Reconnect GitHub.":"GitHub repositories are unavailable"},{status:expired?409:503,headers})}
}
