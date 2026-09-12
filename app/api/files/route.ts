import { after } from 'next/server';
import catalog from '@/lib/catalog.json';
import { AppError,bucket,bump,database,ensureUser,failure,identity,reply } from '@/lib/server';
import { syncWorkspace } from '@/lib/github';
import { emptyRecord } from '@/lib/types';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
  const userId=await identity(request,true);await ensureUser(userId);
  if(Number(request.headers.get('content-length')||0)>9*1024*1024)throw new AppError('Choose a file smaller than 8 MB.',413);
  const form=await request.formData();const file=form.get('file');const problemId=String(form.get('problemId')||'');
  if(!catalog.problems.some(p=>p.id===problemId))throw new AppError('Choose a problem first.');
  if(!(file instanceof File)||!file.size||file.size>8*1024*1024)throw new AppError('Choose an image or PDF smaller than 8 MB.');
  const bytes=await file.arrayBuffer();const b=new Uint8Array(bytes);let mime='';let ext='';
  if(b[0]===0xff&&b[1]===0xd8&&b[2]===0xff){mime='image/jpeg';ext='jpg';}
  else if(b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47){mime='image/png';ext='png';}
  else if(new TextDecoder().decode(b.slice(0,4))==='RIFF'&&new TextDecoder().decode(b.slice(8,12))==='WEBP'){mime='image/webp';ext='webp';}
  else if(new TextDecoder().decode(b.slice(0,5))==='%PDF-'){mime='application/pdf';ext='pdf';}
  else throw new AppError('Supported files: JPG, PNG, WebP, and PDF.');
  const id=crypto.randomUUID();const key=`${userId}/${id}.${ext}`;
  await bucket().put(key,bytes,{httpMetadata:{contentType:mime}});
  const attachment={id,problemId,name:file.name.replace(/[\x00-\x1f/\\]/g,'_').slice(0,150),mime,size:file.size,key,createdAt:Date.now()};
  try{await database().batch([database().prepare('INSERT OR IGNORE INTO records (user_id,problem_id,data,version) VALUES (?,?,?,1)').bind(userId,problemId,JSON.stringify({...emptyRecord(problemId),updatedAt:Date.now(),version:1})),database().prepare('INSERT INTO attachments (id,user_id,problem_id,data) VALUES (?,?,?,?)').bind(id,userId,problemId,JSON.stringify(attachment)),bump(userId)]);}catch(error){await bucket().delete(key);throw error;}
  after(async()=>{try{await syncWorkspace(userId,false);}catch{}});
  return reply(attachment,201);
}catch(error){return failure(error);}}
