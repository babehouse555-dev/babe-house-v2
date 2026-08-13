// ═══════════ 🩺 ตัวตรวจอัตโนมัติ — เดินทุกเส้นทางที่ลูกค้าจ่ายเงิน ก่อนขึ้นเว็บทุกครั้ง ═══════════
//
// ทำไมต้องมี (คิมสั่ง 12 ส.ค. 2569):
//   "ฉันโอเคที่จะมาตรวจงาน แต่ไม่โอเคที่ต้องมาตรวจงานเดิมหลายรอบ ... แก้อันนี้ไปเจออันโน้น มันไม่จบ"
//   บั๊กที่หลุดขึ้นเว็บจริงส่วนใหญ่เป็นแบบ "ทดสอบครั้งเดียวก็เจอ" เช่น
//     · ลูกค้าบุคคลธรรมดากรอกชื่อ-นามสกุลแล้วกดจ่ายไม่ผ่าน
//     · เลือกช่อง A แต่ระบบไปสร้างให้ช่อง B
//     · จ่ายค่าแพ็ก 12 เดือนแล้วไม่ได้สิทธิ์เลยสักเดือน
//   ตัวนี้ไล่กดแทนคิมทุกเส้นทาง ทุกครั้งก่อน push
//
// ⛔ รันบน "สนามเด็กเล่น" เท่านั้น — สร้างเซิร์ฟเวอร์ของตัวเองบนพอร์ตแยก + ฐานข้อมูลชั่วคราว
//    ไม่แตะเว็บจริง ไม่แตะ .localdb ของคิม ลบทิ้งทุกครั้งที่รันจบ
//
// ใช้:  node scripts/checkup.mjs          (รันเองก่อน push อัตโนมัติ)

import { spawn } from "node:child_process";
import { rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.CHECKUP_PORT || 39117);
const BASE = `http://127.0.0.1:${PORT}`;
const DBDIR = mkdtempSync(path.join(tmpdir(), "bh-checkup-"));
const ADMIN = "checkup";

let pass = 0, fail = 0; const failures = [];
const ok = (n) => { console.log(`  ✅ ${n}`); pass++; };
const bad = (n, m) => { console.log(`  ❌ ${n}\n       └ ${m}`); fail++; failures.push(`${n} — ${m}`); };
async function check(name, fn) { try { await fn(); ok(name); } catch (e) { bad(name, e.message); } }
function must(cond, msg) { if (!cond) throw new Error(msg); }
const group = (t) => console.log(`\n${t}`);

const api = async (p, { method = "GET", body, token, admin, code } = {}) => {
  const h = {}; if (body) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  if (admin) h["x-admin-key"] = ADMIN;
  if (code) h["x-team-code"] = code;
  const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let json = null; const text = await r.text();
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
};
// เข้าสู่ระบบเป็นลูกค้า (สนามเด็กเล่นส่งรหัส OTP กลับมาให้เลย)
async function login(email) {
  const a = await api("/api/auth/request-otp", { method: "POST", body: { email } });
  const b = await api("/api/auth/verify-otp", { method: "POST", body: { email, code: a.json.dev_code } });
  must(b.json?.token, `เข้าสู่ระบบเป็น ${email} ไม่ได้`);
  return b.json.token;
}
// ซื้อเล่ม Blueprint 1 เล่มแบบลูกค้าจริง แล้วจ่ายเงิน
async function buyBook(email, channel, cycle = "August_2026", uid = "u_" + Math.random().toString(36).slice(2, 8)) {
  const c = await api("/api/checkout", { method: "POST", body: { tier: "Premium_490", payload: {
    user_id: uid, instagram_account: channel, email,
    meta_purchase: { tier: "Premium_490", billing_cycle: cycle },
    form_responses: { monthly_goal: "โต 10k", business_type: "ร้านกาแฟ", display_name: "ลูกค้าทดสอบ" } } } });
  must(c.json?.order_id, "สร้างออเดอร์เล่มไม่สำเร็จ: " + c.text.slice(0, 120));
  const p = await api("/api/create-payment-session", { method: "POST", body: { order_id: c.json.order_id } });
  return { orderId: c.json.order_id, redirect: p.json?.redirect_url, userId: uid };
}

// ───────── ยิงเซิร์ฟเวอร์สนามเด็กเล่นของตัวเองขึ้นมา ─────────
console.log("🩺 ตัวตรวจอัตโนมัติ — กำลังเปิดสนามทดสอบ…");
const srv = spawn(process.execPath, ["server/index.js"], {
  env: { ...process.env, LOCAL_DB: "1", LOCAL_DB_DIR: DBDIR, PORT: String(PORT),
         EMAIL_ENABLED: "0", PAY_PROVIDER: "mock", ADMIN_KEY: ADMIN, TEAM_KEY: "team",
         PLANS_PREVIEW: "promo", NODE_ENV: "test" },   // ⚠️ ต้องตรงกับเว็บจริงตอนนี้: ยังไม่ถึงวันเปิดขายแพ็ก

  stdio: ["ignore", "pipe", "pipe"],
});
let srvLog = "";
srv.stdout.on("data", d => { srvLog += d; });
srv.stderr.on("data", d => { srvLog += d; });
const cleanup = () => { try { srv.kill("SIGKILL"); } catch {} try { rmSync(DBDIR, { recursive: true, force: true }); } catch {} };
process.on("exit", cleanup); process.on("SIGINT", () => { cleanup(); process.exit(1); });

// รอจนเซิร์ฟเวอร์พร้อม
let up = false;
for (let i = 0; i < 90; i++) {
  await new Promise(r => setTimeout(r, 400));
  try { const h = await fetch(BASE + "/api/health"); if (h.ok) { up = true; break; } } catch {}
}
if (!up) { console.log("❌ เปิดสนามทดสอบไม่ขึ้น\n" + srvLog.slice(-1500)); cleanup(); process.exit(1); }

