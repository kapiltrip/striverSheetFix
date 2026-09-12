import { env } from 'cloudflare:workers';
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { AppError,bucket,bump,database,ensureUser,loadState } from './server';
import { imagePath,makeBackup,textFiles } from './backup';
import type { Attachment,Backup,Settings } from './types';
const encoder=new TextEncoder();
export const repoSchema=z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,'Use owner/repository, such as kapiltrip/dsa-study-notes.');
async function encryptionKey(){const hex=env.GITHUB_ENCRYPTION_KEY;if(!hex||!/^[a-f0-9]{64}$/.test(hex))throw new AppError('GitHub connection is being configured. Your study work is saved.',503);return crypto.subtle.importKey('raw',Buffer.from(hex,'hex'),'AES-GCM',false,['encrypt','decrypt']);}
async function encrypt(token:string,userId:string){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(userId)},await encryptionKey(),encoder.encode(token));return `${Buffer.from(iv).toString('base64')}.${Buffer.from(cipher).toString('base64')}`;}
async function decrypt(value:string,userId:string){try{const [iv,cipher]=value.split('.');const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(iv,'base64'),additionalData:encoder.encode(userId)},await encryptionKey(),Buffer.from(cipher,'base64'));return new TextDecoder().decode(plain);}catch{throw new AppError('Reconnect GitHub to resume backups.',401);}}
async function github(token:string,path:string,method='GET',body?:unknown,raw=false):Promise<any>{
  const response=await fetch(`https://api.github.com${path}`,{method,headers:{Authorization:`Bearer ${token}`,Accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json','Content-Type':'application/json','User-Agent':'Recall-DSA','X-GitHub-Api-Version':'2022-11-28'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(!response.ok){if(response.status===401)throw new AppError('Your GitHub token expired or was revoked. Reconnect to resume backups.',401);if(response.status===403)throw new AppError('GitHub denied the backup. Check the token’s Contents access, expiry, or rate limit.',403);if(response.status===404)throw new AppError('GitHub could not find the repository or backup. Check repository access.',404);throw new AppError(`GitHub could not finish the backup (${response.status}). Your saved work is safe; try again.`,response.status===409||response.status===422?409:502);}
  return response.json();
}
async function connection(userId:string){await ensureUser(userId);const row=await database().prepare('SELECT data,token,sync_lock_until FROM settings WHERE user_id=?').bind(userId).first<{data:string;token:string|null;sync_lock_until:number}>();if(!row?.token)throw new AppError('Connect your private GitHub repository first.');const settings:Settings=JSON.parse(row.data);return {settings,token:await decrypt(row.token,userId),lock:row.sync_lock_until};}
export async function connectGithub(userId:string,repository:string,token:string){
  repoSchema.parse(repository);if(!token||token.length>500)throw new AppError('Enter a fine-grained GitHub token.');
  const repo=await github(token,`/repos/${repository}`);if(!repo.private)throw new AppError('Choose a private repository for your study backups.');
  if(repo.permissions?.push===false)throw new AppError('This token needs Contents: Read and write on the selected repository.');
  await ensureUser(userId);const row=await database().prepare('SELECT data,sync_lock_until FROM settings WHERE user_id=?').bind(userId).first<{data:string;sync_lock_until:number}>();
  if(row!.sync_lock_until>Date.now())throw new AppError('A backup is running. Try connecting again when it finishes.',409);
  const next={...JSON.parse(row!.data),repository:repo.full_name,branch:repo.default_branch||'main',autoSync:true,syncError:null,lastSyncAt:null,lastSyncCommit:null};
  await database().prepare('UPDATE settings SET data=?,token=?,last_sync_version=-1 WHERE user_id=?').bind(JSON.stringify(next),await encrypt(token,userId),userId).run();
}
async function storeSyncResult(userId:string,changes:Partial<Settings>,version?:number){const row=await database().prepare('SELECT data FROM settings WHERE user_id=?').bind(userId).first<{data:string}>();if(!row)return;const data=JSON.stringify({...JSON.parse(row.data),...changes});if(version!==undefined)await database().prepare('UPDATE settings SET data=?,last_sync_version=? WHERE user_id=?').bind(data,version,userId).run();else await database().prepare('UPDATE settings SET data=? WHERE user_id=?').bind(data,userId).run();}
export async function syncWorkspace(userId:string,manual=true){
  const state=await loadState(userId);if(!state.settings.connected){if(manual)throw new AppError('Connect your GitHub repository first.');return {status:'not-connected'};}if(!manual&&!state.settings.autoSync)return {status:'disabled'};
  if(state.settings.lastSyncVersion>=state.settings.syncVersion&&!state.settings.syncError)return {status:'up-to-date',commit:state.settings.lastSyncCommit};
  const db=database();const now=Date.now();const lock=await db.prepare('UPDATE settings SET sync_lock_until=? WHERE user_id=? AND sync_lock_until<?').bind(now+120000,userId,now).run();
  if(!lock.meta.changes)return {status:'in-progress'};
  try{
    const {token,settings}=await connection(userId);const snapshot=await loadState(userId);const base=`/repos/${settings.repository}`;const ref=encodeURIComponent(settings.branch);
    let head=await github(token,`${base}/git/ref/heads/${ref}`);let commit:string=head.object.sha;
    const firstCommit=await github(token,`${base}/git/commits/${commit}`);let baseTree=firstCommit.tree.sha;
    const tree=await github(token,`${base}/git/trees/${baseTree}?recursive=1`);if(tree.truncated)throw new AppError('This repository is too large for a complete backup check. Use a dedicated study repository.');
    const existing=new Map<string,string>(tree.tree.filter((e:any)=>e.type==='blob').map((e:any)=>[e.path,e.sha]));
    const entries:{path:string;mode:string;type:string;sha:string}[]=[];
    const put=async(path:string,bytes:Uint8Array)=>{
      const header=encoder.encode(`blob ${bytes.byteLength}\0`);const object=new Uint8Array(header.length+bytes.length);object.set(header);object.set(bytes,header.length);
      const sha=Buffer.from(await crypto.subtle.digest('SHA-1',object)).toString('hex');
      if(existing.get(path)===sha)return sha;
      const blob=await github(token,`${base}/git/blobs`,'POST',{content:Buffer.from(bytes).toString('base64'),encoding:'base64'});
      entries.push({path,mode:'100644',type:'blob',sha:blob.sha});return blob.sha as string;
    };
    const attachments:Attachment[]=[];
    for(const attachment of snapshot.attachments){const path=imagePath(attachment);let sha=existing.get(path);if(!sha){const object=await bucket().get(attachment.key);if(!object)throw new AppError(`The attachment “${attachment.name}” is missing. The backup has not been marked complete.`);sha=await put(path,new Uint8Array(await object.arrayBuffer()));}attachments.push({...attachment,sha});}
    const withFiles={...snapshot,attachments};const backup=makeBackup(withFiles,now);
    for(const [path,content] of textFiles(withFiles,backup))await put(path,encoder.encode(content));
    if(entries.length){
      for(let attempt=0;attempt<2;attempt++){
        if(attempt){head=await github(token,`${base}/git/ref/heads/${ref}`);commit=head.object.sha;baseTree=(await github(token,`${base}/git/commits/${commit}`)).tree.sha;}
        const updatedTree=await github(token,`${base}/git/trees`,'POST',{base_tree:baseTree,tree:entries});
        const created=await github(token,`${base}/git/commits`,'POST',{message:`Back up DSA practice — ${new Date(now).toISOString().slice(0,10)}`,tree:updatedTree.sha,parents:[commit]});
        try{await github(token,`${base}/git/refs/heads/${ref}`,'PATCH',{sha:created.sha,force:false});commit=created.sha;break;}catch(error){if(!(error instanceof AppError)||error.status!==409||attempt===1)throw error;}
      }
    }
    await storeSyncResult(userId,{lastSyncAt:Date.now(),lastSyncCommit:commit,syncError:null},snapshot.settings.syncVersion);
    return {status:'synced',commit};
  }catch(error){await storeSyncResult(userId,{syncError:error instanceof AppError?error.message:'GitHub could not be reached. Your saved work is safe; retry the backup.'});throw error;}
  finally{await db.prepare('UPDATE settings SET sync_lock_until=0 WHERE user_id=?').bind(userId).run();}
}
const uuid=z.string().uuid();const bounded=z.string().max(200000);const time=z.number().finite().min(0).max(4102444800000);
const recordSchema=z.object({problemId:z.string().max(40),status:z.enum(['in-progress','solved','assisted','retry']),code:bounded,notes:bounded,mistake:bounded,language:z.string().max(20),updatedAt:time,solveDue:time.nullable(),solveStreak:z.number().int().min(0).max(10000),version:z.number().int().min(0)});
const scheduleSchema=z.object({due:z.union([z.string().datetime(),time]),stability:z.number().finite().min(0),difficulty:z.number().finite().min(0),elapsed_days:z.number().finite().min(0).optional(),scheduled_days:z.number().finite().min(0),learning_steps:z.number().int().min(0),reps:z.number().int().min(0),lapses:z.number().int().min(0),state:z.number().int().min(0).max(3),last_review:z.union([z.string().datetime(),time]).optional()});
export const backupSchema=z.object({format:z.literal('recall-backup'),version:z.literal(1),exportedAt:time,catalogSource:z.string().url(),records:z.array(recordSchema).max(2000),attempts:z.array(z.object({id:uuid,problemId:z.string().max(40),outcome:z.enum(['solved','assisted','retry']),minutes:z.number().min(0).max(600),at:time,code:bounded,notes:bounded,mistake:bounded,language:z.string().max(20)})).max(20000),cards:z.array(z.object({id:uuid,problemId:z.string().max(40),front:z.string().max(3000),back:z.string().max(10000),schedule:scheduleSchema,updatedAt:time,version:z.number().int().min(1)})).max(5000),reviews:z.array(z.object({id:uuid,cardId:uuid,problemId:z.string().max(40),rating:z.number().int().min(1).max(4),at:time,log:z.unknown()})).max(100000),attachments:z.array(z.object({id:uuid,problemId:z.string().max(40),name:z.string().max(150),mime:z.enum(['image/jpeg','image/png','image/webp','application/pdf']),size:z.number().min(1).max(8*1024*1024),key:z.string().max(300),createdAt:time,sha:z.string().regex(/^[a-f0-9]{40}$/)})).max(5000)});
export async function getRemoteBackup(userId:string){const {token,settings}=await connection(userId);const data=await github(token,`/repos/${settings.repository}/contents/recall/state.json?ref=${encodeURIComponent(settings.branch)}`,'GET',undefined,true);return backupSchema.parse(data) as Backup;}
async function mergeWorkspace(userId:string){
  const backup=await getRemoteBackup(userId);const current=await loadState(userId);const {token,settings}=await connection(userId);const db=database();const statements:D1PreparedStatement[]=[];let restored=0;
  for(const a of backup.attachments){if(current.attachments.some(c=>c.id===a.id))continue;const blob=await github(token,`/repos/${settings.repository}/git/blobs/${a.sha}`);const bytes=Buffer.from(blob.content.replace(/\s/g,''),'base64');if(bytes.byteLength!==a.size)throw new AppError('An image in the backup did not pass its size check. Restore stopped.');const ext=imagePath(a).split('.').pop();const key=`${userId}/${a.id}.${ext}`;await bucket().put(key,bytes,{httpMetadata:{contentType:a.mime}});statements.push(db.prepare('INSERT OR IGNORE INTO attachments (id,user_id,problem_id,data) VALUES (?,?,?,?)').bind(a.id,userId,a.problemId,JSON.stringify({...a,key})));}
  for(const r of backup.records){const existing=current.records.find(x=>x.problemId===r.problemId);if(existing&&existing.updatedAt>=r.updatedAt)continue;const next={...r,version:(existing?.version||0)+1};statements.push(db.prepare('INSERT INTO records (user_id,problem_id,data,version) VALUES (?,?,?,?) ON CONFLICT(user_id,problem_id) DO UPDATE SET data=excluded.data,version=excluded.version WHERE records.version=?').bind(userId,r.problemId,JSON.stringify(next),next.version,existing?.version||0));restored++;}
  for(const c of backup.cards){const existing=current.cards.find(x=>x.id===c.id);if(existing&&existing.updatedAt>=c.updatedAt)continue;const next={...c,version:(existing?.version||0)+1};statements.push(db.prepare('INSERT INTO cards (id,user_id,data,version) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version WHERE cards.user_id=? AND cards.version=?').bind(c.id,userId,JSON.stringify(next),next.version,userId,existing?.version||0));}
  for(const [table,items] of [['attempts',backup.attempts],['reviews',backup.reviews]] as const){for(const a of items)statements.push(db.prepare(`INSERT OR IGNORE INTO ${table} (id,user_id,data,created_at) VALUES (?,?,?,?)`).bind(a.id,userId,JSON.stringify(a),a.at));}
  for(let i=0;i<statements.length;i+=60)await db.batch(statements.slice(i,i+60));await bump(userId).run();return {restored};
}
export async function restoreWorkspace(userId:string){
  await ensureUser(userId);const db=database();const now=Date.now();
  const locked=await db.prepare('UPDATE settings SET sync_lock_until=? WHERE user_id=? AND sync_lock_until<?').bind(now+120000,userId,now).run();
  if(!locked.meta.changes)throw new AppError('A backup or restore is already running. Please try again when it finishes.',409);
  try{await bump(userId).run();return await mergeWorkspace(userId);}finally{await db.prepare('UPDATE settings SET sync_lock_until=0 WHERE user_id=?').bind(userId).run();}
}
