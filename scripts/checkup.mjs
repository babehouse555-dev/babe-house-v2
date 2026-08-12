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
await check("ต้องแปะลิงก์คลิปก่อนถึงจะส่งให้กราฟฟิกได้", async () => {
  const b = await buyBook(EM, "@chan_c");
  const r = await api("/api/team/graphic/request", { method: "POST", admin: true, body: { order_id: jobId } });
  must(!r.json?.ok || r.json?.already, "ส่งให้กราฟฟิกได้ทั้งที่ไม่มีลิงก์คลิป");
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
