import { readFile, writeFile } from 'node:fs/promises';

const catalog=JSON.parse(await readFile(new URL('../lib/catalog.json',import.meta.url),'utf8'));
const outputUrl=new URL('../lib/question-summaries.json',import.meta.url);
const existing=await readFile(outputUrl,'utf8').then(JSON.parse).catch(()=>({}));
const manual={
  '425':'Read an integer supplied by the user and print that same number using the language’s standard output operation.',
  '1211':'Learn the basic syntax and building blocks of C++ that you need before solving programming problems.',
  '2869':'Understand how arrays store indexed values and how strings represent character sequences, including their basic access and traversal operations.',
  '754':'Given strings s1 and s2, find the shortest substring of s1 containing s2 as a subsequence; return an empty string if none exists.',
  '2398':'In a binary search tree, find its minimum and maximum key values by using the tree’s ordering property.',
  '2390':'Review the bitwise operations and binary-number ideas needed before solving binary-trie problems.',
  '981':'Compute the Z-function for a string: at each position, record the longest prefix that also matches the substring starting there.',
  '980':'Add characters only to the beginning of a string so the result is a palindrome, using as few added characters as possible.'
};

function decode(value){
  return value
    .replace(/&#(\d+);/g,(_,number)=>String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi,(_,number)=>String.fromCodePoint(Number.parseInt(number,16)))
    .replace(/&nbsp;|\u00a0/g,' ')
    .replace(/&amp;/g,'&')
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/&quot;|&ldquo;|&rdquo;/g,'"')
    .replace(/&#39;|&apos;|&lsquo;|&rsquo;/g,"'");
}

function plainText(value=''){
  return decode(value)
    .replace(/<sup>(.*?)<\/sup>/gi,'^$1')
    .replace(/<sub>(.*?)<\/sub>/gi,'_$1')
    .replace(/<br\s*\/?>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function concise(value,title){
  const cleaned=plainText(value)
    .replace(/^Detailed solution for .* - (?=(?:Problem|Given|What|When|In|Introduction|This|Hashing|Spanning|Input|Boundary|Recursion|A celebrity)\b)/i,'')
    .replace(/\s+(?:Example(?:\s+\d+)?|Examples|Constraints|Follow-up)\s*:\s.*$/i,'')
    .replace(/^(?:Problem statement|Problem description|Description)\s*:?\s*/i,'');
  if(!cleaned)return `Solve “${title}” using the input and output requirements on the exercise page.`;
  const words=cleaned.split(' ');
  if(words.length<=24)return /[.!?]$/.test(cleaned)?cleaned:`${cleaned}.`;
  const shortened=words.slice(0,24).join(' ').replace(/[,;:]$/,'');
  return `${shortened}…`;
}

function metaDescription(html){
  for(const tag of html.match(/<meta\s[^>]*>/gi)||[]){
    const attributes=Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(match=>[match[1].toLowerCase(),match[3]]));
    if(['description','og:description','twitter:description'].includes((attributes.name||attributes.property||'').toLowerCase())&&attributes.content)return attributes.content;
  }
  return '';
}

async function fetchText(url,options){
  const response=await fetch(url,{...options,headers:{'User-Agent':'Recall catalog updater (+private study app)',Accept:'text/html,application/json',...options?.headers},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function fromLeetCode(url){
  const slug=new URL(url).pathname.split('/').filter(Boolean)[1];
  const query='query questionData($titleSlug: String!) { question(titleSlug: $titleSlug) { content } }';
  const body=await fetchText('https://leetcode.com/graphql',{method:'POST',headers:{'Content-Type':'application/json',Referer:url},body:JSON.stringify({query,variables:{titleSlug:slug}})});
  return JSON.parse(body).data?.question?.content||'';
}

async function fromPage(url){
  if(!url||url.includes('$undefined'))return '';
  return metaDescription(await fetchText(url));
}

async function summary(problem){
  if(manual[problem.id])return manual[problem.id];
  const primary=problem.url?.includes('leetcode.com/problems/')?()=>fromLeetCode(problem.url):()=>fromPage(problem.url);
  const candidates=[primary,()=>fromPage(problem.article)];
  for(const candidate of candidates){
    try{
      const value=await candidate();
      const text=plainText(value);
      if(text.length>8&&!/Solve this DSA problem on takeUforward/i.test(text))return concise(text,problem.title);
    }catch{}
  }
  return concise('',problem.title);
}

const pending=catalog.problems;
let cursor=0;
let completed=0;
async function worker(){
  while(cursor<pending.length){
    const problem=pending[cursor++];
    existing[problem.id]=await summary(problem);
    completed++;
    if(completed%25===0||completed===pending.length)console.log(`Prepared ${completed}/${pending.length}`);
  }
}

await Promise.all(Array.from({length:8},worker));
const ordered=Object.fromEntries(catalog.problems.map(problem=>[problem.id,existing[problem.id]||concise('',problem.title)]));
await writeFile(outputUrl,`${JSON.stringify(ordered,null,2)}\n`);
console.log(`Saved ${Object.keys(ordered).length} concise question summaries.`);
