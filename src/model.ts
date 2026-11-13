import raw from './catalog.json';
export type Section='main'|'defenders'|'related'|'animation'|'future';
export type Season={number:number;date:string;episodes:number;phase:number|null;episodeDates?:string[]};
export type Project={id:string;title:string;original:string;year:number;date:string;phase:number|null;type:'film'|'series'|'special';section:Section;seasons:Season[];seasonCount:number;description:string;sources:string[];chronology:number|null;poster:string;verifiedAt:string};
export const catalog=raw as Project[];
export type Entry={watched:boolean;date:string;anton:number|null;tanya:number|null;note:string;favorite:boolean;episodes:string[];updatedAt:string};
export type Records=Record<string,Entry>;
export const emptyEntry=():Entry=>({watched:false,date:'',anton:null,tanya:null,note:'',favorite:false,episodes:[],updatedAt:''});
export const today=()=>new Date().toLocaleDateString('en-CA');
export const sectionNames:Record<Section,string>={main:'Основной MCU',defenders:'Сага Защитников',related:'Связанные сериалы',animation:'Другие вселенные',future:'Впереди'};
export const typeNames={film:'Фильм',series:'Сериал',special:'Спецвыпуск'};
export const episodeKey=(s:number,e:number)=>`${s}:${e}`;
export function available(p:Project,s:Season,e:number,now=today()){return (s.episodeDates?.[e-1]||s.date)<=now && p.section!=='future';}
export function progress(p:Project,r?:Entry){
 if(p.type!=='series')return {done:r?.watched?1:0,total:1};
 let done=0,total=0;for(const s of p.seasons)for(let e=1;e<=s.episodes;e++){total++;if(r?.episodes.includes(episodeKey(s.number,e))&&available(p,s,e))done++;}
 return {done,total};
}
export function watched(p:Project,r?:Entry){const x=progress(p,r);return p.section!=='future'&&x.total>0&&x.done===x.total;}
export function average(r?:Entry){if(r?.anton==null||r?.tanya==null)return null;return (r.anton+r.tanya)/2;}
export function markAll(p:Project,r:Entry,on:boolean):Entry{
 const episodes=on?p.seasons.flatMap(s=>Array.from({length:s.episodes},(_,i)=>i+1).filter(e=>available(p,s,e)).map(e=>episodeKey(s.number,e))):[];
 const next={...r,watched:on,episodes,date:on?(r.date||today()):'',updatedAt:new Date().toISOString()};
 if(p.type==='series')next.watched=watched(p,next);
 if(!next.watched)next.date='';
 return next;
}
export function toggleEpisode(p:Project,r:Entry,key:string){
 const episodes=r.episodes.includes(key)?r.episodes.filter(e=>e!==key):[...r.episodes,key];
 const next={...r,episodes,updatedAt:new Date().toISOString()}; next.watched=watched(p,next);next.date=next.watched?(r.date||today()):'';
 return next;
}
export type Filters={query:string;section:Section|'all';type:string;status:string;phase:string;sort:string};
export function selectProjects(records:Records,f:Filters){
 const q=f.query.toLocaleLowerCase('ru').replace(/ё/g,'е').trim();
 return catalog.filter(p=>{
 const r=records[p.id];return (f.section==='all'?p.section!=='future':p.section===f.section)&&(!q||`${p.title} ${p.original}`.toLocaleLowerCase('ru').replace(/ё/g,'е').includes(q))&&(f.type==='all'||p.type===f.type)&&(f.status==='all'||(f.status==='watched'?watched(p,r):f.status==='unwatched'?!watched(p,r):r?.favorite))&&(f.phase==='all'||p.phase===Number(f.phase)||p.seasons.some(s=>s.phase===Number(f.phase)));
 }).sort((a,b)=>{
 if(f.sort==='rating')return (average(records[b.id])??-1)-(average(records[a.id])??-1)||a.date.localeCompare(b.date);
 if(f.sort==='year')return b.year-a.year||a.date.localeCompare(b.date);
 if(f.sort==='phase')return (a.phase??99)-(b.phase??99)||a.date.localeCompare(b.date);
 if(f.sort==='chronology')return (a.chronology??999)-(b.chronology??999)||a.date.localeCompare(b.date);
 return a.date.localeCompare(b.date)||a.id.localeCompare(b.id);
 });
}
export function stats(records:Records,projects=catalog.filter(p=>p.section!=='future')){
 const done=projects.filter(p=>watched(p,records[p.id]));const ratings=projects.map(p=>average(records[p.id])).filter((x):x is number=>x!==null);
 return {total:projects.length,done:done.length,left:projects.length-done.length,percent:projects.length?Math.round(done.length/projects.length*100):0,average:ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:null,films:done.filter(p=>p.type==='film').length,series:done.filter(p=>p.type==='series').length,episodes:projects.reduce((n,p)=>n+(p.type==='series'?progress(p,records[p.id]).done:0),0)};
}
export function validateBackup(input:unknown):Records{
 if(!input||typeof input!=='object')throw Error('Файл не является резервной копией.');
 const v=input as {app?:string;version?:number;records?:unknown};
 if(v.app!=='our-marvel'||v.version!==1||!v.records||typeof v.records!=='object'||Array.isArray(v.records))throw Error('Неподдерживаемый формат копии.');
 const result:Records={};
 for(const [id,value] of Object.entries(v.records)){
 if(!/^[a-z0-9-]{1,100}$/.test(id)||!value||typeof value!=='object')throw Error('Повреждённая запись.');
 const r=value as Entry;
 if(typeof r.watched!=='boolean'||typeof r.favorite!=='boolean'||typeof r.note!=='string'||r.note.length>20000||typeof r.date!=='string'||(r.date!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||Number.isNaN(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date))||!Array.isArray(r.episodes)||r.episodes.length>5000||r.episodes.some(e=>typeof e!=='string'||!/^\d+:\d+$/.test(e))||[r.anton,r.tanya].some(x=>x!==null&&(!Number.isInteger(x)||x<1||x>10)))throw Error('В копии есть некорректные даты, оценки или серии.');
 result[id]={...emptyEntry(),...r,episodes:[...new Set(r.episodes)],updatedAt:typeof r.updatedAt==='string'?r.updatedAt:''};
 }
 return result;
}
// Series remain grouped in the catalog, while the next release recommendation
// uses the earliest season with an unwatched, already released episode.
export function nextRecommendation(records:Records,f:Filters):{project:Project;season?:number}|undefined{
 const projects=selectProjects(records,f);
 const candidates=projects.flatMap((project,index)=>{
  const r=records[project.id];
  if(project.section==='future'||watched(project,r))return [];
  if(project.type!=='series')return [{project,date:project.date,phase:project.phase,index,season:undefined as number|undefined}];
  return project.seasons.filter(s=>Array.from({length:s.episodes},(_,i)=>i+1).some(e=>available(project,s,e)&&!r?.episodes.includes(episodeKey(s.number,e)))).map(s=>({project,date:s.date,phase:s.phase,index,season:s.number}));
 });
 candidates.sort((a,b)=>f.sort==='release'?a.date.localeCompare(b.date):f.sort==='phase'?(a.phase??99)-(b.phase??99)||a.date.localeCompare(b.date):f.sort==='year'?b.date.localeCompare(a.date):a.index-b.index||a.date.localeCompare(b.date));
 return candidates[0];
}
