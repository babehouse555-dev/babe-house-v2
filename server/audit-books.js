// 🔍 ตรวจเล่มทั้งระบบทีเดียว — หา "เล่มที่วิเคราะห์ผิดคน/ผิดช่อง" แบบที่คิมสุ่มเจอ
// รันจากไฟล์ backup: node server/audit-books.js /tmp/bk2.json
import fs from "fs";
import { checkBlueprintQuality } from "./ai.js";

const db = JSON.parse(fs.readFileSync(process.argv[2] || "/tmp/bk2.json", "utf8")).tables;
const reqById = Object.fromEntries((db.blueprint_requests || []).map(r => [r.request_id, r]));
const paidBpIds = new Set((db.blueprint_orders || [])
  .filter(o => o.payment_status === "paid").map(o => o.blueprint_id).filter(Boolean));

const J = (v) => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return null; } };
const norm = (s) => String(s || "").toLowerCase().replace(/[@\s._-]/g, "");
// ความคล้ายแบบ bigram — ใช้กับไทยได้โดยไม่ต้องตัดคำ
const bigrams = (s) => { const t = String(s || "").toLowerCase().replace(/\s+/g, ""); const g = new Set(); for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; };
const overlap = (a, b) => { const A = bigrams(a), B = bigrams(b); if (!A.size || !B.size) return 1; let n = 0; for (const g of A) if (B.has(g)) n++; return n / Math.min(A.size, B.size); };

const OURS = /babe\s*house|เบ๊บเฮาส์|สถาบันสอนตัดต่อวิดีโอ/i;
const ONLY_CUSTOMERS = process.argv.includes("--customers"); // ตัดเล่มทดสอบของคิมออก
// เล่มที่คิมทำเองเพื่อทดสอบ/ช่องของ Babe House เอง — "Babe House" ในเล่มพวกนี้ถูกต้องแล้ว ไม่ใช่บั๊ก
const OUR_EMAILS = new Set(["babehouse555@gmail.com", "kanc2442@gmail.com"]);
const rows = [];

for (const bp of db.blueprints || []) {
  if (bp.deleted_at) continue;
  const b = J(bp.blueprint_json) || {};
  const r = reqById[bp.request_id] || {};
  if (ONLY_CUSTOMERS && OUR_EMAILS.has(String(r.email || "").toLowerCase())) continue;
  const paid = paidBpIds.has(bp.blueprint_id);
  const who = r.instagram_account || b.instagram_account || "(ไม่ระบุ)";
  const bad = [];

  // 1) ตัวตรวจคุณภาพตัวจริงที่ใช้ตอนเจนเล่ม
  for (const f of checkBlueprintQuality(b, true)) bad.push(["คุณภาพ", f]);

  // 2) เล่มกลายเป็นของ Babe House
  if (OURS.test(`${b.theme || ""} ${b.positioning || ""} ${b.audience_summary || ""}`))
    bad.push(["ผิดคน", `เล่มพูดถึง Babe House แทนช่องลูกค้า`]);

  // 3) ช่องในเล่ม ≠ ช่องที่ลูกค้ากรอก
  const inBook = norm(b.instagram_account), inForm = norm(r.instagram_account);
  if (inBook && inForm && inBook !== inForm && !inBook.includes(inForm) && !inForm.includes(inBook))
    bad.push(["ผิดช่อง", `เล่มเขียนว่า "${b.instagram_account}" แต่ลูกค้ากรอก "${r.instagram_account}"`]);

  // 4) เนื้อหาไม่ครบ
  const ns = (b.scripts || []).length, nc = (b.calendar || []).length;
  if (bp.content_status !== "ready") bad.push(["ยังไม่เสร็จ", `content_status=${bp.content_status}`]);
  if (ns < 30) bad.push(["เนื้อหาขาด", `สคริปต์ ${ns}/30`]);
  if (nc < 30) bad.push(["เนื้อหาขาด", `ปฏิทิน ${nc}/30`]);

  // 5) ธีมเล่มไม่เกี่ยวกับสิ่งที่ลูกค้ากรอกมาเลย → เข้าข่ายวิเคราะห์ผิดธุรกิจ
  const said = `${r.business_type || ""} ${r.starting_point || ""} ${r.industry || ""}`.trim();
  const book = `${b.theme || ""} ${b.positioning || ""} ${b.audience_summary || ""}`.trim();
  if (said.length > 40 && book.length > 40) {
    const ov = overlap(said, book);
    if (ov < 0.16) bad.push(["น่าสงสัย", `ธีมเล่มแทบไม่ตรงกับที่ลูกค้ากรอก (ตรงกัน ${(ov * 100).toFixed(0)}%)`]);
  }

  if (bad.length) rows.push({ who, email: r.email, cycle: bp.billing_cycle, id: bp.blueprint_id, paid, bad, theme: b.theme });
}

