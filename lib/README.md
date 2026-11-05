# ไลบรารีที่เก็บในโปรเจกต์

เกมนำเข้าไฟล์ในโฟลเดอร์นี้ด้วย ES modules เท่านั้น ไม่มีการเรียก CDN ระหว่างเล่น และไม่ต้องใช้ npm หรือ build step

| ไฟล์ | รุ่น | URL ที่ใช้ดาวน์โหลด | ใบอนุญาต |
| --- | --- | --- | --- |
| `d3-7.9.0.js` | d3 7.9.0 | https://esm.sh/d3@7.9.0/es2022/d3.bundle.mjs | `d3-LICENSE.txt` (ISC) |
| `topojson-client-3.1.0.js` | topojson-client 3.1.0 | https://esm.sh/topojson-client@3.1.0/es2022/topojson-client.bundle.mjs | `topojson-client-LICENSE.txt` (ISC) |

ดาวน์โหลดวันที่ 2026-11-06 เป็น bundle ที่รวม dependency แล้ว ตรวจว่าไม่มี import ไปยัง URL ภายนอก ตัดเฉพาะบรรทัด `sourceMappingURL` ที่ชี้ไปยังไฟล์ซึ่งไม่ได้แจกมาด้วย

SHA-256 ของไฟล์ที่ใช้งาน:

- d3: `e308b8bcdfb2c5e542c7fd091c83eb2abe77a4b62c23640991655e31a4f68a26`
- topojson-client: `a73f6d148098792c0858cb18cc888b79b9ebcf3570674fa2c27a9c570833e627`

แหล่งต้นทาง: https://github.com/d3/d3 และ https://github.com/topojson/topojson-client
