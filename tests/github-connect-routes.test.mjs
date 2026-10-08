import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
const start=read("app/api/private/connect/github/start/route.ts");
const callback=read("app/api/private/connect/github/callback/route.ts");
const installations=read("app/api/private/connect/github/installations/route.ts");
const repositories=read("app/api/private/connect/github/repositories/route.ts");
const select=read("app/api/private/connect/github/select-repository/route.ts");

test("GitHub connection start is project owned and anti-forgery scoped",()=>{
 assert.match(start,/eq\("owner_id",user\.id\)/);
 assert.match(start,/createConnectionAuthSession\(\{service:"github"/);
 assert.match(start,/buildGitHubAuthorizationUrl/);
 assert.match(start,/clientId/);
 assert.match(start,/CONNECTION_AUTH_COOKIE/);
});

test("GitHub callback stores OAuth bundle only in Infisical",()=>{
 assert.match(callback,/verifyConnectionAuthSession/);
 assert.match(callback,/vault\.putSecret\(oauthRef/);
 assert.match(callback,/credential_reference:oauthRef/);
 assert.doesNotMatch(callback,/NextResponse\.json\([^\n]*accessToken/);
});

test("GitHub discovery rechecks exact owner and installation before exposing repositories",()=>{
 assert.match(installations,/eq\("owner_id",user\.id\)/);
 assert.match(repositories,/listGitHubUserInstallations/);
 assert.match(repositories,/some\(\(?item(?::GitHubInstallation)?\)?=>item\.id===installationId\)/);
 assert.match(repositories,/listGitHubUserInstallationRepositories/);
});

test("GitHub repository selection is exact and read-only",()=>{
 assert.match(select,/checkWriteOrigin/);
 assert.match(select,/repositories\.find\(\(?item(?::GitHubRepository)?\)?=>item\.id===parsed\.data\.repositoryId\)/);
 assert.match(select,/resourceId=`github:repo:\$\{selected\.repo\.fullName\}`/);
 assert.match(select,/permission_mode:"read"/);
 assert.doesNotMatch(select,/permission_mode:"write"/);
});
