from pathlib import Path
import json,zipfile,struct,re,math,textwrap,sys
from PIL import Image,ImageDraw,ImageFont,ImageChops
scratch=Path(sys.argv[1]);output=Path(sys.argv[2]);source=Path(sys.argv[3]);slug=sys.argv[4];label=sys.argv[5]
loc=json.loads((scratch/'names.json').read_text(encoding='utf-8'))
d=json.loads((scratch/'projected.json').read_text(encoding='utf-8'))
warningpath=scratch/'model-warnings.json'
if warningpath.exists():
 warnings=json.loads(warningpath.read_text(encoding='utf-8'))
 for check in d['checks']:
  check['modelWarnings']=[w for w in warnings if w['code']==check['code']]
for a in d['assets']:
 code=a['code'];a['id']=code
 name=loc.get('Assets.NAME['+code+']')
 if not name:
  m=re.fullmatch(r'(EU|NA)_(MixedOldTown(?:Left|Right)?|ResidentialLow)(\d+)_L(\d+)_(\d+x\d+)',code)
  if m:
   theme='欧式' if m[1]=='EU' else '北美';kind='低密住宅' if 'Residential' in m[2] else '老城商住';corner='左角' if 'Left' in m[2] else '右角' if 'Right' in m[2] else ''
   name=f'{theme}{kind}{corner} {m[3]} · {m[5]} · L{m[4]}'
  else:
   cn=re.fullmatch(r'CN_(Bonus)?(ResidentialLow|ResidentialMedium|ResidentialHigh|LowRent|OfficeHigh|HighOffice)([A-Za-z0-9]*)_L(\d+)_(\d+x\d+)',code)
   labels={'ResidentialLow':'低密住宅','ResidentialMedium':'中密住宅','ResidentialHigh':'高密住宅','LowRent':'廉租住宅','OfficeHigh':'高层办公','HighOffice':'高层办公'}
   name=(f'中式{labels[cn[2]]} {cn[3]} · {cn[5]} · L{cn[4]}'+(' · 额外款' if cn[1] else '')) if cn else code
 a['name']=name
pack={'id':slug,'name':label,'assets':d['assets']}
library={'format':'cs2-building-assets','version':1,'packs':[pack]}
for a in pack['assets']:
 if len(a['rings'])>512:
  def ringarea(r):return abs(sum(x*v-u*y for (x,y),(u,v) in zip(r,r[1:]+r[:1]))/2)
  ordered=sorted(a['rings'],key=ringarea,reverse=True);removed=ordered[512:];bound=sum(map(ringarea,removed))
  if bound<=max(.1,a['area']*.0001):
   from shapely.geometry import Polygon
   a['rings']=ordered[:512];g=Polygon()
   for ring in a['rings']:g=g.symmetric_difference(Polygon(ring))
   a['area']=round(g.area,2)
   next(c for c in d['checks'] if c['code']==a['code'])['exportGeneralization']={'removedTinyRings':len(removed),'areaChangeBoundM2':bound}
 if len(a['rings'])>512 or any(len(r)<3 or len(r)>5000 for r in a['rings']):raise ValueError('轮廓复杂度超过地图支持范围：'+a['code'])
 if not a['height']>0 or any(v<=0 for v in a['lot']):raise ValueError('建筑尺寸无效：'+a['code'])
(output/(slug+'.cs2assets')).write_text(json.dumps(library,ensure_ascii=False,separators=(',',':')).replace('-0.0,','0,').replace('-0.0]','0]'),encoding='utf-8')
report=scratch/'预览';report.mkdir(parents=True,exist_ok=True)
fontpath='C:/Windows/Fonts/msyh.ttc'
def sheet(selected,title,file,cols=7):
 cw,ch=280,245;W=cols*cw+40;H=108+math.ceil(len(selected)/cols)*ch;im=Image.new('RGB',(W,H),'#f7faf7');draw=ImageDraw.Draw(im)
 def text(x,y,t,size=13,fill='#35594d'):draw.text((x,y),t,font=ImageFont.truetype(fontpath,size),fill=fill)
 text(20,14,title,26);text(20,54,'浅绿为真实地块，蓝色为主模型投影；各卡片自适应缩放，尺寸以标注为准。',15);text(20,78,'来源编号保持原样；未提供明确人数上限则留空。不含道具、附加模块或三维模型。',13)
 for i,a in enumerate(selected):
  x=20+(i%cols)*cw;y=104+(i//cols)*ch;draw.rounded_rectangle((x,y,x+cw-10,y+ch-8),5,fill='white',outline='#dce5da')
  text(x+9,y+7,a['name'][:26],13)
  for j,t in enumerate(textwrap.wrap(a['code'],36)[:2]):text(x+9,y+29+j*12,t,10,'#819484')
  rings=a['rings'];w,h=a['lot'];ps=[p for r in rings for p in r]+[[-w/2,-h/2],[w/2,h/2]];xs,ys=zip(*ps);lo=[min(xs),min(ys)];hi=[max(xs),max(ys)];scale=min(240/(hi[0]-lo[0]),120/(hi[1]-lo[1]));cx=x+130;cy=y+124
  xy=lambda p:(round(cx+(p[0]-(lo[0]+hi[0])/2)*scale),round(cy+(p[1]-(lo[1]+hi[1])/2)*scale))
  draw.rectangle((*xy([-w/2,-h/2]),*xy([w/2,h/2])),fill='#edf3e4',outline='#9bb392')
  mask=Image.new('1',(cw,ch));
  for ring in rings:
   temp=Image.new('1',(cw,ch));md=ImageDraw.Draw(temp);md.polygon([(px-x,py-y) for px,py in map(xy,ring)],fill=1);mask=ImageChops.logical_xor(mask,temp)
  im.paste('#4b8293',(x,y,x+cw,y+ch),mask)
  text(x+9,y+190,f'占地 {w} × {h} m   高 {a["height"]:.2f} m',12)
  text(x+9,y+208,f'投影 {a["area"]:,.1f} m²',12)
  if a['maxEmployees'] is not None:text(x+9,y+225,f'最大雇佣人口 {a["maxEmployees"]} 人',11)
 im.save(report/file)
sheet(d['assets'],label+' · '+str(len(d['assets']))+' 栋建筑','全部建筑-占地与投影.png')

(report/'投影核验.json').write_text(json.dumps(d['checks'],ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'assets':len(pack['assets']),'vertices':sum(len(r) for a in pack['assets'] for r in a['rings']),'maxRings':max(len(a['rings']) for a in pack['assets']),'maxAssetVertices':max(sum(map(len,a['rings'])) for a in pack['assets']),'libraryBytes':(output/(slug+'.cs2assets')).stat().st_size},ensure_ascii=False))
