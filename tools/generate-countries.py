"""สร้างข้อมูลเริ่มต้นจากไฟล์อ้างอิงในเครื่อง ไม่ใช้ระหว่างรันเกม"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
def read(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))
def write(name, value):
    (DATA / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
def series(name):
    return {row['countryiso3code']: row['value'] for row in read('sources/' + name + '.json')[1]}

gdp = series('gdp-2000')
population = series('population-2000')
spending = series('military-expenditure-2000')
mapping = {entry['_numeric']: entry['_alpha3']
           for code, entry in read('sources/iso-mappings.json')['supplemental']['codeMappings'].items()
           if len(code) == 2 and '_numeric' in entry and '_alpha3' in entry}
mapping.update({'180': 'COD', '626': 'TLS'})
names = read('country-names-th.json')
world = read('world-2000.json')
geometries = read('countries-50m.json')['objects']['countries']['geometries']
config = read('country-generation-2000.json')
fallback = config['fallback']
territories = set(config['territories'])
constitutional = set(config['constitutional'])
absolute = set(config['absolute'])
oneparty = set(config['oneparty'])
authoritarian = set(config['authoritarian'])
unstable = set(config['unstable'])
oil = set(config['oil'])
food = set(config['food'])
minerals = set(config['minerals'])
noarmy = set(config['noarmy'])
profiles = config['profiles']
special = config['special']

records = {}
for geometry in geometries:
    name = geometry['properties']['name']
    if any(name in group['members'] for group in world['merges']):
        continue
    spec = world['specialTerritories'].get(name)
    map_id = spec['id'] if spec else geometry['id']
    id = special[map_id] if spec else mapping[map_id]
    if id in records:
        continue
    name_th = world['overrides'].get(map_id, {}).get('nameTh') or (spec['nameTh'] if spec else names[map_id])
    records[id] = {'id': id, 'mapId': map_id, 'nameTh': name_th, 'nameEn': name}
records['SDN'] = {'id': 'SDN', 'mapId': '729', 'nameTh': 'ซูดาน', 'nameEn': 'Sudan'}
records['YUG'] = {'id': 'YUG', 'mapId': 'YUG', 'nameTh': 'ยูโกสลาเวีย', 'nameEn': 'Yugoslavia'}

for id, country in records.items():
    estimated_gdp, estimated_pop = fallback.get(id, (None, None))
    real_gdp, real_pop = gdp.get(id), population.get(id)
    if id == 'YUG':
        estimated_gdp = (gdp['SRB'] + gdp['MNE']) / 1e9 + 1.85
        estimated_pop = (population['SRB'] + population['MNE'] + population['XKX']) / 1e6
    if id == 'SDN':
        # ประชากรรวมพื้นที่ซูดานใต้ ส่วน GDP ใช้อนุกรมซูดานเดิมโดยประมาณ
        estimated_gdp = gdp['SDN'] / 1e9
        estimated_pop = (population['SDN'] + population['SSD']) / 1e6
        real_gdp = real_pop = None
    total_gdp = real_gdp / 1e9 if real_gdp is not None else estimated_gdp
    total_pop = real_pop / 1e6 if real_pop is not None else estimated_pop
    if total_gdp is None or total_pop is None:
        raise ValueError(f'ไม่มีข้อมูล {id}')
    per_capita = total_gdp / max(total_pop, .00001) * 1000
    wealth = min(1, max(0, math.log10(max(200, per_capita) / 200) / 2.4))
    regime = 'absolute_monarchy' if id in absolute else 'constitutional_monarchy' if id in constitutional else 'one_party' if id in oneparty else 'authoritarian' if id in authoritarian else 'democracy'
    for inherited, members in config['governmentByTerritory'].items():
        if id in members:
            regime = inherited
    country['nameEn'] = config['englishNames'].get(id, country['nameEn'])
    score = round(min(95, max(3, 15 + 22 * math.log10(1 + (spending.get(id) or total_gdp * 1e9 * .015) / 1e8))))
    stats = [score, round(43 + wealth * 42), round(35 + wealth * 45), round(12 + wealth * 78), round(43 + wealth * 38), 45,
             82 if id in oil else 8, 82 if id in food else 45, 83 if id in minerals else 30]
    if id in unstable:
        stats[1:3] = [23, 25]
        stats[4] = 22
        stats[5] = 110
    if id in authoritarian:
        stats[2] = max(20, stats[2] - 10)
        stats[4] = max(15, stats[4] - 15)
    stats = profiles.get(id, stats)
    if id in noarmy:
        stats[0] = 0 if id in ('ISL', 'CRI', 'PAN') else 3
    if id in territories:
        if id not in profiles:
            stats[0] = 0
            stats[5] = 0
        if total_pop == 0:
            stats = [0, 50, 50, 0, 50, 0, 0, 0, 0]
    military, stability, happiness, tech, reputation, debt, oil_score, food_score, mineral_score = stats
    country.update({
        'idType': 'custom' if id.startswith('X') else 'historical_iso' if id == 'YUG' else 'iso_alpha3',
        'playable': id not in territories,
        'government': regime,
        'gdp': round(total_gdp, 3), 'population': round(total_pop, 6),
        'treasury': round(total_gdp * (.08 if id in unstable else .12), 3),
        'debt': debt, 'military': military, 'stability': stability, 'happiness': happiness,
        'tech': tech, 'reputation': reputation,
        'resources': {'oil': oil_score, 'food': food_score, 'minerals': mineral_score},
        'provenance': {
            'gdp': 'world_bank_2000' if real_gdp is not None else 'scenario_estimate',
            'population': 'world_bank_2000' if real_pop is not None else 'scenario_estimate',
            'militaryExpenditureUSD': spending.get(id),
            'military': 'game_index_informed_by_sipri_wb' if spending.get(id) is not None else 'game_estimate',
            'otherStats': 'game_estimates_not_official_statistics'
        }
    })
    if id in territories:
        country['statusTh'] = 'ดินแดนหรือเขตบริหารพิเศษ · ไม่รวมในชุดสุ่มเกิด'
    if id == 'TLS':
        country['statusTh'] = 'ดินแดนภายใต้การดูแลของสหประชาชาติในปี 2000'
        country['governmentLabelTh'] = 'การบริหารชั่วคราวของสหประชาชาติ'
    if total_pop == 0:
        country['governmentLabelTh'] = 'ไม่มีรัฐบาลประจำดินแดน'
    if id.startswith('X'):
        country['statusTh'] = 'ดินแดนที่ไม่มีรหัส ISO · ใช้รหัสเฉพาะในเกม'

write('countries_2000.json', list(sorted(records.values(), key=lambda record: record['id'])))

relations = read('relations_2000.json')
assert all(pair['a'] in records and pair['b'] in records for pair in relations['pairs'])
print(f'{len(records)} records; {sum(c["playable"] for c in records.values())} playable; {len(relations["pairs"])} relations')
