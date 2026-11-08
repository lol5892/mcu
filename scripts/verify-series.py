import urllib.request, urllib.parse, json, concurrent.futures, pathlib, time
items=json.loads(pathlib.Path('src/catalog.json').read_text())
def check(p):
 if p['type']!='series':return None
 try:
  query={'Agents of S.H.I.E.L.D.: Slingshot':"Marvel's Agents of S.H.I.E.L.D.: Slingshot",'The Defenders':"Marvel's The Defenders",'Inhumans':"Marvel's Inhumans",'Runaways':"Marvel's Runaways"}.get(p['original'],p['original'])
  url='https://api.tvmaze.com/singlesearch/shows?q='+urllib.parse.quote(query)
  with urllib.request.urlopen(url,timeout=25) as r:show=json.load(r)
  with urllib.request.urlopen(f'https://api.tvmaze.com/shows/{show["id"]}/episodes',timeout=25) as r:episodes=json.load(r)
  rows=[]
  for s in p['seasons']:
   eps=[e for e in episodes if e['season']==s['number'] and e.get('type','regular')=='regular']
   rows.append(dict(season=s['number'],expected=s['episodes'],found=len(eps),catalogDate=s['date'],sourceDate=eps[0]['airdate'] if eps else None,match=len(eps)==s['episodes'] and (eps[0]['airdate']==s['date'] if eps else False)))
  return dict(id=p['id'],name=show['name'],source=show['url'],imdb=show.get('externals',{}).get('imdb'),seasons=rows)
 except Exception as e:return dict(id=p['id'],error=str(e))
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: results=list(filter(None,pool.map(check,items)))
pathlib.Path('docs').mkdir(exist_ok=True)
pathlib.Path('docs/series-audit.json').write_text(json.dumps({'checkedAt':'2026-11-08','source':'TVmaze episode API; supplementary to official sources','results':results},ensure_ascii=False,indent=2))
for r in results:
 print(r['id'],r.get('error') or ('OK' if all(s['match'] for s in r['seasons']) else r['seasons']))
