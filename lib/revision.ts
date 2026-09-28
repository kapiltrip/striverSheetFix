import { createEmptyCard, fsrs, Rating, type CardInput, type Grade } from 'ts-fsrs';
import type { Outcome, Problem, StudyState, StudyRecord } from './types';
const scheduler=fsrs({request_retention:0.9,enable_fuzz:false});
const DAY_MS=86_400_000;
function dayNumber(value:string){return Math.floor(Date.parse(`${value}T00:00:00Z`)/DAY_MS);}
export function sessionBudget(minutes:number){const recall=Math.min(10,Math.floor(minutes/5));const reflection=minutes>=30?5:2;return {recall,reflection,solve:minutes-recall-reflection};}
export const newSchedule=(now=Date.now())=>createEmptyCard(new Date(now));
export function rateRecall(card:CardInput,rating:number,now=Date.now()){
  if(![Rating.Again,Rating.Hard,Rating.Good,Rating.Easy].includes(rating))throw new Error('Choose a valid recall rating.');
  return scheduler.next(card,new Date(now),rating as Grade);
}
export function nextSolve(outcome:Outcome,streak:number,now=Date.now()){
  const nextStreak=outcome==='solved'?streak+1:0;
  const days=outcome==='retry'?1:outcome==='assisted'?2:[3,7,14,30,60][Math.min(nextStreak-1,4)];
  return {solveStreak:nextStreak,solveDue:now+days*DAY_MS};
}
export function localDay(time:number,timezone='Asia/Kolkata'){return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));}
export function planLoad(totalProblems:number,solvedProblems:number,startDate:string,targetDate:string,now=Date.now()){
  const today=localDay(now),remaining=Math.max(0,totalProblems-solvedProblems),paused=today<startDate;
  const effectiveStart=paused?startDate:today;
  const daysRemaining=Math.max(0,dayNumber(targetDate)-dayNumber(effectiveStart)+1);
  const minimumPerDay=daysRemaining?Math.floor(remaining/daysRemaining):remaining;
  const maximumPerDay=daysRemaining?Math.ceil(remaining/daysRemaining):remaining;
  const heavierDays=daysRemaining?remaining-minimumPerDay*daysRemaining:0;
  return {today,startDate,targetDate,effectiveStart,paused,remaining,daysRemaining,minimumPerDay,maximumPerDay,heavierDays,overdue:today>targetDate&&remaining>0};
}
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
  const due=dueWork(state,now),byId=new Map(problems.map(p=>[p.id,p])),order=new Map(problems.map((p,index)=>[p.id,index]));
  const recorded=new Set(state.records.map(r=>r.problemId));
  const next=problems.find(p=>!recorded.has(p.id));
  const nextIndex=next?order.get(next.id)!:problems.length;
  const isEarlier=(id:string)=>(order.get(id)??Infinity)<nextIndex;
  const unfinished=state.records.filter(r=>r.status==='in-progress'&&isEarlier(r.problemId)).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
  if(unfinished&&byId.has(unfinished.problemId))return {problem:byId.get(unfinished.problemId)!,reason:'Continue where you stopped'};
  const reattempt=due.solves.find(r=>isEarlier(r.problemId));
  if(reattempt&&byId.has(reattempt.problemId))return {problem:byId.get(reattempt.problemId)!,reason:'Ready for another attempt'};
  return next?{problem:next,reason:'Next in your study path'}:null;
}
export function weeklySummary(state:StudyState,now=Date.now()){
  const attempts=state.attempts.filter(a=>a.at>=now-7*DAY_MS);
  const reviews=state.reviews.filter(r=>r.at>=now-7*DAY_MS);
  return {minutes:attempts.reduce((n,a)=>n+a.minutes,0),attempts:attempts.length,independent:attempts.filter(a=>a.outcome==='solved').length,recall:reviews.length?Math.round(reviews.filter(r=>r.rating>1).length/reviews.length*100):null,reviewCount:reviews.length,activeDays:new Set(attempts.map(a=>localDay(a.at)).concat(reviews.map(r=>localDay(r.at)))).size};
}
export function recordFor(records:StudyRecord[],id:string){return records.find(r=>r.problemId===id);}
