export function getRelation(catalog, a, b, state=null) {
  if (a === b) return { value: 100, label: 'ประเทศของคุณ', reasonTh: '' };
  const pair = catalog.relationPairs.get([a, b].sort().join(':'));
  const penalty=state?.warfare?.relations?.[[a,b].sort().join(':')]??0;
  const value = Math.max(-100,Math.min(100,(pair?.value ?? 0)+penalty));
  const label = value >= 60 ? 'เป็นมิตรอย่างยิ่ง' : value > 20 ? 'เป็นมิตร'
    : value <= -60 ? 'เป็นปฏิปักษ์' : value < -20 ? 'ตึงเครียด' : 'เป็นกลาง';
  return { value, label, reasonTh: penalty?'ความสัมพันธ์ลดลงจากการประกาศสงคราม':pair?.reasonTh ?? 'ไม่มีความสัมพันธ์พิเศษในสถานการณ์เริ่มต้น' };
}
