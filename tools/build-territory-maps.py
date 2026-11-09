"""เตรียมเส้นดินแดนและเพื่อนบ้านจาก Natural Earth ไม่มีระบบบริหารจังหวัด"""
import json, sys, pathlib
import shapely
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from shapely.strtree import STRtree

root = pathlib.Path(__file__).resolve().parents[1]
folder = root/'data/provinces'
index = json.loads((folder/'index.json').read_text(encoding='utf8'))
groups = json.loads((root/'tools/territory-groups.json').read_text(encoding='utf8'))
features = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf8'))['features']
raw = {f['properties']['iso_3166_2']: f for f in features}
geometries = [shapely.make_valid(shape(f['geometry'])) for f in features]
tree = STRtree(geometries)
country_ids = {c['id'] for c in json.loads((root/'data/countries_2000.json').read_text(encoding='utf8'))}
aliases = {'SDS':'SSD','SAH':'ESH','KOS':'XKX','SRS':'SRB'}
for owner, rows in index['countries'].items():
    full = []
    for p in rows:
        parts = groups.get(p['id'], [p['id']])
        full.append(unary_union([shapely.make_valid(shape(raw[k]['geometry'])) for k in parts]))
    for p, geom in zip(rows, full):
        borders = set()
        for i in tree.query(geom.buffer(.002), predicate='intersects'):
            code = features[i]['properties']['adm0_a3']
            code = aliases.get(code, code)
            if code != owner and code in country_ids:
                borders.add(code)
        p['borders'] = sorted(borders)
    tolerance = .012
    while True:
        simplified = shapely.coverage_simplify(full, tolerance)
        simplified = [shapely.set_precision(g, .0001) for g in simplified]
        assert all(g.is_valid for g in simplified)
        output = dict(type='FeatureCollection',countryId=owner,features=[dict(type='Feature',id=p['id'],properties={'id':p['id']},geometry=mapping(shapely.orient_polygons(g,exterior_cw=True))) for p,g in zip(rows,simplified)])
        body = json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n'
        if len(body.encode()) <= 300000: break
        tolerance *= 1.3
    path = folder/index['files'][owner]
    path.write_text(body,encoding='utf8',newline='\n')
    print(owner,len(rows),len(body.encode()),'bytes')
(folder/'index.json').write_text(json.dumps(index,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8',newline='\n')
