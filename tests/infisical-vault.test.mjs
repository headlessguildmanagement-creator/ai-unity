import test from "node:test";
import assert from "node:assert/strict";
import {
  createInfisicalLocation,
  createInfisicalLocationRegistry,
  createInfisicalVault
} from "../lib/security/infisical-vault.mjs";

const location=()=>createInfisicalLocation({
  secretRef:"secret:openrouter/fpx/main",
  secretName:"OPENROUTER_API_KEY",
  projectId:"infisical-project-1",
  environment:"prod",
  secretPath:"/unity/fpx"
});

test("Infisical location records contain metadata only",()=>{
  const item=location();
  assert.equal(item.secretRef,"secret:openrouter/fpx/main");
  assert.equal(item.secretName,"OPENROUTER_API_KEY");
  assert.equal(item.secretPath,"/unity/fpx");
  assert.equal("secretValue" in item,false);
  assert.equal("clientSecret" in item,false);
});

test("registry rejects duplicate secret references",()=>{
  assert.throws(()=>createInfisicalLocationRegistry([location(),location()]),/Duplicate/);
});

test("vault exchanges machine identity credentials and retrieves exactly one mapped secret",async()=>{
  const calls=[];
  const fakeFetch=async (url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).endsWith("/api/v1/auth/universal-auth/login")){
      return {ok:true,json:async()=>({accessToken:"short-lived-access-token",expiresIn:7200})};
    }
    if(String(url).includes("/api/v4/secrets/OPENROUTER_API_KEY")){
      return {ok:true,json:async()=>({secret:{secretValue:"fake-openrouter-value"}})};
    }
    return {ok:false,status:500,json:async()=>({})};
  };
  const vault=createInfisicalVault({
    locations:createInfisicalLocationRegistry([location()]),
    getBootstrapCredentials:async()=>({clientId:"fake-client-id",clientSecret:"fake-client-secret"}),
    fetchImpl:fakeFetch
  });
  const result=await vault.useSecret("secret:openrouter/fpx/main",async secret=>({used:secret==="fake-openrouter-value"}));
  assert.deepEqual(result,{used:true});
  assert.equal(calls.length,2);
  assert.match(calls[0].url,/universal-auth\/login$/);
  assert.equal(calls[0].options.method,"POST");
  assert.match(String(calls[0].options.body),/clientId=fake-client-id/);
  assert.match(String(calls[0].options.body),/clientSecret=fake-client-secret/);
  assert.match(calls[1].url,/projectId=infisical-project-1/);
  assert.match(calls[1].url,/environment=prod/);
  assert.match(calls[1].url,/secretPath=%2Funity%2Ffpx/);
  assert.equal(calls[1].options.headers.Authorization,"Bearer short-lived-access-token");
});

test("vault falls back to folder listing when direct secret lookup is rejected",async()=>{
  let readCalls=0;
  const fakeFetch=async(url)=>{
    const target=String(url);
    if(target.endsWith("/api/v1/auth/universal-auth/login"))return {ok:true,json:async()=>({accessToken:"short-lived-access-token"})};
    readCalls++;
    if(target.includes("/api/v4/secrets/OPENROUTER_API_KEY"))return {ok:false,status:400,json:async()=>({})};
    if(target.includes("/api/v4/secrets?"))return {ok:true,status:200,json:async()=>({secrets:[{secretKey:"OPENROUTER_API_KEY",secretValue:"folder-value",type:"shared"}]})};
    return {ok:false,status:500,json:async()=>({})};
  };
  const vault=createInfisicalVault({locations:createInfisicalLocationRegistry([location()]),getBootstrapCredentials:async()=>({clientId:"fake-client-id",clientSecret:"fake-client-secret"}),fetchImpl:fakeFetch});
  const result=await vault.useSecret("secret:openrouter/fpx/main",async secret=>secret);
  assert.equal(result,"folder-value");
  assert.equal(readCalls,2);
});