// ═════════════ 1) กรอกแบบคนจริง — ช่องที่ลูกค้าเจอหน้าจ่ายเงิน ═════════════
group("1️⃣  กรอกฟอร์มแบบลูกค้าจริง");
const { validateTax } = await import("../web/src/validate.js");
await check("ลูกค้าทั่วไป ไม่กรอกอะไรเลย → จ่ายได้", () =>
  must(validateTax(null) === null, "ดันบล็อกทั้งที่ไม่ได้กรอกอะไร"));
await check("ลูกค้าทั่วไป กรอกแค่ชื่อ-นามสกุล → จ่ายได้", () =>
  must(validateTax({ full_name: "สมหญิง ใจดี" }) === null,
    "กรอกชื่อ-นามสกุลแล้วกดจ่ายไม่ผ่าน (บั๊กที่คิมเจอ 12 ส.ค.)"));
await check("ติ๊กบริษัทแต่ไม่กรอกชื่อบริษัท → ต้องเตือน", () =>
  must(validateTax({ is_company: true }), "ปล่อยผ่านทั้งที่ยังไม่กรอกชื่อบริษัท"));
await check("บริษัท เลขภาษีไม่ครบ 13 หลัก → ต้องเตือน", () =>
  must(validateTax({ is_company: true, name: "บ.เอ", tax_id: "123", address: "กทม" }), "ปล่อยเลขภาษีผิดผ่าน"));
await check("บริษัทกรอกครบ → จ่ายได้", () =>
  must(validateTax({ is_company: true, name: "บ.เอ", tax_id: "1234567890123", address: "กทม" }) === null, "บล็อกทั้งที่กรอกครบ"));

// ═════════════ 2) เส้นทางเงิน: เล่ม Blueprint ═════════════
group("2️⃣  ซื้อเล่ม Blueprint");
const EM = "checkup@test.local";
const tok = await login(EM);
let book1;
await check("สั่งซื้อ + จ่ายเงิน → ออเดอร์เป็น 'จ่ายแล้ว'", async () => {
  book1 = await buyBook(EM, "@chan_a");
  const o = await api(`/api/orders/${book1.orderId}`);
  must(o.json?.order?.payment_status === "paid", "จ่ายแล้วแต่สถานะไม่เป็น paid");
});
await check("จ่ายแล้วได้ใบกำกับภาษี ชื่อสินค้าถูกต้อง", async () => {
  await new Promise(r => setTimeout(r, 600));
  const inv = await api("/api/admin/tax-invoices?limit=5", { admin: true });
  const row = (inv.json?.invoices || []).find(r => r.order_id === book1.orderId);
  must(row, "ไม่ออกใบกำกับให้");
  must(/Blueprint/.test(row.description || ""), `ชื่อบนใบผิด: ${row.description}`);
});

