import { after } from 'next/server';
import { z } from 'zod';
import { AppError,failure,identity,loadState,readJson,reply } from '@/lib/server';
import { connectGithub,getRemoteBackup,restoreWorkspace,syncWorkspace } from '@/lib/github';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
  const userId=await identity(request,true);const input=await readJson(request);let result:unknown;
  if(input.action==='connect'){const data=z.object({repository:z.string(),token:z.string().min(10).max(500)}).parse(input);await connectGithub(userId,data.repository,data.token);after(async()=>{try{await syncWorkspace(userId);}catch{}});result={connected:true};}
  else if(input.action==='sync')result=await syncWorkspace(userId);
  else if(input.action==='preview-restore'){const b=await getRemoteBackup(userId);result={exportedAt:b.exportedAt,records:b.records.length,attempts:b.attempts.length,cards:b.cards.length,attachments:b.attachments.length};}
  else if(input.action==='restore')result=await restoreWorkspace(userId);
  else throw new AppError('That GitHub action is not supported.');
  return reply({result,state:await loadState(userId)});
}catch(error){return failure(error);}}
