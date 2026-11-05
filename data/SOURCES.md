# แหล่งข้อมูลแผนที่

## พรมแดน

- ไฟล์: `countries-50m.json` จาก world-atlas 2.0.2
- ดาวน์โหลด: https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json
- คำอธิบายต้นทาง: https://github.com/topojson/world-atlas
- เป็น TopoJSON ที่แปลงจาก Natural Earth 4.1.0 ชุด Admin 0 ระดับ 1:50m มี 241 รูปทรงประเทศและดินแดน ไม่ใช่ฐานข้อมูลพรมแดนประวัติศาสตร์ปี 2000 โดยตรง
- SHA-256 ต้นฉบับ: `04342cdc1e3016bcd7db1630de95684d67b79fe3c8c460321e87aef469502394`
- Natural Earth เป็น public domain: https://www.naturalearthdata.com/about/terms-of-use/
- ใบอนุญาต world-atlas: `world-atlas-LICENSE.txt`

เก็บไฟล์ต้นฉบับไว้ครบ ไม่แก้รูปทรงในไฟล์นั้น `world-2000.json` กำหนดการรวมและสถานะของพื้นที่ จากนั้น `js/data/world.js` ใช้ topojson-client.merge รวมพรมแดนจริงก่อนวาด:

1. Sudan + S. Sudan → ซูดาน
2. Serbia + Montenegro + Kosovo → ยูโกสลาเวีย
3. Timor-Leste → ติมอร์-เลสเต ภายใต้การดูแลของสหประชาชาติ สีเทา

ต้นทางแยกออสเตรเลียและหมู่เกาะแอชมอร์และคาร์เทียร์เป็นสองรูปทรงที่ใช้รหัส 036 เดียวกัน จึงรวมเป็นหน่วยเดียวด้วย หลังรวมทั้งหมดเหลือ 237 หน่วยแสดงผล การแสดงโคโซโวรวมกับยูโกสลาเวียเป็นขอบเขตเกมตามโจทย์ ไม่ได้จำลองรายละเอียดการบริหารพื้นที่ในปีนั้น ส่วนพื้นที่อื่นยังใช้รูปทรงของชุดต้นทาง จึงไม่อ้างว่าตรวจความถูกต้องของพรมแดนปี 2000 ทุกจุดแล้ว

## ชื่อภาษาไทย

`country-names-th.json` สกัดชื่อจาก Unicode CLDR 46.1.0 โดยจับคู่รหัส ISO numeric กับชื่อไทย:

- https://cdn.jsdelivr.net/npm/cldr-core@46.1.0/supplemental/codeMappings.json
- https://cdn.jsdelivr.net/npm/cldr-localenames-full@46.1.0/main/th/territories.json
- ใบอนุญาต: `cldr-LICENSE.txt`

ชื่อของดินแดนที่ไม่มี ISO numeric และชื่อเฉพาะปี 2000 อยู่ใน `world-2000.json` ไม่เก็บชื่อประเทศหรือเงื่อนไขพรมแดนในโค้ด

ดาวน์โหลดและสกัดข้อมูลวันที่ 2026-11-06 ไม่มีการโหลดข้อมูลภายนอกตอนรันเกม
