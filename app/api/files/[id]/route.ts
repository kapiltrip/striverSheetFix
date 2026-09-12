import { AppError,bucket,database,failure,identity } from '@/lib/server';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
  const userId=await identity(request);const {id}=await params;
  const row=await database().prepare('SELECT data FROM attachments WHERE id=? AND user_id=?').bind(id,userId).first<{data:string}>();
  if(!row)throw new AppError('File not found.',404);const attachment=JSON.parse(row.data);const object=await bucket().get(attachment.key);
  if(!object)throw new AppError('This file could not be found in storage.',404);
  return new Response(object.body,{headers:{'Content-Type':attachment.mime,'Content-Length':String(attachment.size),'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=3600'}});
}catch(error){return failure(error);}}