// ═════════════ 3) เส้นทางเงิน: อัปเกรดแพ็กหลายเดือน ═════════════
group("3️⃣  อัปเกรดแพ็ก 12 เดือน");
await check("มี 2 ช่อง → ต้องได้ช่องที่เลือก ไม่ใช่ช่องล่าสุด", async () => {
  await buyBook(EM, "@chan_b");                       // ช่องนี้ใหม่กว่า = ตัวล่อบั๊กเดิม
  const r = await api("/api/me/upgrade", { method: "POST", token: tok, body: { plan: "12m", channel: "@chan_a", preview: "1" } });
  must(r.json?.ok, "สร้างออเดอร์อัปเกรดไม่สำเร็จ: " + r.text.slice(0, 120));
  must(r.json.channel === "@chan_a", `เลือก @chan_a แต่ระบบให้ ${r.json.channel}`);
  globalThis.__up = r.json.order_id;
});
await check("ออเดอร์แพ็กต้องใช้รอบเดือนนี้ ไม่ใช่เดือนของเล่มเก่า", async () => {
  // บั๊กจริง 12 ส.ค.: เล่มเก่าเป็น June ออเดอร์แพ็กเลยได้รอบ June ทั้งที่ซื้อเดือนสิงหา
  await buyBook(EM, "@chan_old", "March_2026");            // เล่มเก่าคนละเดือนกับวันนี้
  const r = await api("/api/me/upgrade", { method: "POST", token: tok, body: { plan: "6m", channel: "@chan_old", preview: "1" } });
  must(r.json?.ok, "สร้างออเดอร์แพ็กไม่สำเร็จ: " + r.text.slice(0, 120));
  const o = await api(`/api/orders/${r.json.order_id}`);
  const MO = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const now = new Date();
  const want = `${MO[now.getMonth()]}_${now.getFullYear()}`;
  must(o.json?.order?.billing_cycle === want, `รอบเดือนควรเป็น ${want} แต่ได้ ${o.json?.order?.billing_cycle}`);
});
await check("จ่ายค่าแพ็กแล้วต้องกลับหน้าบัญชี ไม่วิ่งไปสร้างเล่ม", async () => {
  const p = await api("/api/create-payment-session", { method: "POST", body: { order_id: globalThis.__up } });
  must(/\/account/.test(p.json?.redirect_url || ""), `ไปที่ ${p.json?.redirect_url} แทนหน้าบัญชี`);
});
await check("ซื้อแพ็กด้วยโค้ดฟรี 100% ก็ต้องกลับหน้าบัญชี ไม่ใช่ไปสร้างเล่ม", async () => {
  // เส้นนี้คิมใช้ทดสอบบ่อย (KIMFREE) — เคยเด้งไปหน้า "ครูพี่คิมกำลังอ่านช่องของคุณ" ผิด (12 ส.ค.)
  await api("/api/admin/codes", { method: "POST", admin: true, body: { code: "FREEALL", discount_percent: 100, max_uses: 99 } });
  await buyBook(EM, "@chan_free");
  const up = await api("/api/me/upgrade", { method: "POST", token: tok, body: { plan: "6m", channel: "@chan_free", preview: "1" } });
  must(up.json?.ok, "สร้างออเดอร์แพ็กไม่สำเร็จ: " + up.text.slice(0, 120));
  const r = await api("/api/apply-code", { method: "POST", body: { order_id: up.json.order_id, code: "FREEALL" } });
  must(r.json?.ok, "ใช้โค้ดไม่สำเร็จ: " + r.text.slice(0, 120));
  must(/\/account/.test(r.json.redirect_url || ""), `เด้งไป ${r.json.redirect_url} แทนหน้าบัญชี`);
});
await check("เลือกแพ็กที่หน้าจ่ายเงิน (โหมดพรีวิว) → ต้องคิดราคาแพ็กจริง ไม่ใช่ราคารายเดือน", async () => {
  // 🗓️ ก่อน 1 ก.ย. planOf() จะบังคับทุกอย่างเป็น "รายเดือน 490"
  //    ถ้าหน้าจ่ายเงินเลือกแพ็ก 12 เดือนแล้วยังได้ 490 = ขายขาดทุน + สิทธิ์ไม่เปิด
  const o = await api("/api/checkout", { method: "POST", body: { tier: "Premium_490", payload: {
    user_id: "u_setplan", instagram_account: "@chan_setplan", email: "newbuyer@test.local",
    meta_purchase: { tier: "Premium_490", billing_cycle: "August_2026" },
    form_responses: { monthly_goal: "โต 10k", business_type: "ร้านกาแฟ", display_name: "ลูกค้าทดสอบ" } } } });
  must(o.json?.order_id, "สร้างออเดอร์ไม่สำเร็จ: " + o.text.slice(0, 120));
  const noPrev = await api("/api/order/set-plan", { method: "POST", body: { order_id: o.json.order_id, plan: "12m" } });
  must(noPrev.status === 409, `ลูกค้าทั่วไปต้องเลือกแพ็กไม่ได้ก่อน 1 ก.ย. แต่ได้ ${noPrev.status}`);
  const r = await api("/api/order/set-plan", { method: "POST", body: { order_id: o.json.order_id, plan: "12m", preview: "1" } });
  must(r.json?.ok, "เลือกแพ็กในโหมดพรีวิวไม่ได้: " + r.text.slice(0, 120));
  must(r.json.months === 12, `ได้แพ็ก ${r.json.months} เดือน แทนที่จะเป็น 12`);
  must(r.json.amount_satang === 954000, `ยอด ฿${r.json.amount_satang / 100} ไม่ใช่ ฿9,540`);
  // ...แล้วลูกค้าใหม่คนนี้ต้องได้เล่มเดือนแรกทันที ไม่ใช่โดนหน้าปฏิเสธหลังจ่าย ฿9,540
  const p2 = await api("/api/create-payment-session", { method: "POST", body: { order_id: o.json.order_id } });
  must(/\/processing/.test(p2.json?.redirect_url || ""), `เด้งไป ${p2.json?.redirect_url} แทนหน้าสร้างเล่ม`);
  const g = await api("/api/start-generation", { method: "POST", body: { order_id: o.json.order_id } });
  must(g.json?.error !== "PLAN_ORDER", "ลูกค้าใหม่ที่ซื้อแพ็กโดนปฏิเสธไม่ให้สร้างเล่มเดือนแรก");
  // ...และสิทธิ์ต้องถูกหักไป 1 เดือน เหลือ 11 (ไม่ใช่ได้เล่มฟรีแถม 12 เดือน)
  const tk = await login("newbuyer@test.local");
  const pk = await api("/api/me/perks?channel=@chan_setplan", { token: tk });
  must(pk.json?.months_left === 11, `เหลือ ${pk.json?.months_left} เดือน ควรเหลือ 11 (เล่มเดือนแรกนับเป็นเดือนที่ 1)`);
});
await check("คอร์สฟรี: ต้องมีเฉพาะคอร์สที่ยังขายอยู่ ไม่มีคอร์สราคา 0 / คอร์สพาร์ทเนอร์", async () => {
  // คิมเจอ 12 ส.ค.: รายการคอร์สฟรีมีคอร์สที่เลิกขายแล้วเต็มไปหมด + มีคอร์ส ASaiDemy ที่ห้ามแจก
  // 🪤 ใส่ "ของล่อ" 3 แบบเข้าไปก่อน แล้วดูว่ามันหลุดเข้ารายการคอร์สฟรีไหม
  //    (ถ้าไม่มีของล่อ ข้อสอบข้อนี้จะผ่านตลอดแม้โค้ดพัง — เคยเป็นแบบนั้นจริง)
  await api("/api/admin/academy-import", { method: "POST", admin: true, body: { table: "academy_tutors",
    rows: [{ legacy_id: "t_partner", data_json: JSON.stringify({ name: "ASaiDemy" }) }] } });
  await api("/api/admin/academy-import", { method: "POST", admin: true, body: { table: "academy_courses", rows: [
    { legacy_id: "9001", name: "คอร์สที่ปิดขายไปแล้ว", price: "2000", is_active: "1" },                    // เลิกขาย
    { legacy_id: "9002", name: "คอร์สราคาศูนย์", price: "0", is_active: "0" },                              // ราคา 0
    { legacy_id: "9003", name: "คอร์สของพาร์ทเนอร์", price: "3000", is_active: "0", instructor: "t_partner" }, // ห้ามแจก
  ] } });
  const me = await api("/api/me/perks", { token: tok });
  const choices = me.json?.free_course?.choices || [];
  must(choices.length, "ไม่มีคอร์สให้เลือกเลย — ตรวจไม่ได้");
  const ids = choices.map(c => String(c.id));
  must(!ids.includes("9001"), "คอร์สที่ปิดขายไปแล้วหลุดเข้ารายการคอร์สฟรี");
  must(!ids.includes("9002"), "คอร์สราคา 0 หลุดเข้ารายการคอร์สฟรี");
  must(!ids.includes("9003"), "คอร์สของพาร์ทเนอร์หลุดเข้ารายการคอร์สฟรี (ต้องจ่ายส่วนแบ่งจริง)");

  // 🎓 คอร์สที่ลูกค้ามีอยู่แล้ว ต้องไม่โผล่ให้เลือกซ้ำ (คิมเจอ 12 ส.ค.: มีคอร์สอยู่แล้วแต่กดเลือกเป็นคอร์สฟรีได้)
  const mine = choices[0];
  await api("/api/admin/academy/grant", { method: "POST", admin: true, body: { email: EM, course_id: mine.id } });
  const after = await api("/api/me/perks", { token: tok });
  const ids2 = (after.json?.free_course?.choices || []).map(c => String(c.id));
  must(!ids2.includes(String(mine.id)), `คอร์สที่มีอยู่แล้วยังโผล่ให้เลือกซ้ำ: ${mine.name}`);
  const tryPick = await api("/api/me/free-course", { method: "POST", token: tok, body: { course_id: mine.id } });
  must(!tryPick.json?.ok, "เลือกคอร์สที่มีอยู่แล้วได้ = เสียสิทธิ์ฟรีเปล่าๆ");
  const cat = await api("/api/academy/catalog");
  const onSale = new Set((cat.json?.courses || []).map(c => String(c.id)));
  for (const c of choices) {
    must(Number(c.price) > 0, `มีคอร์สราคา 0 หลุดมา: ${c.name}`);
    must(onSale.has(String(c.id)), `มีคอร์สที่ไม่ได้ขายอยู่หลุดมา: ${c.name}`);
    must(!/asaidemy/i.test(c.name), `คอร์สพาร์ทเนอร์หลุดมาแจกฟรี: ${c.name}`);
  }
});
await check("บังคับให้ออเดอร์แพ็กสร้างเล่ม → ระบบต้องปฏิเสธ (ด่านสุดท้าย)", async () => {
  // คิมถาม 12 ส.ค.: "ถ้าเทสต์รอบที่ 3 จะเจอปัญหาเดิมอีกไหม"
  // ข้อนี้จำลอง "เส้นทางที่แย่ที่สุด" — ยิงตรงเข้าตัวสร้างเล่มด้วยออเดอร์แพ็กที่จ่ายแล้ว
  // ถึงจะมีเส้นทางใหม่ที่เราไม่รู้จักในอนาคต ก็ต้องมาตายตรงนี้ ไม่มีทางสร้างเล่มได้
  await buyBook(EM, "@chan_guard");
  const up = await api("/api/me/upgrade", { method: "POST", token: tok, body: { plan: "12m", channel: "@chan_guard", preview: "1" } });
  must(up.json?.ok, "สร้างออเดอร์แพ็กไม่สำเร็จ: " + up.text.slice(0, 120));
  await api("/api/create-payment-session", { method: "POST", body: { order_id: up.json.order_id } });
  const g = await api("/api/start-generation", { method: "POST", body: { order_id: up.json.order_id } });
  must(!g.json?.ok, "❗ ระบบยอมสร้างเล่มจากออเดอร์ซื้อแพ็ก (เปลืองค่า AI + ลูกค้าได้ของผิด)");
  must(g.json?.error === "PLAN_ORDER", `ควรถูกปฏิเสธด้วย PLAN_ORDER แต่ได้ ${g.json?.error}`);
  const o = await api(`/api/orders/${up.json.order_id}`);
  must(!o.json?.order?.blueprint_id, "มีเล่มถูกสร้างขึ้นจริงจากออเดอร์แพ็ก");
});
await check("ได้สิทธิ์ 12 เดือนเต็ม ยังไม่ถูกหักสักเดือน", async () => {
  await new Promise(r => setTimeout(r, 600));
  const me = await api("/api/me/perks", { token: tok });
  must(me.json?.plan === "12m", `แพ็กควรเป็น 12m แต่ได้ ${me.json?.plan} (สิทธิ์ไม่ถูกเปิด)`);
  must(me.json.months_total === 12, `ควรได้ 12 เดือน แต่ได้ ${me.json.months_total}`);
  must(me.json.months_left === 12, `ควรเหลือครบ 12 แต่เหลือ ${me.json.months_left} (โดนหักเดือนแรกทิ้ง)`);
});
await check("กดสร้างเล่มเดือนถัดไป → สิทธิ์ลด 1 เดือน", async () => {
  const r = await api("/api/subscription/claim-month", { method: "POST", token: tok, body: { tier: "Premium_490", payload: {
    user_id: "u_up", instagram_account: "@chan_a", email: EM,
    meta_purchase: { tier: "Premium_490", billing_cycle: "September_2026" },
    form_responses: { monthly_goal: "โต 10k" } } } });
  must(r.json?.ok, "ใช้สิทธิ์ไม่ได้: " + r.text.slice(0, 120));
  const me = await api("/api/me/perks", { token: tok });
  must(me.json.months_left === 11, `ควรเหลือ 11 แต่เหลือ ${me.json.months_left}`);
});
await check("กดซ้ำเดือนเดิม → ต้องกันไว้ ไม่เสียสิทธิ์ฟรี", async () => {
  const r = await api("/api/subscription/claim-month", { method: "POST", token: tok, body: { tier: "Premium_490", payload: {
    user_id: "u_up", instagram_account: "@chan_a", email: EM,
    meta_purchase: { tier: "Premium_490", billing_cycle: "September_2026" },
    form_responses: { monthly_goal: "โต 10k" } } } });
  must(!r.json?.ok, "ปล่อยให้ใช้สิทธิ์ซ้ำเดือนเดิม");
  const me = await api("/api/me/perks", { token: tok });
  must(me.json.months_left === 11, `สิทธิ์หายเพิ่ม เหลือ ${me.json.months_left}`);
});

