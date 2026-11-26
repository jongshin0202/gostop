import test from 'node:test';
import assert from 'node:assert/strict';
import {selectReadyDevDeployment,hasSuccessfulTestRun,requireAliasTarget} from '../scripts/sync-development-aliases.mjs';
const SHA='3283a62c349e82d5cd75c7ec633d9d882f7b8388';
const PROJECT='prj_e0k7nemlDIhPW9rnbwZZ3oiCbd4M';
const good={id:'dpl_dev',projectId:PROJECT,state:'READY',target:null,created:5,
 meta:{githubOrg:'jongshin0202',githubRepo:'gostop',githubCommitRef:'develop',githubCommitSha:SHA}};
test('release guard rejects production, other project/branch, failed and stale deployments',()=>{
 const choice=selectReadyDevDeployment([
  {...good,id:'prod',target:'production',created:30},
  {...good,id:'wrong-project',projectId:'prj_prod',created:15},
  {...good,id:'wrong-branch',meta:{...good.meta,githubCommitRef:'main'},created:12},
  {...good,id:'stale',meta:{...good.meta,githubCommitSha:'a'.repeat(40)},created:10},
  {...good,id:'failed',state:'ERROR',created:20}, good],SHA);
 assert.equal(choice?.id,'dpl_dev');
 assert.equal(selectReadyDevDeployment([{...good,projectId:undefined,name:'gostop-dev'}],SHA)?.id,'dpl_dev');
 assert.equal(selectReadyDevDeployment([{...good,projectId:undefined,name:'production'}],SHA),null);
});
test('requires exact SHA and successful push CI on develop',()=>{
 const run={name:'Test',head_sha:SHA,head_branch:'develop',event:'push',status:'completed',conclusion:'success'};
 assert.equal(hasSuccessfulTestRun([run],SHA),true);
 for(const override of [{head_branch:'main'},{event:'pull_request'},{conclusion:'failure'},{status:'in_progress'},{head_sha:'b'.repeat(40)}])
  assert.equal(hasSuccessfulTestRun([{...run,...override}],SHA),false);
});
test('alias readback rejects other deployment and production project',()=>{
 const target={deploymentId:'dpl_dev',projectId:PROJECT};
 assert.equal(requireAliasTarget(target,'dpl_dev'),true);
 assert.throws(()=>requireAliasTarget({...target,deploymentId:'dpl_prod'},'dpl_dev'));
 assert.throws(()=>requireAliasTarget({...target,projectId:'prj_prod'},'dpl_dev'));
});
