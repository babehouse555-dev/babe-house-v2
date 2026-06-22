// Smoke test — เช็ก flow/จุดสำคัญก่อน-หลัง deploy (ไม่สร้างออเดอร์จริง ไม่ทำขยะลง DB)
// ใช้: node scripts/smoke.mjs [URL]
const BASE = process.argv[2] || "https://babe-house-v2-production.up.railway.app";
const ADMIN = process.env.ADMIN_KEY || "bh-admin-859e27da10720689734a79d2";
let pass = 0, fail = 0;
async function check(name, fn) { try { await fn(); console.log(`✅ ${name}`); pass++; } catch (e) { console.log(`❌ ${name} — ${e.message}`); fail++; } }
const get = async (p, opts = {}) => { const r = await fetch(BASE + p, opts); const text = await r.text(); let json; try { json = JSON.parse(text); } catch {} return { status: r.status, text, json }; };

console.log(`\n🚦 Smoke test → ${BASE}\n`);

await check("เซิร์ฟเวอร์ + AI พร้อม", async () => {
  const r = await get("/api/health");
  if (r.status !== 200 || !r.json?.ok) throw new Error("health ไม่ ok");
  if (!r.json.ai || r.json.ai === "none") throw new Error("AI ไม่ได้ตั้งค่า");
});
await check("หน้าแรกโหลดได้", async () => {
  const r = await get("/");
  if (r.status !== 200 || !/index-[A-Za-z0-9_-]*\.js/.test(r.text)) throw new Error("ไม่เจอ bundle");
});
await check("DB เข้าถึงได้ (admin overview)", async () => {
  const r = await get("/api/admin/overview", { headers: { "x-admin-key": ADMIN } });
  if (!r.json?.ok || typeof r.json.customers !== "number") throw new Error("admin/overview พัง");
});
await check("ระบบ login ทำงาน (me ต้องมี token)", async () => {
  const r = await get("/api/me/blueprints");
  if (r.status !== 401) throw new Error(`ควร 401 แต่ได้ ${r.status}`);
});
await check("เช็กเจ้าของเล่มทำงาน (เปิดเล่มต้อง login)", async () => {
  const r = await get("/api/blueprints/latest?user_id=babe_user_1782022505861&billing_cycle=June_2026&blueprint_id=bp_dd29683f-8511-4410-9554-1d8c5761cd76");
  if (r.status !== 403 || r.json?.error !== "NOT_OWNER") throw new Error(`ควรโดนบล็อก 403 NOT_OWNER แต่ได้ ${r.status}/${r.json?.error}`);
});
await check("เล่มจริงเปิดได้ด้วยสิทธิ์แอดมิน + มีสคริปต์", async () => {
  const r = await get("/api/blueprints/latest?user_id=babe_user_1782022505861&billing_cycle=June_2026&blueprint_id=bp_dd29683f-8511-4410-9554-1d8c5761cd76", { headers: { "x-admin-key": ADMIN } });
  if (!r.json?.ok) throw new Error("เปิดเล่มไม่ได้");
  const s = r.json.blueprint?.scripts || [];
  if (!s.length) throw new Error("เล่มไม่มีสคริปต์");
});

console.log(`\n${fail === 0 ? "🎉 ผ่านหมด!" : "⚠️ มีจุดพัง!"}  ${pass} ผ่าน · ${fail} พัง\n`);
process.exit(fail === 0 ? 0 : 1);
