/**
 * GoStop Live! development-only alias guard.
 * Never touches game code, production projects, Cloudflare or user data.
 */
import {pathToFileURL} from 'node:url';
const REPO='jongshin0202/gostop';
const PROJECT_ID='prj_e0k7nemlDIhPW9rnbwZZ3oiCbd4M';
const TEAM_ID='team_u2NsdzvNBlczBdzicAiT5JsA';
const ALIASES=['gostop-dev.vercel.app','gostop-dev-jwshin1-5345s-projects.vercel.app'];

export function selectReadyDevDeployment(rows,sha){
 if(!/^[a-f0-9]{40}$/.test(sha))throw new Error('Expected exact Git commit SHA');
 const good=(rows||[]).filter(d=>
  (d?.projectId===PROJECT_ID||(!d?.projectId&&d?.name==='gostop-dev'))&&
  (d?.state==='READY'||d?.readyState==='READY')&&
  d?.target!=='production'&&
  d?.meta?.githubOrg==='jongshin0202'&&
  d?.meta?.githubRepo==='gostop'&&
  d?.meta?.githubCommitRef==='develop'&&
  d?.meta?.githubCommitSha===sha);
 good.sort((a,b)=>(b.created||b.createdAt||0)-(a.created||a.createdAt||0));
 return good[0]||null;
}
export function hasSuccessfulTestRun(runs,sha){
 return (runs||[]).some(r=>r?.name==='Test'&&r?.head_sha===sha&&
  r?.event==='push'&&r?.head_branch==='develop'&&
  r?.status==='completed'&&r?.conclusion==='success');
}
export function requireAliasTarget(data,id){
 const a=data?.alias&&typeof data.alias==='object'?data.alias:data;
 if(!a||a.projectId!==PROJECT_ID||
  (a.deploymentId||a.deployment?.id)!==id)
  throw new Error('Alias read-back does not match verified dev deployment');
 return true;
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const sha=String(process.env.GITHUB_SHA||'');
 const ghToken=process.env.GITHUB_TOKEN;
 const veToken=process.env.VERCEL_TOKEN;
 if(!/^[a-f0-9]{40}$/.test(sha)||!ghToken||!veToken)
  throw new Error('Requires GITHUB_SHA, GITHUB_TOKEN and scoped VERCEL_TOKEN');
 const gh=async path=>{
  const response=await fetch('https://api.github.com'+path,{
   headers:{Authorization:'Bearer '+ghToken,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
  if(!response.ok)throw new Error('GitHub API failed '+response.status+' '+path);
  return response.json();
 };
 const vercel=async(path,method='GET',body)=>{
  const url=new URL('https://api.vercel.com'+path);
  url.searchParams.set('teamId',TEAM_ID);
  const response=await fetch(url,{method,headers:{Authorization:'Bearer '+veToken,'Content-Type':'application/json'},
   ...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw new Error('Vercel API failed '+response.status+' '+path+' '+(await response.text()).slice(0,300));
  return response.json();
 };
 let release=null;
 for(let attempt=0;attempt<48;attempt++){
  const branch=await gh('/repos/'+REPO+'/branches/develop');
  if(branch.commit?.sha!==sha)throw new Error('Develop advanced; refuse stale alias assignment');
  const runs=await gh('/repos/'+REPO+'/actions/runs?branch=develop&head_sha='+sha+'&per_page=40');
  const passed=hasSuccessfulTestRun(runs.workflow_runs,sha);
  const list=await vercel('/v6/deployments?projectId='+PROJECT_ID+'&limit=50');
  release=passed?selectReadyDevDeployment(list.deployments,sha):null;
  if(release)break;
  await sleep(15000);
 }
 const id=release?.uid||release?.id;
 if(!id)throw new Error('No exact-SHA successful Test and READY dev deployment');
 if((await gh('/repos/'+REPO+'/branches/develop')).commit?.sha!==sha)
  throw new Error('Develop advanced before alias assignment');
 for(const alias of ALIASES){
  const path='/v4/aliases/'+encodeURIComponent(alias);
  const current=await vercel(path);
  if((current.deploymentId||current.deployment?.id)!==id){
   if(current.projectId&&current.projectId!==PROJECT_ID)
    throw new Error('Alias belongs to another project: '+alias);
   await vercel('/v2/deployments/'+encodeURIComponent(id)+'/aliases','POST',{alias});
  }
  requireAliasTarget(await vercel(path),id);
  console.log('Verified development alias '+alias+' -> '+id+' @ '+sha);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(err=>{console.error('Development alias guard blocked:',err.message);process.exitCode=1;});