// 6) ธีมซ้ำข้ามลูกค้า = AI ลอกแม่แบบ ไม่ได้วิเคราะห์รายคน
const byTheme = {};
for (const bp of db.blueprints || []) {
  if (bp.deleted_at) continue;
  const b = J(bp.blueprint_json) || {}; const th = String(b.theme || "").trim();
  if (th.length > 8) (byTheme[th] ||= []).push(reqById[bp.request_id]?.instagram_account || bp.blueprint_id);
}
const dupes = Object.entries(byTheme).filter(([, v]) => new Set(v).size > 1);

const live = (db.blueprints || []).filter(x => !x.deleted_at).length;
console.log(`ตรวจเล่มที่ยังอยู่ทั้งหมด ${live} เล่ม · จ่ายเงินจริง ${paidBpIds.size} เล่ม\n`);
const order = { "ผิดคน": 0, "ผิดช่อง": 1, "เนื้อหาขาด": 2, "ยังไม่เสร็จ": 3, "คุณภาพ": 4, "น่าสงสัย": 5 };
rows.sort((a, b2) => Math.min(...a.bad.map(x => order[x[0]])) - Math.min(...b2.bad.map(x => order[x[0]])));
for (const r of rows) {
  console.log(`${r.paid ? "💰" : "🎁"} ${r.who}  (${r.cycle})  ${r.email || ""}`);
  console.log(`   ธีม: ${r.theme}`);
  for (const [k, v] of r.bad) console.log(`   [${k}] ${v}`);
  console.log(`   id: ${r.id}\n`);
}
console.log(`\n=== สรุป ===`);
console.log(`เล่มมีปัญหา: ${rows.length} / ${live}`);
const cnt = {}; for (const r of rows) for (const [k] of r.bad) cnt[k] = (cnt[k] || 0) + 1;
for (const [k, v] of Object.entries(cnt).sort((a, b2) => b2[1] - a[1])) console.log(`  ${k}: ${v}`);
console.log(`ธีมซ้ำข้ามลูกค้า: ${dupes.length}`);
for (const [th, who] of dupes.slice(0, 10)) console.log(`  "${th.slice(0, 70)}" ← ${[...new Set(who)].join(", ")}`);

// ===== สรุปแบบสั้น จัดกลุ่มตามอาการ =====
if (process.argv.includes("--brief")) {
  const groups = {};
  for (const r of rows) for (const [k, v] of r.bad) (groups[k] ||= []).push({ ...r, msg: v });
  for (const [k, list] of Object.entries(groups).sort((a, b2) => order[a[0]] - order[b2[0]])) {
    const paid = list.filter(x => x.paid);
    console.log(`\n### ${k} — ${list.length} เล่ม (จ่ายเงินจริง ${paid.length})`);
    for (const x of list.slice(0, 40)) console.log(`  ${x.paid ? "💰" : "🎁"} ${x.who} (${x.cycle}) — ${x.msg}`);
    if (list.length > 40) console.log(`  ... อีก ${list.length - 40}`);
  }
}