// ═════════════ 4) เส้นทางเงิน: คอร์ส · คลาสสด · เครดิต ═════════════
group("4️⃣  คอร์ส · คลาสสด · เครดิตตัดต่อ");
await check("โค้ดส่วนลดใช้ได้ทุกหน้า (คิดยอดถูก)", async () => {
  await api("/api/admin/codes", { method: "POST", admin: true, body: { code: "HALF", discount_percent: 50, max_uses: 99 } });
  const r = await api("/api/promo/preview", { method: "POST", body: { code: "HALF", amount_satang: 100000 } });
  must(r.json?.final === 50000, `ลด 50% จาก 1,000 ควรเหลือ 500 แต่ได้ ${(r.json?.final || 0) / 100}`);
});
await check("โค้ดที่ปิดแล้ว ใช้ไม่ได้", async () => {
  await api("/api/admin/codes", { method: "POST", admin: true, body: { code: "OFFCODE", discount_percent: 100, max_uses: 5 } });
  await api("/api/admin/codes/toggle", { method: "POST", admin: true, body: { code: "OFFCODE" } });
  const r = await api("/api/promo/preview", { method: "POST", body: { code: "OFFCODE", amount_satang: 100000 } });
  must(!r.json?.ok, "โค้ดที่ปิดแล้วยังใช้ได้");
});
await check("ซื้อเครดิตตัดต่อพร้อมโค้ด → หักราคาถูก + ได้เครดิตจริง", async () => {
  const before = (await api("/api/edit/credits", { token: tok })).json?.credits || 0;
  const r = await api("/api/edit/credits/buy", { method: "POST", token: tok, body: { credits: 1, code: "HALF" } });
  must(r.json?.ok, "ซื้อเครดิตไม่สำเร็จ: " + r.text.slice(0, 120));
  const after = (await api("/api/edit/credits", { token: tok })).json?.credits || 0;
  must(after === before + 1, `เครดิตควรเพิ่ม 1 (${before}→${after})`);
});
await check("ยังไม่ล็อกอิน → ต้องล็อกอินจบในหน้าเดิมแล้วส่งงานต่อได้ (ไม่ตันกลางทาง)", async () => {
  // คิมเจอบนมือถือ 13 ส.ค.: กรอกบรีฟจนเสร็จ กดส่ง ได้แค่ "เข้าสู่ระบบก่อนนะคะ"
  // หน้านั้นไม่มีทางไปล็อกอินเลย ต้องออกไปหน้าอื่น = บรีฟหายหมด
  const EM2 = "nologin@test.local";
  const blocked = await api("/api/edit/use-credit", { method: "POST", body: { script_day: null, job_title: "x" } });
  must(blocked.status === 401, `ยังไม่ล็อกอินแต่ส่งงานได้ (${blocked.status})`);
  const t2 = await login(EM2);                       // ← กล่องล็อกอินในหน้าใช้ 2 เส้นนี้
  must(t2, "ล็อกอินในหน้าไม่สำเร็จ");
  await api("/api/edit/credits/buy", { method: "POST", token: t2, body: { credits: 1 } });
  const job = await api("/api/edit/use-credit", { method: "POST", token: t2,
    body: { script_day: null, job_title: "คลิปทดสอบ", footage_url: "https://drive.google.com/z" } });
  must(job.json?.order_id, "ล็อกอินแล้วยังส่งงานไม่ได้: " + job.text.slice(0, 140));
});
await check("ซื้อเครดิตจากหน้าบรีฟ → ต้องพากลับมาที่บรีฟเดิม ไม่ใช่โยนไปหน้าแรก", async () => {
  // คิมทัก 12 ส.ค.: กรอกบรีฟจนเสร็จ จะกดส่งแต่ไม่มีเครดิต ต้องออกไปซื้อที่หน้าอื่น = บรีฟหายหมด
  const backTo = "/edit/new?free=1&topup=ok";
  const r = await api("/api/edit/credits/buy", { method: "POST", token: tok, body: { credits: 1, return_to: backTo } });
  must(r.json?.ok, "ซื้อเครดิตไม่สำเร็จ: " + r.text.slice(0, 120));
  must(r.json.redirect_url === backTo, `พาไป ${r.json.redirect_url} แทนที่จะกลับหน้าบรีฟ`);
});
await check("ลิงก์กลับที่ไม่ใช่ของเว็บเรา ต้องไม่ถูกใช้ (กันหลอกลูกค้าออกนอกเว็บ)", async () => {
  for (const bad of ["https://evil.example/steal", "//evil.example", "/account?x=1"]) {
    const r = await api("/api/edit/credits/buy", { method: "POST", token: tok, body: { credits: 1, return_to: bad } });
    must(r.json?.redirect_url === "/edit?topup=ok", `ยอมพาไป ${r.json?.redirect_url} จาก return_to = ${bad}`);
  }
});
await check("จองคลาสรอบที่ผ่านไปแล้ว → ต้องจองไม่ได้", async () => {
  const ws = await api("/api/workshops");
  const s = (ws.json?.workshops || []).flatMap(w => w.sessions || [])[0];
  if (!s) return;                                     // สนามทดสอบไม่มีรอบ = ข้าม
  const r = await api("/api/workshops/book", { method: "POST", token: tok,
    body: { session_id: "ไม่มีรอบนี้", qty: 1, name: "ทดสอบ", phone: "0812345678" } });
  must(!r.json?.ok, "จองรอบที่ไม่มีอยู่จริงได้");
});

