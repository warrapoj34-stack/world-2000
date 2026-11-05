export function getRelation(catalog, a, b) {
  if (a === b) return { value: 100, label: 'ประเทศของคุณ', reasonTh: '' };
  const pair = catalog.relationPairs.get([a, b].sort().join(':'));
  const value = pair?.value ?? 0;
  const label = value >= 60 ? 'เป็นมิตรอย่างยิ่ง' : value > 20 ? 'เป็นมิตร'
    : value <= -60 ? 'เป็นปฏิปักษ์' : value < -20 ? 'ตึงเครียด' : 'เป็นกลาง';
  return { value, label, reasonTh: pair?.reasonTh ?? 'ไม่มีความสัมพันธ์พิเศษในสถานการณ์เริ่มต้น' };
}
