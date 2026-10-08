import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {isSupabaseConfigured} from "@/lib/supabase/config";
import {getVerifiedUser} from "@/lib/supabase/server";
import {createSupabaseAdmin,isSupabaseAdminConfigured} from "@/lib/supabase/admin";
import {requireInfisicalBootstrap,isInfisicalConfigured} from "@/lib/security/infisical-config";
import {createInfisicalLocation,createInfisicalLocationRegistry,createInfisicalVault} from "@/lib/security/infisical-vault.mjs";
import {openConnectionAuthSession,CONNECTION_AUTH_COOKIE} from "@/lib/security/connection-auth-cookie.mjs";
import {verifyConnectionAuthSession} from "@/lib/security/connection-auth-session.mjs";
import {requireGitHubIntegrationConfig,isGitHubIntegrationConfigured} from "@/lib/infrastructure/github-integration-config";
import {exchangeGitHubUserCode} from "@/lib/infrastructure/github-install-auth.mjs";
import {githubOAuthSecretName,githubOAuthSecretPath,githubOAuthSecretRef} from "@/lib/infrastructure/github-vault-location.mjs";
export const dynamic="force-dynamic";
type FailStage="config"|"github_return"|"session"|"auth"|"project"|"vault_auth"|"vault_forbidden"|"vault_missing"|"vault_network"|"vault_invalid"|"vault_secret_read"|"oauth_exchange"|"oauth_credentials"|"oauth_redirect"|"oauth_code"|"oauth_rejected"|"vault_store"|"connection_save"|"binding_save"|"unknown";
function finish(status:"connected"|"error",stage?:FailStage){const u=new URL("/",process.env.UNITY_APP_ORIGIN||"http://localhost:3000");u.searchParams.set("connection","github");u.searchParams.set("status",status);if(stage)u.searchParams.set("stage",stage);return u}
function path(base:string,suffix:string){return `${base.replace(/\/$/,"")}/${suffix}`}
function callbackUrl(){return new URL("/api/private/connect/github/callback",process.env.UNITY_APP_ORIGIN||"http://localhost:3000").toString()}
function failureStage(error:unknown,current:FailStage):FailStage{
 if(!(error instanceof Error))return current;
 if(error.message==="GITHUB_OAUTH_INCORRECT_CREDENTIALS")return "oauth_credentials";
 if(error.message==="GITHUB_OAUTH_REDIRECT_MISMATCH")return "oauth_redirect";
 if(error.message==="GITHUB_OAUTH_BAD_CODE")return "oauth_code";
 if(error.message==="GITHUB_OAUTH_REJECTED")return "oauth_rejected";
 if(error.message==="INFISICAL_AUTH_FAILED"||error.message==="INFISICAL_LOGIN_FAILED"||error.message==="INFISICAL_BOOTSTRAP_MISSING"||error.message==="INFISICAL_AUTH_RESPONSE_MISSING_TOKEN")return "vault_auth";
 if(error.message==="INFISICAL_FORBIDDEN")return "vault_forbidden";
 if(error.message==="INFISICAL_SECRET_MISSING"||error.message==="INFISICAL_PATH_MISSING")return "vault_missing";
 if(error.message==="INFISICAL_NETWORK_ERROR")return "vault_network";
 if(error.message==="INFISICAL_INVALID_RESPONSE"||error.message==="INFISICAL_SECRET_VALUE_UNAVAILABLE")return "vault_invalid";
 return current;
}
export async function GET(request:Request){
 const fail=(stage:FailStage)=>{const r=NextResponse.redirect(finish("error",stage),303);r.cookies.delete(CONNECTION_AUTH_COOKIE.name);return r};
 if(!isSupabaseConfigured()||!isSupabaseAdminConfigured()||!isInfisicalConfigured()||!isGitHubIntegrationConfigured())return fail("config");
 let stage:FailStage="github_return";
 try{
  const url=new URL(request.url),code=url.searchParams.get("code"),state=url.searchParams.get("state");if(!code||!state)return fail("github_return");
  stage="session";
  const sealed=(await cookies()).get(CONNECTION_AUTH_COOKIE.name)?.value,sessionSecret=process.env.UNITY_CONNECTION_SESSION_SECRET;if(!sealed||!sessionSecret)return fail("session");
  const session=openConnectionAuthSession(sealed,sessionSecret);const verified=verifyConnectionAuthSession(session,{service:"github",projectId:String(session.projectId||""),state});
  stage="auth";
  const {user}=await getVerifiedUser();if(!user)return fail("auth");const admin=createSupabaseAdmin();
  stage="project";
  const {data:project,error}=await admin.from("projects").select("id").eq("id",verified.projectId).eq("owner_id",user.id).maybeSingle();if(error||!project)return fail("project");
  const cfg=requireGitHubIntegrationConfig(),bootstrap=requireInfisicalBootstrap();
  const appSecretRef=cfg.clientSecretRef,oauthRef=githubOAuthSecretRef(verified.projectId);
  const registry=createInfisicalLocationRegistry([
   createInfisicalLocation({secretRef:appSecretRef,secretName:cfg.clientSecretName,projectId:bootstrap.projectId,environment:bootstrap.environment,secretPath:path(bootstrap.secretPath,"system/github")}),
   createInfisicalLocation({secretRef:oauthRef,secretName:githubOAuthSecretName(verified.projectId),projectId:bootstrap.projectId,environment:bootstrap.environment,secretPath:githubOAuthSecretPath(bootstrap.secretPath)})
  ]);
  const vault=createInfisicalVault({locations:registry,getBootstrapCredentials:async()=>({clientId:bootstrap.clientId,clientSecret:bootstrap.clientSecret})});
  stage="vault_secret_read";
  const exchanged=await vault.useSecret(appSecretRef,(clientSecret:string)=>{stage="oauth_exchange";return exchangeGitHubUserCode({clientId:cfg.clientId,clientSecret,code,redirectUri:callbackUrl()})});
  const expiresAt=exchanged.expiresIn?new Date(Date.now()+exchanged.expiresIn*1000).toISOString():null;
  stage="vault_store";
  await vault.putSecret(oauthRef,JSON.stringify({version:1,accessToken:exchanged.accessToken,refreshToken:exchanged.refreshToken,expiresAt}));
  stage="connection_save";
  const {data:connection,error:connectionError}=await admin.from("account_connections").upsert({owner_id:user.id,connection_key:`github:${verified.projectId}`,provider:"github",account_label:"GitHub",sign_in_method:"github",auth_method:"oauth_ref",credential_reference:oauthRef,external_account_id:null,status:"ready",updated_at:new Date().toISOString()},{onConflict:"owner_id,connection_key"}).select("id").single();
  if(connectionError||!connection?.id)return fail("connection_save");
  stage="binding_save";
  const {error:bindingError}=await admin.from("project_account_bindings").upsert({project_id:verified.projectId,account_connection_id:connection.id,resource_id:"github:account",permission_mode:"read",updated_at:new Date().toISOString()},{onConflict:"project_id,account_connection_id,resource_id"});if(bindingError)return fail("binding_save");
  const r=NextResponse.redirect(finish("connected"),303);r.cookies.delete(CONNECTION_AUTH_COOKIE.name);return r;
 }catch(error){return fail(failureStage(error,stage||"unknown"))}
}
