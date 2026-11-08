"""แปลง Natural Earth เป็นข้อมูลจังหวัดชุดเดียว ใช้เฉพาะตอนเตรียมข้อมูล"""
import json,sys,pathlib,subprocess,unicodedata,math
import shapely
from shapely.geometry import shape,mapping,Point
from shapely.ops import unary_union

root=pathlib.Path(__file__).resolve().parents[1]
source=pathlib.Path(sys.argv[1]); cities_path=pathlib.Path(sys.argv[2])
source_data=json.loads((root/'tools/province-source-inputs.json').read_text(encoding='utf8'))
legacy=json.loads(subprocess.check_output(['git','show','88a1600:data/provinces_2000.json'],cwd=root))
world=json.loads((root/'data/countries_2000.json').read_text(encoding='utf8'))
original=json.loads(source.read_text(encoding='utf8'))['features']
cities=json.loads(cities_path.read_text(encoding='utf8'))['features']
out=root/'data/provinces';out.mkdir(exist_ok=True)
names={'THA':'th','CHN':'cn','USA':'us','JPN':'jp','FRA':'fr'}
def norm(s):
 return ''.join(c.lower() for c in unicodedata.normalize('NFD',s or '') if c.isascii() and c.isalnum()).replace('saint','st')
def apportion(weights,total):
 scale=total/sum(weights);exact=[w*scale for w in weights];values=[math.floor(v) for v in exact]
 for i in sorted(range(len(values)),key=lambda i:exact[i]-values[i],reverse=True)[:total-sum(values)]:values[i]+=1
 return values
def city_for(country,geom,capital_en=None,adm_name=None):
 candidates=[f for f in cities if f['properties']['adm0_a3']==country]
 if capital_en:
  matched=[f for f in candidates if norm(capital_en) in [norm(f['properties'].get('name')),norm(f['properties'].get('nameascii'))]]
  if matched:
   return min(matched,key=lambda f:geom.distance(Point(f['geometry']['coordinates'])))
 matches=[f for f in candidates if (f['properties'].get('adm0cap') or 'Admin-1 capital' in f['properties']['featurecla']) and geom.buffer(.02).covers(Point(f['geometry']['coordinates']))]
 if not matches:raise ValueError(f'ไม่มีเมืองหลวง {country} {capital_en} {adm_name}')
 return max(matches,key=lambda f:f['properties']['pop_max'])
def rounded(obj):
 if isinstance(obj,(tuple,list)):return [rounded(v) for v in obj]
 if isinstance(obj,float):return round(obj,4)
 return obj
resource_overrides={'USA':dict(TX='oil',AK='oil',LA='oil',OK='oil',ND='oil',WY='coal',WV='coal',KY='coal',PA='coal',UT='coal',AZ='copper',NV='gold',MT='copper',CO='minerals',MN='iron',MI='iron',CA='food',WA='forest',OR='forest',IA='food',KS='food',NE='food',IL='food',FL='food'),
 'CHN':dict(XJ='oil',HL='oil',SX='coal',SN='coal',NM='coal',LN='iron',HE='iron',SD='gold',JX='rare_earths',SC='gas',GZ='coal',YN='copper',XZ='freshwater',NX='coal',BJ=None,SH=None,TJ=None),
 'JPN':{'01':'food','05':'oil','15':'gas','13':None,'14':None,'27':None},'THA':{'10':None,'11':None,'20':None,'21':'gas','50':'forest','30':'food','40':'food','90':'fish'},'FRA':{}}
