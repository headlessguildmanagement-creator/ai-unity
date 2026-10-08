const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function githubOAuthSecretRef(projectId){
 if(!UUID.test(projectId??""))throw new Error("Invalid GitHub project id");
 return `secret:github/${projectId.toLowerCase()}/oauth`;
}

export function githubOAuthSecretName(projectId){
 if(!UUID.test(projectId??""))throw new Error("Invalid GitHub project id");
 return `GITHUB_USER_OAUTH_${projectId.replaceAll("-","").toUpperCase()}`;
}

export function githubOAuthSecretPath(basePath){
 const base=String(basePath??"").replace(/\/$/,"");
 if(!base.startsWith("/"))throw new Error("Invalid GitHub vault base path");
 return `${base}/system/github`;
}
