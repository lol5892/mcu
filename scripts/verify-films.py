import urllib.request,json,pathlib,re,datetime
from html.parser import HTMLParser
class Tables(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None
 def handle_starttag(self,tag,attrs):
  if tag=='tr':self.row=[]
  if tag in ('td','th') and self.row is not None:self.cell=[]
 def handle_endtag(self,tag):
  if tag in ('td','th') and self.cell is not None:
   if self.row is not None:self.row.append(''.join(self.cell).strip())
   self.cell=None
  if tag=='tr' and self.row is not None:self.rows.append(self.row);self.row=None
 def handle_data(self,data):
  if self.cell is not None:self.cell.append(data)
url='https://en.wikipedia.org/wiki/List_of_Marvel_Cinematic_Universe_films'
request=urllib.request.Request(url,headers={'User-Agent':'OurMarvelCatalogCheck/1.0 (personal noncommercial metadata verification)'})
with urllib.request.urlopen(request,timeout=40) as r:html=r.read().decode()
parser=Tables();parser.feed(html)
results=[]
for p in json.loads(pathlib.Path('src/catalog.json').read_text()):
 if p['type']!='film' or p['section']=='future':continue
 title=p['original'].lower().replace('’',"'")
 candidates=[row for row in parser.rows if row and title in row[0].lower().replace('’',"'") and re.search(r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}', ' '.join(row))]
 found=[]
 for row in candidates:
  for d in re.findall(r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}', ' '.join(row)):
   try:found.append(datetime.datetime.strptime(d.replace(',',''),'%B %d %Y').date().isoformat())
   except ValueError:pass
 result=dict(id=p['id'],title=p['original'],date=p['date'],sourceDates=sorted(set(found)),match=p['date'] in found)
 results.append(result)
pathlib.Path('docs/films-audit.json').write_text(json.dumps({'checkedAt':'2026-11-08','source':url,'results':results},ensure_ascii=False,indent=2))
for r in results:print(r['id'],'OK' if r['match'] else r['sourceDates'])