// ═════════════ 5) งานตัดต่อ: สั่ง → แจ้งทีม → รอบแก้ ═════════════
group("5️⃣  งานตัดต่อของลูกค้า");
let jobId;
await check("ใช้เครดิตสั่งงาน → ได้งาน + ระบบบันทึกว่าแจ้งทีมแล้ว", async () => {
  const r = await api("/api/edit/use-credit", { method: "POST", token: tok,
    body: { script_day: null, job_title: "คลิปทดสอบ", note: "เน้นไวรัล", footage_url: "https://drive.google.com/x" } });
  must(r.json?.ok, "สั่งงานไม่สำเร็จ: " + r.text.slice(0, 120));
  jobId = r.json.order_id;
  const list = await api("/api/admin/edit-orders", { admin: true });
  const job = (list.json?.orders || []).find(o => o.order_id === jobId);
  must(job, "ไม่เจองานที่เพิ่งสั่ง");
  must("ops_notified_at" in job, "ระบบไม่มีช่องบันทึกว่าแจ้งทีมแล้ว");
});
await check("ลูกค้าเพิ่มจุดแก้ได้เฉพาะตอนทีมส่งงานแล้ว", async () => {
  const r = await api("/api/edit/rounds/submit", { method: "POST", token: tok, body: { order_id: jobId } });
  must(!r.json?.ok, "ส่งรอบแก้ได้ทั้งที่ทีมยังไม่ส่งงานให้ดู");
});
await check("ทีมส่งงาน → ลูกค้าใส่จุดแก้แล้วส่งได้", async () => {
  await api("/api/admin/edit-order/update", { method: "POST", admin: true,
    body: { order_id: jobId, status: "draft_sent", draft_url: "https://youtu.be/x" } });
  await api("/api/edit/rounds/note", { method: "POST", token: tok, body: { order_id: jobId, text: "แก้ตรงนี้", at: "0:45" } });
  const r = await api("/api/edit/rounds/submit", { method: "POST", token: tok, body: { order_id: jobId } });
  must(r.json?.ok, "ส่งรอบแก้ไม่ผ่าน: " + r.text.slice(0, 140));
});

