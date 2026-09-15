import { after } from 'next/server';
import { z } from 'zod';
import catalog from '@/lib/catalog.json';
import { AppError,bump,database,ensureUser,failure,identity,loadState,readJson,reply } from '@/lib/server';
import { emptyRecord,type StudyRecord,type Attempt,type RecallCard } from '@/lib/types';
import { newSchedule,nextSolve,rateRecall } from '@/lib/revision';
import { syncWorkspace } from '@/lib/github';
export const dynamic='force-dynamic';
const problemIds=new Set(catalog.problems.map(p=>p.id));
const pid=z.string().refine(s=>problemIds.has(s),'Choose a problem from the A2Z sheet.');
const draftSchema=z.object({problemId:pid,code:z.string().max(150000),notes:z.string().max(50000),mistake:z.string().max(10000),language:z.enum(['cpp','java','python','javascript','typescript','c']),expectedVersion:z.number().int().min(0)});
const id=z.string().uuid();
function autoSync(userId:string){after(async()=>{try{await syncWorkspace(userId,false);}catch{/* Sync status is recorded separately from the saved study work. */}});}
export async function GET(request:Request){try{return reply(await loadState(await identity(request)));}catch(error){return failure(error);}}
export async function POST(request:Request){try{
  const userId=await identity(request,true);await ensureUser(userId);const input=await readJson(request);const db=database();const now=Date.now();
  if(input.action==='save-draft'||input.action==='attempt'){
    const d=draftSchema.parse(input);
    const old=await db.prepare('SELECT data,version FROM records WHERE user_id=? AND problem_id=?').bind(userId,d.problemId).first<{data:string;version:number}>();
    if(input.action==='attempt'){
      id.parse(input.id);const existing=await db.prepare('SELECT id FROM attempts WHERE id=? AND user_id=?').bind(input.id,userId).first();
      if(existing)return reply(await loadState(userId));
    }
    if((old?.version||0)!==d.expectedVersion)throw new AppError('This problem changed in another session. Your draft is kept here. Reload the saved version before trying again.',409);
    const previous:StudyRecord=old?JSON.parse(old.data):emptyRecord(d.problemId);
    const record:StudyRecord={...previous,problemId:d.problemId,code:d.code,notes:d.notes,mistake:d.mistake,language:d.language,updatedAt:now,version:d.expectedVersion+1};
    let attempt:Attempt|undefined;
    if(input.action==='attempt'){
      const a=z.object({id,outcome:z.enum(['solved','assisted','retry']),minutes:z.number().int().min(0).max(600)}).parse(input);
      Object.assign(record,{status:a.outcome},nextSolve(a.outcome,previous.solveStreak,now));
      attempt={...a,problemId:d.problemId,at:now,code:d.code,notes:d.notes,mistake:d.mistake,language:d.language};
    }
    const update=db.prepare('INSERT INTO records (user_id,problem_id,data,version) VALUES (?,?,?,?) ON CONFLICT(user_id,problem_id) DO UPDATE SET data=excluded.data,version=excluded.version WHERE records.version=?').bind(userId,d.problemId,JSON.stringify(record),record.version,d.expectedVersion);
    const statements=[update];
    if(attempt)statements.push(db.prepare('INSERT OR IGNORE INTO attempts (id,user_id,data,created_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM records WHERE user_id=? AND problem_id=? AND data=?)').bind(attempt.id,userId,JSON.stringify(attempt),now,userId,d.problemId,JSON.stringify(record)));
    statements.push(bump(userId));const result=await db.batch(statements);
    if(!result[0].meta.changes)throw new AppError('Another session saved this problem. Your draft is preserved; reload the saved version.',409);
    if(attempt)autoSync(userId);
  }else if(input.action==='create-card'){
    const c=z.object({id,problemId:pid,front:z.string().trim().min(3,'Write a recall question.').max(3000),back:z.string().trim().min(1,'Add an answer.').max(10000)}).parse(input);
    const card:RecallCard={...c,schedule:newSchedule(now),updatedAt:now,version:1};
    await db.batch([db.prepare('INSERT OR IGNORE INTO records (user_id,problem_id,data,version) VALUES (?,?,?,1)').bind(userId,c.problemId,JSON.stringify({...emptyRecord(c.problemId),updatedAt:now,version:1})),db.prepare('INSERT OR IGNORE INTO cards (id,user_id,data,version) VALUES (?,?,?,1)').bind(c.id,userId,JSON.stringify(card)),bump(userId)]);autoSync(userId);
  }else if(input.action==='review-card'){
    const r=z.object({id,cardId:id,rating:z.number().int().min(1).max(4),expectedVersion:z.number().int().min(1)}).parse(input);
    const existing=await db.prepare('SELECT id FROM reviews WHERE id=? AND user_id=?').bind(r.id,userId).first();if(existing)return reply(await loadState(userId));
    const raw=await db.prepare('SELECT data,version FROM cards WHERE id=? AND user_id=?').bind(r.cardId,userId).first<{data:string;version:number}>();
    if(!raw)throw new AppError('This recall card was not found.',404);if(raw.version!==r.expectedVersion)throw new AppError('This card was already reviewed in another session. Refresh your queue.',409);
    const card:RecallCard=JSON.parse(raw.data);const result=rateRecall(card.schedule,r.rating,now);
    const next={...card,schedule:result.card,updatedAt:now,version:raw.version+1};
    const log={id:r.id,cardId:r.cardId,problemId:card.problemId,rating:r.rating,at:now,log:result.log};
    const saved=await db.batch([db.prepare('INSERT OR IGNORE INTO reviews (id,user_id,data,created_at) SELECT ?,?,?,? FROM cards WHERE id=? AND user_id=? AND version=?').bind(r.id,userId,JSON.stringify(log),now,r.cardId,userId,r.expectedVersion),db.prepare('UPDATE cards SET data=?,version=version+1 WHERE id=? AND user_id=? AND version=?').bind(JSON.stringify(next),r.cardId,userId,r.expectedVersion),bump(userId)]);
    if(!saved[1].meta.changes)throw new AppError('This card changed elsewhere. Refresh your queue.',409);autoSync(userId);
  }else if(input.action==='settings'){
    const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    const values=z.object({dailyMinutes:z.number().int().min(15).max(120),startDate:date,targetDate:date,autoSync:z.boolean()}).refine(v=>v.startDate<=v.targetDate,{message:'The finish date must be on or after the resume date.',path:['targetDate']}).parse(input);
    const raw=await db.prepare('SELECT data FROM settings WHERE user_id=?').bind(userId).first<{data:string}>();
    await db.batch([db.prepare('UPDATE settings SET data=? WHERE user_id=?').bind(JSON.stringify({...JSON.parse(raw!.data),...values}),userId),bump(userId)]);
  }else throw new AppError('That action is not supported.');
  return reply(await loadState(userId));
}catch(error){return failure(error);}}
