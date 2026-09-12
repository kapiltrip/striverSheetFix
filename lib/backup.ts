import catalog from './catalog.json';
import { localDay } from './revision';
import type { Attachment,Backup,StudyState } from './types';
export function imagePath(a:Attachment){return `recall/images/${a.id}.${a.mime==='image/jpeg'?'jpg':a.mime==='image/png'?'png':a.mime==='image/webp'?'webp':'pdf'}`;}
export function makeBackup(state:StudyState,at=Date.now()):Backup{
  return {format:'recall-backup',version:1,exportedAt:at,catalogSource:catalog.source,records:state.records,attempts:state.attempts,cards:state.cards,reviews:state.reviews,attachments:state.attachments.map(a=>({...a,key:imagePath(a)}))};
}
export function textFiles(state:StudyState,backup:Backup):Map<string,string>{
  const result=new Map<string,string>();const lookup=new Map(catalog.problems.map(p=>[p.id,p]));
  const escape=(s:string)=>s.replace(/[\[\]|]/g,' ').replace(/\r?\n/g,' ');
  const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70);
  const folder=(id:string)=>`${id}-${slug(lookup.get(id)?.title||id)}`;
  const extensions:Record<string,string>={cpp:'cpp',java:'java',python:'py',javascript:'js',typescript:'ts',c:'c'};
  const fence=(text:string)=>'`'.repeat(Math.max(3,...[...text.matchAll(/`+/g)].map(m=>m[0].length+1)));
  const block=(code:string,language:string)=>{const f=fence(code);return `${f}${language}\n${code}\n${f}`;};
  for(const record of state.records){
    const p=lookup.get(record.problemId);if(!p)continue;const prefix=`recall/problems/${folder(p.id)}`;
    const files=state.attachments.filter(a=>a.problemId===p.id);
    const images=files.map(a=>a.mime==='application/pdf'?`[${escape(a.name)}](../../images/${imagePath(a).split('/').pop()})`:`![${escape(a.name)}](../../images/${imagePath(a).split('/').pop()})`).join('\n\n');
    const cards=state.cards.filter(c=>c.problemId===p.id).map(c=>`### ${c.front}\n\n${c.back}`).join('\n\n');
    const history=state.attempts.filter(a=>a.problemId===p.id).map(a=>`| ${localDay(a.at)} | ${a.outcome} | ${a.minutes} |`).join('\n');
    result.set(`${prefix}/notes.md`,`# ${p.title}\n\n[Exercise](${p.url||p.article}) · ${p.topic}\n\n[Notes](#notes) · [Code](#code) · [Mistakes](#mistakes) · [Recall](#recall) · [Attempts](#attempts)\n\nStatus: ${record.status}\n\n## Source pages\n\n${images||'No files attached.'}\n\n## Notes\n\n${record.notes||'No notes yet.'}\n\n## Code\n\n${record.code?block(record.code,record.language):'No code saved yet.'}\n\n## Mistakes\n\n${record.mistake||'No mistake recorded.'}\n\n## Recall\n\n${cards||'No recall cards yet.'}\n\n## Attempts\n\n| Date | Result | Minutes |\n| --- | --- | ---: |\n${history}\n`);
    if(record.code)result.set(`${prefix}/solution.${extensions[record.language]||'txt'}`,record.code+'\n');
  }
  const days=[...new Set(state.attempts.map(a=>localDay(a.at)))].sort();
  for(const day of days){const attempts=state.attempts.filter(a=>localDay(a.at)===day).sort((a,b)=>a.at-b.at);let body=`# ${day}\n\n`;
    body+=attempts.map((a,i)=>`- [${escape(lookup.get(a.problemId)?.title||a.problemId)}](#attempt-${i+1})`).join('\n')+'\n\n';
    body+=attempts.map((a,i)=>`<a id="attempt-${i+1}"></a>\n\n## ${lookup.get(a.problemId)?.title||a.problemId}\n\nResult: ${a.outcome} · ${a.minutes} minutes\n\n${a.notes}\n\n${a.code?block(a.code,a.language):'No code recorded for this attempt.'}\n\n${a.mistake?`Mistake to revisit: ${a.mistake}\n\n`:''}[Problem notebook](../problems/${folder(a.problemId)}/notes.md)`).join('\n\n---\n\n');result.set(`recall/days/${day}.md`,body+'\n');}
  result.set('recall/state.json',JSON.stringify(backup,null,2)+'\n');
  result.set('recall/README.md',`# DSA study notebook\n\nYour original code, notes, images, and revision history from Recall.\n\n## Problems\n\n| Problem | Topic | Status |\n| --- | --- | --- |\n${state.records.map(r=>{const p=lookup.get(r.problemId);return `| [${escape(p?.title||r.problemId)}](problems/${folder(r.problemId)}/notes.md) | ${escape(p?.topic||'')} | ${r.status} |`;}).join('\n')}\n\n## Study days\n\n${days.map(d=>`- [${d}](days/${d}.md)`).join('\n')||'Your first saved attempt will appear here.'}\n\n## Restore\n\nRecall can merge this repository’s state.json and images into your study space. Newer saved work is preserved.\n\n[Original A2Z sheet](${catalog.source})\n`);
  return result;
}