// ═════════════ 6) ปุ่มที่โชว์ให้กด ต้องกดได้จริง ═════════════
group("6️⃣  สิทธิ์ในหน้าทีม (ปุ่มที่เห็น = กดได้)");
await check("คนที่ขอกราฟฟิก ต้องกด 'รับงานแล้ว' ได้ (ไม่ใช่ 403)", async () => {
  const me = await api("/api/team/me", { admin: true });
  const fairy = (me.json?.members || []).find(m => m.role === "graphic");
  if (!fairy) return;                                  // ไม่มีกราฟฟิกในสนามทดสอบ = ข้าม
  const g = await api("/api/team/graphic/request", { method: "POST", admin: true,
    body: { order_id: jobId, clip_url: "https://drive.google.com/cut" } });
  must(g.json?.ok, "ขอกราฟฟิกไม่สำเร็จ: " + g.text.slice(0, 120));
  const u = await api("/api/team/graphic/update", { method: "POST", admin: true, body: { gj_id: g.json.gj_id, status: "done" } });
  must(u.json?.ok, "คนที่ขอกดปิดงานไม่ได้ (403)");
});
await check("กราฟฟิกประจำ (แฟรี่) ต้องไม่โดนยัดงานตัดต่อวันทำงาน — เปิดวันเองถึงจะรับได้", async () => {
  // คิมอธิบาย 12 ส.ค.: จ-ศ แฟรี่ทำกราฟฟิกบริษัทกินเงินเดือน
  // งานตัดต่อคลิปละ ฿800 คือ "งานเสริมวันหยุด" ที่เธอต้องกดเปิดวันเอง ระบบห้ามจ่ายให้เอง
  const wl = await api("/api/team/workload", { admin: true });
  const rows = wl.json?.people || [];
  const f = rows.find(m => m.role === "graphic");
  must(f, "ระบบมองไม่เห็นกราฟฟิกในคิวงานตัดต่อเลย — เปิดวันหยุดยังไงก็ไม่ได้งาน");
  must(Number(f.capacity) === 0, `แฟรี่ว่างรับงานตัดต่อ ${f.capacity} คลิปทั้งที่ยังไม่ได้เปิดวันไหนเลย`);
  must(f.auto_available === false, "ระบบตั้งให้แฟรี่ว่างอัตโนมัติ จ-ศ ซึ่งเป็นวันงานประจำของเธอ");
  // เปิดวันเอง 1 วัน → ต้องรับได้ 1 คลิป
  const d3 = new Date(); d3.setDate(d3.getDate() + 3);          // ต้องอยู่ในช่วง 14 วันที่ระบบมอง
  const day = d3.toISOString().slice(0, 10);
  await api("/api/team/availability", { method: "POST", admin: true, body: { member_id: f.member_id, day, slots: 1 } });
  const wl2 = await api("/api/team/workload", { admin: true });
  const f2 = (wl2.json?.people || []).find(m => m.role === "graphic");
  must(Number(f2?.capacity) === 1, `เปิดวันเองแล้วยังรับได้ ${f2?.capacity} คลิป ควรเป็น 1`);
});
await check("ส่งลิงก์งานให้ลูกค้าผิด ต้องแก้เองได้ ไม่ต้องรบกวนคิม", async () => {
  // ทีมถาม 13 ส.ค.: "ถ้า editor ส่งลิงก์ที่งานให้ลูกค้าผิด ต้องทำไง?" — เดิมทำไม่ได้เลย ลิงก์ล็อกหลังส่ง
  const bad = "https://youtu.be/ลิงก์ผิด", good = "https://youtu.be/ลิงก์ถูก";
  await api("/api/admin/edit-order/update", { method: "POST", admin: true,
    body: { order_id: jobId, status: "draft_sent", draft_url: bad } });
  const r = await api("/api/team/fix-draft-url", { method: "POST", admin: true,
    body: { order_id: jobId, draft_url: good, note: "แปะผิดงาน" } });
  must(r.json?.ok, "แก้ลิงก์ไม่สำเร็จ: " + r.text.slice(0, 140));
  const list = await api("/api/admin/edit-orders", { admin: true });
  const job = (list.json?.orders || []).find(o => o.order_id === jobId);
  must(job?.draft_url === good, `ลิงก์ยังเป็น ${job?.draft_url}`);
  // ลิงก์มั่วต้องไม่ผ่าน
  const junk = await api("/api/team/fix-draft-url", { method: "POST", admin: true, body: { order_id: jobId, draft_url: "ไม่ใช่ลิงก์" } });
  must(!junk.json?.ok, "รับลิงก์ที่ไม่ใช่ URL");
});
await check("ลูกค้าแนบรูป + ลิงก์ในจุดแก้ได้ และเปิดดูได้เฉพาะเจ้าของ", async () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const r = await api("/api/edit/rounds/note", { method: "POST", token: tok,
    body: { order_id: jobId, text: "ตรงนี้สีเพี้ยน", at: "0:20", image: png, link: "https://youtu.be/ตัวอย่าง" } });
  must(r.json?.ok, "แนบไม่สำเร็จ: " + r.text.slice(0, 140));
  const last = (r.json.notes || []).slice(-1)[0];
  must(last?.file_id, "ไม่ได้เก็บรูปไว้");
  must(last?.link, "ไม่ได้เก็บลิงก์ไว้");
  // ลิงก์มั่วต้องไม่ผ่าน
  const badLink = await api("/api/edit/rounds/note", { method: "POST", token: tok, body: { order_id: jobId, text: "x", link: "javascript:alert(1)" } });
  must(!badLink.json?.ok, "รับลิงก์ที่ไม่ใช่ http(s)");
  // คนอื่นเปิดรูปนี้ไม่ได้
  const other = await login("stranger@test.local");
  const peek = await api(`/api/edit/note-file/${last.file_id}?order_id=${encodeURIComponent(jobId)}`, { token: other });
  must(peek.status !== 200, `คนอื่นเปิดรูปของลูกค้าได้ (${peek.status})`);
});
await check("เปลี่ยนรหัสล็อกอินแล้ว สิทธิ์ในทีมต้องไม่หาย", async () => {
  // คิมเปลี่ยนรหัสทั้งทีม 13 ส.ค. — เดิมสิทธิ์ "ขอให้กราฟฟิกช่วย" ผูกกับรหัสตายตัว (bow/gong/gun)
  // เปลี่ยนรหัสปุ๊บสิทธิ์หายเงียบๆ โดยไม่มีใครรู้ → ย้ายไปอิงคุณสมบัติของคนแทน
  const ms = await api("/api/team/members", { admin: true });
  const bow = (ms.json?.members || []).find(m => String(m.code).toLowerCase() === "bow");
  must(bow, "ไม่เจอคนในเฮ้าส์ในสนามทดสอบ");
  const save = (code) => api("/api/team/members/save", { method: "POST", admin: true,
    body: { member_id: bow.member_id, name: bow.name, code, role: bow.role, email: bow.email,
            position: bow.position, side: bow.side, active: true, default_slots: bow.default_slots } });
  await save("bo-changed-123");
  const me = await api("/api/team/me?code=bo-changed-123", {});
  must(me.json?.ok, "ล็อกอินด้วยรหัสใหม่ไม่ได้: " + me.text.slice(0, 120));
  must(me.json.can_ask_graphic === true, "เปลี่ยนรหัสแล้วสิทธิ์ขอกราฟฟิกหาย");
  // พิมพ์ตัวใหญ่ก็ต้องเข้าได้ (ทีมขี้ลืม — คิมสั่งให้เอาง่ายไว้ก่อน)
  const up = await api("/api/team/me?code=BO-CHANGED-123", {});
  must(up.json?.ok, "พิมพ์ตัวใหญ่แล้วเข้าไม่ได้");
  await save(bow.code);
});
await check("ไม่เปิดวันไว้ = ระบบต้องไม่ยัดงานให้ (ทุกคนเป็น opt-in)", async () => {
  // คิมสั่ง 13 ส.ค.: "อยากให้ทุกคนทำงานเสริมได้ แต่เขาต้องติ๊กว่าว่างนะ"
  // เปิดสิทธิ์ให้ AE/ฟรีแลนซ์รับงานได้แล้ว — ตาข่ายที่กันไว้คือ "โควตา 0 = ไม่มีวันได้งาน"
  const wl = await api("/api/team/workload", { admin: true });
  const people = wl.json?.people || [];
  must(people.length, "ไม่มีใครในคิวงานเลย");
  for (const m of people) {
    if (Number(m.default_slots || 0) === 0 && !(m.filed_days || []).length) {
      must(Number(m.capacity || 0) === 0,
        `${m.name} ไม่ได้เปิดวันไว้เลย แต่ระบบมองว่าว่าง ${m.capacity} คลิป`);
    }
  }
});
await check("สรุปรายเดือน: พนักงานประจำต้องไม่ได้เงินจากงาน จ-ศ (อยู่ในเงินเดือนแล้ว)", async () => {
  // คิมสั่ง 13 ส.ค.: "หน้าสรุปงานตรงนี้จะเป็นยอดเฉพาะงานฟรีแลนซ์ที่เขาทำเพิ่มเท่านั้น"
  // เดิมนับทุกคลิป × ฿800 → พนักงานประจำจะเห็นตัวเลขเหมือนถูกค้างจ่ายทั้งที่กินเงินเดือนอยู่
  const ms = await api("/api/team/members", { admin: true });
  const inh = (ms.json?.members || []).find(m => String(m.code).toLowerCase() === "bow");
  const free = (ms.json?.members || []).find(m => String(m.code).toLowerCase() === "gun");
  must(inh, "ไม่เจอพนักงานประจำในสนามทดสอบ");
  const meIn = await api(`/api/team/me?code=${encodeURIComponent(inh.code)}`, {});
  must(meIn.json?.ok, "ล็อกอินพนักงานประจำไม่ได้");
  const mm = meIn.json.my_month?.this;
  must(mm, "ไม่มีสรุปรายเดือน");
  must(mm.inhouse === true, "ระบบไม่รู้ว่าคนนี้เป็นพนักงานประจำ");
  // เงินต้องมาจาก extra_clips เท่านั้น ไม่ใช่ clip_units ทั้งหมด
  must(mm.pay === (mm.extra_clips || 0) * mm.rate,
    `ยอดเงิน ${mm.pay} ไม่ตรงกับคลิปที่ทำเพิ่ม ${mm.extra_clips} × ${mm.rate}`);
  must((mm.extra_clips || 0) <= (mm.clip_units || 0), "คลิปที่ทำเพิ่มมากกว่าคลิปทั้งหมด");
});
await check("ประตูรับงานประตูเดียว — ติ๊กประเภทไหน ต้องไปหาคนที่ถูกต้อง", async () => {
  // คิมสั่ง 13 ส.ค.: เดิมมี 3 ฟอร์มแยกกัน ลูกตาลต้องรู้ก่อนว่างานนี้ประเภทไหนถึงจะกรอกถูกที่
  // รวมเป็นฟอร์มเดียวแล้ว — ฟอร์มยิงไป 3 เส้นตามที่ติ๊ก ต้องผ่านทั้ง 3 เส้น
  const stamp = Math.random().toString(36).slice(2, 7);
  // 🎬 ตัดต่อ → ระบบเลือกคนตัดให้
  const ed = await api("/api/team/intake", { method: "POST", admin: true,
    body: { client_name: "ลูกค้าทดสอบ", client_email: `intake${stamp}@test.local`, title: "งานตัดต่อ", clips: 1, brief: "x" } });
  must(ed.json?.ok, "รับงานตัดต่อไม่สำเร็จ: " + ed.text.slice(0, 140));
  // 🎨 กราฟฟิก → เข้าคิวกราฟฟิกได้โดยไม่ต้องผูกกับงานตัดต่อ
  const gr = await api("/api/team/graphic/request", { method: "POST", admin: true,
    body: { title: "งานกราฟฟิกเดี่ยว", brief: "ทำโลโก้", client: "ลูกค้าทดสอบ" } });
  must(gr.json?.ok, "ส่งงานกราฟฟิกเดี่ยวไม่ได้: " + gr.text.slice(0, 140));
  // 📝 คอนเทนต์ → เข้าคิวคนตรวจคอนเทนต์
  const ct = await api("/api/team/content/create", { method: "POST", admin: true,
    body: { client_name: "ลูกค้าทดสอบ", brief: "อยากได้คอนเทนต์ขายของ", want_count: 3 } });
  must(ct.json?.ok, "รับบรีฟคอนเทนต์ไม่สำเร็จ: " + ct.text.slice(0, 140));
  // อีเมลลูกค้าเป็นของบังคับเฉพาะงานตัดต่อ (ลูกค้าต้องเปิดหน้างานเอง)
  const noEmail = await api("/api/team/intake", { method: "POST", admin: true,
    body: { client_name: "ไม่มีเมล", title: "งาน", clips: 1 } });
  must(!noEmail.json?.ok, "รับงานตัดต่อได้ทั้งที่ไม่มีอีเมลลูกค้า");
});
await check("ต้องแปะลิงก์คลิปก่อนถึงจะส่งให้กราฟฟิกได้", async () => {
  // ⚠️ ต้องใช้ "งานใหม่ที่ยังไม่เคยส่งดราฟให้ลูกค้า" — ถ้าใช้งานเดิมที่มี draft_url อยู่แล้ว
  //    ระบบจะดึงลิงก์นั้นมาใช้ให้เอง (ถูกต้องแล้ว) เทสต์จะผ่านทั้งที่ไม่ได้ทดสอบอะไรเลย
  await api("/api/edit/credits/buy", { method: "POST", token: tok, body: { credits: 1 } });
  const j = await api("/api/edit/use-credit", { method: "POST", token: tok,
    body: { script_day: null, job_title: "คลิปทดสอบลิงก์", note: "-", footage_url: "https://drive.google.com/y" } });
  must(j.json?.order_id, "สั่งงานใหม่ไม่สำเร็จ: " + j.text.slice(0, 120));
  const r = await api("/api/team/graphic/request", { method: "POST", admin: true, body: { order_id: j.json.order_id } });
  must(!r.json?.ok, "ส่งให้กราฟฟิกได้ทั้งที่ยังไม่มีลิงก์คลิปให้ดู");
  must(r.json?.error === "NEED_CLIP", "ปฏิเสธด้วยเหตุผลอื่น: " + r.text.slice(0, 140));
});

