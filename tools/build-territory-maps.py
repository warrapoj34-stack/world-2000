"""เตรียมดินแดนปี 2000 ชายฝั่ง และกราฟชายแดน ใช้เฉพาะตอนจัดข้อมูล"""
import json,sys,pathlib
import shapely
from shapely.geometry import shape,mapping
from shapely.ops import unary_union
from shapely.strtree import STRtree
root=pathlib.Path(__file__).resolve().parents[1];folder=root/'data/provinces'
index=json.loads((folder/'index.json').read_text(encoding='utf8'))
groups=json.loads((root/'tools/territory-groups.json').read_text(encoding='utf8'))
features=json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf8'))['features']
coasts=[shape(f['geometry']) for f in json.loads(pathlib.Path(sys.argv[2]).read_text(encoding='utf8'))['features']]
coast_tree=STRtree(coasts)
cuts={f['id']:shape(f['geometry']) for f in json.loads((root/'tools/territory-historical-cuts.geojson').read_text(encoding='utf8'))['features']}
aliases={'SDS':'SSD','SAH':'ESH','KOS':'XKX','SRS':'YUG'}
country_ids={c['id'] for c in json.loads((root/'data/countries_2000.json').read_text(encoding='utf8'))}
raw={}
for f in features:
    p=f['properties'];id=p['iso_3166_2']
    if id=='LA-VI' and p['adm1_code']=='LAO-3283':id='LA-VT'
    if id=='RU-MOW':id='RU-MOS'
    elif id=='RU-MOS':id='RU-MOW'
    raw[id]=shapely.make_valid(shape(f['geometry']))
# คืนหน่วยที่ถูกควบรวมหลังปี 2000 โดยตัดฐาน Natural Earth ด้วยเส้นประวัติศาสตร์
raw['RU-CHI']=raw.pop('RU-ZAB')
raw['RU-NEN']=unary_union([raw['RU-NEN'],raw.pop('RU-X01~')])
split={'RU-CHI':['RU-AGB'],'RU-PER':['RU-KOP'],'RU-KAM':['RU-KOR'],'RU-IRK':['RU-UOB'],'RU-KYA':['RU-EVE','RU-TAY']}
for parent,children in split.items():
    for child in children:raw[child]=shapely.make_valid(cuts[child].intersection(raw[parent]))
    raw[parent]=shapely.make_valid(raw[parent].difference(unary_union([raw[c] for c in children])))
moscow=unary_union([raw['RU-MOW'],raw['RU-MOS']]);raw['RU-MOW']=cuts['RU-MOW'].intersection(moscow);raw['RU-MOS']=moscow.difference(raw['RU-MOW'])
lao_zone=cuts['LA-XN'].intersection(unary_union([raw['LA-VI'],raw['LA-XI']]))
raw['LA-XN']=lao_zone
for id in ['LA-VI','LA-XI']:raw[id]=raw[id].difference(lao_zone)
# ปุตราจายายังอยู่ในสลังงอร์ในปี 2000
raw['MY-10']=unary_union([raw['MY-10'],raw.pop('MY-16')])
full={p['id']:unary_union([raw[k] for k in groups.get(p['id'],[p['id']])]) for rows in index['countries'].values() for p in rows}
metadata={p['id']:p for rows in index['countries'].values() for p in rows}
foreign=[];foreign_owners=[]
for f in features:
    code=aliases.get(f['properties']['adm0_a3'],f['properties']['adm0_a3'])
    if code not in index['countries'] and code in country_ids:
        foreign.append(shapely.make_valid(shape(f['geometry'])));foreign_owners.append(code)
for id,g in full.items():foreign.append(g);foreign_owners.append(metadata[id]['owner'])
foreign_tree=STRtree(foreign)
cross={id:[] for id in full};all_neighbors={id:[] for id in full};ids=list(full);province_tree=STRtree(list(full.values()))
def shares_line(a,b):
    return a.boundary.intersection(b.boundary).length>.002 or a.boundary.intersection(b.buffer(.002)).length>.012
for id,g in full.items():
    p=metadata[id];borders=set()
    for j in foreign_tree.query(g.buffer(.002),predicate='intersects'):
        if foreign_owners[j]!=p['owner'] and shares_line(g,foreign[j]):borders.add(foreign_owners[j])
    p['borders']=sorted(borders)
    p['coastal']=len(coast_tree.query(g.buffer(.01),predicate='intersects'))>0
    for j in province_tree.query(g.buffer(.002),predicate='intersects'):
        other=ids[j]
        if other!=id and shares_line(g,full[other]):
            all_neighbors[id].append(other)
            if metadata[other]['owner']!=p['owner']:cross[id].append(other)
index['adjacency']={id:sorted(set(others)) for id,others in cross.items() if others}
# กราฟต้องสมมาตร ไม่ให้ทิศทางโจมตีขึ้นกับลำดับข้อมูล
for id,neighbors in list(index['adjacency'].items()):
    for other in neighbors:index['adjacency'].setdefault(other,[]).append(id)
index['adjacency']={id:sorted(set(rows)) for id,rows in index['adjacency'].items()}
for id,neighbors in list(all_neighbors.items()):
    for other in list(neighbors):all_neighbors[other].append(id)
index['provinceNeighbors']={id:sorted(set(rows)) for id,rows in all_neighbors.items()}
def rounded(v):
    if isinstance(v,(tuple,list)):return [rounded(x) for x in v]
    if isinstance(v,float):return round(v,4)
    return v
for owner,rows in index['countries'].items():
    geoms=[full[p['id']] for p in rows];tolerance=.012;limit=500000 if owner=='RUS' else 300000
    while True:
        simplified=[shapely.set_precision(g,.0001) for g in shapely.coverage_simplify(geoms,tolerance)]
        assert all(g.is_valid and not g.is_empty for g in simplified)
        output=dict(type='FeatureCollection',countryId=owner,features=[dict(type='Feature',id=p['id'],properties={'id':p['id']},geometry={k:rounded(v) for k,v in mapping(shapely.orient_polygons(g,exterior_cw=True)).items()}) for p,g in zip(rows,simplified)])
        body=json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n'
        if len(body.encode())<=limit:break
        tolerance*=1.3
        if tolerance>.5:raise ValueError(f'ลดขนาดไม่ได้ {owner}')
    (folder/index['files'][owner]).write_text(body,encoding='utf8',newline='\n')
    print(owner,len(rows),len(body.encode()),'bytes',sum(shapely.get_num_coordinates(g) for g in simplified),'points')
(folder/'index.json').write_text(json.dumps(index,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8',newline='\n')
