import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../src/catalog.json',import.meta.url),'utf8'));
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
console.log('insert into public.mv_projects(id,title,release_date,kind,section,seasons) values\n'+catalog.map(p=>`(${[p.id,p.title,p.date,p.type,p.section,JSON.stringify(p.seasons)].map(q).join(',')})`).join(',\n')+'\non conflict(id) do update set title=excluded.title,release_date=excluded.release_date,kind=excluded.kind,section=excluded.section,seasons=excluded.seasons;');
