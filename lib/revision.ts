import { createEmptyCard, fsrs, Rating, type CardInput, type Grade } from 'ts-fsrs';
import type { Outcome, Problem, StudyState, StudyRecord } from './types';
const scheduler=fsrs({request_retention:0.9,enable_fuzz:false});
export function sessionBudget(minutes:number){const recall=Math.min(10,Math.floor(minutes/5));const reflection=minutes>=30?5:2;return {recall,reflection,solve:minutes-recall-reflection};}
export const newSchedule=(now=Date.now())=>createEmptyCard(new Date(now));
export function rateRecall(card:CardInput,rating:number,now=Date.now()){
  if(![Rating.Again,Rating.Hard,Rating.Good,Rating.Easy].includes(rating))throw new Error('Choose a valid recall rating.');
  return scheduler.next(card,new Date(now),rating as Grade);
}
export function nextSolve(outcome:Outcome,streak:number,now=Date.now()){
  const nextStreak=outcome==='solved'?streak+1:0;
  const days=outcome==='retry'?1:outcome==='assisted'?2:[3,7,14,30,60][Math.min(nextStreak-1,4)];
  return {solveStreak:nextStreak,solveDue:now+days*86_400_000};
}
export function localDay(time:number,timezone='Asia/Kolkata'){return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));}
export function scheduleLabel(time:number|string|Date|null,now=Date.now()){
  if(time===null)return 'Not scheduled';
  const due=new Date(time).getTime(),remaining=due-now;
  if(remaining<=0)return 'Due now';
  if(remaining<60_000)return 'In a minute';
  if(remaining<3_600_000)return `In ${Math.ceil(remaining/60_000)} min`;
  const days=Math.round((Date.parse(localDay(due))-Date.parse(localDay(now)))/86_400_000);
  return days===0?'Later today':days===1?'Tomorrow':`In ${days} days`;
}
export function dueWork(state:StudyState,now=Date.now()){
  return {cards:state.cards.filter(c=>new Date(c.schedule.due).getTime()<=now).sort((a,b)=>new Date(a.schedule.due).getTime()-new Date(b.schedule.due).getTime()),solves:state.records.filter(r=>r.solveDue!==null&&r.solveDue<=now).sort((a,b)=>a.solveDue!-b.solveDue!)};
}
export function chooseNext(problems:Problem[],state:StudyState,now=Date.now()):{problem:Problem;reason:string}|null{
  const due=dueWork(state,now),byId=new Map(problems.map(p=>[p.id,p]));
  const unfinished=state.records.filter(r=>r.status==='in-progress').sort((a,b)=>b.updatedAt-a.updatedAt)[0];
  if(unfinished&&byId.has(unfinished.problemId))return {problem:byId.get(unfinished.problemId)!,reason:'Continue where you stopped'};
  if(due.solves[0]&&byId.has(due.solves[0].problemId))return {problem:byId.get(due.solves[0].problemId)!,reason:'Ready for another attempt'};
  const recorded=new Set(state.records.map(r=>r.problemId));
  const next=problems.find(p=>!recorded.has(p.id));
  return next?{problem:next,reason:'Next in your A2Z journey'}:null;
}
export function weeklySummary(state:StudyState,now=Date.now()){
  const attempts=state.attempts.filter(a=>a.at>=now-7*86_400_000);
  const reviews=state.reviews.filter(r=>r.at>=now-7*86_400_000);
  return {minutes:attempts.reduce((n,a)=>n+a.minutes,0),attempts:attempts.length,independent:attempts.filter(a=>a.outcome==='solved').length,recall:reviews.length?Math.round(reviews.filter(r=>r.rating>1).length/reviews.length*100):null,reviewCount:reviews.length,activeDays:new Set(attempts.map(a=>localDay(a.at)).concat(reviews.map(r=>localDay(r.at)))).size};
}
export function recordFor(records:StudyRecord[],id:string){return records.find(r=>r.problemId===id);}
