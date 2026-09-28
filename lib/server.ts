import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { z } from 'zod';
import type { Settings,StudyState } from './types';
import { localDay } from './revision';
import { plannedStartDate } from './study-plan';
export class AppError extends Error {constructor(message:string,public status=400){super(message);}}
export function database(){if(!env.DB)throw new AppError('Your study storage is temporarily unavailable. Your draft has been kept.',503);return env.DB;}
export function bucket(){if(!env.BUCKET)throw new AppError('Image storage is temporarily unavailable.',503);return env.BUCKET;}
export async function identity(request:Request,write=false){
  const user=await getChatGPTUser();if(!user)throw new AppError('Sign in to open your study space.',401);
  if(write){const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)throw new AppError('Please save from your Recall app.',403);}
  return user.userId;
}
export function reply(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export function failure(error:unknown){if(error instanceof AppError)return reply({error:error.message},error.status);if(error instanceof z.ZodError)return reply({error:error.issues[0]?.message||'Please check the form.'},400);console.error('Recall request failed',error instanceof Error?error.message:'Unknown error');return reply({error:'Something could not be saved. Your draft is still here; please try again.'},503);}
export const defaultSettings=():Settings=>{const startedAt=Date.now(),today=localDay(startedAt),startDate=today<plannedStartDate?plannedStartDate:today;return {dailyMinutes:52,startDate,targetDate:startDate===plannedStartDate?'2027-04-12':new Date(new Date(startedAt).setMonth(new Date(startedAt).getMonth()+7)).toISOString().slice(0,10),startedAt,repository:'kapiltrip/cpp-and-scripting-practice',branch:'main',autoSync:true,connected:false,syncVersion:0,lastSyncVersion:-1,lastSyncAt:null,lastSyncCommit:null,syncError:null};};
export async function ensureUser(userId:string){await database().prepare('INSERT OR IGNORE INTO settings (user_id,data) VALUES (?,?)').bind(userId,JSON.stringify(defaultSettings())).run();}
export async function loadState(userId:string):Promise<StudyState>{
  await ensureUser(userId);const db=database();
  const batch=await db.batch([db.prepare('SELECT data,token,sync_version,last_sync_version FROM settings WHERE user_id=?').bind(userId),...['records','attempts','cards','reviews','attachments'].map(table=>db.prepare(`SELECT data FROM ${table} WHERE user_id=?`).bind(userId))]);
  const raw=batch[0].results[0] as {data:string;token:string|null;sync_version:number;last_sync_version:number};
  let saved=JSON.parse(raw.data) as Partial<Settings>;
  let syncVersion=raw.sync_version,migrated=false;
  if(!saved.startDate||saved.startDate==='2026-09-21'){saved={...saved,startDate:plannedStartDate,dailyMinutes:Math.max(saved.dailyMinutes||50,52)};migrated=true;}
  if(!raw.token&&(!saved.repository||saved.repository==='kapiltrip/dsa-study-notes')){saved={...saved,repository:'kapiltrip/cpp-and-scripting-practice',branch:'main'};migrated=true;}
  if(migrated){syncVersion+=1;await db.prepare('UPDATE settings SET data=?,sync_version=? WHERE user_id=? AND sync_version=?').bind(JSON.stringify(saved),syncVersion,userId,raw.sync_version).run();}
  const settings={...defaultSettings(),...saved,connected:!!raw.token,syncVersion,lastSyncVersion:raw.last_sync_version};
  const [records,attempts,cards,reviews,attachments]=batch.slice(1).map(r=>r.results.map(row=>JSON.parse((row as {data:string}).data)));
  return {settings,records,attempts:attempts.sort((a,b)=>b.at-a.at),cards,reviews:reviews.sort((a,b)=>b.at-a.at),attachments};
}
export function bump(userId:string){return database().prepare('UPDATE settings SET sync_version=sync_version+1 WHERE user_id=?').bind(userId);}
export async function readJson(request:Request){const length=Number(request.headers.get('content-length')||0);if(length>2_000_000)throw new AppError('This entry is too large. Please shorten it.',413);const text=await request.text();if(text.length>2_000_000)throw new AppError('This entry is too large.',413);try{return JSON.parse(text);}catch{throw new AppError('The request could not be read.');}}
