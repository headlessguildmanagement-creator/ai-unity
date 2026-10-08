const CLOUD_HOST="https://app.infisical.com";
const SECRET_REF=/^secret:[a-z0-9][a-z0-9._:/-]{2,199}$/;
const SAFE_NAME=/^[A-Z][A-Z0-9_]{1,119}$/;
const SAFE_ENV=/^[a-z0-9][a-z0-9_-]{0,39}$/;
const SAFE_PATH=/^\/(?:[A-Za-z0-9._-]+\/?)*$/;
const nonempty=value=>typeof value==="string"&&value.trim().length>0;

function safeJson(response){
 return response.json().catch(()=>{throw new Error("INFISICAL_INVALID_RESPONSE")});
}
function readFailure(status){
 if(status===401)return "INFISICAL_AUTH_FAILED";
 if(status===403)return "INFISICAL_FORBIDDEN";
 if(status===404)return "INFISICAL_SECRET_MISSING";
 return "INFISICAL_READ_FAILED";
}
function writeFailure(status){
 if(status===401)return "INFISICAL_AUTH_FAILED";
 if(status===403)return "INFISICAL_FORBIDDEN";
 if(status===404)return "INFISICAL_PATH_MISSING";
 return "INFISICAL_WRITE_FAILED";
}

export function createInfisicalLocation({secretRef,secretName,projectId,environment="prod",secretPath="/unity"}){
 if(!SECRET_REF.test(secretRef??"")||!SAFE_NAME.test(secretName??"")||!nonempty(projectId)||projectId.length>160||
    !SAFE_ENV.test(environment??"")||!SAFE_PATH.test(secretPath??""))
  throw new Error("Invalid Infisical secret location");
 return Object.freeze({secretRef,secretName,projectId,environment,secretPath});
}

export function createInfisicalLocationRegistry(locations=[]){
 if(!Array.isArray(locations)||locations.length>500)throw new Error("Invalid Infisical location registry");
 const refs=new Set();
 const output=new Map();
 for(const input of locations){
  const item=createInfisicalLocation(input);
  if(refs.has(item.secretRef))throw new Error("Duplicate Infisical secret reference");
  refs.add(item.secretRef);output.set(item.secretRef,item);
 }
 return output;
}

export function createInfisicalVault({host=CLOUD_HOST,locations,getBootstrapCredentials,fetchImpl=globalThis.fetch}){
 if(host!==CLOUD_HOST)throw new Error("Only the reviewed Infisical Cloud host is enabled");
 if(!(locations instanceof Map)||typeof getBootstrapCredentials!=="function"||typeof fetchImpl!=="function")
  throw new Error("Invalid Infisical vault configuration");

 async function login(){
  const bootstrap=await getBootstrapCredentials();
  if(!bootstrap||!nonempty(bootstrap.clientId)||!nonempty(bootstrap.clientSecret))throw new Error("INFISICAL_BOOTSTRAP_MISSING");
  const body=new URLSearchParams({clientId:bootstrap.clientId,clientSecret:bootstrap.clientSecret});
  let response;
  try{
   response=await fetchImpl(`${host}/api/v1/auth/universal-auth/login`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body,cache:"no-store",redirect:"error"});
  }catch{throw new Error("INFISICAL_NETWORK_ERROR")}
  if(!response?.ok)throw new Error(response?.status===401||response?.status===403?"INFISICAL_AUTH_FAILED":"INFISICAL_LOGIN_FAILED");
  const data=await safeJson(response);
  if(!nonempty(data?.accessToken))throw new Error("INFISICAL_AUTH_RESPONSE_MISSING_TOKEN");
  return data.accessToken;
 }

 function requireLocation(secretRef){
  if(!SECRET_REF.test(secretRef??""))throw new Error("Invalid Infisical secret request");
  const location=locations.get(secretRef);
  if(!location)throw new Error("Unknown Infisical secret reference");
  return location;
 }

 async function writeSecret(accessToken,location,secretValue,method){
  try{
   return await fetchImpl(`${host}/api/v4/secrets/${encodeURIComponent(location.secretName)}`,{method,headers:{Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({projectId:location.projectId,environment:location.environment,secretValue,secretPath:location.secretPath,type:"shared",skipMultilineEncoding:false}),cache:"no-store",redirect:"error"});
  }catch{throw new Error("INFISICAL_NETWORK_ERROR")}
 }

 return Object.freeze({
  kind:"infisical",configured:true,
  async useSecret(secretRef,callback){
   if(typeof callback!=="function")throw new Error("Invalid Infisical secret request");
   const location=requireLocation(secretRef);
   const accessToken=await login();
   const url=new URL(`${host}/api/v4/secrets/${encodeURIComponent(location.secretName)}`);
   url.searchParams.set("projectId",location.projectId);url.searchParams.set("environment",location.environment);url.searchParams.set("secretPath",location.secretPath);
   let response;
   try{response=await fetchImpl(url.toString(),{method:"GET",headers:{Authorization:`Bearer ${accessToken}`},cache:"no-store",redirect:"error"})}catch{throw new Error("INFISICAL_NETWORK_ERROR")}
   if(!response?.ok)throw new Error(readFailure(response?.status));
   const data=await safeJson(response);
   const secret=data?.secret?.secretValue;
   if(!nonempty(secret))throw new Error("INFISICAL_SECRET_VALUE_UNAVAILABLE");
   return await callback(secret);
  },
  async putSecret(secretRef,secretValue){
   if(!nonempty(secretValue))throw new Error("Invalid Infisical secret value");
   const location=requireLocation(secretRef);const accessToken=await login();
   let response=await writeSecret(accessToken,location,secretValue,"POST");
   if(response?.status===409||response?.status===422)response=await writeSecret(accessToken,location,secretValue,"PATCH");
   if(!response?.ok)throw new Error(writeFailure(response?.status));
   return Object.freeze({stored:true,secretRef});
  }
 });
}
