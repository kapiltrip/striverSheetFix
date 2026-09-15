import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { env } from './worker-mock';
import { connectGithub,getRemoteBackup,restoreWorkspace,syncWorkspace } from '../lib/github';
import { ensureUser,loadState } from '../lib/server';
import { emptyRecord } from '../lib/types';

class Statement{
  args:unknown[]=[];constructor(private db:DatabaseSync,private sql:string){}
  bind(...args:unknown[]){this.args=args;return this;}
  async first(){return this.db.prepare(this.sql).get(...this.args as any[])||null;}
  async all(){return {results:this.db.prepare(this.sql).all(...this.args as any[])};}
  async run(){const result=this.db.prepare(this.sql).run(...this.args as any[]);return {success:true,meta:{changes:Number(result.changes)}};}
  async execute(){return /^\s*SELECT/i.test(this.sql)?this.all():this.run();}
}
class DB{
  raw=new DatabaseSync(':memory:');constructor(){this.raw.exec(fs.readFileSync('drizzle/0000_fair_shape.sql','utf8'));}
  prepare(sql:string){return new Statement(this.raw,sql);}
  async batch(statements:Statement[]){this.raw.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.execute());this.raw.exec('COMMIT');return results;}catch(e){this.raw.exec('ROLLBACK');throw e;}}
}
test('GitHub backup, failure recovery, idempotence, secret privacy, and restore preserve data',async()=>{
  const db=new DB();env.DB=db;env.GITHUB_ENCRYPTION_KEY='a'.repeat(64);
  const objects=new Map<string,Buffer>();env.BUCKET={async get(key:string){const value=objects.get(key);return value?{arrayBuffer:async()=>Uint8Array.from(value).buffer}:null;},async put(key:string,value:Uint8Array){objects.set(key,Buffer.from(value));}};
  let head='initial',counter=0,failRef=false;const blobs=new Map<string,Buffer>(),trees=new Map<string,Map<string,string>>([['root',new Map([['README.md','original-readme']])]]),commits=new Map([['initial',{tree:{sha:'root'}}]]);const writes:any[]=[];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=(async(input:any,init:any={})=>{
    const url=new URL(String(input)),method=init.method||'GET',body=init.body?JSON.parse(init.body):undefined;
    assert.equal(url.hostname,'api.github.com');const path=url.pathname.replace('/repos/kapiltrip/cpp-and-scripting-practice','');let result:any;
    if(!path){result={private:false,permissions:{push:true},full_name:'kapiltrip/cpp-and-scripting-practice',default_branch:'main'};}
    else if(path==='/git/ref/heads/main'){result={object:{sha:head}};}
    else if(path.startsWith('/git/commits/')&&method==='GET'){result=commits.get(path.split('/').pop()!);}
    else if(path.startsWith('/git/trees/')&&method==='GET'){result={truncated:false,tree:[...trees.get(path.split('/').pop()!)!].map(([path,sha])=>({path,sha,type:'blob'}))};}
    else if(path==='/git/blobs'&&method==='POST'){const bytes=Buffer.from(body.content,'base64');const sha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');blobs.set(sha,bytes);result={sha};}
    else if(path.startsWith('/git/blobs/')&&method==='GET'){result={content:blobs.get(path.split('/').pop()!)!.toString('base64')};}
    else if(path==='/git/trees'&&method==='POST'){const tree=new Map(trees.get(body.base_tree));for(const entry of body.tree)tree.set(entry.path,entry.sha);const sha=`tree-${++counter}`;trees.set(sha,tree);result={sha};}
    else if(path==='/git/commits'&&method==='POST'){const sha=`commit-${++counter}`;commits.set(sha,{tree:{sha:body.tree}});result={sha};}
    else if(path==='/git/refs/heads/main'&&method==='PATCH'){assert.equal(body.force,false);if(failRef)return Response.json({error:'temporary'}, {status:503});head=body.sha;writes.push(body);result={object:{sha:head}};}
    else if(path==='/contents/recall/state.json'){const tree=trees.get(commits.get(head)!.tree.sha)!;result=JSON.parse(blobs.get(tree.get('recall/state.json')!)!.toString());}
    else throw new Error(`Unexpected GitHub test request ${method} ${path}`);
    return Response.json(result);
  }) as typeof fetch;
  try{
    await ensureUser('alice');const record={...emptyRecord('425'),notes:'Original notes',code:'int main() { return 0; }',version:1,updatedAt:100};
    await db.prepare('INSERT INTO records (user_id,problem_id,data,version) VALUES (?,?,?,?)').bind('alice','425',JSON.stringify(record),1).run();
    const photo={id:'b11ad29a-d8b8-4d41-863a-928b7cc0cc55',problemId:'425',name:'original.png',mime:'image/png',size:3,key:'alice/original.png',createdAt:100};objects.set(photo.key,Buffer.from([1,2,3]));
    await db.prepare('INSERT INTO attachments (id,user_id,problem_id,data) VALUES (?,?,?,?)').bind(photo.id,'alice','425',JSON.stringify(photo)).run();
    await connectGithub('alice','kapiltrip/cpp-and-scripting-practice','github_pat_TEST_SECRET');
    const stored=await db.prepare('SELECT token FROM settings WHERE user_id=?').bind('alice').first() as {token:string};assert.ok(!stored.token.includes('TEST_SECRET'));
    const result=await syncWorkspace('alice');assert.equal(result.status,'synced');assert.equal(writes.length,1);assert.equal((await loadState('alice')).settings.lastSyncVersion,0);
    const currentTree=trees.get(commits.get(head)!.tree.sha)!;assert.equal(currentTree.get('README.md'),'original-readme');
    const remote=await getRemoteBackup('alice');assert.equal(remote.records[0].notes,'Original notes');assert.equal(remote.attachments[0].size,3);assert.ok(!JSON.stringify(remote).includes('TEST_SECRET'));
    assert.equal((await syncWorkspace('alice')).status,'up-to-date');assert.equal(writes.length,1);
    await db.prepare('UPDATE settings SET sync_version=sync_version+1 WHERE user_id=?').bind('alice').run();failRef=true;
    await assert.rejects(()=>syncWorkspace('alice'));assert.equal((await loadState('alice')).settings.lastSyncVersion,0);assert.ok((await loadState('alice')).settings.syncError);
    failRef=false;await syncWorkspace('alice');assert.equal((await loadState('alice')).settings.lastSyncVersion,1);
    const newer={...record,notes:'Newer local work',updatedAt:999,version:2};await db.prepare('UPDATE records SET data=?,version=2 WHERE user_id=? AND problem_id=?').bind(JSON.stringify(newer),'alice','425').run();
    await restoreWorkspace('alice');assert.equal((await loadState('alice')).records[0].notes,'Newer local work');
    await db.prepare('DELETE FROM attachments WHERE user_id=?').bind('alice').run();objects.clear();await restoreWorkspace('alice');assert.equal((await loadState('alice')).attachments.length,1);assert.deepEqual([...objects.values()][0],Buffer.from([1,2,3]));
    const other=await loadState('bob');assert.equal(other.records.length,0);assert.equal(other.settings.connected,false);
  }finally{globalThis.fetch=originalFetch;db.raw.close();}
});