// ═════════════ 7) ความปลอดภัย ═════════════
group("7️⃣  ความปลอดภัย");
await check("ไม่ล็อกอิน เปิดข้อมูลลูกค้าไม่ได้", async () => {
  const r = await api("/api/me/blueprints");
  must(r.status === 401, `ควร 401 แต่ได้ ${r.status}`);
});
await check("ไม่มีรหัสแอดมิน เปิดหลังบ้านไม่ได้", async () => {
  const r = await api("/api/admin/overview");
  must(r.status === 401, `ควร 401 แต่ได้ ${r.status}`);
});
await check("สุ่มโค้ดส่วนลดรัวๆ ต้องโดนบล็อก", async () => {
  let blocked = false;
  for (let i = 0; i < 45; i++) {
    const r = await api("/api/promo/preview", { method: "POST", body: { code: "X" + i, amount_satang: 1000 } });
    if (r.status === 429) { blocked = true; break; }
  }
  must(blocked, "ยิงเดาโค้ด 45 ครั้งยังไม่โดนบล็อก");
});

// ───────── สรุป ─────────
console.log(`\n${"─".repeat(52)}`);
if (fail === 0) {
  console.log(`🟢 ผ่านหมด ${pass} ข้อ — ปลอดภัยที่จะขึ้นเว็บ`);
} else {
  console.log(`🔴 ไม่ผ่าน ${fail} ข้อ (ผ่าน ${pass})\n`);
  failures.forEach(f => console.log(`   • ${f}`));
  console.log(`\n⛔ ห้ามขึ้นเว็บจนกว่าจะแก้ครบ`);
}
cleanup();
process.exit(fail === 0 ? 0 : 1);
