const API="https://api.github.com";
const TOKEN_URL="https://github.com/login/oauth/access_token";
const AUTH_URL="https://github.com/login/oauth/authorize";
const SLUG=/^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/;
const STATE=/^[A-Za-z0-9_-]{20,256}$/;
const CODE=/^[A-Za-z0-9._~:/+-]{6,1000}$/;
const CLIENT=/^(?:Iv1\.)?[A-Za-z0-9_-]{8,160}$/;
const positive=value=>Number.isSafeInteger(value)&&value>0;

function validCallbackUrl(value){
 try{const u=new URL(value);return u.protocol==="https:"&&u.username===""&&u.password===""&&u.hash===""&&u.search===""&&u.pathname.startsWith("/")}catch{return false}
}

export function buildGitHubInstallationUrl({appSlug,state}){
 if(!SLUG.test(appSlug??"")||!STATE.test(state??""))throw new Error("Invalid GitHub installation start");
 const url=new URL(`https://github.com/apps/${appSlug}/installations/new`);
 url.searchParams.set("state",state);
 return url.toString();
}

export function buildGitHubAuthorizationUrl({clientId,state,redirectUri}){
 if(!CLIENT.test(clientId??"")||!STATE.test(state??"")||!validCallbackUrl(redirectUri))throw new Error("Invalid GitHub authorization start");
 const url=new URL(AUTH_URL);
 url.searchParams.set("client_id",clientId);
 url.searchParams.set("state",state);
 url.searchParams.set("redirect_uri",redirectUri);
 return url.toString();
}

export async function exchangeGitHubUserCode({clientId,clientSecret,code,redirectUri,fetchImpl=globalThis.fetch}){
 if(!CLIENT.test(clientId??"")||typeof clientSecret!=="string"||clientSecret.length<12||!CODE.test(code??"")||!validCallbackUrl(redirectUri)||typeof fetchImpl!=="function")
  throw new Error("Invalid GitHub authorization return");
 const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,redirect_uri:redirectUri});
 const response=await fetchImpl(TOKEN_URL,{method:"POST",headers:{Accept:"application/json","Content-Type":"application/x-www-form-urlencoded"},body,cache:"no-store",redirect:"error"});
 if(!response?.ok)throw new Error("GitHub authorization exchange failed");
 let data;try{data=await response.json()}catch{throw new Error("GitHub returned an invalid authorization response")}
 if(typeof data?.error==="string"){
  const code=String(data.error).toLowerCase();
  if(code==="incorrect_client_credentials")throw new Error("GITHUB_OAUTH_INCORRECT_CREDENTIALS");
  if(code==="redirect_uri_mismatch")throw new Error("GITHUB_OAUTH_REDIRECT_MISMATCH");
  if(code==="bad_verification_code")throw new Error("GITHUB_OAUTH_BAD_CODE");
  throw new Error("GITHUB_OAUTH_REJECTED");
 }
 if(typeof data?.access_token!=="string"||data.access_token.length<12)throw new Error("GitHub authorization response missing token");
 return Object.freeze({accessToken:data.access_token,expiresIn:Number.isFinite(data.expires_in)?data.expires_in:null,refreshToken:typeof data.refresh_token==="string"?data.refresh_token:null,refreshTokenExpiresIn:Number.isFinite(data.refresh_token_expires_in)?data.refresh_token_expires_in:null,tokenType:typeof data.token_type==="string"?data.token_type:"bearer"});
}

function headers(token){return {Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2026-03-10",Authorization:`Bearer ${token}`}}
function validToken(token){return typeof token==="string"&&token.length>=12}

export async function listGitHubUserInstallations({token,fetchImpl=globalThis.fetch}){
 if(!validToken(token)||typeof fetchImpl!=="function")throw new Error("Invalid GitHub user authorization");
 const response=await fetchImpl(`${API}/user/installations?per_page=100`,{method:"GET",headers:headers(token),cache:"no-store",redirect:"error"});
 if(!response?.ok)throw new Error("GitHub installations could not be retrieved");
 let data;try{data=await response.json()}catch{throw new Error("GitHub returned an invalid installations response")}
 if(!Array.isArray(data?.installations)||data.installations.length>100)throw new Error("GitHub returned an invalid installations response");
 return data.installations.flatMap(item=>{
  const login=item?.account?.login;
  if(!positive(item?.id)||typeof login!=="string"||!/^[A-Za-z0-9_.-]{1,100}$/.test(login))return [];
  return [{id:item.id,accountLogin:login,accountType:typeof item.account.type==="string"?item.account.type.slice(0,40):"Unknown",repositorySelection:item.repository_selection==="all"?"all":"selected"}];
 });
}

export async function listGitHubUserInstallationRepositories({token,installationId,fetchImpl=globalThis.fetch}){
 if(!validToken(token)||!positive(installationId)||typeof fetchImpl!=="function")throw new Error("Invalid GitHub repository discovery request");
 const response=await fetchImpl(`${API}/user/installations/${installationId}/repositories?per_page=100`,{method:"GET",headers:headers(token),cache:"no-store",redirect:"error"});
 if(!response?.ok)throw new Error("GitHub repositories could not be retrieved");
 let data;try{data=await response.json()}catch{throw new Error("GitHub returned an invalid repositories response")}
 if(!Array.isArray(data?.repositories)||data.repositories.length>100)throw new Error("GitHub returned an invalid repositories response");
 return data.repositories.flatMap(repo=>{
  if(!positive(repo?.id)||typeof repo.full_name!=="string"||!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repo.full_name))return [];
  return [{id:repo.id,fullName:repo.full_name,private:repo.private===true,defaultBranch:typeof repo.default_branch==="string"?repo.default_branch.slice(0,200):null}];
 });
}
