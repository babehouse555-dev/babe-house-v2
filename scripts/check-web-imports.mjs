// 🕸️ ด่านตรวจฝั่งหน้าเว็บ — จับ "ใช้ตัวแปรแต่ลืม import"
//
// ⚠️ ทำไมต้องมี: 13 ส.ค. 69 ผมแยกสวิตช์เปิดขายเป็น 3 ตัว แล้วสคริปต์เติม import ทำงานไม่ครบกับ main.jsx
//    Vite build ผ่านฉลุย (ตัวแปรที่ไม่มีจริงพังตอน "รัน" ไม่ใช่ตอน "build")
//    ด่านตรวจเดิมก็ผ่าน เพราะตรวจแต่ฝั่งเซิร์ฟเวอร์
//    ผลคือเว็บจริงพังทั้งเว็บ — ทุกหน้าที่มีแถบเมนูขึ้น "โหลดหน้านี้ใหม่" ลูกค้าซื้อไม่ได้เลย
// → ตรวจให้แล้วทุกครั้งก่อนขึ้นเว็บ

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "web/src";
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(jsx?|tsx?)$/.test(f)) files.push(p);
  }
})(ROOT);

// ตัวแปรที่ export จากไฟล์ตั้งค่าทั้งหลาย (ไฟล์ไหนก็ได้ที่ export const ตัวพิมพ์ใหญ่ล้วน)
const exported = new Map();          // ชื่อตัวแปร -> ไฟล์ที่ export
for (const p of files) {
  for (const m of readFileSync(p, "utf8").matchAll(/export\s+const\s+([A-Z][A-Z0-9_]{2,})\s*=/g)) {
    exported.set(m[1], p);
  }
}

const problems = [];
for (const p of files) {
  const src = readFileSync(p, "utf8");
  // ชื่อที่ไฟล์นี้ import เข้ามา (ทุก import ไม่เฉพาะ config)
  const imported = new Set();
  for (const m of src.matchAll(/import\s*(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from/g)) {
    for (const x of m[1].split(",")) {
      const name = x.trim().split(/\s+as\s+/).pop().trim();
      if (name) imported.add(name);
    }
  }
  // ประกาศเองในไฟล์ก็ถือว่ามี
  const declared = new Set();
  for (const m of src.matchAll(/(?:const|let|var|function|class)\s+([A-Z][A-Z0-9_]{2,})\b/g)) declared.add(m[1]);

  const body = src.replace(/^\s*import[\s\S]*?from\s*["'][^"']+["'];?\s*$/gm, "");
  for (const [name, from] of exported) {
    if (imported.has(name) || declared.has(name)) continue;
    if (p === from) continue;
    if (new RegExp(`(?<![\\w$.])${name}(?![\\w$])`).test(body)) {
      problems.push({ file: p, name, from });
    }
  }
}

if (problems.length) {
  console.log(`  ❌ พบ ${problems.length} จุดที่ใช้ตัวแปรแต่ลืม import (เว็บจะพังตอนลูกค้าเปิดจริง)`);
  for (const x of problems) console.log(`     • ${x.file} ใช้ ${x.name} — ต้อง import จาก ${x.from}`);
  process.exit(1);
}
console.log("  ✅ หน้าเว็บ import ครบทุกตัวแปร");
