import definitions from './registry.json';
import frozen from './catalog-v1.json';
import {available,emptyEntry,episodeKey,type Project,type Records} from '../model';
export const legendVersion=1;
export const registry=definitions;
const catalog=frozen as Project[];
export function evaluate(records:Records,now:string){
 const complete=(id:string)=>{const p=catalog.find(p=>p.id===id)!;const r=records[id]||emptyEntry();if(p.section==='future'||p.date>now)return false;if(p.type!=='series')return r.watched;return p.seasons.length>0&&p.seasons.every(s=>s.episodes>0&&Array.from({length:s.episodes},(_,i)=>i+1).every(e=>available(p,s,e,now)&&r.episodes.includes(episodeKey(s.number,e))));};
 const episodes=catalog.reduce((n,p)=>n+p.seasons.reduce((n,s)=>n+Array.from({length:s.episodes},(_,i)=>i+1).filter(e=>available(p,s,e,now)&&records[p.id]?.episodes.includes(episodeKey(s.number,e))).length,0),0);
 return registry.map(a=>{const role=a.owner==='anton'?'anton':'tanya';const rated=catalog.filter(p=>records[p.id]?.[role]!=null);let current=0;
 switch(a.metric){case 'collection':case 'watched':current=a.projects.filter(complete).length;break;case 'episodes':current=episodes;break;case 'series':current=catalog.filter(p=>p.type==='series'&&complete(p.id)).length;break;case 'ratings':current=rated.filter(p=>p.type==='film').length;break;case 'rated-series':current=rated.filter(p=>p.type==='series').length;break;case 'perfect':current=rated.filter(p=>records[p.id][role]===10).length;break;case 'strict':current=rated.filter(p=>(records[p.id][role]??11)<=3).length;}
 return {...a,current:Math.min(current,a.threshold),qualified:current>=a.threshold,missing:a.projects.filter(id=>!complete(id))};});
}
export function level(xp:number){let level=1,threshold=0,next=100;while(xp>=next){threshold=next;level++;next+=100+50*(level-1);}return {level,current:xp-threshold,total:next-threshold};}