test("vault creates a mapped secret without returning the secret value",async()=>{
  const calls=[];
  const fakeFetch=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).endsWith("/api/v1/auth/universal-auth/login"))
      return {ok:true,json:async()=>({accessToken:"short-lived-access-token"})};
    return {ok:true,status:200,json:async()=>({secret:{secretValue:"must-not-leave-vault"}})};
  };
  const vault=createInfisicalVault({
    locations:createInfisicalLocationRegistry([location()]),
    getBootstrapCredentials:async()=>({clientId:"fake-client-id",clientSecret:"fake-client-secret"}),
    fetchImpl:fakeFetch
  });
  const result=await vault.putSecret("secret:openrouter/fpx/main","new-fake-provider-value");
  assert.deepEqual(result,{stored:true,secretRef:"secret:openrouter/fpx/main"});
  assert.equal(calls[1].options.method,"POST");
  const body=JSON.parse(calls[1].options.body);
  assert.equal(body.projectId,"infisical-project-1");
  assert.equal(body.environment,"prod");
  assert.equal(body.secretPath,"/unity/fpx");
  assert.equal(body.secretValue,"new-fake-provider-value");
  assert.equal(JSON.stringify(result).includes("new-fake-provider-value"),false);
  assert.equal(JSON.stringify(result).includes("must-not-leave-vault"),false);
});

test("vault replaces an existing secret after create conflict",async()=>{
  const writes=[];
  const fakeFetch=async(url,options={})=>{
    if(String(url).endsWith("/api/v1/auth/universal-auth/login"))
      return {ok:true,json:async()=>({accessToken:"short-lived-access-token"})};
    writes.push({url:String(url),options});
    if(options.method==="POST")return {ok:false,status:409,json:async()=>({})};
    return {ok:true,status:200,json:async()=>({secret:{secretValue:"hidden"}})};
  };
  const vault=createInfisicalVault({
    locations:createInfisicalLocationRegistry([location()]),
    getBootstrapCredentials:async()=>({clientId:"fake-client-id",clientSecret:"fake-client-secret"}),
    fetchImpl:fakeFetch
  });
  const result=await vault.putSecret("secret:openrouter/fpx/main","replacement-fake-value");
  assert.equal(result.stored,true);
  assert.deepEqual(writes.map(item=>item.options.method),["POST","PATCH"]);
  assert.equal(JSON.parse(writes[1].options.body).secretValue,"replacement-fake-value");
});

test("vault refuses unreviewed hosts, unknown refs and missing machine identity",async()=>{
  const registry=createInfisicalLocationRegistry([location()]);
  assert.throws(()=>createInfisicalVault({
    host:"https://example.invalid",
    locations:registry,
    getBootstrapCredentials:async()=>({clientId:"x",clientSecret:"y"}),
    fetchImpl:async()=>({ok:false})
  }),/reviewed Infisical Cloud host/);

  const vault=createInfisicalVault({
    locations:registry,
    getBootstrapCredentials:async()=>({clientId:"",clientSecret:""}),
    fetchImpl:async()=>({ok:false})
  });
  await assert.rejects(()=>vault.useSecret("secret:unknown/service/key",async()=>null),/Unknown Infisical secret reference/);
  await assert.rejects(()=>vault.useSecret("secret:openrouter/fpx/main",async()=>null),/INFISICAL_BOOTSTRAP_MISSING/);
  await assert.rejects(()=>vault.putSecret("secret:unknown/service/key","value"),/Unknown Infisical secret reference/);
});

test("Infisical errors are sanitized and never echo remote bodies",async()=>{
  const vault=createInfisicalVault({
    locations:createInfisicalLocationRegistry([location()]),
    getBootstrapCredentials:async()=>({clientId:"fake-client-id",clientSecret:"fake-client-secret"}),
    fetchImpl:async()=>({ok:false,status:500,json:async()=>({error:"raw-sensitive-provider-text"})})
  });
  await assert.rejects(()=>vault.useSecret("secret:openrouter/fpx/main",async()=>null),error=>{
    assert.equal(error.message,"INFISICAL_LOGIN_FAILED");
    assert.doesNotMatch(error.message,/raw-sensitive/);
    return true;
  });
});
