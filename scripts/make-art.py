import pathlib,json,html,colorsys,math
from PIL import Image,ImageDraw,ImageFont
pathlib.Path('public/covers').mkdir(exist_ok=True)
items=json.loads(pathlib.Path('src/catalog.json').read_text())
for i,p in enumerate(items):
 hue=(i*47+4)%360; color=f'hsl({hue},68%,52%)'; color2=f'hsl({(hue+40)%360},60%,22%)'
 lines=[];words=p['original'].upper().split();line=''
 for w in words:
  if len(line+' '+w)>20:lines.append(line);line=w
  else:line=(line+' '+w).strip()
 if line:lines.append(line)
 title=''.join(f'<text x="40" y="{420+j*31}" fill="#fff" font-family="Arial,sans-serif" font-size="27" font-weight="900" letter-spacing="-1">{html.escape(t)}</text>' for j,t in enumerate(lines))
 motif=i%4
 shapes=[f'<circle cx="200" cy="235" r="115" fill="none" stroke="{color}" stroke-width="2"/><circle cx="200" cy="235" r="80" fill="none" stroke="{color}" stroke-width="20" opacity=".5"/><path d="M200 160L269 280H131Z" fill="none" stroke="#fff" stroke-width="4" opacity=".75"/>',f'<path d="M235 80L115 250H203L175 370L295 190H207Z" fill="{color}"/><path d="M235 80L207 190H295L175 370" fill="none" stroke="#fff" opacity=".5"/>',f'<circle cx="200" cy="225" r="110" fill="none" stroke="{color}" stroke-width="25"/><circle cx="200" cy="225" r="71" fill="none" stroke="#fff" stroke-width="2" opacity=".6"/><path d="M200 168L215 207L257 209L224 235L235 278L200 253L165 278L176 235L143 209L185 207Z" fill="{color}"/>',f'<path d="M200 90L310 170V270L200 340L90 270V170Z" fill="none" stroke="{color}" stroke-width="4"/><path d="M200 125L280 185V255L200 307L120 255V185Z" fill="{color}" opacity=".4"/><circle cx="200" cy="217" r="40" fill="none" stroke="#fff" stroke-width="2"/>'][motif]
 svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><defs><radialGradient id="g"><stop stop-color="{color2}"/><stop offset="1" stop-color="#0b101a"/></radialGradient><linearGradient id="v" x2="0" y2="1"><stop stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#04070e"/></linearGradient></defs><rect width="400" height="600" fill="url(#g)"/><path d="M0 340L400 0M0 410L400 70M0 480L400 140" stroke="{color}" opacity=".08" stroke-width="30"/>{shapes}<rect y="350" width="400" height="250" fill="url(#v)"/><text x="40" y="46" font-family="Arial" font-size="13" letter-spacing="4" fill="#fff" opacity=".5">OUR MARVEL COLLECTION</text>{title}<text x="40" y="565" font-family="Arial" letter-spacing="4" font-size="13" fill="{color}">{p['year']} · {('PHASE '+str(p['phase'])) if p['phase'] else 'EXTENDED STORIES'}</text></svg>'''
 pathlib.Path('public/'+p['poster']).write_text(svg)
for size,name in [(192,'icon-192.png'),(512,'icon-512.png'),(512,'icon-maskable.png'),(180,'apple-touch-icon.png')]:
 im=Image.new('RGB',(size,size),'#090d16');d=ImageDraw.Draw(im)
 d.rounded_rectangle((size*.15,size*.2,size*.85,size*.8),radius=size*.1,fill='#df283b')
 font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',int(size*.34));d.text((size*.5,size*.49),'M',font=font,fill='white',anchor='mm')
 d.line((size*.36,size*.7,size*.64,size*.7),fill='#e6bb77',width=max(2,int(size*.014)))
 im.save('public/icons/'+name)