reports=[]
for country,short in names.items():
 old={p['id']:p for p in legacy['countries'][country]}
 raw={f['properties']['iso_3166_2']:f for f in original if f['properties']['adm0_a3']==country}
 entries=[]
 if country=='FRA':
  groups=source_data['franceRegions']
 else:
  groups=[dict(id=id,legacyIds=[id],**values) for id,values in source_data['countries'][country].items() if id!='TH-38']
  if country=='THA':
   row=next(p for p in groups if p['id']=='TH-43');row['legacyIds'].append('TH-38');row['censusPopulation']+=source_data['countries'][country]['TH-38']['censusPopulation']
 for group in groups:
  id=group['id'];parts=group['legacyIds'];geom=unary_union([shapely.make_valid(shape(raw[k]['geometry'])) for k in parts])
  if country=='FRA':
   prop=dict(nameTh=group['nameTh'],nameEn=group['nameEn']);capital=group['capital'];capital_en=group['capitalEn'];coastal=any(old[k]['coastal'] for k in parts)
  else:
   p=old[id];prop=dict(nameTh=p['nameTh'],nameEn=p['nameEn']);coastal=p['coastal'];capital_en=prop['nameEn'];capital=prop['nameTh']
   if country=='USA':capital=source_data['usCapitals'][id]['capital'];capital_en=source_data['usCapitals'][id]['capitalEn']
   if country=='CHN':capital=source_data['chinaCapitals'][id]['capital'];capital_en=source_data['chinaCapitals'][id]['capitalEn']
   if country=='JPN' and str(int(id.split('-')[1])) in source_data['jpCapitals']:
    capital,capital_en=source_data['jpCapitals'][str(int(id.split('-')[1]))]
  override=source_data.get('capitalPointOverrides',{}).get(id)
  city=city_for(country,geom,capital_en,prop['nameEn']) if not override else None
  point=override or city['geometry']['coordinates']
  if id=='JP-11':point=[139.6469,35.8581]
  area=max(.1,sum(p.area for p in shapely.get_parts(geom))*111.32**2*math.cos(math.radians(geom.centroid.y)))
  density=group['censusPopulation']/area
  development=1+sum(density>=t for t in [20,100,250,1000])
  code=id.split('-')[-1];default_resource='fish' if coastal else 'food'
  resource=resource_overrides[country].get(code,default_resource)
  if resource=='minerals':resource='copper'
  factory_resource=resource or 'iron'
  prop.update(id=id,capital=capital,capitalEn=capital_en or (city['properties']['nameascii'] if city else prop['nameEn']),point=[round(v,4) for v in point],capitalPoint=[round(v,4) for v in point],censusPopulation=group['censusPopulation'],development=development,resourceId=resource,factoryResourceId=factory_resource,hasPort=coastal,coastal=coastal)
  entries.append(dict(properties=prop,geometry=geom,oldIds=[k for k in parts if k in old]))
 target=round(next(c['population'] for c in world if c['id']==country)*1e6)
 populations=apportion([e['properties']['censusPopulation'] for e in entries],target)
 economic_total=sum(pop*e['properties']['development'] for pop,e in zip(populations,entries))
 migration={}
 for e,pop in zip(entries,populations):
  p=e['properties'];p.update(population=pop,populationShare=pop/target,incomeShare=pop*p['development']/economic_total)
  for old_id in e['oldIds']:
   x=old[old_id];migration[old_id]=dict(target=p['id'],populationShare=x['populationShare'],incomeShare=x['incomeShare'],resourceId=x['resourceId'])
 if country=='USA':
  x=old['US-DC'];migration['US-DC']=dict(target='US-MD',populationShare=x['populationShare'],incomeShare=x['incomeShare'],resourceId=x['resourceId'])
 tolerance=.012
 while True:
  simplified=shapely.coverage_simplify([e['geometry'] for e in entries],tolerance)
  simplified=[shapely.set_precision(g,.0001) for g in simplified]
  for e,g in zip(entries,simplified):
   p=e['properties'];p['point']=p['capitalPoint'] if g.covers(Point(p['capitalPoint'])) else [round(v,4) for v in g.representative_point().coords[0]]
  features=[dict(type='Feature',id=e['properties']['id'],properties=e['properties'],geometry={k:rounded(v) for k,v in mapping(shapely.orient_polygons(g,exterior_cw=True)).items()}) for e,g in zip(entries,simplified)]
  data=dict(type='FeatureCollection',schemaVersion=2,countryId=country,populationTotal=target,censusYear=1999 if country=='FRA' else 2000,migration=migration,features=features)
  text=json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n'
  if len(text.encode())<=300000:break
  tolerance*=1.3
  if tolerance>.2:raise ValueError(f'ไฟล์ใหญ่เกิน {country}')
 (out/f'{short}.json').write_text(text,encoding='utf8')
 reports.append(dict(country=country,count=len(features),bytes=len(text.encode()),simplifyTolerance=tolerance,vertices=int(sum(shapely.get_num_coordinates(g) for g in simplified)),valid=all(g.is_valid for g in simplified)))
config=dict(schemaVersion=2,balance=legacy['balance'],projects=legacy['projects'],files={id:short+'.json' for id,short in names.items()},counts={id:len(json.loads((out/f'{short}.json').read_text(encoding='utf8'))['features']) for id,short in names.items()})
(out/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(reports,indent=2))
