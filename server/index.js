import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import path from "node:path";
import fs, { readFileSync } from "node:fs";
import os from "node:os";
import multer from "multer";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { pool, q, one, run, initDb } from "./db.js";
import { issueTaxInvoice, retryPendingInvoices, invoicesCsv, flowAccountReady, splitVat } from "./tax.js";
import { seedProjects } from "./seed-projects.js";
import { seedPlayground } from "./seed-playground.js";
import { seedWorkshops } from "./seed-workshops.js";
import { seedAssignments } from "./seed-assignments.js";
import { generateBlueprint, generateAnalysis, generateContent, generateSingleScript, generateGrowthAnalysis, buildBaselineGrowth, generateAdminInsight, classifyIndustries, classifyKeyword, INDUSTRIES, aiModelName, aiCostTHB, analyzeVideo, gradeHomework, checkBlueprintQuality, rewriteTheme, BAD_THEME_RE, auditBlueprintMatch, setCuratedTrends, enrichDirections, complianceNote, politeKimBlueprint, reviewMonth, extractImages, reviewTeamWeek } from "./ai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.join(__dirname, "..", "web", "dist");
const app = express();

// ═══════ 💳 ราคา 3 แพ็ก (คิมเคาะ 3 ส.ค. 2569) ═══════
// เหตุผลที่ขึ้นราคาและทำแพ็กยาว: ลูกค้าจ่ายเงิน 232 คน — 231 คนซื้อเดือนเดียวแล้วหาย (เฉลี่ย 1.01 เดือน)
// จ่ายก้อนเดียวล่วงหน้า ทำให้เงินจริงต่อลูกค้า 1 คน จาก 429 บาท → 5,970 (6 เดือน) / 8,557 (12 เดือน)
// ⚠️ ทุกราคา "รวม VAT 7% แล้ว" (ต่างจากงานโปรดักชั่น/บริษัท ที่บวก VAT เพิ่มตามใบกำกับเดิม)
// ⚠️ ราคาทุกแพ็กคิดจาก PRICE_SATANG ตัวเดียว — แก้ที่เดียวแล้วทั้งระบบตามหมด ห้ามฝังเลขซ้ำ
// เคยพลาด: ตั้ง PLANS เป็นเลขตายตัว แต่ PRICE_SATANG ใน env เป็น 49000 → รายเดือนขึ้น 490 แต่แพ็กยาวขึ้นราคาใหม่
// 🚨 ก่อนขึ้นเว็บจริง: ต้องแก้ PRICE_SATANG ใน Railway เป็น 159000 ไม่งั้นราคาไม่เปลี่ยน
const PRICE_SATANG = Number(process.env.PRICE_SATANG || 159000);   // รายเดือน 1,590 (รวม VAT แล้ว)

// ═══════ 🗓️ สลับราคาอัตโนมัติวันที่ 1 ก.ย. 2569 (คิมเคาะ 3 ส.ค.) ═══════
// "โปรเปิดตัวราคา 490 บาท ตั้งแต่วันนี้ถึงสิ้นเดือนสิงหา วันที่ 1 กันยา ราคาปรับเป็น 3 แพ็คทันที
//  เพราะฉะนั้นหน้าแพ็คเกจจะค่อยขึ้นวันที่ 1 กันยา"
// → ก่อนถึงวัน: ขาย 490 อย่างเดียว ไม่มีหน้าแพ็ก · ถึงวัน: 3 แพ็กโผล่เอง ไม่ต้อง deploy ซ้ำ
// ⚠️ ใช้เวลาไทย (+07:00) — ไม่งั้นจะสลับตอนบ่ายโมงของวันที่ 31 ส.ค.
const PROMO_SATANG = Number(process.env.PROMO_SATANG || 49000);        // โปรเปิดตัว 490
const PLANS_LIVE_AT = Date.parse(process.env.PLANS_LIVE_AT || "2026-09-01T00:00:00+07:00");
const plansLive = () => Date.now() >= PLANS_LIVE_AT;
// ราคาของ "1 เดือน" ตอนนี้ — ช่วงโปรคือ 490 หลังจากนั้นคือ 1,590
const monthlySatang = () => (plansLive() ? PRICE_SATANG : PROMO_SATANG);
// ปัด "ราคาต่อเดือน" ลงให้ลงท้าย 5 บาท แล้วค่อยคูณ — เลขที่ลูกค้าเห็นจะสวย (1,110 / 795)
// ปัดลงเสมอ = ลูกค้าได้ส่วนลดไม่น้อยกว่าที่ประกาศไว้
const planPrice = (months, off) => Math.floor(PRICE_SATANG * (100 - off) / 100 / 500) * 500 * months;
const mkPlan = (plan, months, off) => {
  const satang = months === 1 ? PRICE_SATANG : planPrice(months, off);
  return { plan, months, satang, per_month: Math.round(satang / months / 100), off,
           full_satang: PRICE_SATANG * months };
};
const PLANS = {
  monthly: mkPlan("monthly", 1, 0),
  "6m": mkPlan("6m", 6, 30),    // ลด 30%
  "12m": mkPlan("12m", 12, 50), // ลด 50%
};
const planOf = (k) => {
  // ⛔ ช่วงโปรเปิดตัว ยังไม่เปิดขายแพ็กยาว — ใครยิงมาก็ได้รายเดือนราคาโปรเท่านั้น
  if (!plansLive()) return { ...PLANS.monthly, satang: PROMO_SATANG, per_month: PROMO_SATANG / 100, off: 0, full_satang: PRICE_SATANG };
  return PLANS[String(k || "monthly")] || PLANS.monthly;
};
// VAT รวมอยู่ในราคาแล้ว → ถอดออกมาโชว์ในใบกำกับ
const vatSplit = (satang) => {
  const total = Math.round(Number(satang) || 0);
  const net = Math.round(total / 1.07);
  return { total, net, vat: total - net };
};
const REFERRAL_PERCENT = Number(process.env.REFERRAL_PERCENT || 20);
const HOMEWORK_MIN_UPLOADS = Number(process.env.HOMEWORK_MIN_UPLOADS || 5);
const EMAIL_ENABLED = !!process.env.RESEND_API_KEY;
const PROVIDER = process.env.PAYMENT_PROVIDER || "mock";

// ---------- Stripe webhook (raw body, ก่อน json) ----------
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(400).send("Stripe not configured");
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
    const session = event.data?.object || {};
    const orderId = session.metadata?.order_id;
    const claimed = await run(`INSERT INTO payment_events (provider_event_id, type, order_id) VALUES ($1,$2,$3) ON CONFLICT (provider_event_id) DO NOTHING`, [event.id, event.type, orderId || null]);
    if (claimed.rowCount !== 1) return res.json({ received: true, duplicate: true });
    const academyPurchaseId = session.metadata?.academy_purchase_id;
    const workshopBookingId = session.metadata?.workshop_booking_id;
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        if (orderId) await markOrderPaid(orderId, "stripe", session.id);
        if (academyPurchaseId) { const p = await one(`SELECT * FROM academy_purchases WHERE purchase_id=$1`, [academyPurchaseId]); if (p) await finalizeAcademyPurchase(p); }
        if (workshopBookingId) { const b = await one(`SELECT * FROM workshop_bookings WHERE booking_id=$1`, [workshopBookingId]); if (b) await finalizeWorkshopBooking(b); }
        break;
      case "checkout.session.async_payment_failed":
        if (orderId) await run(`UPDATE blueprint_orders SET payment_status='failed' WHERE order_id=$1`, [orderId]); break;
      case "checkout.session.expired":
        if (orderId) await run(`UPDATE blueprint_orders SET payment_status='expired' WHERE order_id=$1`, [orderId]); break;
    }
    res.json({ received: true });
  } catch (err) { console.error("webhook", err.message); res.status(400).send(`Webhook Error: ${err.message}`); }
});

app.use(cors());
app.use(express.json({ limit: "40mb" }));

// ---------- rate limit ----------
const rl = new Map();
function rateLimit(max, win) {
  return (req, res, next) => {
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
    const key = ip + ":" + req.path, now = Date.now();
    const arr = (rl.get(key) || []).filter(t => now - t < win);
    if (arr.length >= max) return res.status(429).json({ ok: false, error: "RATE_LIMITED", message: "ทำรายการบ่อยเกินไป กรุณารอสักครู่ค่ะ" });
    arr.push(now); rl.set(key, arr); next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of rl) if (!v.some(t => now - t < 600000)) rl.delete(k); }, 600000);
const M10 = 600000;
// ลิมิตเผื่อทีมทดสอบหลายคนจาก IP เดียวกัน (เช่น WiFi ออฟฟิศ) — ยังกันสแปม/abuse จริงอยู่
app.use("/api/auth/request-otp", rateLimit(30, M10));
app.use("/api/auth/verify-otp", rateLimit(40, M10));
app.use("/api/checkout", rateLimit(60, M10));
app.use("/api/apply-code", rateLimit(60, M10));
app.use("/api/redeem-code", rateLimit(60, M10));
app.use("/api/generate-blueprint", rateLimit(30, M10));
app.use("/api/start-generation", rateLimit(60, M10));

// ---------- helpers ----------
const uid = (p) => `${p}_${crypto.randomUUID()}`;
const safeJson = (t) => { try { return JSON.parse(String(t || "{}")); } catch { return {}; } };

// 🖼️ รูปปกคอร์ส/รูปผู้สอน — เดิมลิงก์ตรงจากเซิร์ฟเวอร์ ZeroDesign (เว็บเก่า)
// ถ้าเขาลบไฟล์หรือหยุดต่ออายุเซิร์ฟเวอร์ = รูปหายทั้งเว็บโดยเราคุมอะไรไม่ได้เลย
// จึงโหลดมาเก็บไว้เองที่ web/public/academy-img แล้วสลับ URL ตอนส่งออก (ไม่ต้องแตะข้อมูลใน DB)
// ถ้าเจอ URL ที่ไม่มีในรายการ (เช่น คิมเพิ่มคอร์สใหม่ทีหลัง) จะคืนของเดิมไป — ไม่พัง
let ACADEMY_IMG = {};
try { ACADEMY_IMG = JSON.parse(readFileSync(path.join(__dirname, "academy-images.json"), "utf8")); }
catch (e) { console.warn("[img] โหลดรายการรูปคอร์สไม่ได้:", e.message); }
const localImg = (u) => ACADEMY_IMG[String(u || "")] || u || "";
const normEmail = (e) => String(e || "").trim().toLowerCase();
const maskEmail = (e) => { const [u, d] = String(e || "").split("@"); return d ? `${u.slice(0, 2)}***@${d}` : "***"; };
const appBaseUrl = () => (process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "");
const cycleMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const currentBillingCycle = () => { const d = new Date(); return `${cycleMonths[d.getMonth()]}_${d.getFullYear()}`; };

function cleanCompetitors(fr) {
  return { ...fr,
    competitor_1: String(fr.competitor_1 || "").trim() || "ไม่ระบุชื่อคู่แข่ง ให้ AI วิเคราะห์คู่แข่งเชิงกลยุทธ์จากประเภทธุรกิจแทน",
    competitor_2: String(fr.competitor_2 || "").trim() || "ไม่ระบุชื่อคู่แข่ง ให้ AI วิเคราะห์คู่แข่งเชิงกลยุทธ์จากพฤติกรรมตลาดแทน" };
}
// 🚫 ลูกค้าบางคนกด "ใช้ตัวอย่างนี้" แล้วส่งมาเลย (เจอจริง 2 คน) → AI ทำเล่มให้ Babe House Academy แทนช่องเขา
// ลบข้อความตัวอย่างของเราออกก่อนส่งเข้า AI เสมอ — กันได้แม้ลูกค้าเปิดหน้าเว็บเวอร์ชันเก่าค้างไว้
const OUR_EXAMPLE_RE = /babe\s*house|เบ๊บเฮาส์|สถาบันสอนตัดต่อวิดีโอและทำคอนเทนต์สำหรับผู้หญิง/i;
function stripOurExample(fr) {
  const out = { ...fr };
  for (const k of ["business_type", "starting_point", "monthly_goal"]) {
    const v = String(out[k] || "");
    if (!v || !OUR_EXAMPLE_RE.test(v)) continue;
    // ตัดทิ้งเฉพาะบรรทัด/ประโยคที่มีชื่อเรา เก็บส่วนที่ลูกค้าเขียนเองไว้
    const kept = v.split(/\n+/).filter(line => !OUR_EXAMPLE_RE.test(line)).join("\n").trim();
    out[k] = kept;
    console.warn(`[form-guard] ลบข้อความตัวอย่างของเราออกจาก ${k} (เหลือ ${kept.length} ตัวอักษร)`);
  }
  return out;
}
function normalizePayload(p) {
  return { ...p, email: normEmail(p.email) || undefined, meta_purchase: { tier: "Premium_490", billing_cycle: p.meta_purchase?.billing_cycle || currentBillingCycle() }, form_responses: stripOurExample(cleanCompetitors(p.form_responses || {})) };
}
async function upsertUser({ user_id, instagram_account, business_type }) {
  await run(`INSERT INTO users (user_id, instagram_account, business_type) VALUES ($1,$2,$3)
    ON CONFLICT (user_id) DO UPDATE SET instagram_account=COALESCE(NULLIF(EXCLUDED.instagram_account,''),users.instagram_account), business_type=COALESCE(NULLIF(EXCLUDED.business_type,''),users.business_type), updated_at=now()`,
    [user_id, instagram_account || "", business_type || ""]);
}
async function upsertCustomer(email, ig) {
  const e = normEmail(email); if (!e) return;
  await run(`INSERT INTO customers (email, instagram_account) VALUES ($1,$2)
    ON CONFLICT (email) DO UPDATE SET instagram_account=COALESCE(NULLIF(EXCLUDED.instagram_account,''),customers.instagram_account), updated_at=now()`, [e, ig || ""]);
}
async function getOrder(id) { return one(`SELECT * FROM blueprint_orders WHERE order_id=$1`, [id]); }
const dashUrlOf = (o) => `/dashboard?user_id=${encodeURIComponent(o.user_id)}&billing_cycle=${encodeURIComponent(o.billing_cycle)}&blueprint_id=${encodeURIComponent(o.blueprint_id)}`;
// โค้ดฟรี: 1 อีเมล ใช้โค้ดเดียวกันได้ครั้งเดียว (จ่ายเงินจริง/ลด% ซื้อได้ไม่จำกัด)
async function usedFreeCodeBefore(email, code) {
  const e = normEmail(email); if (!e || !code) return null;
  return one(`SELECT order_id, user_id, billing_cycle, blueprint_id FROM blueprint_orders WHERE email=$1 AND UPPER(COALESCE(discount_code,''))=$2 AND COALESCE(provider,'')='code' AND payment_status='paid' ORDER BY created_at DESC LIMIT 1`, [e, String(code).toUpperCase()]);
}

// ---------- email (Resend) ----------
let lastEmailError = null; // เก็บ error ล่าสุดจาก Resend ไว้ debug (admin)
async function sendEmail(to, subject, html) {
  if (!EMAIL_ENABLED) { console.log(`[DEV EMAIL] -> ${to} | ${subject}`); return false; }
  try {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.APP_FROM_EMAIL || "Babe House <onboarding@resend.dev>", to: [to], subject, html }) });
    if (!r.ok) { const body = await r.text().catch(() => ""); lastEmailError = { status: r.status, body: body.slice(0, 500), to, at: new Date().toISOString() }; console.error(`[EMAIL FAIL] ${r.status} -> ${to}: ${body.slice(0, 200)}`); }
    return r.ok;
  } catch (e) { lastEmailError = { status: "fetch_error", body: String(e.message).slice(0, 300), to, at: new Date().toISOString() }; console.error(`[EMAIL FAIL] fetch ${to}: ${e.message}`); return false; }
}
const wrap = (body) => `<div style="font-family:sans-serif;font-size:16px;line-height:1.8">${body}</div>`;
const btn = (href, label) => `<a href="${href}" style="display:inline-block;background:#2E86DE;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${label}</a>`;
const btnG = (href, label) => `<a href="${href}" style="display:inline-block;background:#06C755;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${label}</a>`;
// ---------- อีเมล 2 ภาษา: เลือกตามภาษาที่ลูกค้าใช้ (payload.lang เก็บตอนกรอกฟอร์ม เฟส i18n) ----------
const tr = (l, th, en) => (l === "en" ? en : th);
const langOfPayload = (p) => (p?.lang === "en" ? "en" : "th");
async function langOfEmail(email) {
  // หา lang จากออเดอร์ล่าสุดของอีเมลนี้ (ใช้กับเมลที่ไม่มี payload ในมือ เช่น cron/referral)
  try {
    const r = await one(`SELECT order_payload_json FROM blueprint_orders WHERE email=$1 AND order_payload_json IS NOT NULL ORDER BY created_at DESC LIMIT 1`, [normEmail(email)]);
    return langOfPayload(safeJson(r?.order_payload_json));
  } catch { return "th"; }
}

// ---------- payment / referral ----------
async function markOrderPaid(orderId, provider = "mock", sid = "") {
  // live_mode = จ่ายด้วย Stripe จริง (คีย์ sk_live_) เท่านั้น = เงินเข้าจริง; mock/code/test = false
  const liveMode = provider === "stripe" && String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_");
  // flip เฉพาะตอนยังไม่ paid → rowCount บอกว่า "เพิ่งจ่ายครั้งแรก" (กัน webhook ยิงซ้ำแล้วแจ้งเตือนซ้ำ)
  const upd = await run(`UPDATE blueprint_orders SET payment_status='paid', provider=$1, provider_session_id=COALESCE($2,provider_session_id), live_mode=$3, paid_at=now() WHERE order_id=$4 AND payment_status<>'paid'`, [provider, sid || null, liveMode, orderId]);
  grantCreditsIfCreditOrder(orderId).catch(e => console.error("grant-credits", e.message));
  activatePlanIfLongOrder(orderId).catch(e => console.error("activate-plan", e.message));
  issueInvoiceForOrder(orderId).catch(e => console.error("tax-invoice", e.message));   // 🧾 ออกใบกำกับภาษีทุกการจ่ายเงิน
  processReferralReward(orderId).catch(e => console.error("referral", e.message));
  if (upd.rowCount === 1) notifyAdminPurchase(orderId, provider, liveMode).catch(() => {}); // แจ้งเตือน "มีคนซื้อ"
}
// แจ้งเตือนแอดมินเมื่อมีคนซื้อจริง (มีเงินเข้า) — ข้ามโค้ดฟรี/amount=0 กันสแปมจากทดลองฟรี
async function notifyAdminPurchase(orderId, provider, liveMode) {
  const o = await getOrder(orderId); if (!o) return;
  const amt = Number(o.final_amount_satang || 0);
  if (amt <= 0) return; // ฟรี/โค้ด 100% ไม่ใช่การซื้อ → ไม่แจ้ง
  const baht = (amt / 100).toLocaleString("th-TH");
  const kind = String(o.tier || "").startsWith("Credits") ? "แพ็กเครดิต" : String(o.tier || "").startsWith("Video") ? "บริการตรวจคลิป" : "เล่ม Blueprint";
  const when = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
  const via = liveMode ? "Stripe (เงินเข้าจริง 💵)" : `${provider}${provider === "code" ? " (ใช้โค้ดลด)" : ""}`;
  await sendEmail(ADMIN_ALERT_EMAIL, `💰 มีคนซื้อ! ฿${baht} · ${o.email || "-"}`,
    wrap(`<b>มีลูกค้าซื้อเข้ามาค่ะ 🎉</b><br><br>📧 อีเมล: <b>${o.email || "-"}</b><br>🛒 สินค้า: ${kind}<br>💵 ยอด: <b>฿${baht}</b><br>📱 ช่อง: ${o.instagram_account || "-"}<br>🕐 เวลา: ${when}<br>ช่องทาง: ${via}`)).catch(() => {});
}
// 🧾 ออกใบกำกับภาษีจากออเดอร์ที่จ่ายแล้ว — คิมสั่ง "ทุกการจ่ายเงินต้องออกใบกำกับ"
// ⛔ ห้ามพังการจ่ายเงินไม่ว่าจะเกิดอะไรขึ้น (เรียกแบบ fire-and-forget + จับ error ครบ)
const KIND_LABEL = { credits: "แพ็กเครดิตสคริปต์", video: "บริการตรวจคลิป (Video Audit)" };
async function issueInvoiceForOrder(orderId) {
  const o = await getOrder(orderId); if (!o) return;
  const amount = Number(o.final_amount_satang || 0);
  if (amount <= 0) return;                                  // ฟรี/โค้ด 100% ไม่มียอด ไม่ต้องออกใบ
  const payload = safeJson(o.order_payload_json) || {};
  const tier = String(o.tier || "");
  const kind = tier.startsWith("Credits") ? "credits" : tier.startsWith("Video") ? "video" : "blueprint";
  const plan = planOf(payload.plan);
  const desc = KIND_LABEL[kind] ||
    (plan.months > 1 ? `AI Creator Blueprint — แพ็ก ${plan.months} เดือน` : "AI Creator Blueprint — รายเดือน");
  await issueTaxInvoice({
    orderId, kind, email: o.email, amountSatang: amount, description: desc,
    docDate: o.paid_at || o.created_at,                     // วันที่บนใบ = วันรับเงินจริง
    tax: { ...(payload.tax || {}), fallback_name: payload.form_responses?.display_name || o.instagram_account || "" },
  });
}

// ออเดอร์แพ็ก 6/12 เดือน จ่ายแล้ว → เปิดสิทธิ์ให้ (idempotent กัน webhook ยิงซ้ำ)
// เดือนแรกหักสิทธิ์ทันที เพราะเล่มเดือนนี้ถูกสร้างจากออเดอร์นี้อยู่แล้ว
async function activatePlanIfLongOrder(orderId) {
  const o = await getOrder(orderId); if (!o) return;
  const payload = safeJson(o.order_payload_json) || {};
  const plan = planOf(payload.plan);
  if (plan.months <= 1) return;
  const email = normEmail(o.email || ""); if (!email) return;
  const exists = await one(`SELECT 1 FROM subscriptions WHERE order_id=$1`, [orderId]);
  if (exists) return;                                    // เปิดไปแล้ว (webhook ยิงซ้ำ)
  const subId = uid("sub");
  // ⚠️ คิดวันหมดอายุใน JS ไม่ใช่ใน SQL — เคยพลาด: ใช้ $6 เป็นทั้งตัวเลขและต่อสตริง interval
  // Postgres เดาชนิดไม่ได้ → "inconsistent types deduced" → แพ็กไม่เปิดเงียบๆ ทั้งที่ลูกค้าจ่ายแล้ว
  // เผื่อเวลาเกินไว้ 2 เดือน เผื่อลูกค้าข้ามเดือน จะได้ไม่เสียสิทธิ์
  const expires = new Date();
  expires.setMonth(expires.getMonth() + plan.months + 2);
  await run(`INSERT INTO subscriptions (subscription_id,email,user_id,instagram_account,plan,months_total,months_used,amount_satang,order_id,started_cycle,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10)`,
    [subId, email, o.user_id, o.instagram_account || null, plan.plan, plan.months, o.final_amount_satang || plan.satang, orderId, o.billing_cycle, expires.toISOString()]);
  await run(`INSERT INTO subscription_uses (use_id,subscription_id,billing_cycle,order_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [uid("su"), subId, o.billing_cycle, orderId]).catch(() => {});
  console.log(`[plan] เปิดแพ็ก ${plan.plan} (${plan.months} เดือน) ให้ ${email}`);
  sendEmail(email, `แพ็ก ${plan.months} เดือนของคุณเปิดใช้แล้วค่ะ 🩵`,
    wrap(`ขอบคุณที่ไว้ใจครูพี่คิมนะคะ 🩵<br><br>
      แพ็ก <b>${plan.months} เดือน</b> ของคุณเปิดใช้เรียบร้อยแล้วค่ะ<br><br>
      ทุกเดือนถัดจากนี้ <b>ไม่ต้องจ่ายอีก</b> — แค่เข้ามากดสร้างเล่มใหม่ได้เลย<br>
      และยิ่งอยู่กับเรานาน แผนจะยิ่งแม่นขึ้น เพราะระบบเรียนรู้จากคลิปที่คุณลงจริงทุกเดือนค่ะ<br><br>
      ${btn(appBaseUrl() + "/account", "เปิดบัญชีของฉัน")}`)).catch(() => {});
}
// ออเดอร์ซื้อเครดิต (tier Credits_N) จ่ายแล้ว → เติมเครดิต (idempotent กัน webhook ยิงซ้ำ)
async function grantCreditsIfCreditOrder(orderId) {
  const o = await getOrder(orderId);
  if (!o || !String(o.tier || "").startsWith("Credits")) return;
  const claim = await run(`UPDATE blueprint_orders SET credits_granted=true WHERE order_id=$1 AND COALESCE(credits_granted,false)=false`, [orderId]);
  if (claim.rowCount !== 1) return; // เติมไปแล้ว
  const pl = safeJson(o.order_payload_json) || {};
  const n = Number(pl.credit_pack) || 0;
  const email = normEmail(pl.email || o.email);
  if (n > 0 && email) { await upsertCustomer(email, ""); await run(`UPDATE customers SET credits=COALESCE(credits,0)+$1 WHERE lower(email)=lower($2)`, [n, email]); console.log(`[credits] +${n} → ${email}`); }
}
async function getOrCreateReferralCode(email) {
  const e = normEmail(email); if (!e) return null;
  const c = await one(`SELECT referral_code FROM customers WHERE email=$1`, [e]);
  if (c && c.referral_code) return c.referral_code;
  let code, tries = 0;
  do { code = "BABE" + Math.random().toString(36).slice(2, 7).toUpperCase(); tries++; } while ((await one(`SELECT 1 FROM customers WHERE referral_code=$1`, [code])) && tries < 10);
  await run(`UPDATE customers SET referral_code=$1 WHERE email=$2`, [code, e]);
  return code;
}
async function processReferralReward(orderId) {
  const o = await getOrder(orderId);
  if (!o || !o.referred_by || o.referral_rewarded) return;
  const claim = await run(`UPDATE blueprint_orders SET referral_rewarded=1 WHERE order_id=$1 AND COALESCE(referral_rewarded,0)=0`, [orderId]);
  if (claim.rowCount !== 1) return;
  const ref = await one(`SELECT * FROM customers WHERE referral_code=$1`, [o.referred_by]);
  if (!ref || (o.email && normEmail(o.email) === normEmail(ref.email))) return;
  await run(`UPDATE customers SET referral_count=COALESCE(referral_count,0)+1 WHERE email=$1`, [ref.email]);
  const code = "THX" + Math.random().toString(36).slice(2, 7).toUpperCase();
  await run(`INSERT INTO promo_codes (code, note, max_uses, discount_percent) VALUES ($1,$2,1,$3)`, [code, "รางวัลแนะนำเพื่อน " + ref.email, REFERRAL_PERCENT]);
  const l = await langOfEmail(ref.email);
  await sendEmail(ref.email,
    tr(l, `เพื่อนของคุณสมัครแล้ว! รับโค้ดลด ${REFERRAL_PERCENT}% 🎁`, `Your friend just joined! Here's ${REFERRAL_PERCENT}% off 🎁`),
    wrap(tr(l,
      `ขอบคุณที่แนะนำ Babe House ค่ะ 🩵<br><br>โค้ดลด <b>${REFERRAL_PERCENT}%</b> สำหรับเดือนถัดไป:`,
      `Thank you for sharing Babe House 🩵<br><br>Here's your <b>${REFERRAL_PERCENT}% off</b> code for next month:`) +
      `<br><div style="font-size:26px;font-weight:800;letter-spacing:3px;margin:14px 0;color:#2E86DE">${code}</div>` +
      tr(l, `ใช้ได้ 1 ครั้ง<br><br>${btn(appBaseUrl() + "/account", "ไปที่บัญชีของฉัน")}`, `Valid for one use<br><br>${btn(appBaseUrl() + "/account", "Go to my account")}`))).catch(() => {});
}

// ---------- schemas ----------
const CheckoutSchema = z.object({
  tier: z.literal("Premium_490"),
  payload: z.object({
    user_id: z.string().min(1), instagram_account: z.string().min(1), email: z.string().email().optional(), referred_by: z.string().optional(),
    source: z.string().optional(),   // ⚠️ ต้องประกาศตรงนี้ ไม่งั้น zod ตัดทิ้งเงียบๆ (เคยพลาดมาแล้วกับ phone)
    meta_purchase: z.object({ tier: z.literal("Premium_490"), billing_cycle: z.string().min(1) }),
    form_responses: z.object({ self_term: z.string().optional().default(""), audience_term: z.string().optional().default(""), catchphrases: z.string().optional().default(""), tone: z.string().optional().default(""), business_type: z.string().optional().default(""), gender: z.string().optional().default(""), age_range: z.string().optional().default(""), work_style: z.string().optional().default(""), audience: z.string().optional().default(""), experience: z.string().optional().default(""), goal_primary: z.string().optional().default(""), starting_point: z.string().optional().default(""), monthly_goal: z.string().min(1),
      // 🎯 แนวคอนเทนต์ที่อยาก/ไม่อยากได้ (เพิ่ม 2 ส.ค.) — ⚠️ ถ้าไม่ประกาศตรงนี้ Zod จะตัดทิ้งเงียบๆ
      content_want: z.string().optional().default(""), content_avoid: z.string().optional().default(""),
      competitor_1: z.string().optional().default(""), competitor_2: z.string().optional().default(""), display_name: z.string().optional().default(""), phone: z.string().optional().default("") }),
    insight_screenshot_base64: z.string().nullable().optional(), insight_images: z.array(z.string()).max(8).optional()
  })
}).passthrough();
const GenSchema = CheckoutSchema.shape.payload;
const MarathonSchema = z.object({ user_id: z.string().min(1), instagram_account: z.string().optional().default(""), billing_cycle: z.string().min(1), uploaded_days: z.array(z.number().int().min(1).max(31)), day: z.number().int().min(1).max(31).optional(), action: z.enum(["upload", "remove"]).optional() });

// ---------- checkout ----------
app.post("/api/checkout", async (req, res) => {
  try {
    const parsed = CheckoutSchema.parse(req.body);
    const payload = normalizePayload(parsed.payload);
    // จ่ายเงินจริง: ซื้อได้หลายเล่ม (เช่น อยากได้บทวิเคราะห์เพิ่ม) — ไม่บล็อกซ้ำที่ checkout แล้ว (โค้ดฟรีกันซ้ำที่ apply-code)
    const orderId = uid("ord");
    await upsertUser({ user_id: payload.user_id, instagram_account: payload.instagram_account, business_type: payload.form_responses.business_type });
    await upsertCustomer(payload.email, payload.instagram_account);
    const refBy = String(payload.referred_by || "").trim().toUpperCase() || null;
    let discountPct = null, finalAmount = monthlySatang(), refValid = null;
    if (refBy) {
      const refC = await one(`SELECT email FROM customers WHERE referral_code=$1`, [refBy]);
      if (refC && normEmail(refC.email) !== normEmail(payload.email)) { refValid = refBy; discountPct = REFERRAL_PERCENT; finalAmount = Math.round(monthlySatang() * (100 - REFERRAL_PERCENT) / 100); }
    }
    // ⛔ ตัดส่วนลดลูกค้าเก่า 10% ออก (คิมสั่ง 3 ส.ค.: "เขาจ่ายลด 50% ไปแล้ว จะลดอะไรอีก")
    //    แพ็กยาวลด 30-50% อยู่แล้ว การลดซ้อนอีกชั้นทำให้ราคาที่ประกาศไว้ไม่จริง
    // 💳 แพ็ก 6/12 เดือน — ราคาแพ็กมาก่อนส่วนลดอื่นเสมอ (แพ็กลด 30-50% อยู่แล้ว ห้ามลดซ้อน)
    const chosen = String(req.body?.plan || payload.plan || "");
    const plan = planOf(chosen);
    if (plan.months > 1) { finalAmount = plan.satang; discountPct = plan.off; refValid = null; }
    const checkoutUrl = `/checkout?order_id=${encodeURIComponent(orderId)}`;
    await run(`INSERT INTO blueprint_orders (order_id,user_id,instagram_account,email,tier,billing_cycle,payment_status,order_payload_json,provider,final_amount_satang,referred_by,discount_percent,checkout_url,source) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10,$11,$12,$13)`,
      [orderId, payload.user_id, payload.instagram_account, payload.email || null, parsed.tier, payload.meta_purchase.billing_cycle, JSON.stringify({ ...payload, plan: plan.plan, plan_chosen: !!chosen }), PROVIDER, finalAmount, refValid, discountPct, checkoutUrl,
       (String(req.body?.source || payload.source || "").slice(0, 60)) || null]);
    res.json({ ok: true, order_id: orderId, checkout_url: checkoutUrl, provider: PROVIDER, payment_status: "pending", plan: plan.plan, amount_satang: finalAmount });
  } catch (err) { console.error(err); res.status(400).json({ ok: false, error: "CHECKOUT_FAILED", message: err.message }); }
});

// ═══════ 💳 แพ็กราย 6/12 เดือน — ลูกค้าจ่ายก้อนเดียว เดือนถัดไปปลดล็อกเอง ═══════

// แพ็กที่ยังใช้ได้ของอีเมลนี้ (ผูกกับช่อง ถ้าระบุช่องมา)
async function activeSubscription(email, channel) {
  if (!email) return null;
  const rows = await q(`SELECT * FROM subscriptions WHERE lower(email)=lower($1) AND status='active'
    AND months_used < months_total AND (expires_at IS NULL OR expires_at > now()) ORDER BY created_at`, [email]);
  if (!rows.length) return null;
  if (!channel) return rows[0];
  const norm = (s) => String(s || "").toLowerCase().replace(/[@\s._-]/g, "");
  return rows.find(r => norm(r.instagram_account) === norm(channel)) || rows.find(r => !r.instagram_account) || null;
}

// ใช้สิทธิ์ 1 เดือน — กันปลดซ้ำเดือนเดียวกันด้วย unique index (กดรัวๆ ก็ไม่เสียสิทธิ์เกิน)
async function useSubscriptionMonth(sub, cycle, orderId) {
  try {
    await run(`INSERT INTO subscription_uses (use_id,subscription_id,billing_cycle,order_id) VALUES ($1,$2,$3,$4)`,
      [uid("su"), sub.subscription_id, cycle, orderId || null]);
  } catch { return false; }   // เดือนนี้ปลดไปแล้ว
  await run(`UPDATE subscriptions SET months_used = months_used + 1,
      status = CASE WHEN months_used + 1 >= months_total THEN 'finished' ELSE status END, updated_at=now()
    WHERE subscription_id=$1`, [sub.subscription_id]);
  return true;
}

// ราคาทั้ง 3 แพ็ก (หน้าเว็บดึงไปโชว์ ไม่ฝังเลขไว้ในหน้าเว็บ)
app.get("/api/plans", async (req, res) => {
  const email = normEmail(String(req.query.email || ""));
  const sub = email ? await activeSubscription(email, String(req.query.channel || "")) : null;
  res.json({ ok: true,
    live: plansLive(),                                    // false = ยังอยู่ช่วงโปร 490 ยังไม่โชว์หน้าแพ็ก
    live_at: new Date(PLANS_LIVE_AT).toISOString(),
    promo_baht: PROMO_SATANG / 100, full_baht: PRICE_SATANG / 100,
    plans: plansLive() ? Object.values(PLANS).map(p => ({ ...p, baht: p.satang / 100, vat_included: true })) : [],
    active: sub ? { plan: sub.plan, months_total: sub.months_total, months_used: sub.months_used,
                    months_left: sub.months_total - sub.months_used, channel: sub.instagram_account } : null });
});

// 👑 แอดมิน: ลูกค้าแพ็กยาวยังใช้อยู่ไหม — ตัวเลขที่ต้องดูทุกเดือน
// ถ้าคนซื้อ 12 เดือนแล้วเลิกเปิดตั้งแต่เดือนที่ 3 แปลว่าปีหน้าเขาไม่ต่อ ต้องรู้ก่อนจะสาย
app.get("/api/admin/subscriptions", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const subs = await q(`SELECT subscription_id, email, instagram_account, plan, months_total, months_used,
        amount_satang, status, started_cycle, expires_at, created_at FROM subscriptions ORDER BY created_at DESC LIMIT 500`);
    const byPlan = {};
    for (const s of subs) {
      const k = s.plan;
      (byPlan[k] ||= { plan: k, count: 0, baht: 0, months_sold: 0, months_used: 0 });
      byPlan[k].count++; byPlan[k].baht += Number(s.amount_satang || 0) / 100;
      byPlan[k].months_sold += Number(s.months_total || 0); byPlan[k].months_used += Number(s.months_used || 0);
    }
    // ใช้จริงกี่ % ของเดือนที่ขายไป — ต่ำ = ลูกค้าจ่ายแล้วไม่ได้ใช้ = ปีหน้าไม่ต่อ
    const rows = Object.values(byPlan).map(x => ({ ...x, used_pct: x.months_sold ? Math.round(x.months_used / x.months_sold * 100) : 0 }));
    const active = subs.filter(s => s.status === "active").length;
    res.json({ ok: true, total: subs.length, active, by_plan: rows,
      revenue_baht: subs.reduce((t, s) => t + Number(s.amount_satang || 0) / 100, 0),
      subscriptions: subs.map(s => ({ ...s, months_left: Number(s.months_total) - Number(s.months_used),
        amount_baht: Number(s.amount_satang || 0) / 100 })) });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// ลูกค้าเลือกแพ็กที่หน้าจ่ายเงิน — เปลี่ยนได้จนกว่าจะจ่าย
app.post("/api/order/set-plan", rateLimit(60, M10), async (req, res) => {
  const orderId = String(req.body?.order_id || "");
  const plan = planOf(req.body?.plan);
  const o = await getOrder(orderId);
  if (!o) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
  if (["paid", "mock_paid"].includes(o.payment_status)) return res.status(409).json({ ok: false, error: "ALREADY_PAID", message: "ออเดอร์นี้จ่ายแล้วค่ะ" });
  if (!plansLive()) return res.status(409).json({ ok: false, error: "PLANS_NOT_LIVE", message: "ช่วงนี้เป็นโปรเปิดตัวราคาเดียวค่ะ" });
  // ⛔ แพ็กยาวลด 30-50% อยู่แล้ว ห้ามเอาโค้ด/ส่วนลดแนะนำเพื่อนมาลดซ้อน
  const payload = { ...(safeJson(o.order_payload_json) || {}), plan: plan.plan, plan_chosen: true };
  await run(`UPDATE blueprint_orders SET final_amount_satang=$1, discount_percent=$2, order_payload_json=$3, discount_code=NULL, referred_by=NULL WHERE order_id=$4`,
    [plan.satang, plan.off || null, JSON.stringify(payload), orderId]);
  res.json({ ok: true, plan: plan.plan, months: plan.months, amount_satang: plan.satang, ...vatSplit(plan.satang) });
});

// 🧾 แอดมิน: ใบกำกับภาษีทั้งหมด + ส่งออกให้นักบัญชีรายเดือน
app.get("/api/admin/tax-invoices", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const month = String(req.query.month || "") || new Date().toISOString().slice(0, 7);
    // จัดกลุ่มตาม "วันที่บนใบ" (= วันรับเงินจริง) ให้ตรงกับที่นักบัญชียื่นภาษี
    const rows = await q(`SELECT * FROM tax_invoices
      WHERE to_char(COALESCE(doc_date, created_at::date), 'YYYY-MM') = $1
      ORDER BY COALESCE(doc_date, created_at::date) DESC, created_at DESC`, [month]);
    const sum = (k) => rows.reduce((t, r) => t + Number(r[k] || 0), 0);
    const byStatus = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    res.json({ ok: true, month, flowaccount_ready: flowAccountReady(),
      count: rows.length, by_status: byStatus,
      net_baht: sum("net_satang") / 100, vat_baht: sum("vat_satang") / 100, total_baht: sum("amount_satang") / 100,
      invoices: rows.map(r => ({ ...r, net_baht: r.net_satang / 100, vat_baht: r.vat_satang / 100, total_baht: r.amount_satang / 100 })) });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});
// ไฟล์ส่งนักบัญชี (เปิดใน Excel ได้เลย)
app.get("/api/admin/tax-invoices.csv", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).send("unauthorized");
  const month = String(req.query.month || "") || new Date().toISOString().slice(0, 7);
  try {
    const { csv } = await invoicesCsv(month);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    // ⚠️ ชื่อไฟล์ภาษาไทยใส่ตรงๆ ใน header ไม่ได้ (Invalid character) — ต้อง encode ตาม RFC 5987
    res.setHeader("Content-Disposition",
      `attachment; filename="tax-invoices-${month}.csv"; filename*=UTF-8''${encodeURIComponent(`ใบกำกับภาษี-${month}.csv`)}`);
    res.send(csv);
  } catch (e) { res.status(500).send("failed: " + e.message); }
});
// 🕰️ ทำใบกำกับย้อนหลังให้ยอดที่เข้ามาแล้วก่อนมีระบบนี้
// ⚠️ อันตราย: ถ้าคิมออกใบมือไว้แล้วใน FlowAccount การส่งซ้ำ = เลขที่เอกสารซ้ำ = ยื่นภาษีผิด
//    เพราะงั้น: (1) มีโหมด "ดูก่อนทำ" (2) ใบที่สร้างย้อนหลังจะไม่ถูกส่งขึ้น FlowAccount อัตโนมัติ
//    ต้องมากดสั่งทีหลังเอง หลังเช็คแล้วว่าใบไหนยังไม่เคยออก
app.post("/api/admin/tax-invoices/backfill", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const b = req.body || {};
  const from = String(b.from || "2000-01-01"), to = String(b.to || "2999-12-31");
  const dryRun = b.dry_run !== false;                       // ค่าเริ่มต้น = ดูก่อน ไม่เขียนอะไร
  const alreadyIssued = !!b.already_issued_manually;        // ติ๊กถ้าใบพวกนี้ออกมือไว้แล้ว
  // คิมยืนยัน 3 ส.ค.: "ยังไม่มีใครทำใบใน Stripe เลย" → ค่าเริ่มต้นทำเฉพาะยอดที่จ่ายผ่าน Stripe
  // (ยอดที่จ่ายทางอื่น/ทำมือ คิมออกใบเองอยู่แล้ว ห้ามแตะ)
  const onlyStripe = b.only_stripe !== false;
  try {
    const rows = await q(`SELECT o.* FROM blueprint_orders o
      LEFT JOIN tax_invoices t ON t.order_id = o.order_id
      WHERE o.payment_status IN ('paid','mock_paid') AND COALESCE(o.final_amount_satang,0) > 0
        AND t.invoice_id IS NULL
        ${onlyStripe ? "AND o.provider = 'stripe'" : ""}
        AND COALESCE(o.paid_at, o.created_at) >= $1::date
        AND COALESCE(o.paid_at, o.created_at) < ($2::date + interval '1 day')
      ORDER BY COALESCE(o.paid_at, o.created_at)`, [from, to]);

    const preview = rows.map(o => {
      const payload = safeJson(o.order_payload_json) || {};
      const tier = String(o.tier || "");
      const kind = tier.startsWith("Credits") ? "credits" : tier.startsWith("Video") ? "video" : "blueprint";
      const amount = Number(o.final_amount_satang || 0);
      const v = splitVat(amount);
      const t = payload.tax || {};
      return { order_id: o.order_id, paid_at: o.paid_at || o.created_at, email: o.email, kind,
        name: String(t.name || payload.form_responses?.display_name || o.instagram_account || String(o.email || "").split("@")[0] || "ลูกค้าทั่วไป"),
        is_company: !!t.is_company, baht: amount / 100, net_baht: v.net / 100, vat_baht: v.vat / 100 };
    });
    const sum = (k) => preview.reduce((s, x) => s + x[k], 0);
    // ⚠️ paid_at เป็น Date object — String(date).slice(0,7) ได้ "Mon Aug" ไม่ใช่ "2026-08"
    const monthKey = (d) => { try { return new Date(d).toISOString().slice(0, 7); } catch { return "-"; } };
    const byMonth = {};
    for (const p of preview) {
      const m = monthKey(p.paid_at);
      (byMonth[m] ||= { month: m, count: 0, baht: 0 });
      byMonth[m].count++; byMonth[m].baht += p.baht;
    }
    const summary = { count: preview.length, total_baht: sum("baht"), net_baht: sum("net_baht"), vat_baht: sum("vat_baht"),
      by_month: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)) };

    if (dryRun) return res.json({ ok: true, dry_run: true, ...summary,
      note: "ยังไม่ได้สร้างอะไรเลย — ส่ง dry_run:false เพื่อสร้างจริง",
      sample: preview.slice(0, 10) });

    let made = 0;
    for (const o of rows) {
      const payload = safeJson(o.order_payload_json) || {};
      const tier = String(o.tier || "");
      const kind = tier.startsWith("Credits") ? "credits" : tier.startsWith("Video") ? "video" : "blueprint";
      const plan = planOf(payload.plan);
      const desc = KIND_LABEL[kind] || (plan.months > 1 ? `AI Creator Blueprint — แพ็ก ${plan.months} เดือน` : "AI Creator Blueprint — รายเดือน");
      const r = await issueTaxInvoice({ orderId: o.order_id, kind, email: o.email,
        amountSatang: Number(o.final_amount_satang || 0), description: desc,
        docDate: o.paid_at || o.created_at,                 // ⚠️ ใบย้อนหลังต้องลงวันที่เดิม ไม่ใช่วันที่กดปุ่ม
        tax: { ...(payload.tax || {}), fallback_name: payload.form_responses?.display_name || o.instagram_account || "" } });
      if (r?.invoice_id) {
        // ⛔ ใบย้อนหลังไม่ส่งขึ้น FlowAccount อัตโนมัติ — ต้องเช็คก่อนว่าไม่ซ้ำกับที่ออกมือไว้
        await run(`UPDATE tax_invoices SET backfilled=true, issued_manually=$2, status='manual', provider='manual'
          WHERE invoice_id=$1`, [r.invoice_id, alreadyIssued]);
        made++;
      }
    }
    res.json({ ok: true, dry_run: false, created: made, ...summary,
      marked_already_issued: alreadyIssued,
      note: alreadyIssued
        ? "สร้างแล้วและติ๊กว่า 'ออกมือไว้แล้ว' — ระบบจะไม่ส่งซ้ำขึ้น FlowAccount"
        : "สร้างแล้ว · ยังไม่ส่งขึ้น FlowAccount — ตรวจก่อนแล้วค่อยกดส่ง" });
  } catch (e) { console.error("backfill", e.message); res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});
// ติ๊ก/ยกเลิกติ๊ก "ออกใบมือไว้แล้ว" เป็นชุด (ตามเดือน หรือระบุใบ)
app.post("/api/admin/tax-invoices/mark-issued", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const b = req.body || {}, val = b.value !== false;
  try {
    if (Array.isArray(b.invoice_ids) && b.invoice_ids.length) {
      const r = await run(`UPDATE tax_invoices SET issued_manually=$1 WHERE invoice_id = ANY($2)`, [val, b.invoice_ids]);
      return res.json({ ok: true, updated: r.rowCount });
    }
    if (b.month) {
      const r = await run(`UPDATE tax_invoices SET issued_manually=$1
        WHERE to_char(created_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM')=$2`, [val, String(b.month)]);
      return res.json({ ok: true, updated: r.rowCount, month: b.month });
    }
    res.status(400).json({ ok: false, error: "MISSING", message: "ระบุ month หรือ invoice_ids" });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// ลองออกใบที่ค้างใหม่ (ใช้หลังตั้งรหัส FlowAccount เสร็จ)
app.post("/api/admin/tax-invoices/retry", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  res.json(await retryPendingInvoices(Number(req.body?.limit) || 50));
});

// 🧾 ลูกค้าบริษัทกรอกข้อมูลใบกำกับที่หน้าจ่ายเงิน — ลูกค้าทั่วไปไม่ต้องกรอกอะไรเลย
app.post("/api/order/tax-info", rateLimit(60, M10), async (req, res) => {
  const orderId = String(req.body?.order_id || "");
  const o = await getOrder(orderId);
  if (!o) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
  if (["paid", "mock_paid"].includes(o.payment_status)) return res.status(409).json({ ok: false, error: "ALREADY_PAID", message: "ออเดอร์นี้จ่ายแล้วค่ะ ทักทีมงานเพื่อแก้ใบกำกับนะคะ" });
  const b = req.body || {};
  const isCompany = !!b.is_company;
  const name = String(b.name || "").trim();
  const taxId = String(b.tax_id || "").replace(/\D/g, "");
  if (isCompany) {
    if (!name) return res.status(400).json({ ok: false, error: "NEED_NAME", message: "ใส่ชื่อบริษัทด้วยนะคะ" });
    if (taxId.length !== 13) return res.status(400).json({ ok: false, error: "BAD_TAX_ID", message: "เลขประจำตัวผู้เสียภาษีต้องมี 13 หลักค่ะ" });
    if (!String(b.address || "").trim()) return res.status(400).json({ ok: false, error: "NEED_ADDRESS", message: "ใส่ที่อยู่บริษัทด้วยนะคะ" });
  }
  const payload = { ...(safeJson(o.order_payload_json) || {}),
    tax: isCompany ? { is_company: true, name, tax_id: taxId,
                       branch: String(b.branch || "สำนักงานใหญ่").slice(0, 100),
                       address: String(b.address || "").slice(0, 500) }
                   : { is_company: false, name: name || undefined } };
  await run(`UPDATE blueprint_orders SET order_payload_json=$1 WHERE order_id=$2`, [JSON.stringify(payload), orderId]);
  res.json({ ok: true, tax: payload.tax });
});

// เล่มเดือนใหม่ของคนที่มีแพ็กอยู่แล้ว — ไม่ต้องจ่ายซ้ำ สร้างออเดอร์ที่จ่ายแล้วให้เลย
app.post("/api/subscription/claim-month", rateLimit(20, M10), async (req, res) => {
  try {
    const parsed = CheckoutSchema.parse(req.body);
    const payload = normalizePayload(parsed.payload);
    const email = normEmail(payload.email || "");
    if (!email) return res.status(401).json({ ok: false, error: "LOGIN_REQUIRED", message: "เข้าสู่ระบบก่อนนะคะ" });
    const cycle = payload.meta_purchase.billing_cycle;
    const sub = await activeSubscription(email, payload.instagram_account);
    if (!sub) return res.status(404).json({ ok: false, error: "NO_SUBSCRIPTION", message: "ยังไม่มีแพ็กที่ใช้ได้ค่ะ" });

    const orderId = uid("ord");
    await upsertUser({ user_id: payload.user_id, instagram_account: payload.instagram_account, business_type: payload.form_responses.business_type });
    await upsertCustomer(email, payload.instagram_account);
    const used = await useSubscriptionMonth(sub, cycle, orderId);
    if (!used) return res.status(409).json({ ok: false, error: "ALREADY_CLAIMED", message: "เดือนนี้ปลดล็อกไปแล้วค่ะ ดูได้ในบัญชีของฉัน" });

    await run(`INSERT INTO blueprint_orders (order_id,user_id,instagram_account,email,tier,billing_cycle,payment_status,order_payload_json,provider,final_amount_satang,checkout_url,paid_at)
      VALUES ($1,$2,$3,$4,$5,$6,'paid',$7,'subscription',0,$8,now())`,
      [orderId, payload.user_id, payload.instagram_account, email, parsed.tier, cycle, JSON.stringify(payload),
       `/processing?order_id=${encodeURIComponent(orderId)}`]);
    res.json({ ok: true, order_id: orderId, from_subscription: true,
      months_left: sub.months_total - sub.months_used - 1,
      redirect_url: `/processing?order_id=${encodeURIComponent(orderId)}` });
  } catch (err) { console.error("claim-month", err.message); res.status(400).json({ ok: false, error: "FAILED", message: err.message }); }
});

app.get("/api/orders/:orderId", async (req, res) => {
  const o = await getOrder(req.params.orderId);
  if (!o) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
  const pl = safeJson(o.order_payload_json) || {};
  res.json({ ok: true, order: { plan: pl.plan || "monthly", plan_chosen: !!pl.plan_chosen, order_id: o.order_id, user_id: o.user_id, instagram_account: o.instagram_account, tier: o.tier, billing_cycle: o.billing_cycle, payment_status: o.payment_status, provider: o.provider, blueprint_id: o.blueprint_id, generation_status: o.generation_status || "pending", generation_error: o.generation_error, discount_code: o.discount_code, discount_percent: o.discount_percent, final_amount_satang: o.final_amount_satang, created_at: o.created_at, paid_at: o.paid_at } });
});

app.post("/api/mock-payment-complete", async (req, res) => {
  if (PROVIDER !== "mock") return res.status(403).json({ ok: false, error: "MOCK_DISABLED", message: "โหมดทดสอบถูกปิดในระบบจริง" });
  const o = await getOrder(String(req.body?.order_id || "")); if (!o) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
  await markOrderPaid(o.order_id, "mock", "mock_paid");
  res.json({ ok: true, order_id: o.order_id, payment_status: "paid", redirect_url: `/processing?order_id=${encodeURIComponent(o.order_id)}` });
});

// โค้ดส่วนลดสำหรับคอร์ส/workshop — ใช้ตาราง promo_codes ตัวเดียวกับ Blueprint (คิมสร้างโค้ดที่เดิม ใช้ได้ทุกสินค้า)
// คืน { final, percent, code } หรือ { error, message } · นับ used_count ทันทีที่ผ่าน (กันใช้เกินโควตา)
async function redeemPromo(rawCode, email, amountSatang) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { final: amountSatang, percent: 0, code: null };
  const row = await one(`SELECT * FROM promo_codes WHERE code=$1`, [code]);
  if (!row || !row.active) return { error: "INVALID_CODE", message: "โค้ดไม่ถูกต้องหรือถูกปิดแล้วค่ะ" };
  if (row.locked_email && normEmail(email) !== normEmail(row.locked_email)) return { error: "EMAIL_LOCKED", message: "โค้ดนี้ใช้ได้เฉพาะอีเมลที่กำหนดค่ะ" };
  const percent = row.discount_percent == null ? 100 : Math.max(1, Math.min(100, row.discount_percent));
  const upd = await run(`UPDATE promo_codes SET used_count=used_count+1 WHERE code=$1 AND active=1 AND (max_uses IS NULL OR used_count<max_uses)`, [code]);
  if (upd.rowCount !== 1) return { error: "CODE_USED_UP", message: "โค้ดนี้ถูกใช้ครบแล้วค่ะ" };
  return { final: Math.max(0, Math.round(amountSatang * (100 - percent) / 100)), percent, code };
}
// เช็กโค้ดก่อนกดจ่าย (ไม่นับโควตา) — ให้หน้าเว็บโชว์ราคาหลังหักทันทีเหมือนหน้า Blueprint
app.post("/api/promo/preview", async (req, res) => {
  const code = String(req.body?.code || "").trim().toUpperCase();
  const amount = Math.max(0, Number(req.body?.amount_satang) || 0);
  if (!code) return res.json({ ok: true, percent: 0, final: amount });
  const row = await one(`SELECT * FROM promo_codes WHERE code=$1`, [code]);
  if (!row || !row.active) return res.status(400).json({ ok: false, error: "INVALID_CODE", message: "โค้ดไม่ถูกต้องหรือถูกปิดแล้วค่ะ" });
  if (row.max_uses != null && row.used_count >= row.max_uses) return res.status(400).json({ ok: false, error: "CODE_USED_UP", message: "โค้ดนี้ถูกใช้ครบแล้วค่ะ" });
  const percent = row.discount_percent == null ? 100 : Math.max(1, Math.min(100, row.discount_percent));
  res.json({ ok: true, percent, final: Math.max(0, Math.round(amount * (100 - percent) / 100)), code });
});

async function applyCode(req, res) {
  const orderId = String(req.body?.order_id || ""), code = String(req.body?.code || "").trim().toUpperCase();
  const o = await getOrder(orderId); if (!o) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
  if (["paid", "mock_paid"].includes(o.payment_status)) return res.json({ ok: true, already: true, free: true, redirect_url: `/processing?order_id=${encodeURIComponent(orderId)}` });
  const row = await one(`SELECT * FROM promo_codes WHERE code=$1`, [code]);
  if (!row || !row.active) return res.status(400).json({ ok: false, error: "INVALID_CODE", message: "โค้ดไม่ถูกต้องหรือถูกปิด" });
  const percent = row.discount_percent == null ? 100 : Math.max(1, Math.min(100, row.discount_percent));
  const isFree = percent >= 100;
  // โค้ดล็อกอีเมล: ใช้ได้เฉพาะอีเมลที่กำหนด (กันโค้ดทดสอบหลุด) + อีเมลนั้นใช้ซ้ำได้หลายครั้ง (เช่น dogfood agency หลายช่อง)
  if (row.locked_email && normEmail(o.email) !== normEmail(row.locked_email)) return res.status(400).json({ ok: false, error: "EMAIL_LOCKED", message: "โค้ดนี้ใช้ได้เฉพาะอีเมลที่กำหนดเท่านั้นค่ะ" });
  // โค้ดฟรีทั่วไป: เมลเดิมใช้โค้ดนี้ซ้ำไม่ได้ (กันแจกฟรีรัวๆ) — ยกเว้นโค้ดล็อกอีเมล (ตั้งใจให้ใช้ซ้ำได้)
  if (isFree && !row.locked_email) {
    const used = await usedFreeCodeBefore(o.email, code);
    if (used) return res.json({ ok: true, existing: true, free: true, redirect_url: used.blueprint_id ? dashUrlOf(used) : `/processing?order_id=${encodeURIComponent(used.order_id)}`, message: "อีเมลนี้ใช้โค้ดฟรีนี้ไปแล้วค่ะ (1 โค้ด / 1 อีเมล)" });
  }
  const upd = await run(`UPDATE promo_codes SET used_count=used_count+1 WHERE code=$1 AND active=1 AND (max_uses IS NULL OR used_count<max_uses)`, [code]);
  if (upd.rowCount !== 1) return res.status(400).json({ ok: false, error: "CODE_USED_UP", message: "โค้ดถูกใช้ครบแล้ว" });
  const finalAmount = Math.round(monthlySatang() * (100 - percent) / 100);
  await run(`UPDATE blueprint_orders SET discount_code=$1, discount_percent=$2, final_amount_satang=$3 WHERE order_id=$4`, [code, percent, finalAmount, orderId]);
  // โค้ดที่แถมเครดิต (เช่น โค้ดทดลอง) → เติมเครดิตให้อีเมลนี้ตอนใช้โค้ด (1 ครั้ง/อีเมล จาก guard usedFreeCodeBefore ด้านบน)
  if (Number(row.credit_grant) > 0 && o.email) {
    await upsertCustomer(o.email, "").catch(() => {});
    await run(`UPDATE customers SET credits=COALESCE(credits,0)+$1 WHERE lower(email)=lower($2)`, [Number(row.credit_grant), o.email]).catch(() => {});
    console.log(`[credits] โค้ด ${code} +${row.credit_grant} → ${o.email}`);
  }
  if (isFree || finalAmount <= 0) { await markOrderPaid(orderId, "code", code); return res.json({ ok: true, free: true, percent, redirect_url: `/processing?order_id=${encodeURIComponent(orderId)}` }); }
  res.json({ ok: true, free: false, percent, original_satang: PRICE_SATANG, final_satang: finalAmount });
}
app.post("/api/apply-code", applyCode);
app.post("/api/redeem-code", applyCode);

async function createStripeCheckout({ orderId, payload, origin, amountSatang, productName, successPath }) {
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const s = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: (process.env.STRIPE_PAYMENT_METHODS || "card,promptpay").split(",").map(x => x.trim()).filter(Boolean),
    line_items: [{ price_data: { currency: "thb", product_data: { name: productName || "Babe House AI Creator Blueprint Premium" }, unit_amount: amountSatang || PRICE_SATANG }, quantity: 1 }],
    success_url: `${origin}${successPath || `/processing?order_id=${encodeURIComponent(orderId)}`}`,
    cancel_url: `${origin}/checkout?order_id=${encodeURIComponent(orderId)}&payment=cancelled`,
    metadata: { order_id: orderId, user_id: payload?.user_id || "", billing_cycle: payload?.meta_purchase?.billing_cycle || "" }
  });
  return { checkout_url: s.url, provider_session_id: s.id };
}
app.post("/api/create-payment-session", async (req, res) => {
  try {
    const o = await getOrder(String(req.body?.order_id || "")); if (!o) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
    const isVideo = String(o.tier || "").startsWith("Video");
    const donePath = isVideo ? `/video-audit?order_id=${encodeURIComponent(o.order_id)}` : `/processing?order_id=${encodeURIComponent(o.order_id)}`;
    if (["paid", "mock_paid"].includes(o.payment_status)) return res.json({ ok: true, redirect_url: donePath });
    // จ่ายเงินจริง: ซื้อได้หลายเล่ม ไม่บล็อกซ้ำ
    const amount = o.final_amount_satang || PRICE_SATANG;
    if (o.provider === "stripe") {
      // ความปลอดภัย: ถ้าตั้ง stripe แต่ไม่มีคีย์ → ห้ามแจกฟรีเงียบๆ
      if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ ok: false, error: "PAYMENT_UNAVAILABLE", message: "ระบบชำระเงินยังไม่พร้อม กรุณาติดต่อทีมงานค่ะ" });
      const origin = req.headers.origin || `${req.protocol}://${req.get("host")}`;
      const s = await createStripeCheckout({ orderId: o.order_id, payload: safeJson(o.order_payload_json), origin, amountSatang: amount, productName: isVideo ? "Babe House Video Audit (ตรวจคลิป)" : undefined, successPath: isVideo ? donePath : undefined });
      await run(`UPDATE blueprint_orders SET provider_session_id=$1 WHERE order_id=$2`, [s.provider_session_id, o.order_id]);
      return res.json({ ok: true, redirect_url: s.checkout_url, external: true });
    }
    // โหมด mock เท่านั้นที่ mark paid โดยไม่ตัดเงิน
    await markOrderPaid(o.order_id, "mock", "mock_paid");
    res.json({ ok: true, redirect_url: donePath });
  } catch (err) { console.error(err); res.status(500).json({ ok: false, error: "PAYMENT_SESSION_FAILED", message: err.message }); }
});

// ---------- Video Audit (ครูพี่คิม AI ตรวจคลิป 199฿) ----------
const VIDEO_PRICE_SATANG = Number(process.env.VIDEO_PRICE_SATANG) || 19900;
app.post("/api/video-audit/create", async (req, res) => {
  try {
    const email = normEmail(req.body?.email) || null;
    const orderId = uid("vord"), uId = `video_${Date.now()}`;
    await run(`INSERT INTO blueprint_orders (order_id,user_id,instagram_account,email,tier,billing_cycle,payment_status,order_payload_json,provider,final_amount_satang,checkout_url) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10)`,
      [orderId, uId, "", email, "Video_199", currentBillingCycle(), JSON.stringify({ video_audit: true, email }), PROVIDER, VIDEO_PRICE_SATANG, `/video-audit?order_id=${encodeURIComponent(orderId)}`]);
    res.json({ ok: true, order_id: orderId, provider: PROVIDER, amount_satang: VIDEO_PRICE_SATANG });
  } catch (err) { console.error("video create", err); res.status(500).json({ ok: false, error: "VIDEO_CREATE_FAILED", message: err.message }); }
});

// เก็บคลิปไว้ "ก่อนจ่ายเงิน" (flow ใหม่: อัปคลิป → จ่าย → วิเคราะห์) — ยังไม่เรียก AI จนกว่าจะจ่าย
app.post("/api/video-audit/upload", async (req, res) => {
  try {
    const o = await getOrder(String(req.body?.order_id || "")); if (!o) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
    const video = String(req.body?.video || ""); const mime = String(req.body?.mime || "video/mp4"); const context = String(req.body?.context || "").slice(0, 800);
    if (!video) return res.status(400).json({ ok: false, error: "NO_VIDEO", message: "ยังไม่ได้แนบคลิปค่ะ" });
    if (video.length > 36 * 1024 * 1024) return res.status(413).json({ ok: false, error: "TOO_LARGE", message: "คลิปใหญ่เกินไปค่ะ (ลองสั้นกว่า ~1 นาที)" });
    const existing = await one(`SELECT audit_id, status FROM video_audits WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1`, [o.order_id]);
    if (existing && ["analyzing", "ready"].includes(existing.status)) return res.json({ ok: true, status: existing.status }); // วิเคราะห์ไปแล้ว ไม่ทับ
    if (existing) await run(`UPDATE video_audits SET video_data=$1, video_mime=$2, context=$3, status='uploaded', error=NULL WHERE audit_id=$4`, [video, mime, context, existing.audit_id]);
    else await run(`INSERT INTO video_audits (audit_id,order_id,email,status,video_data,video_mime,context) VALUES ($1,$2,$3,'uploaded',$4,$5,$6)`, [uid("va"), o.order_id, o.email || null, video, mime, context]);
    res.json({ ok: true, status: "uploaded" });
  } catch (err) { console.error("video upload", err); res.status(500).json({ ok: false, error: "VIDEO_UPLOAD_FAILED", message: err.message }); }
});

app.get("/api/video-audit/:orderId", async (req, res) => {
  const o = await getOrder(req.params.orderId);
  if (!o) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
  const va = await one(`SELECT * FROM video_audits WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1`, [o.order_id]);
  res.json({ ok: true, order_id: o.order_id, payment_status: o.payment_status, paid: ["paid", "mock_paid"].includes(o.payment_status), audit_status: va?.status || null, has_video: !!(va && va.video_data), audit: va?.result_json ? safeJson(va.result_json) : null, error: va?.error || null });
});

app.post("/api/video-audit/analyze", async (req, res) => {
  try {
    const o = await getOrder(String(req.body?.order_id || "")); if (!o) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
    if (!["paid", "mock_paid"].includes(o.payment_status)) return res.status(402).json({ ok: false, error: "PAYMENT_REQUIRED", message: "ต้องชำระเงินก่อนค่ะ" });
    const existing = await one(`SELECT * FROM video_audits WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1`, [o.order_id]);
    if (existing && existing.status === "ready") return res.json({ ok: true, status: "ready", audit: safeJson(existing.result_json), cached: true });
    if (existing && existing.status === "analyzing") return res.json({ ok: true, status: "analyzing" });
    // คลิป + บริบท: เอาจาก body (flow เก่า) หรือจากที่อัปเก็บไว้ก่อนจ่าย (flow ใหม่)
    const video = String(req.body?.video || "") || (existing && existing.video_data) || "";
    const mime = req.body?.mime || (existing && existing.video_mime) || "video/mp4";
    const contextRaw = req.body?.context != null ? String(req.body.context) : (existing && existing.context) || "";
    const langPref = req.body?.lang === "en" ? "en" : "th"; // ภาษาผลวิเคราะห์ตามที่ลูกค้าเลือก
    if (!video) return res.status(400).json({ ok: false, error: "NO_VIDEO", message: "ยังไม่ได้แนบวิดีโอค่ะ" });
    // มีแถว uploaded อยู่แล้ว → อัปเป็น analyzing (ไม่สร้างแถวใหม่) · ไม่งั้น insert ใหม่
    const auditId = existing && existing.status === "uploaded" ? existing.audit_id : uid("va");
    if (existing && existing.status === "uploaded") await run(`UPDATE video_audits SET status='analyzing', error=NULL WHERE audit_id=$1`, [auditId]);
    else await run(`INSERT INTO video_audits (audit_id,order_id,email,status) VALUES ($1,$2,$3,'analyzing')`, [auditId, o.order_id, o.email || null]);
    res.json({ ok: true, status: "analyzing" });
    const ctx = `บริบทจากเจ้าของคลิป (ถ้ามี): ${(contextRaw || "(ไม่ระบุ)").slice(0, 800)}\nช่วยตรวจคลิปนี้ละเอียดตามสเปก JSON`;
    (async () => {
      try {
        const { audit, model, usage } = await analyzeVideo({ dataUrl: video, mimeType: mime, contextText: ctx, lang: langPref });
        await run(`UPDATE video_audits SET status='ready', result_json=$1, video_data=NULL WHERE audit_id=$2`, [JSON.stringify(audit), auditId]); // เคลียร์คลิปทิ้ง วิเคราะห์เสร็จแล้ว
        if (usage) await run(`INSERT INTO ai_usage (id,kind,model,input_tokens,output_tokens,total_tokens) VALUES ($1,'video_audit',$2,$3,$4,$5)`, [uid("use"), model, usage.input || 0, usage.output || 0, usage.total || 0]).catch(() => {});
      } catch (e) { console.error("video analyze bg", e.message); await run(`UPDATE video_audits SET status='uploaded', error=$1 WHERE audit_id=$2`, [String(e.message).slice(0, 300), auditId]); } // คงคลิปไว้ให้ retry ได้
    })();
  } catch (err) { console.error("video analyze", err); res.status(500).json({ ok: false, error: "VIDEO_ANALYZE_FAILED", message: err.message }); }
});

// ---------- blueprint generation ----------
// จำกัดจำนวนเจนเล่มพร้อมกัน — กันคนจ่ายพร้อมกันเยอะแล้ว Gemini โดน rate-limit / RAM พุ่งจนล่ม
// ที่เหลือเข้าคิวรอ (หน้า Processing ของลูกค้า poll อยู่แล้ว + retryStuckGenerations เป็นตาข่ายกันพลาด)
const MAX_CONCURRENT_GENS = Number(process.env.MAX_CONCURRENT_GENS) || 15; // 6→10→15 รับวันเปิดขาย (load test 12 พร้อมกันผ่าน 0 error · Paid Tier 1 rate limit พอ) — คิวสั้นลง เจนไวขึ้นตอนคนแห่เข้า
let activeGens = 0; const genQueue = [];
// order_id ที่กำลังเจน/เข้าคิวอยู่ใน process นี้ — ให้ retryStuckGenerations ข้าม กันเจนซ้ำตอนคิวยาวเกิน 8 นาที
const inFlightOrders = new Set();
// blueprint_id ที่กำลังเจนคอนเทนต์/รีไฟน์บทวิเคราะห์อยู่ใน process นี้ (กันยิงซ้ำ)
const inFlightBp = new Set();
function acquireGen() { return new Promise(res => { if (activeGens < MAX_CONCURRENT_GENS) { activeGens++; res(); } else genQueue.push(res); }); }
function releaseGen() { activeGens = Math.max(0, activeGens - 1); const next = genQueue.shift(); if (next) { activeGens++; next(); } }

// ดึงบริบท "ทุกเดือนที่ผ่านมา" ของลูกค้าคนเดิม (จับคู่ด้วยอีเมล+ช่อง) → เดือน 2+ ต่อยอดจากผลจริง ไม่ซ้ำแม้แต่เดือนแรกๆ
async function getPrevContext(email, cycle, channel) {
  if (!email) return null;
  try {
    const params = [email, cycle]; let chFilter = "";
    if (channel) { params.push(channel); chFilter = ` AND regexp_replace(lower(r.instagram_account),'[@\\s._-]','','g')=regexp_replace(lower($3),'[@\\s._-]','','g')`; } // เทียบเฉพาะช่องเดียวกัน (normalize @/เว้นวรรค)
    // เอาทุกเดือนย้อนหลัง (ล่าสุด 6 เล่ม) — เดือน 3 ต้องไม่ซ้ำกับเดือน 1 ด้วย ไม่ใช่แค่เดือนล่าสุด
    const rows = await q(`SELECT b.blueprint_json FROM blueprints b JOIN blueprint_requests r ON b.request_id=r.request_id WHERE lower(r.email)=lower($1) AND b.billing_cycle<>$2${chFilter} AND b.blueprint_json IS NOT NULL AND b.deleted_at IS NULL ORDER BY b.created_at DESC LIMIT 6`, params);
    if (!rows.length) return null;
    const latest = safeJson(rows[0].blueprint_json) || {};
    const seen = new Set(); const topics = [];
    for (const row of rows) {
      const a = safeJson(row.blueprint_json) || {};
      for (const c of (Array.isArray(a.calendar) ? a.calendar : [])) {
        const t = c && c.t; if (t && !seen.has(t)) { seen.add(t); topics.push(t); }
      }
    }
    // ผลจริงจากรายงานการเติบโตล่าสุด → AI รู้ว่าแนวไหนเวิร์ก/แป้ก ไม่ใช่ต่อยอดแบบเดาๆ
    let growthGist = "";
    try {
      const g = await one(`SELECT analysis_json FROM growth_analyses WHERE lower(email)=lower($1)`, [email]);
      const gj = safeJson(g?.analysis_json);
      if (gj) growthGist = JSON.stringify(gj).slice(0, 900);
    } catch {}
    // 📈 ผลจริงรายคลิปของเดือนก่อนๆ — "ยิ่งใช้ยิ่งแม่น"
    // รวมทุกเดือนย้อนหลังของช่องนี้ แล้วสรุปว่าคนดูของเขาชอบอะไรจริงๆ
    let clipLearning = null;
    try {
      const bps = await q(`SELECT b.blueprint_id, b.user_id, b.billing_cycle, b.blueprint_json
        FROM blueprints b JOIN blueprint_requests r ON b.request_id=r.request_id
        WHERE lower(r.email)=lower($1) AND b.billing_cycle<>$2${chFilter} AND b.deleted_at IS NULL
        ORDER BY b.created_at DESC LIMIT 6`, params);
      const all = [];
      let calAll = {};
      for (const b of bps) {
        const rs = await q(`SELECT day, views FROM clip_results WHERE user_id=$1 AND billing_cycle=$2`, [b.user_id, b.billing_cycle]);
        if (!rs.length) continue;
        const cal = calendarByDay(b.blueprint_json);
        // ใส่ prefix เดือนกันวันชนกันข้ามเดือน (วันที่ 5 ของ ก.ค. ≠ วันที่ 5 ของ ส.ค.)
        for (const r of rs) { const k = `${b.billing_cycle}-${r.day}`; calAll[k] = cal[Number(r.day)] || {}; all.push({ ...r, day: k }); }
      }
      const L = learnFromClips(all, calAll);
      if (L.enough) clipLearning = L;
      // สรุปที่ AI อ่านจากแคปสิ้นเดือน — ใช้ได้แม้จับคู่รายวันไม่ได้ครบ
      const mr = await one(`SELECT review_json, clips_done FROM month_reviews WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [bps[0]?.user_id || ""]);
      const rv = safeJson(mr?.review_json);
      if (rv && (rv.worked?.length || rv.didnt_work?.length)) {
        clipLearning = { ...(clipLearning || { enough: true, clips: 0 }),
          worked: (rv.worked || []).slice(0, 6), didnt_work: (rv.didnt_work || []).slice(0, 6),
          coach_summary: String(rv.summary || "").slice(0, 600), clips_done: mr?.clips_done ?? null };
      }
    } catch (e) { console.warn("clip learning", e.message); }

    if (!latest.positioning && !latest.theme && !topics.length) return null;
    return { theme: latest.theme, positioning: latest.positioning, prev_topics: topics.slice(0, 100), months: rows.length + 1, growth_gist: growthGist, clip_learning: clipLearning };
  } catch (e) { console.warn("getPrevContext", e.message); return null; }
}

// pre-gen บทวิเคราะห์การเติบโต (เดือน 2+) แล้ว cache ไว้ → หน้าเทียบโหลดทันที ไม่ต้องรอเจนตอนเปิด
async function pregenGrowthAnalysis(email, channel) {
  try {
    const months = await getCustomerMonths(email, channel || undefined);
    if (months.length < 2) return; // เดือนเดียว = baseline instant อยู่แล้ว
    const lang = "th";
    const signature = `g2:${channel || ""}:${months.length}:${months[months.length - 1].blueprint_id}:${lang}`;
    const cached = await one(`SELECT signature FROM growth_analyses WHERE email=$1`, [email]);
    if (cached && cached.signature === signature) return; // มี cache ตรงแล้ว
    const { analysis, model } = await generateGrowthAnalysis(months, lang);
    await run(`INSERT INTO growth_analyses (email,signature,analysis_json,model,created_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (email) DO UPDATE SET signature=EXCLUDED.signature,analysis_json=EXCLUDED.analysis_json,model=EXCLUDED.model,created_at=now()`, [email, signature, JSON.stringify(analysis), model]);
    console.log(`[growth] pre-generated for ${maskEmail(email)} (${months.length} months)`);
  } catch (e) { console.error("pregen growth", e.message); }
}
async function generateBlueprintForPayload(payload) {
  await acquireGen();
  let out;
  try {
  const parsed = GenSchema.parse(normalizePayload(payload));
  const lang = payload.lang === "en" ? "en" : "th"; // ภาษาที่ลูกค้าเลือก (เก็บไว้ให้ generate-content/improve ใช้ต่อ)
  const firstImg = parsed.insight_screenshot_base64 || (Array.isArray(parsed.insight_images) ? parsed.insight_images[0] : "") || "";
  const requestId = uid("req"), blueprintId = uid("bp");
  await upsertUser({ user_id: parsed.user_id, instagram_account: parsed.instagram_account, business_type: parsed.form_responses.business_type });
  await upsertCustomer(parsed.email, parsed.instagram_account);
  const industry = classifyKeyword(`${parsed.form_responses.business_type} ${parsed.form_responses.monthly_goal}`);
  await run(`INSERT INTO blueprint_requests (request_id,user_id,instagram_account,email,billing_cycle,business_type,starting_point,monthly_goal,competitor_1,competitor_2,insight_screenshot_base64,insight_images_json,raw_payload_json,industry,phone) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [requestId, parsed.user_id, parsed.instagram_account, parsed.email || null, parsed.meta_purchase.billing_cycle, parsed.form_responses.business_type, parsed.form_responses.starting_point, parsed.form_responses.monthly_goal, parsed.form_responses.competitor_1, parsed.form_responses.competitor_2, firstImg, JSON.stringify(parsed.insight_images || (firstImg ? [firstImg] : [])), JSON.stringify(parsed), industry, parsed.form_responses.phone || null]);
  // สเต็ป 1: เจน "บทวิเคราะห์" ก่อน (เร็ว) — ยังไม่เจน 30 สคริปต์ จนกว่าลูกค้าจะยืนยันว่าแม่น
  parsed.prev_context = await getPrevContext(parsed.email, parsed.meta_purchase.billing_cycle, parsed.instagram_account); // เดือน 2+ ต่อยอด แยกตามช่อง
  const { analysis, model, usage } = await generateAnalysis(parsed, lang);
  await run(`INSERT INTO blueprints (blueprint_id,request_id,user_id,billing_cycle,blueprint_json,model,quality_flags_json,content_status,analysis_status) VALUES ($1,$2,$3,$4,$5,$6,'[]','pending','ready')`, [blueprintId, requestId, parsed.user_id, parsed.meta_purchase.billing_cycle, JSON.stringify(analysis), model]);
  // ประหยัดดิสก์: รูป base64 ใช้แค่ตอนเจน — ลบทิ้งหลังเจนสำเร็จ (กัน DB เต็มเหมือนที่เคยล่ม) คงไว้แค่ form_responses + lang
  try { const lean = { ...parsed, lang, insight_images: [], insight_screenshot_base64: null }; await run(`UPDATE blueprint_requests SET insight_screenshot_base64=NULL, insight_images_json='[]', raw_payload_json=$1 WHERE request_id=$2`, [JSON.stringify(lean), requestId]); } catch (e) { console.warn("strip imgs", e.message); }
  if (usage) await run(`INSERT INTO ai_usage (id,kind,model,input_tokens,output_tokens,total_tokens) VALUES ($1,'analysis',$2,$3,$4,$5)`, [uid("use"), model, usage.input || 0, usage.output || 0, usage.total || 0]).catch(() => {});
  await run(`INSERT INTO marathon_progress (progress_id,user_id,instagram_account,billing_cycle) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,billing_cycle) DO NOTHING`, [uid("marathon"), parsed.user_id, parsed.instagram_account, parsed.meta_purchase.billing_cycle]);
  out = { blueprintId, requestId, parsed, blueprint: analysis };
  } finally { releaseGen(); }
  // 🛡️ ยามตรวจความหมาย: แผนตรงกับช่องลูกค้าไหม + ตัวเลขสมเหตุผลไหม — fire-and-forget (ไม่หน่วงลูกค้า) fail-safe → เจอปัญหาค่อยเมลเตือนคิม (คิมไม่ต้องนั่งเช็กทุกเล่ม)
  auditBlueprintMatch(out.parsed, out.blueprint, payload.lang === "en" ? "en" : "th").then(async (auditFlags) => {
    if (!auditFlags || !auditFlags.length) return;
    // merge กับธงที่มีอยู่ (เผื่อ generate-content เพิ่งเขียนธงรูปแบบลงไประหว่างที่ audit กำลังรัน) — ไม่ทับของเดิม
    const cur = safeJson((await one(`SELECT quality_flags_json FROM blueprints WHERE blueprint_id=$1`, [out.blueprintId]))?.quality_flags_json) || [];
    const merged = [...new Set([...cur, ...auditFlags])];
    await run(`UPDATE blueprints SET quality_flags_json=$1 WHERE blueprint_id=$2`, [JSON.stringify(merged), out.blueprintId]).catch(() => {});
    await alertQualityIfNeeded(auditFlags, out.parsed, out.blueprintId);
  }).catch((e) => console.warn("audit gen", e.message));
  // เดือน 2+ : pre-gen บทวิเคราะห์การเติบโตเบื้องหลัง (ไม่ await) → ลูกค้าเปิดหน้าเทียบไม่ต้องรอเจน
  if (out.parsed.email) pregenGrowthAnalysis(out.parsed.email, out.parsed.instagram_account).catch(() => {});
  return out;
}

app.post("/api/start-generation", async (req, res) => {
  try {
    const o = await getOrder(String(req.body?.order_id || "")); if (!o) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
    if (!["paid", "mock_paid"].includes(o.payment_status)) return res.status(402).json({ ok: false, error: "PAYMENT_REQUIRED", message: "ต้องชำระเงินก่อน" });
    if (o.blueprint_id) return res.json({ ok: true, status: "ready", order_id: o.order_id, blueprint_id: o.blueprint_id, user_id: o.user_id, billing_cycle: o.billing_cycle });
    const claim = await run(`UPDATE blueprint_orders SET generation_status='generating', generation_error=NULL WHERE order_id=$1 AND blueprint_id IS NULL AND (generation_status IS NULL OR generation_status IN ('pending','error'))`, [o.order_id]);
    if (claim.rowCount !== 1) return res.json({ ok: true, status: o.generation_status || "generating", order_id: o.order_id });
    res.json({ ok: true, status: "generating", order_id: o.order_id });
    inFlightOrders.add(o.order_id);
    (async () => {
      try {
        const result = await generateBlueprintForPayload(safeJson(o.order_payload_json));
        await run(`UPDATE blueprint_orders SET blueprint_id=$1, generation_status='ready', generation_error=NULL WHERE order_id=$2`, [result.blueprintId, o.order_id]);
        const url = `${appBaseUrl()}/dashboard?user_id=${encodeURIComponent(result.parsed.user_id)}&billing_cycle=${encodeURIComponent(result.parsed.meta_purchase.billing_cycle)}&blueprint_id=${encodeURIComponent(result.blueprintId)}`;
        if (o.email) { const l = langOfPayload(result.parsed); await sendEmail(o.email,
          tr(l, `บทวิเคราะห์ช่องของคุณพร้อมแล้ว 🩵`, `Your channel analysis is ready 🩵`),
          wrap(tr(l,
            `ครูพี่คิมอ่านช่องของคุณเสร็จแล้วค่ะ!<br><br>กดเปิดดู <b>บทวิเคราะห์ช่อง</b> (จุดแข็ง–จุดอ่อน · กลุ่มเป้าหมาย · โอกาสโต) — ถ้าตรงแล้ว กดปุ่ม <b>"สร้างแผน 30 วัน"</b> ในเล่ม ครูพี่คิมจะเขียนสคริปต์พร้อมอัดให้ครบทั้งเดือนเลยค่ะ<br><br>${btn(url, "เปิดดูบทวิเคราะห์ของฉัน")}`,
            `Kim has finished reading your channel!<br><br>Open your <b>Channel Analysis</b> (strengths & weaknesses · audience · growth opportunities) — if it looks right, hit <b>"Create my 30-day plan"</b> inside and Kim will write a full month of ready-to-shoot scripts.<br><br>${btn(url, "Open my analysis")}`))).catch(() => {}); }
      } catch (e) { console.error("bg gen", e.message); await run(`UPDATE blueprint_orders SET generation_status='error', generation_error=$1 WHERE order_id=$2`, [String(e.message).slice(0, 300), o.order_id]); }
      finally { inFlightOrders.delete(o.order_id); }
    })();
  } catch (err) { console.error(err); res.status(500).json({ ok: false, error: "START_GENERATION_FAILED", message: err.message }); }
});

app.post("/api/generate-blueprint-by-order", async (req, res) => {
  try {
    const o = await getOrder(String(req.body?.order_id || "")); if (!o) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
    if (!["paid", "mock_paid"].includes(o.payment_status)) return res.status(402).json({ ok: false, error: "PAYMENT_REQUIRED", message: "ต้องชำระเงินก่อน" });
    if (o.blueprint_id) { const row = await one(`SELECT blueprint_id, blueprint_json FROM blueprints WHERE blueprint_id=$1`, [o.blueprint_id]); if (row) return res.json({ ok: true, blueprint_id: row.blueprint_id, order_id: o.order_id, user_id: o.user_id, billing_cycle: o.billing_cycle, blueprint: safeJson(row.blueprint_json), cached: true }); }
    const result = await generateBlueprintForPayload(safeJson(o.order_payload_json));
    await run(`UPDATE blueprint_orders SET blueprint_id=$1, generation_status='ready' WHERE order_id=$2`, [result.blueprintId, o.order_id]);
    res.json({ ok: true, blueprint_id: result.blueprintId, order_id: o.order_id, user_id: result.parsed.user_id, billing_cycle: result.parsed.meta_purchase.billing_cycle, blueprint: result.blueprint });
  } catch (err) { console.error(err); res.status(500).json({ ok: false, error: "GENERATE_FAILED", message: err.message }); }
});

// เพิ่มข้อมูลให้ครูพี่คิมเข้าใจมากขึ้น → เจนเล่มเดิมใหม่ (ฟรี 1 ครั้ง/เล่ม) ทับ blueprint เดิม URL เดิมใช้ได้
app.post("/api/improve-blueprint", async (req, res) => {
  try {
    const userId = String(req.body?.user_id || ""), cycle = String(req.body?.billing_cycle || ""), bpId = String(req.body?.blueprint_id || ""), extra = req.body?.extra || {};
    if (!userId || !cycle || !bpId) return res.status(400).json({ ok: false, error: "MISSING_QUERY" });
    // ต้องมี blueprint_id ที่ตรง (เดาไม่ได้) ถึงรีเจนได้ — กันคนอื่นกดรีเจนเล่มเรา
    const bp = await one(`SELECT * FROM blueprints WHERE blueprint_id=$1 AND user_id=$2 AND billing_cycle=$3`, [bpId, userId, cycle]);
    if (!bp) return res.status(404).json({ ok: false, error: "BLUEPRINT_NOT_FOUND" });
    if ((bp.improve_count || 0) >= 1) return res.status(409).json({ ok: false, error: "IMPROVE_USED", message: "คุณใช้สิทธิ์เพิ่มข้อมูลฟรีของเล่มนี้ไปแล้วค่ะ 🩵" });
    const reqRow = await one(`SELECT raw_payload_json FROM blueprint_requests WHERE request_id=$1`, [bp.request_id]);
    const raw = safeJson(reqRow?.raw_payload_json) || {};
    const lang = (req.body?.lang === "en" || raw.lang === "en") ? "en" : "th"; // ภาษาปัจจุบัน (body) ทับที่เก็บไว้
    const parsed = GenSchema.parse(normalizePayload(raw));
    const fr = parsed.form_responses;
    fr.starting_point = [fr.starting_point,
      extra.brand_info && `ข้อมูลแบรนด์เพิ่มเติม: ${extra.brand_info}`,
      extra.products && `สินค้า/บริการที่อยากขาย: ${extra.products}`,
      extra.pain_points && `ปัญหา/อุปสรรคตอนนี้: ${extra.pain_points}`,
      extra.content_likes && `คอนเทนต์ที่ชอบ/อยากได้แนวนี้: ${extra.content_likes}`,
      extra.content_dislikes && `แนวที่ไม่ชอบ: ${extra.content_dislikes}`,
      extra.more && `เล่าเพิ่มเติม: ${extra.more}`].filter(Boolean).join("\n");
    if (extra.competitor_1) fr.competitor_1 = extra.competitor_1;
    if (extra.competitor_2) fr.competitor_2 = extra.competitor_2;
    // รูป Insight ที่แนบใหม่ตอนรีเจน (เผื่อรอบแรกลืมใส่) → ใช้เจนใหม่ให้แม่นขึ้น
    const newImgs = Array.isArray(req.body?.images) ? req.body.images.filter(x => typeof x === "string" && x.startsWith("data:image")) : [];
    if (newImgs.length) { parsed.insight_images = newImgs.slice(0, 8); parsed.insight_screenshot_base64 = newImgs[0]; }
    // รูป Insight เดิมถูกลบทิ้งหลังเจนรอบแรก (ประหยัดดิสก์) → ถ้าไม่แนบรูปใหม่รอบนี้ ส่ง "สถิติที่วิเคราะห์ไว้แล้ว" ให้ AI ใช้ต่อ (กัน metrics หาย = บอกลูกค้าว่าไม่ได้แนบทั้งที่แนบแล้ว)
    const curBp = safeJson(bp.blueprint_json) || {};
    const curHasNums = curBp.metrics && Object.values(curBp.metrics).some(v => typeof v === "number" && v > 0);
    if (!newImgs.length && curHasNums) parsed.prior_metrics = curBp.metrics;
    // รีไฟน์ "บทวิเคราะห์" เท่านั้น (เร็ว) แบบ async — ตอบทันที แล้วเจนเบื้องหลัง หน้า Dashboard poll analysis_status
    if (inFlightBp.has(bpId)) return res.json({ ok: true, status: "generating" });
    inFlightBp.add(bpId);
    await run(`UPDATE blueprints SET analysis_status='generating', content_started_at=now() WHERE blueprint_id=$1`, [bpId]);
    res.json({ ok: true, status: "generating", improve_count: (bp.improve_count || 0) + 1 });
    (async () => {
      try {
        await acquireGen();
        try {
          parsed.prev_context = await getPrevContext(parsed.email, parsed.meta_purchase?.billing_cycle, parsed.instagram_account);
          const { analysis, model, usage } = await generateAnalysis(parsed, lang);
          // ⛔ กันสคริปต์หาย: ถ้าเคยสร้างคอนเทนต์แล้ว (มี calendar/scripts) ต้องคงไว้ — ไม่งั้นเขียนทับด้วยบทวิเคราะห์ล้วน = หน้า 30 วันว่างทั้งที่ content_status=ready
          const freshJson = safeJson((await one(`SELECT blueprint_json FROM blueprints WHERE blueprint_id=$1`, [bpId]))?.blueprint_json) || {};
          const nextJson = { ...analysis };
          if (Array.isArray(freshJson.calendar) && freshJson.calendar.length) nextJson.calendar = freshJson.calendar;
          if (Array.isArray(freshJson.scripts) && freshJson.scripts.length) nextJson.scripts = freshJson.scripts;
          // กันสถิติหาย (belt+suspenders): ถ้าไม่แนบรูปใหม่ + รอบก่อนมีตัวเลขจริง แต่รอบนี้ AI ทำหลุด → คงของเดิมไว้
          if (!newImgs.length && curHasNums) {
            const newHasNums = nextJson.metrics && Object.values(nextJson.metrics).some(v => typeof v === "number" && v > 0);
            if (!newHasNums) nextJson.metrics = curBp.metrics;
            if ((!Array.isArray(nextJson.what_we_see) || !nextJson.what_we_see.length) && Array.isArray(curBp.what_we_see)) nextJson.what_we_see = curBp.what_we_see;
            if (!nextJson.follower_insight && curBp.follower_insight) nextJson.follower_insight = curBp.follower_insight;
          }
          await run(`UPDATE blueprints SET blueprint_json=$1, model=$2, improve_count=COALESCE(improve_count,0)+1, analysis_status='ready' WHERE blueprint_id=$3`, [JSON.stringify(nextJson), model, bpId]);
          const lean = { ...parsed, lang, insight_images: [], insight_screenshot_base64: null }; // ลบ base64 ออกก่อนเก็บ (กัน DB บวม) คง lang
          await run(`UPDATE blueprint_requests SET raw_payload_json=$1, starting_point=$2 WHERE request_id=$3`, [JSON.stringify(lean), fr.starting_point, bp.request_id]).catch(() => {});
          if (usage) await run(`INSERT INTO ai_usage (id,kind,model,input_tokens,output_tokens,total_tokens) VALUES ($1,'improve',$2,$3,$4,$5)`, [uid("use"), model, usage.input || 0, usage.output || 0, usage.total || 0]).catch(() => {});
          // ส่งเมลแจ้งเมื่อแก้บทวิเคราะห์เสร็จ — ลูกค้าจะปิดหน้าไปก็ได้ ไม่ต้องนั่งรอ
          if (parsed.email) { const url = `${appBaseUrl()}/dashboard?user_id=${encodeURIComponent(parsed.user_id)}&billing_cycle=${encodeURIComponent(parsed.meta_purchase.billing_cycle)}&blueprint_id=${encodeURIComponent(bpId)}`; const l = langOfPayload(parsed); await sendEmail(parsed.email,
            tr(l, `บทวิเคราะห์ของคุณอัปเดตแล้ว 🩵`, `Your analysis has been updated 🩵`),
            wrap(tr(l,
              `ครูพี่คิมอ่านข้อมูลใหม่ของคุณแล้ว ปรับบทวิเคราะห์ให้แม่นขึ้นเรียบร้อยค่ะ!<br><br>เปิดดูได้เลย ถ้าตรงใจแล้วกด <b>"สร้างแผน 30 วัน"</b> ในเล่มได้เลยนะคะ<br><br>${btn(url, "เปิดดูบทวิเคราะห์ที่อัปเดตแล้ว")}`,
              `Kim has read your new info and fine-tuned your analysis!<br><br>Take a look — if it feels right, hit <b>"Create my 30-day plan"</b> inside.<br><br>${btn(url, "Open my updated analysis")}`))).catch(() => {}); }
        } finally { releaseGen(); }
      } catch (e) { console.error("improve bg", e.message); await run(`UPDATE blueprints SET analysis_status='error' WHERE blueprint_id=$1`, [bpId]).catch(() => {}); }
      finally { inFlightBp.delete(bpId); }
    })();
  } catch (err) { console.error("improve", err); res.status(500).json({ ok: false, error: "IMPROVE_FAILED", message: err.message }); }
});

// เตือนคิมทางเมล "เฉพาะตอนเจอปัญหาจริง" — คิมไม่ต้องนั่งเช็กเล่มเอง (ระบบเจนซ้ำอัตโนมัติแล้วยังไม่หาย ค่อยเตือน)
const SERIOUS_QUALITY_RE = /สั้น|placeholder|อังกฤษ|ไม่ครบ|ว่าง|ซ้ำ|หลุด|แต่งตัวเลข|ไม่ตรง|สลับ/;
async function alertQualityIfNeeded(flags, parsed, bpId) {
  try {
    const serious = (flags || []).filter(f => SERIOUS_QUALITY_RE.test(f));
    if (!serious.length) return;
    const url = `${appBaseUrl()}/dashboard?user_id=${encodeURIComponent(parsed.user_id)}&billing_cycle=${encodeURIComponent(parsed.meta_purchase.billing_cycle)}&blueprint_id=${encodeURIComponent(bpId)}`;
    await sendEmail(OPS_EMAIL,
      `⚠️ เล่มอาจมีปัญหาคุณภาพ — ${parsed.instagram_account || bpId}`,
      wrap(`เล่มเจนเสร็จแล้ว แต่ระบบตรวจเจอจุดที่ควรดู (เจนซ้ำอัตโนมัติแล้วยังเจอ):<br><br>• ${serious.join("<br>• ")}<br><br>ช่อง: <b>${parsed.instagram_account || "-"}</b><br><br>${btn(url, "เปิดดูเล่มนี้")}<br><br><span style="color:#999;font-size:12px">เมลนี้ส่งอัตโนมัติ "เฉพาะตอนเจอปัญหา" เท่านั้น — ไม่เจอปัญหาจะไม่ส่ง คิมไม่ต้องนั่งเช็กเองค่ะ</span>`)).catch(() => {});
    console.warn(`[quality-alert] ${bpId}: ${serious.join(" · ")}`);
  } catch (e) { console.warn("alertQualityIfNeeded", e.message); }
}

// สเต็ป 2: สร้างปฏิทิน + 30 สคริปต์ (เจนเบื้องหลัง) — เรียกเมื่อลูกค้ายืนยันว่าบทวิเคราะห์แม่นแล้ว
app.post("/api/generate-content", async (req, res) => {
  try {
    const userId = String(req.body?.user_id || ""), cycle = String(req.body?.billing_cycle || ""), bpId = String(req.body?.blueprint_id || "");
    if (!userId || !cycle || !bpId) return res.status(400).json({ ok: false, error: "MISSING_QUERY" });
    const bp = await one(`SELECT * FROM blueprints WHERE blueprint_id=$1 AND user_id=$2 AND billing_cycle=$3`, [bpId, userId, cycle]);
    if (!bp) return res.status(404).json({ ok: false, error: "BLUEPRINT_NOT_FOUND" });
    const current = safeJson(bp.blueprint_json) || {};
    // ลูกค้าแก้ค่า 6 ช่องเอง → อัปเดตบทวิเคราะห์ก่อนเจนคอนเทนต์ (คอนเทนต์อิงค่าที่แก้ + ช่องในเล่มอัปเดตด้วย) ไม่ต้องเจนวิเคราะห์ใหม่
    const edits = Array.isArray(req.body?.snapshot_edits) ? req.body.snapshot_edits : [];
    if (edits.length && Array.isArray(current.snapshot)) {
      for (const e of edits) { const idx = Number(e?.i); if (current.snapshot[idx] && typeof e?.value === "string" && e.value.trim()) current.snapshot[idx].value = e.value.trim().slice(0, 60); }
    }
    if (bp.content_status === "ready" || (Array.isArray(current.scripts) && current.scripts.length)) return res.json({ ok: true, status: "ready" });
    if (bp.content_status === "generating" && inFlightBp.has(bpId)) return res.json({ ok: true, status: "generating" }); // กำลังทำอยู่จริงใน process นี้
    // ไม่งั้นเริ่มใหม่ (รวมถึงกรณี 'generating' ที่ค้างจาก deploy เก่า = orphaned)
    inFlightBp.add(bpId);
    await run(`UPDATE blueprints SET content_status='generating', content_started_at=now() WHERE blueprint_id=$1`, [bpId]);
    res.json({ ok: true, status: "generating" });
    (async () => {
      try {
        await acquireGen();
        try {
          const reqRow = await one(`SELECT raw_payload_json FROM blueprint_requests WHERE request_id=$1`, [bp.request_id]);
          const raw = safeJson(reqRow?.raw_payload_json) || {};
          const lang = (req.body?.lang === "en" || raw.lang === "en") ? "en" : "th";
          const parsed = GenSchema.parse(normalizePayload(raw));
          parsed.prev_context = await getPrevContext(parsed.email, cycle, parsed.instagram_account); // เดือน 2+ ห้ามซ้ำ แยกตามช่อง
          const { content, model, usage } = await generateContent(parsed, current, lang);
          const merged = { ...current, calendar: content.calendar, scripts: content.scripts };
          const qualityFlags = checkBlueprintQuality(merged, true);
          if (qualityFlags.length) console.warn(`[quality] ${bpId}: ${qualityFlags.join(" · ")}`);
          // คงธง "ยามตรวจความหมาย" (🎯 นิช / 🔢 ตัวเลข) ที่ตั้งไว้ตอนวิเคราะห์ ไม่ให้ถูกเช็กรูปแบบเขียนทับหาย (เมลนิชเตือนไปแล้วตอนวิเคราะห์ ไม่เตือนซ้ำ)
          const priorAudit = (safeJson(bp.quality_flags_json) || []).filter(f => /🎯|🔢/.test(String(f)));
          const allFlags = [...new Set([...priorAudit, ...qualityFlags])];
          await run(`UPDATE blueprints SET blueprint_json=$1, model=$2, content_status='ready', quality_flags_json=$3 WHERE blueprint_id=$4`, [JSON.stringify(merged), model, JSON.stringify(allFlags), bpId]);
          await alertQualityIfNeeded(qualityFlags, parsed, bpId); // เตือนคิมทางเมลถ้าระบบเจนซ้ำแล้วยังมีจุดต้องดู (คิมไม่ต้องนั่งเช็กเอง)
          if (usage) await run(`INSERT INTO ai_usage (id,kind,model,input_tokens,output_tokens,total_tokens) VALUES ($1,'content',$2,$3,$4,$5)`, [uid("use"), model, usage.input || 0, usage.output || 0, usage.total || 0]).catch(() => {});
          // ส่งเมลแจ้งเมื่อแผน 30 วันเจนเสร็จ — ลูกค้าปิดหน้าไปก็ได้ ไม่ต้องนั่งรอ
          if (parsed.email) { const url = `${appBaseUrl()}/dashboard?user_id=${encodeURIComponent(parsed.user_id)}&billing_cycle=${encodeURIComponent(parsed.meta_purchase.billing_cycle)}&blueprint_id=${encodeURIComponent(bpId)}`; const l = langOfPayload(parsed); await sendEmail(parsed.email,
            tr(l, `แผนคอนเทนต์ 30 วันของคุณพร้อมแล้ว 🎉`, `Your 30-day content plan is ready 🎉`),
            wrap(tr(l,
              `ครูพี่คิมเขียนสคริปต์พร้อมอัดให้ครบทั้ง 30 วันแล้วค่ะ! 🩵<br><br>เปิดดูปฏิทิน 30 วัน + สคริปต์ + แคปชันพร้อมโพสต์ได้เลย แล้วเริ่มลงมือทำคอนเทนต์กันค่ะ<br><br>${btn(url, "เปิดดูแผน 30 วันของฉัน")}`,
              `Kim has written all 30 days of ready-to-shoot scripts! 🩵<br><br>Open your 30-day calendar + scripts + ready-to-post captions, and let's start creating.<br><br>${btn(url, "Open my 30-day plan")}`))).catch(() => {}); }
          console.log(`[gen-content] ${bpId} สำเร็จ`);
        } finally { releaseGen(); }
      } catch (e) { console.error("gen-content bg", e.message); await run(`UPDATE blueprints SET content_status='error' WHERE blueprint_id=$1`, [bpId]).catch(() => {}); }
      finally { inFlightBp.delete(bpId); }
    })();
  } catch (err) { console.error("generate-content", err); res.status(500).json({ ok: false, error: "GEN_CONTENT_FAILED", message: err.message }); }
});

app.post("/api/generate-blueprint", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" }); // กันเจนฟรีไม่จ่ายเงิน (เปลือง token) — ลูกค้าใช้ flow checkout→start-generation
  try { const r = await generateBlueprintForPayload(req.body); res.json({ ok: true, blueprint_id: r.blueprintId, user_id: r.parsed.user_id, billing_cycle: r.parsed.meta_purchase.billing_cycle, blueprint: r.blueprint }); }
  catch (err) { console.error(err); res.status(500).json({ ok: false, error: "GENERATE_FAILED", message: err.message }); }
});

app.get("/api/blueprints/latest", async (req, res) => {
  const userId = String(req.query.user_id || ""), cycle = String(req.query.billing_cycle || ""), bpId = String(req.query.blueprint_id || "");
  if (!userId || !cycle || !bpId) return res.status(400).json({ ok: false, error: "MISSING_QUERY" });
  // ต้องรู้ blueprint_id (สุ่ม เดาไม่ได้) ถึงเปิดได้ — กันเดา user_id แล้วอ่านเล่มคนอื่น
  const row = await one(`SELECT b.*, r.email AS owner_email, r.business_type AS business_type FROM blueprints b LEFT JOIN blueprint_requests r ON b.request_id=r.request_id WHERE b.blueprint_id=$1 AND b.user_id=$2 AND b.billing_cycle=$3 AND b.deleted_at IS NULL`, [bpId, userId, cycle]);
  if (!row) return res.status(404).json({ ok: false, error: "BLUEPRINT_NOT_FOUND" });
  // เช็กเจ้าของ: ต้อง login เป็นอีเมลเจ้าของเล่มเท่านั้น (กันเปิดเล่มคนอื่นแม้มีลิงก์) — เล่มไม่มีอีเมล (เก่า) ปล่อยผ่านกันล็อกเอาต์
  const ownerEmail = row.owner_email ? normEmail(row.owner_email) : "";
  if (ownerEmail && !isAdmin(req)) { // แอดมินเปิดดูได้ทุกเล่ม (ไว้ซัพพอร์ตลูกค้า)
    const viewer = await authEmail(req);
    if (!viewer || normEmail(viewer) !== ownerEmail) return res.status(403).json({ ok: false, error: "NOT_OWNER", owner_hint: maskEmail(row.owner_email) });
  }
  const mp = await one(`SELECT uploaded_days_json FROM marathon_progress WHERE user_id=$1 AND billing_cycle=$2`, [userId, cycle]);
  let bpData = safeJson(row.blueprint_json);
  if (bpData && Array.isArray(bpData.scripts) && bpData.scripts.length) bpData.scripts = await mergePlanOverrides(row.blueprint_id, bpData.scripts); // ทับด้วยฉบับที่ลูกค้าแก้/เจนใหม่
  if (bpData) bpData = politeKimBlueprint(bpData); // แก้ "จ้ะ" → "ค่ะ/คะ" ในน้ำเสียงครูพี่คิม (เว้นสคริปต์ลูกค้า) — แก้เล่มเก่าที่มีจ้ะทันที
  if (bpData) bpData.compliance = complianceNote(classifyKeyword(row.business_type || "")); // ป้ายเตือนกฎโฆษณาตามวงการ (สุขภาพ/ความงาม/การเงิน)
  const contentReady = row.content_status === "ready" || (bpData && Array.isArray(bpData.scripts) && bpData.scripts.length > 0);
  res.json({ ok: true, blueprint_id: row.blueprint_id, user_id: row.user_id, billing_cycle: row.billing_cycle, model: row.model, started_at: row.created_at, improve_count: row.improve_count || 0, content_status: contentReady ? "ready" : (row.content_status || "pending"), analysis_status: row.analysis_status || "ready", blueprint: bpData, marathon: mp ? safeJson(mp.uploaded_days_json) : [] });
});

// ---------- marathon ----------
const normDays = (d) => [...new Set(d)].filter(n => Number.isInteger(n) && n >= 1 && n <= 31).sort((a, b) => a - b);
const tierOf = (c) => c >= 15 ? "Diamond" : c >= 5 ? "Gold" : "Silver";
app.get("/api/marathon/progress", async (req, res) => {
  const userId = String(req.query.user_id || ""), cycle = String(req.query.billing_cycle || "");
  if (!userId || !cycle) return res.status(400).json({ ok: false, error: "MISSING_QUERY" });
  const row = await one(`SELECT * FROM marathon_progress WHERE user_id=$1 AND billing_cycle=$2`, [userId, cycle]);
  if (!row) return res.json({ ok: true, user_id: userId, billing_cycle: cycle, uploaded_days: [], uploaded_count: 0, star_count: 0, tier: "Silver" });
  res.json({ ok: true, user_id: row.user_id, instagram_account: row.instagram_account, billing_cycle: row.billing_cycle, uploaded_days: safeJson(row.uploaded_days_json), uploaded_count: row.uploaded_count, star_count: row.star_count, tier: row.tier, last_action_day: row.last_action_day });
});
app.post("/api/marathon/progress", async (req, res) => {
  try {
    const p = MarathonSchema.parse(req.body);
    // ต้องมี blueprint_id ที่ตรงกับเล่มจริง ถึงติ๊กได้ — กันคนอื่นแก้ความคืบหน้าเรา
    const bpId = String(req.body?.blueprint_id || "");
    const owns = bpId && await one(`SELECT 1 FROM blueprints WHERE blueprint_id=$1 AND user_id=$2 AND billing_cycle=$3`, [bpId, p.user_id, p.billing_cycle]);
    if (!owns) return res.status(403).json({ ok: false, error: "FORBIDDEN", message: "ไม่มีสิทธิ์แก้ไข" });
    const days = normDays(p.uploaded_days), count = days.length, tier = tierOf(count);
    await run(`INSERT INTO marathon_progress (progress_id,user_id,instagram_account,billing_cycle,uploaded_days_json,uploaded_count,star_count,tier,last_action_day,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
      ON CONFLICT (user_id,billing_cycle) DO UPDATE SET instagram_account=EXCLUDED.instagram_account,uploaded_days_json=EXCLUDED.uploaded_days_json,uploaded_count=EXCLUDED.uploaded_count,star_count=EXCLUDED.star_count,tier=EXCLUDED.tier,last_action_day=EXCLUDED.last_action_day,updated_at=now()`,
      [uid("marathon"), p.user_id, p.instagram_account || "", p.billing_cycle, JSON.stringify(days), count, count, tier, p.day || null]);
    if (p.day && p.action) await run(`INSERT INTO marathon_events (event_id,user_id,billing_cycle,day,action,uploaded_days_snapshot_json) VALUES ($1,$2,$3,$4,$5,$6)`, [uid("event"), p.user_id, p.billing_cycle, p.day, p.action, JSON.stringify(days)]);
    res.json({ ok: true, user_id: p.user_id, billing_cycle: p.billing_cycle, uploaded_days: days, uploaded_count: count, star_count: count, tier, last_action_day: p.day || null });
  } catch (err) { res.status(400).json({ ok: false, error: "SAVE_FAILED", message: err.message }); }
});

// ═══════ 📈 ผลจริงรายคลิป — "ยิ่งใช้ยิ่งแม่น" (คิมสั่ง 3 ส.ค. 2569) ═══════
// ลูกค้าติ๊กว่าลงคลิปวันไหนอยู่แล้ว (มาราธอน) — เพิ่มแค่ "วันนั้นได้กี่วิว"
// แล้วเดือนถัดไป AI เขียนแผนโดยรู้ว่าคนดูช่องนี้ชอบอะไรจริงๆ ไม่ใช่เดาใหม่ทุกเดือน

// อ่านปฏิทิน 30 วันของเล่มหนึ่ง → map วันที่เป็น {หัวข้อ, เป้าหมาย, ฟอร์แมต, ฮุก}
const calendarByDay = (bpJson) => {
  const cal = safeJson(bpJson)?.calendar;
  const m = {};
  for (const c of (Array.isArray(cal) ? cal : [])) if (c && c.d) m[Number(c.d)] = c;
  return m;
};

// สรุปว่า "อะไรเวิร์ค" จากผลจริง — ใช้ทั้งโชว์ลูกค้าและป้อนให้ AI เดือนถัดไป
// ⚠️ ต้องมีอย่างน้อย 4 คลิปที่มีตัวเลข ถึงจะสรุป — น้อยกว่านั้นคือเดา ไม่ใช่เรียนรู้
const MIN_CLIPS_TO_LEARN = 4;
function learnFromClips(results, calMap) {
  // ⚠️ day อาจเป็นเลข (ในเดือนเดียว) หรือเป็นคีย์ข้ามเดือน "2026-07-12" — ต้องรองรับทั้งสองแบบ
  // เคยพลาด: Number("2026-07-12") = NaN → หาปฏิทินไม่เจอ → สรุปตามฟอร์แมต/เป้าหมายไม่ได้เลย
  const rows = results
    .filter(r => Number(r.views) > 0)
    .map(r => ({ ...r, cal: calMap[r.day] || calMap[Number(r.day)] || {} }))
    .sort((a, b) => Number(b.views) - Number(a.views));
  if (rows.length < MIN_CLIPS_TO_LEARN) return { enough: false, clips: rows.length, need: MIN_CLIPS_TO_LEARN };

  const views = rows.map(r => Number(r.views));
  const avg = Math.round(views.reduce((s, v) => s + v, 0) / views.length);
  // จัดกลุ่มตามมิติที่มีในปฏิทินอยู่แล้ว: g = เป้าหมาย (Awareness/Conversion/Branding) · f = ฟอร์แมต
  const group = (key) => {
    const g = {};
    for (const r of rows) {
      const k = String(r.cal[key] || "").trim();
      if (!k) continue;
      (g[k] ||= []).push(Number(r.views));
    }
    return Object.entries(g)
      .filter(([, v]) => v.length >= 2)          // กลุ่มที่มีคลิปเดียว = บังเอิญ ไม่นับ
      .map(([k, v]) => ({ key: k, clips: v.length, avg: Math.round(v.reduce((s, x) => s + x, 0) / v.length) }))
      .sort((a, b) => b.avg - a.avg);
  };
  const byGoal = group("g"), byFormat = group("f");
  const vsAvg = (n) => Math.round((n / avg - 1) * 100);
  return {
    enough: true, clips: rows.length, avg_views: avg,
    best: rows.slice(0, 3).map(r => ({ day: r.day, views: Number(r.views), title: r.cal.t || "", hook: r.cal.h || "", format: r.cal.f || "", goal: r.cal.g || "" })),
    worst: rows.slice(-3).reverse().map(r => ({ day: r.day, views: Number(r.views), title: r.cal.t || "", format: r.cal.f || "", goal: r.cal.g || "" })),
    by_goal: byGoal.map(x => ({ ...x, vs_avg: vsAvg(x.avg) })),
    by_format: byFormat.map(x => ({ ...x, vs_avg: vsAvg(x.avg) })),
  };
}

// บันทึกผลของคลิปหนึ่งวัน — ต้องเป็นเจ้าของเล่มถึงบันทึกได้ (กันคนอื่นมายุ่ง แบบเดียวกับมาราธอน)
app.post("/api/marathon/clip-result", rateLimit(200, M10), async (req, res) => {
  try {
    const b = req.body || {};
    const userId = String(b.user_id || ""), cycle = String(b.billing_cycle || ""), bpId = String(b.blueprint_id || "");
    const day = Number(b.day);
    if (!userId || !cycle || !bpId || !(day >= 1 && day <= 31)) return res.status(400).json({ ok: false, error: "MISSING" });
    const owns = await one(`SELECT 1 FROM blueprints WHERE blueprint_id=$1 AND user_id=$2 AND billing_cycle=$3`, [bpId, userId, cycle]);
    if (!owns) return res.status(403).json({ ok: false, error: "FORBIDDEN", message: "ไม่มีสิทธิ์แก้ไข" });
    // ⚠️ ต้องเช็ค null/"" ก่อนแปลงเป็นเลข — Number(null) = 0 ไม่ใช่ NaN (เคยทำให้ "ลบ" กลายเป็น "บันทึก 0 วิว")
    const num = (v) => {
      if (v === null || v === undefined || String(v).trim() === "") return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 999999999) : null;
    };
    const views = num(b.views);
    if (views === null) {   // ลบตัวเลขทิ้ง = ลบแถว (ลูกค้าเปลี่ยนใจ/กรอกผิด)
      await run(`DELETE FROM clip_results WHERE user_id=$1 AND billing_cycle=$2 AND day=$3`, [userId, cycle, day]);
      return res.json({ ok: true, cleared: true, day });
    }
    await run(`INSERT INTO clip_results (result_id,user_id,instagram_account,billing_cycle,day,views,likes,comments,saves,note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (user_id,billing_cycle,day) DO UPDATE SET views=EXCLUDED.views, likes=EXCLUDED.likes,
        comments=EXCLUDED.comments, saves=EXCLUDED.saves, note=EXCLUDED.note, updated_at=now()`,
      [uid("cr"), userId, String(b.instagram_account || ""), cycle, day, views,
       num(b.likes), num(b.comments), num(b.saves), String(b.note || "").slice(0, 300) || null]);
    res.json({ ok: true, day, views });
  } catch (e) { res.status(400).json({ ok: false, error: "SAVE_FAILED", message: e.message }); }
});

// 🔍 แอดมิน: "ตอนเขียนแผนเดือนนี้ AI รู้อะไรเกี่ยวกับลูกค้าคนนี้บ้าง"
// ไว้ตรวจย้อนหลังเวลาลูกค้าถามว่าทำไมแผนออกมาแบบนี้ — โดยเฉพาะว่าผลจริงเดือนก่อนถูกใช้จริงไหม
app.get("/api/admin/prev-context", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const email = String(req.query.email || ""), cycle = String(req.query.billing_cycle || "");
  if (!email || !cycle) return res.status(400).json({ ok: false, error: "MISSING_QUERY", message: "ต้องมี email + billing_cycle" });
  const ctx = await getPrevContext(email, cycle, String(req.query.channel || "") || undefined);
  res.json({ ok: true, context: ctx, learned_from_clips: !!ctx?.clip_learning });
});

// ผลของทุกคลิปในเดือนนี้ + สิ่งที่ระบบเรียนรู้จากช่องนี้
app.get("/api/marathon/clip-results", async (req, res) => {
  const userId = String(req.query.user_id || ""), cycle = String(req.query.billing_cycle || "");
  if (!userId || !cycle) return res.status(400).json({ ok: false, error: "MISSING_QUERY" });
  try {
    const rows = await q(`SELECT day, views, likes, comments, saves, note FROM clip_results WHERE user_id=$1 AND billing_cycle=$2 ORDER BY day`, [userId, cycle]);
    const bp = await one(`SELECT blueprint_json FROM blueprints WHERE user_id=$1 AND billing_cycle=$2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, [userId, cycle]);
    const results = {};
    for (const r of rows) results[r.day] = r;
    res.json({ ok: true, results, learning: learnFromClips(rows, calendarByDay(bp?.blueprint_json)) });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// ---------- auth (OTP) ----------
async function sendOtp(email, code, l = "th") {
  return sendEmail(email,
    tr(l, `รหัสเข้าสู่ระบบ Babe House: ${code}`, `Your Babe House login code: ${code}`),
    wrap(tr(l, `รหัสเข้าสู่ระบบของคุณคือ`, `Your login code is`) + `<br><div style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</div>` + tr(l, `ใช้ได้ภายใน 10 นาที`, `Valid for 10 minutes`)));
}
app.post("/api/auth/request-otp", async (req, res) => {
  try {
    const email = normEmail(req.body?.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: "INVALID_EMAIL", message: "อีเมลไม่ถูกต้อง" });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await run(`INSERT INTO auth_otps (email,code,expires_at,attempts) VALUES ($1,$2,$3,0) ON CONFLICT (email) DO UPDATE SET code=EXCLUDED.code,expires_at=EXCLUDED.expires_at,attempts=0`, [email, code, Date.now() + 600000]);
    let sent = false; try { sent = await sendOtp(email, code, req.body?.lang === "en" ? "en" : "th"); } catch {}
    res.json({ ok: true, sent, dev_code: EMAIL_ENABLED ? undefined : code });
  } catch (err) { res.status(500).json({ ok: false, error: "REQUEST_OTP_FAILED", message: err.message }); }
});
// 🎮 เข้าเป็น "ลูกค้าตัวอย่าง" ได้ทันที — มีเฉพาะในสนามเด็กเล่นเท่านั้น
// ⛔ เว็บจริงเรียกไม่ได้เด็ดขาด เพราะเช็ค LOCAL_DB ก่อน
app.post("/api/dev/demo-login", async (req, res) => {
  if (process.env.LOCAL_DB !== "1") return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  const email = "demo@babehouse.test";
  const token = uid("sess");
  await run(`INSERT INTO auth_sessions (token,email,expires_at) VALUES ($1,$2,$3)`, [token, email, Date.now() + 30 * 24 * 3600 * 1000]);
  res.json({ ok: true, token, email });
});
app.post("/api/auth/verify-otp", async (req, res) => {
  try {
    const email = normEmail(req.body?.email), code = String(req.body?.code || "").trim();
    const row = await one(`SELECT * FROM auth_otps WHERE email=$1`, [email]);
    if (!row) return res.status(400).json({ ok: false, error: "NO_OTP", message: "ยังไม่ได้ขอรหัส" });
    if (row.attempts >= 5) return res.status(429).json({ ok: false, error: "TOO_MANY", message: "ลองผิดเกินกำหนด" });
    if (Number(row.expires_at) < Date.now()) return res.status(400).json({ ok: false, error: "OTP_EXPIRED", message: "รหัสหมดอายุ" });
    if (row.code !== code) { await run(`UPDATE auth_otps SET attempts=attempts+1 WHERE email=$1`, [email]); return res.status(400).json({ ok: false, error: "WRONG_CODE", message: "รหัสไม่ถูกต้อง" }); }
    await run(`DELETE FROM auth_otps WHERE email=$1`, [email]);
    const token = uid("sess");
    await run(`INSERT INTO auth_sessions (token,email,expires_at) VALUES ($1,$2,$3)`, [token, email, Date.now() + 30 * 24 * 3600 * 1000]);
    res.json({ ok: true, token, email });
  } catch (err) { res.status(500).json({ ok: false, error: "VERIFY_FAILED", message: err.message }); }
});
// จ่ายเงินเสร็จ = ออก session ให้อัตโนมัติ (order_id เป็น UUID จากการ checkout ของเขาเอง = พิสูจน์ตัวตน) → เปิดเล่มแรกได้เลยไม่ต้อง login
app.post("/api/auth/claim-order", async (req, res) => {
  const o = await getOrder(String(req.body?.order_id || ""));
  if (!o || !["paid", "mock_paid"].includes(o.payment_status) || !o.email) return res.status(403).json({ ok: false, error: "NOT_CLAIMABLE" });
  const email = normEmail(o.email);
  const token = uid("sess");
  await run(`INSERT INTO auth_sessions (token,email,expires_at) VALUES ($1,$2,$3)`, [token, email, Date.now() + 30 * 24 * 3600 * 1000]);
  res.json({ ok: true, token, email });
});
async function authEmail(req) {
  const a = String(req.headers.authorization || ""); const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return null;
  const row = await one(`SELECT email, expires_at FROM auth_sessions WHERE token=$1`, [token]);
  if (!row || Number(row.expires_at) < Date.now()) return null;
  return row.email;
}
// คีย์รวมช่อง: ตัด @ เว้นวรรค _ . - และตัวพิมพ์ ออก → "@babehouse_academy" = "babe house academy" = ช่องเดียวกัน
const chKey = (s) => String(s || "").toLowerCase().replace(/^@/, "").replace(/[\s._-]/g, "").trim() || "(ไม่ระบุ)";
async function getCustomerMonths(email, channel) {
  // dedupe ตาม (ช่อง + เดือน) — เอาเล่มล่าสุดของช่องนั้นในเดือนนั้น · หลายช่องเดือนเดียวกัน "ไม่ชนกันแล้ว" (แก้ bug เล่มหาย)
  const rows = await q(`SELECT b.blueprint_id,b.billing_cycle,b.created_at,b.user_id,b.blueprint_json,r.instagram_account,r.business_type,r.monthly_goal FROM blueprints b JOIN blueprint_requests r ON b.request_id=r.request_id WHERE lower(r.email)=lower($1) AND b.deleted_at IS NULL ORDER BY b.created_at ASC`, [email]);
  const byKey = new Map();
  for (const r of rows) {
    if (channel && chKey(r.instagram_account) !== chKey(channel)) continue;
    let metrics = null; try { metrics = (safeJson(r.blueprint_json) || {}).metrics || null; } catch {}
    const key = `${chKey(r.instagram_account)}|${r.billing_cycle}`;
    byKey.set(key, { blueprint_id: r.blueprint_id, billing_cycle: r.billing_cycle, created_at: r.created_at, user_id: r.user_id, instagram_account: r.instagram_account, business_type: r.business_type, monthly_goal: r.monthly_goal, metrics });
  }
  return [...byKey.values()];
}
// จัดกลุ่มเล่มตาม "ช่อง" → [{channel, months:[...], latest}]  (1 อีเมล ดูแลหลายช่อง)
// รวมช่องเดียวกันที่พิมพ์ต่างกัน (@/เว้นวรรค/ตัวพิมพ์) ให้เป็นโฟลเดอร์เดียว
async function getCustomerChannels(email) {
  const months = await getCustomerMonths(email);
  const byCh = new Map();
  for (const m of months) { const k = chKey(m.instagram_account); if (!byCh.has(k)) byCh.set(k, []); byCh.get(k).push(m); }
  return [...byCh.values()].map(list => {
    const display = list.find(x => String(x.instagram_account || "").startsWith("@"))?.instagram_account || list[list.length - 1].instagram_account || "(ไม่ระบุช่อง)";
    return { channel: display, months: list, latest: list[list.length - 1], count: list.length };
  });
}
app.get("/api/me/blueprints", async (req, res) => {
  const email = await authEmail(req); if (!email) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const months = await getCustomerMonths(email);
  const channels = await getCustomerChannels(email);
  // ออเดอร์ที่จ่ายแล้วแต่เล่มยังไม่เสร็จ (กำลังสร้าง/ติดขัด) — โชว์สถานะให้ลูกค้ารู้ว่ากำลังทำอยู่
  const pendRows = await q(`SELECT order_id, billing_cycle, created_at, COALESCE(generation_status,'pending') gs FROM blueprint_orders WHERE email=$1 AND payment_status IN ('paid','mock_paid') AND blueprint_id IS NULL AND COALESCE(tier,'') NOT LIKE 'Video%' AND COALESCE(tier,'') NOT LIKE 'Credits%' ORDER BY created_at DESC`, [normEmail(email)]);
  const pending = pendRows.map(r => ({ order_id: r.order_id, billing_cycle: r.billing_cycle, created_at: r.created_at, status: r.gs === "error" ? "error" : "generating" }));
  res.json({ ok: true, email, count: months.length, months, channels, pending });
});
// ===== เครดิต: สร้างสคริปต์เดี่ยว on-demand (งานสปอนเซอร์/คอนเทนต์ด่วน นอกแผน 30 วัน) =====
app.get("/api/me/credits", async (req, res) => {
  const email = await authEmail(req); if (!email) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const c = await one(`SELECT credits FROM customers WHERE lower(email)=lower($1)`, [email]);
  const channel = String(req.query.channel || "").trim(); // กรองประวัติให้ตรงช่อง (กันข้ามช่อง)
  const cycle = String(req.query.cycle || "").trim();     // + ตรงเล่มเดือนนั้น (ลูกค้ากลับมาดูเดือนไหนเห็นของเดือนนั้น)
  const params = [email]; let where = "";
  if (channel) { params.push(channel); where += ` AND regexp_replace(lower(channel),'[@\\s._-]','','g')=regexp_replace(lower($${params.length}),'[@\\s._-]','','g')`; }
  if (cycle) { params.push(cycle); where += ` AND cycle = $${params.length}`; }
  const scripts = await q(`SELECT id, channel, sponsor, brief, script_json, created_at FROM credit_scripts WHERE lower(email)=lower($1)${where} ORDER BY created_at DESC LIMIT 50`, params).catch(() => []);
  const items = await applyCreditOverrides(scripts.map(s => ({ id: s.id, channel: s.channel, sponsor: s.sponsor, brief: s.brief, script: safeJson(s.script_json), created_at: s.created_at }))); // ทับด้วยฉบับที่แก้/เจนใหม่
  res.json({ ok: true, credits: (c && c.credits) || 0, scripts: items });
});
app.post("/api/credits/generate-script", async (req, res) => {
  const email = await authEmail(req); if (!email) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const channel = String(req.body?.channel || "").trim();
  const cycle = String(req.body?.cycle || "").trim(); // เล่มเดือนที่สร้างสคริปต์นี้ (ผูกให้โชว์ในเล่มนั้น)
  const brief = String(req.body?.brief || "").trim().slice(0, 2000);
  const sponsor = String(req.body?.sponsor || "").trim().slice(0, 120);
  const briefFiles = (Array.isArray(req.body?.brief_files) ? req.body.brief_files : []).filter(f => typeof f === "string" && /^data:(application\/pdf|image\/)/.test(f)).slice(0, 3);
  if (!brief && !briefFiles.length) return res.status(400).json({ ok: false, error: "NO_BRIEF", message: "ใส่บรีฟงาน หรือแนบไฟล์บรีฟก่อนนะคะ" });
  const cust = await one(`SELECT credits FROM customers WHERE lower(email)=lower($1)`, [email]);
  if (!cust || (cust.credits || 0) < 1) return res.status(402).json({ ok: false, error: "NO_CREDITS", message: "เครดิตไม่พอ — ซื้อแพ็กเครดิตก่อนนะคะ 🩵" });
  // ดึงบทวิเคราะห์ + โปรไฟล์ของช่องนั้นมาเป็นแกน
  let bp;
  if (channel) bp = await one(`SELECT b.blueprint_json, r.raw_payload_json FROM blueprints b JOIN blueprint_requests r ON b.request_id=r.request_id WHERE lower(r.email)=lower($1) AND regexp_replace(lower(r.instagram_account),'[@\\s._-]','','g')=regexp_replace(lower($2),'[@\\s._-]','','g') AND b.deleted_at IS NULL ORDER BY b.created_at DESC LIMIT 1`, [email, channel]);
  if (!bp) bp = await one(`SELECT b.blueprint_json, r.raw_payload_json FROM blueprints b JOIN blueprint_requests r ON b.request_id=r.request_id WHERE lower(r.email)=lower($1) AND b.deleted_at IS NULL ORDER BY b.created_at DESC LIMIT 1`, [email]);
  const analysis = safeJson(bp?.blueprint_json) || {};
  let parsed; try { parsed = GenSchema.parse(normalizePayload(safeJson(bp?.raw_payload_json) || {})); } catch { parsed = { form_responses: {}, instagram_account: channel || "", meta_purchase: { tier: "", billing_cycle: "" } }; }
  // หักเครดิตแบบ atomic ก่อนเจน
  const ded = await run(`UPDATE customers SET credits=credits-1 WHERE lower(email)=lower($1) AND credits>=1`, [email]);
  if (ded.rowCount !== 1) return res.status(402).json({ ok: false, error: "NO_CREDITS", message: "เครดิตไม่พอค่ะ" });
  try {
    await acquireGen();
    const ref = String(req.body?.ref || "").trim().slice(0, 3000); // ตัวอย่างแนวที่ทำประจำ (สคริปต์/แคปชั่นเก่า) → เลียนสไตล์
    let result; try { result = await generateSingleScript(parsed, analysis, brief, { sponsor, ref, files: briefFiles, lang: req.body?.lang === "en" ? "en" : "th" }); } finally { releaseGen(); }
    const csId = uid("cs");
    await run(`INSERT INTO credit_scripts (id,email,channel,sponsor,brief,script_json,cycle) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [csId, normEmail(email), channel || parsed.instagram_account || "", sponsor || null, brief, JSON.stringify(result.script), cycle || null]).catch(() => {});
    if (result.usage) await run(`INSERT INTO ai_usage (id,kind,model,input_tokens,output_tokens,total_tokens) VALUES ($1,'credit_script',$2,$3,$4,$5)`, [uid("use"), result.model, result.usage.input || 0, result.usage.output || 0, result.usage.total || 0]).catch(() => {}); // เก็บ token ไว้ดูต้นทุนจริง
    const bal = await one(`SELECT credits FROM customers WHERE lower(email)=lower($1)`, [email]);
    res.json({ ok: true, id: csId, script: { ...result.script, _id: csId, _edited: false, _regen_used: false }, credits: (bal && bal.credits) || 0 });
  } catch (e) {
    await run(`UPDATE customers SET credits=credits+1 WHERE lower(email)=lower($1)`, [email]).catch(() => {}); // คืนเครดิตถ้าเจนพลาด
    console.error("gen-single", e.message);
    res.status(500).json({ ok: false, error: "GEN_FAILED", message: "สร้างไม่สำเร็จ คืนเครดิตให้แล้ว ลองใหม่นะคะ" });
  }
});
// ── แก้ไข/เจนใหม่ "ทีละสคริปต์" (เก็บลง script_overrides แบบ overlay — ไม่แตะต้นฉบับ AI) ──
// เจ้าของ: plan = เจ้าของ blueprint · credit = เจ้าของ credit_scripts
async function scriptOwner(scope, refId) {
  if (scope === "plan") {
    const r = await one(`SELECT b.blueprint_id, b.blueprint_json, rq.email, rq.raw_payload_json FROM blueprints b LEFT JOIN blueprint_requests rq ON b.request_id=rq.request_id WHERE b.blueprint_id=$1 AND b.deleted_at IS NULL`, [refId]);
    return r ? { email: r.email ? normEmail(r.email) : "", blueprint_json: r.blueprint_json, raw_payload_json: r.raw_payload_json } : null;
  }
  const r = await one(`SELECT email, channel, sponsor, brief, script_json FROM credit_scripts WHERE id=$1`, [refId]);
  return r ? { email: normEmail(r.email), credit: r } : null;
}
function baseScriptOf(scope, owner, day) {
  if (scope === "plan") { const bp = safeJson(owner.blueprint_json) || {}; return (bp.scripts || []).find(s => Number(s.d) === Number(day)) || null; }
  return safeJson(owner.credit.script_json) || null;
}
// merge overrides ทับ scripts ของแผน 30 วัน (ตอน serve) — สะท้อน edit/regen + ธง _edited/_regen_used
async function mergePlanOverrides(refId, scripts) {
  if (!Array.isArray(scripts) || !scripts.length) return scripts;
  const rows = await q(`SELECT day, ai_json, edited_json, regen_count FROM script_overrides WHERE scope='plan' AND ref_id=$1`, [refId]).catch(() => []);
  if (!rows.length) return scripts;
  const byDay = new Map(rows.map(r => [Number(r.day), r]));
  return scripts.map(s => {
    const ov = byDay.get(Number(s.d)); if (!ov) return s;
    const use = safeJson(ov.edited_json) || safeJson(ov.ai_json);
    const m = use ? { ...s, ...use, d: s.d, g: s.g } : { ...s };
    m._edited = !!ov.edited_json; m._regen_used = (ov.regen_count || 0) >= 1;
    return m;
  });
}
// merge overrides ให้ประวัติสคริปต์สปอนเซอร์ (แต่ละอันมี id ของตัวเอง)
async function applyCreditOverrides(items) {
  const ids = items.map(i => i.id).filter(Boolean); if (!ids.length) return items;
  const rows = await q(`SELECT ref_id, ai_json, edited_json, regen_count FROM script_overrides WHERE scope='credit' AND ref_id = ANY($1)`, [ids]).catch(() => []);
  const byId = new Map(rows.map(r => [r.ref_id, r]));
  return items.map(it => {
    const ov = byId.get(it.id); if (!ov || !it.script) return it;
    const use = safeJson(ov.edited_json) || safeJson(ov.ai_json);
    const script = use ? { ...it.script, ...use } : it.script;
    return { ...it, script: { ...script, _edited: !!ov.edited_json, _regen_used: (ov.regen_count || 0) >= 1 } };
  });
}
async function ownScriptOr403(req, res) { // คืน {email, scope, refId, day, owner} ถ้าผ่าน · ไม่งั้น null (ส่ง response แล้ว)
  const email = await authEmail(req); if (!email) { res.status(401).json({ ok: false, error: "UNAUTHORIZED" }); return null; }
  const scope = req.body?.scope === "credit" ? "credit" : "plan";
  const refId = String(req.body?.ref_id || "").trim();
  const day = scope === "plan" ? Math.max(1, Math.min(30, parseInt(req.body?.day, 10) || 0)) : 0;
  if (!refId || (scope === "plan" && !day)) { res.status(400).json({ ok: false, error: "BAD_INPUT" }); return null; }
  const owner = await scriptOwner(scope, refId);
  if (!owner) { res.status(404).json({ ok: false, error: "NOT_FOUND" }); return null; }
  if (owner.email && !isAdmin(req) && normEmail(email) !== owner.email) { res.status(403).json({ ok: false, error: "NOT_OWNER" }); return null; }
  return { email, scope, refId, day, owner };
}
// บันทึกสคริปต์ที่ลูกค้าแก้เอง (ฟรี ไม่จำกัด)
app.post("/api/script/save", async (req, res) => {
  const g = await ownScriptOr403(req, res); if (!g) return;
  const s = req.body?.script; if (!s || !Array.isArray(s.beats)) return res.status(400).json({ ok: false, error: "BAD_INPUT" });
  const clean = {
    title: String(s.title || "").slice(0, 200), g: ["Awareness", "Conversion", "Branding"].includes(s.g) ? s.g : undefined, d: s.d,
    beats: s.beats.slice(0, 8).map(b => ({ ts: String(b.ts || "").slice(0, 40), s: ["HOOK", "BODY", "CTA"].includes(b.s) ? b.s : "BODY", say: String(b.say || "").slice(0, 1500), ost: String(b.ost || "").slice(0, 200), vis: String(b.vis || "").slice(0, 300) })),
    cap: String(s.cap || "").slice(0, 2000), tip: String(s.tip || "").slice(0, 500),
    hooks: Array.isArray(s.hooks) ? s.hooks.slice(0, 3).map(h => String(h).slice(0, 300)) : undefined,
  };
  await run(`INSERT INTO script_overrides (scope,ref_id,day,edited_json,updated_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (scope,ref_id,day) DO UPDATE SET edited_json=$4, updated_at=now()`, [g.scope, g.refId, g.day, JSON.stringify(clean)]);
  res.json({ ok: true });
});
// คืนค่าต้นฉบับ AI (ลบ edit) — คืน baseline (เวอร์ชัน regen ถ้ามี ไม่งั้นต้นฉบับ) ให้ client อัปเดตทันที
app.post("/api/script/revert", async (req, res) => {
  const g = await ownScriptOr403(req, res); if (!g) return;
  await run(`UPDATE script_overrides SET edited_json=NULL, updated_at=now() WHERE scope=$1 AND ref_id=$2 AND day=$3`, [g.scope, g.refId, g.day]);
  const ov = await one(`SELECT ai_json, regen_count FROM script_overrides WHERE scope=$1 AND ref_id=$2 AND day=$3`, [g.scope, g.refId, g.day]);
  let script = (ov && safeJson(ov.ai_json)) || baseScriptOf(g.scope, g.owner, g.day);
  if (script) script = { ...script, _edited: false, _regen_used: (ov?.regen_count || 0) >= 1 };
  res.json({ ok: true, script });
});
// เจนใหม่ทีละสคริปต์ (ฟรี 1 ครั้ง/สคริปต์)
app.post("/api/script/regenerate", async (req, res) => {
  const g = await ownScriptOr403(req, res); if (!g) return;
  const cur = await one(`SELECT regen_count FROM script_overrides WHERE scope=$1 AND ref_id=$2 AND day=$3`, [g.scope, g.refId, g.day]);
  if ((cur?.regen_count || 0) >= 1) return res.status(409).json({ ok: false, error: "REGEN_USED", message: "เจนใหม่ฟรีได้ 1 ครั้ง/สคริปต์ (ใช้ไปแล้ว)" });
  const lang = req.body?.lang === "en" ? "en" : "th";
  const note = String(req.body?.note || "").trim().slice(0, 500); // สิ่งที่ลูกค้าอยากปรับในรอบเจนใหม่ (ไม่บังคับ)
  let parsed, analysis = {}, brief = "", sponsor = "";
  if (g.scope === "plan") {
    analysis = safeJson(g.owner.blueprint_json) || {};
    try { parsed = GenSchema.parse(normalizePayload(safeJson(g.owner.raw_payload_json) || {})); } catch { parsed = { form_responses: {}, instagram_account: analysis.instagram_account || "", meta_purchase: { tier: "", billing_cycle: "" } }; }
    const cal = (analysis.calendar || []).find(c => Number(c.d) === Number(g.day)) || {};
    brief = `หัวข้อวันที่ ${g.day} ในแผน 30 วัน: "${cal.t || ""}"\nแนวฮุกเดิม: ${cal.h || "-"}\nฟอร์แมต: ${cal.f || "-"}\nเป้าหมายคอนเทนต์: ${cal.g || "Awareness"}\n👉 เขียนสคริปต์ใหม่สำหรับ "หัวข้อเดิมนี้" มุมเล่าใหม่ให้สดกว่าเดิม ไม่ซ้ำของเก่า แต่ยังตรงหัวข้อและเข้ากับช่อง`;
  } else {
    const c = g.owner.credit;
    const bpRow = await one(`SELECT b.blueprint_json, r.raw_payload_json FROM blueprints b JOIN blueprint_requests r ON b.request_id=r.request_id WHERE lower(r.email)=lower($1) AND b.deleted_at IS NULL ORDER BY b.created_at DESC LIMIT 1`, [g.email]);
    analysis = safeJson(bpRow?.blueprint_json) || {};
    try { parsed = GenSchema.parse(normalizePayload(safeJson(bpRow?.raw_payload_json) || {})); } catch { parsed = { form_responses: {}, instagram_account: c.channel || "", meta_purchase: { tier: "", billing_cycle: "" } }; }
    brief = String(c.brief || ""); sponsor = c.sponsor || "";
  }
  if (note) brief += `\n\n🙋 สิ่งที่เจ้าของช่องอยากปรับในรอบเจนใหม่นี้ (สำคัญมาก — ต้องทำตามให้ชัด): ${note}`;
  try {
    await acquireGen();
    let result; try { result = await generateSingleScript(parsed, analysis, brief, { sponsor, lang }); } finally { releaseGen(); }
    let ns = result.script;
    if (g.scope === "plan") { const cal = (analysis.calendar || []).find(c => Number(c.d) === Number(g.day)) || {}; ns = { ...ns, d: Number(g.day), g: cal.g || ns.g }; }
    await run(`INSERT INTO script_overrides (scope,ref_id,day,ai_json,edited_json,regen_count,updated_at) VALUES ($1,$2,$3,$4,NULL,1,now()) ON CONFLICT (scope,ref_id,day) DO UPDATE SET ai_json=$4, edited_json=NULL, regen_count=script_overrides.regen_count+1, updated_at=now()`, [g.scope, g.refId, g.day, JSON.stringify(ns)]);
    if (result.usage) await run(`INSERT INTO ai_usage (id,kind,model,input_tokens,output_tokens,total_tokens) VALUES ($1,'regen_script',$2,$3,$4,$5)`, [uid("use"), result.model, result.usage.input || 0, result.usage.output || 0, result.usage.total || 0]).catch(() => {});
    res.json({ ok: true, script: { ...ns, _edited: false, _regen_used: true } });
  } catch (e) { console.error("regen", e.message); res.status(500).json({ ok: false, error: "GEN_FAILED", message: "เจนใหม่ไม่สำเร็จ ลองใหม่นะคะ" }); }
});
// ซื้อแพ็กเครดิต — สร้างออเดอร์ + ไป Stripe (จ่ายเสร็จ markOrderPaid เติมเครดิตให้)
const CREDIT_PACKS = { "1": [1, 5000], "10": [10, 45000], "30": [30, 120000] }; // [จำนวนเครดิต, satang]
app.post("/api/credits/checkout", async (req, res) => {
  const email = await authEmail(req); if (!email) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const p = CREDIT_PACKS[String(req.body?.pack || "")]; if (!p) return res.status(400).json({ ok: false, error: "BAD_PACK" });
  const [n, satang] = p;
  const returnPath = (String(req.body?.return_path || "/account").match(/^\/[\w\-/?=&.%]*$/) ? req.body.return_path : "/account").slice(0, 300);
  const orderId = uid("ord");
  await upsertCustomer(email, "");
  await run(`INSERT INTO blueprint_orders (order_id,user_id,instagram_account,email,tier,billing_cycle,payment_status,order_payload_json,provider,final_amount_satang,checkout_url) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10)`,
    [orderId, "credits_" + Date.now(), "", normEmail(email), "Credits_" + n, currentBillingCycle(), JSON.stringify({ credit_pack: n, email: normEmail(email) }), PROVIDER, satang, `/account`]);
  try {
    if (PROVIDER === "stripe") {
      if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ ok: false, error: "PAYMENT_UNAVAILABLE", message: "ระบบชำระเงินยังไม่พร้อมค่ะ" });
      const origin = req.headers.origin || `${req.protocol}://${req.get("host")}`;
      const sep = returnPath.includes("?") ? "&" : "?";
      const s = await createStripeCheckout({ orderId, payload: {}, origin, amountSatang: satang, productName: `Babe House เครดิต ${n} สคริปต์`, successPath: `${returnPath}${sep}topup=ok` });
      await run(`UPDATE blueprint_orders SET provider_session_id=$1 WHERE order_id=$2`, [s.provider_session_id, orderId]);
      return res.json({ ok: true, redirect_url: s.checkout_url, external: true });
    }
    await markOrderPaid(orderId, "mock", "mock_paid"); // mock: เติมเลย
    res.json({ ok: true, redirect_url: returnPath });
  } catch (err) { console.error("credits/checkout", err); res.status(500).json({ ok: false, error: "CHECKOUT_FAILED", message: err.message }); }
});
app.post("/api/admin/grant-credits", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const email = normEmail(req.body?.email); const n = Math.max(1, parseInt(req.body?.amount, 10) || 0);
  if (!email || !n) return res.status(400).json({ ok: false, error: "INVALID" });
  await upsertCustomer(email, "");
  await run(`UPDATE customers SET credits=COALESCE(credits,0)+$1 WHERE lower(email)=lower($2)`, [n, email]);
  const c = await one(`SELECT credits FROM customers WHERE lower(email)=lower($1)`, [email]);
  res.json({ ok: true, email, credits: (c && c.credits) || 0 });
});
// ลูกค้าลบเล่มของตัวเอง (soft-delete — ซ่อนจากบัญชี แต่ admin กู้คืนได้ ไม่หายถาวร)
app.post("/api/me/delete-book", async (req, res) => {
  const email = await authEmail(req); if (!email) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const bpId = String(req.body?.blueprint_id || ""); if (!bpId) return res.status(400).json({ ok: false, error: "MISSING" });
  const row = await one(`SELECT b.blueprint_id, r.email AS owner_email FROM blueprints b JOIN blueprint_requests r ON b.request_id=r.request_id WHERE b.blueprint_id=$1`, [bpId]);
  if (!row) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  if (normEmail(row.owner_email) !== normEmail(email)) return res.status(403).json({ ok: false, error: "NOT_OWNER" }); // ลบได้เฉพาะเล่มตัวเอง
  await run(`UPDATE blueprints SET deleted_at=now() WHERE blueprint_id=$1`, [bpId]);
  res.json({ ok: true, restorable_days: RESTORE_DAYS });
});
// 🗑️➡️ ลูกค้ากู้เล่มตัวเองได้ภายใน 30 วัน — ไม่ต้องรอทักแอดมิน (เจอเคสจริง 2 ส.ค.)
const RESTORE_DAYS = 30;
app.get("/api/me/deleted-books", async (req, res) => {
  const email = await authEmail(req); if (!email) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const rows = await q(`SELECT b.blueprint_id, b.billing_cycle, b.deleted_at, r.instagram_account
    FROM blueprints b JOIN blueprint_requests r ON b.request_id=r.request_id
    WHERE lower(r.email)=lower($1) AND b.deleted_at IS NOT NULL
      AND b.deleted_at > now() - interval '${RESTORE_DAYS} days'
    ORDER BY b.deleted_at DESC`, [email]);
  res.json({ ok: true, restorable_days: RESTORE_DAYS, books: rows.map(b => ({ ...b,
    days_left: Math.max(0, RESTORE_DAYS - Math.floor((Date.now() - new Date(b.deleted_at).getTime()) / 86400000)) })) });
});
app.post("/api/me/restore-book", async (req, res) => {
  const email = await authEmail(req); if (!email) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const bpId = String(req.body?.blueprint_id || ""); if (!bpId) return res.status(400).json({ ok: false, error: "MISSING" });
  const row = await one(`SELECT b.blueprint_id, b.deleted_at, r.email AS owner_email FROM blueprints b
    JOIN blueprint_requests r ON b.request_id=r.request_id WHERE b.blueprint_id=$1`, [bpId]);
  if (!row) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  if (normEmail(row.owner_email) !== normEmail(email)) return res.status(403).json({ ok: false, error: "NOT_OWNER" });
  if (!row.deleted_at) return res.json({ ok: true, already_active: true });
  const days = (Date.now() - new Date(row.deleted_at).getTime()) / 86400000;
  if (days > RESTORE_DAYS) return res.status(410).json({ ok: false, error: "TOO_OLD",
    message: `เล่มนี้ลบไปเกิน ${RESTORE_DAYS} วันแล้วค่ะ ทักครูพี่คิมมาได้เลยนะคะ เดี๋ยวช่วยดูให้` });
  await run(`UPDATE blueprints SET deleted_at=NULL WHERE blueprint_id=$1`, [bpId]);
  res.json({ ok: true, restored: bpId });
});
// โปรไฟล์เดือนล่าสุด (สำหรับเดือน 2+ ไม่ต้องกรอกซ้ำ) — เอาข้อมูลเดิมมาใช้ ลูกค้าแค่ใส่รูป Insight เดือนใหม่
app.get("/api/me/last-profile", async (req, res) => {
  const email = await authEmail(req); if (!email) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const channel = String(req.query.channel || "").trim();
  const params = [email]; let chFilter = "";
  if (channel) { params.push(channel); chFilter = ` AND regexp_replace(lower(instagram_account),'[@\\s._-]','','g')=regexp_replace(lower($2),'[@\\s._-]','','g')`; } // โปรไฟล์ "ช่องนั้น" (normalize @/เว้นวรรค)
  const r = await one(`SELECT raw_payload_json, instagram_account FROM blueprint_requests WHERE lower(email)=lower($1)${chFilter} AND raw_payload_json IS NOT NULL ORDER BY created_at DESC LIMIT 1`, params);
  if (!r) return res.json({ ok: true, profile: null });
  const parsed = safeJson(r.raw_payload_json) || {};
  const fr = parsed.form_responses || {};
  delete fr._prev; // กันข้อมูลภายในหลุด
  res.json({ ok: true, profile: { instagram_account: parsed.instagram_account || r.instagram_account || "", form_responses: fr } });
});
app.get("/api/me/referral", async (req, res) => {
  const email = await authEmail(req); if (!email) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  await upsertCustomer(email, "");
  const code = await getOrCreateReferralCode(email);
  const c = await one(`SELECT referral_count FROM customers WHERE email=$1`, [email]);
  res.json({ ok: true, code, count: (c && c.referral_count) || 0, percent: REFERRAL_PERCENT, link: `${appBaseUrl()}/?ref=${encodeURIComponent(code)}` });
});
// สรุปงานสปอนเซอร์ต่อเดือน (จาก credit_scripts ที่แท็กสปอนเซอร์) — เอาไปใส่รายงานให้เอเจนซีโชว์ลูกค้า
async function sponsorSummary(email, channel) {
  const chF = channel ? ` AND regexp_replace(lower(channel),'[@\\s._-]','','g')=regexp_replace(lower($2),'[@\\s._-]','','g')` : "";
  const rows = await q(`SELECT to_char(created_at,'YYYY-MM') ym, sponsor sp, COUNT(*) n FROM credit_scripts WHERE lower(email)=lower($1) AND sponsor IS NOT NULL AND sponsor<>''${chF} GROUP BY ym, sponsor ORDER BY ym DESC`, channel ? [email, channel] : [email]).catch(() => []);
  const byM = new Map();
  for (const r of rows) { if (!byM.has(r.ym)) byM.set(r.ym, { ym: r.ym, total: 0, brands: [] }); const m = byM.get(r.ym); m.total += Number(r.n); m.brands.push({ name: r.sp, n: Number(r.n) }); }
  return [...byM.values()];
}
app.get("/api/me/growth-analysis", async (req, res) => {
  const email = await authEmail(req); if (!email) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const channel = String(req.query.channel || "").trim(); // เทียบการโตแยกตามช่อง
    const sponsors = await sponsorSummary(email, channel); // งานสปอนเซอร์ (สด ไม่ cache)
    const months = await getCustomerMonths(email, channel || undefined);
    if (months.length < 1) return res.json({ ok: true, analysis: null, count: 0, sponsors });
    const lang = req.query.lang === "en" ? "en" : "th";
    const signature = `g2:${channel}:${months.length}:${months[months.length - 1].blueprint_id}:${lang}`; // g2 = เวอร์ชันใหม่ (baseline ซื่อสัตย์ + กันแต่งเลข) → cache เก่าที่มั่วถูก bust
    const cached = await one(`SELECT signature, analysis_json, model FROM growth_analyses WHERE email=$1`, [email]);
    if (cached && cached.signature === signature) return res.json({ ok: true, analysis: politeKimBlueprint(safeJson(cached.analysis_json)), model: cached.model, count: months.length, sponsors, cached: true });
    // เดือนเดียว = ยังเทียบการโตไม่ได้ → ใช้ baseline ซื่อสัตย์ (ไม่เรียก AI กัน AI แต่งเดือนก่อนที่ไม่มีจริง)
    const { analysis, model } = months.length < 2
      ? { analysis: buildBaselineGrowth(months[months.length - 1], lang), model: "baseline" }
      : await generateGrowthAnalysis(months, lang);
    await run(`INSERT INTO growth_analyses (email,signature,analysis_json,model,created_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (email) DO UPDATE SET signature=EXCLUDED.signature,analysis_json=EXCLUDED.analysis_json,model=EXCLUDED.model,created_at=now()`, [email, signature, JSON.stringify(analysis), model]);
    res.json({ ok: true, analysis: politeKimBlueprint(analysis), model, count: months.length, sponsors });
  } catch (err) { console.error(err); res.status(500).json({ ok: false, error: "GROWTH_FAILED", message: err.message }); }
});

// ---------- รีวิว/เคสจริง (social proof) ----------
// ลูกค้าดูรีวิวของตัวเองในเล่ม (prefill ถ้าเคยเขียน)
app.get("/api/me/review", async (req, res) => {
  const email = await authEmail(req); if (!email) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const bpId = String(req.query.blueprint_id || "");
  if (!bpId) return res.json({ ok: true, review: null });
  const r = await one(`SELECT rating, text, display_name, role, allow_public, status FROM reviews WHERE email=$1 AND blueprint_id=$2`, [normEmail(email), bpId]);
  res.json({ ok: true, review: r || null });
});
// ลูกค้าส่ง/แก้รีวิว — ต้องเป็นเจ้าของเล่มนั้นจริง, แก้แล้วกลับไปสถานะ pending ให้แอดมินรีวิวใหม่
app.post("/api/me/review", async (req, res) => {
  const email = await authEmail(req); if (!email) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const b = req.body || {};
  const bpId = String(b.blueprint_id || "");
  const own = await one(`SELECT b.blueprint_id, b.billing_cycle FROM blueprints b JOIN blueprint_requests r ON b.request_id=r.request_id WHERE b.blueprint_id=$1 AND r.email=$2`, [bpId, normEmail(email)]);
  if (!own) return res.status(403).json({ ok: false, error: "NOT_OWNER", message: "ไม่พบเล่มนี้ในบัญชีของคุณ" });
  const rating = Math.max(1, Math.min(5, parseInt(b.rating, 10) || 0));
  if (!rating) return res.status(400).json({ ok: false, error: "NO_RATING", message: "ให้ดาวก่อนนะคะ" });
  const text = String(b.text || "").slice(0, 1000);
  const displayName = String(b.display_name || "").slice(0, 60);
  const role = String(b.role || "").slice(0, 80);
  const allowPublic = b.allow_public === false ? 0 : 1;
  await run(`INSERT INTO reviews (review_id,email,blueprint_id,billing_cycle,rating,text,display_name,role,allow_public,status,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',now(),now())
    ON CONFLICT (email,blueprint_id) DO UPDATE SET rating=EXCLUDED.rating,text=EXCLUDED.text,display_name=EXCLUDED.display_name,role=EXCLUDED.role,allow_public=EXCLUDED.allow_public,status='pending',updated_at=now()`,
    [uid("rev"), normEmail(email), bpId, own.billing_cycle, rating, text, displayName, role, allowPublic]);
  res.json({ ok: true });
});
// รีวิวสาธารณะสำหรับหน้าแรก (เฉพาะที่อนุมัติ + ยอมให้โชว์)
app.get("/api/reviews/public", async (req, res) => {
  const rows = await q(`SELECT display_name, role, rating, text, created_at FROM reviews WHERE status='approved' AND allow_public=1 AND text <> '' ORDER BY updated_at DESC LIMIT 24`);
  const count = Number((await one(`SELECT COUNT(*) c FROM reviews WHERE status='approved' AND allow_public=1`)).c);
  const avgRow = await one(`SELECT COALESCE(AVG(rating),0) a, COUNT(*) c FROM reviews WHERE status='approved'`);
  res.json({ ok: true, reviews: rows, count, avg: Math.round(Number(avgRow.a) * 10) / 10, total: Number(avgRow.c) });
});

// ---------- funnel tracking (ดูจุดที่คนหลุดก่อนจ่าย) ----------
const FUNNEL_STEPS = ["landing", "form_view", "form_submit", "checkout_view", "paid"];
app.post("/api/track", async (req, res) => {
  try {
    const step = String(req.body?.step || "");
    if (FUNNEL_STEPS.includes(step)) {
      await run(`INSERT INTO funnel_events (id,step,session_id,email,source) VALUES ($1,$2,$3,$4,$5)`,
        [uid("ev"), step, String(req.body?.session_id || "").slice(0, 80), (String(req.body?.email || "").slice(0, 120)) || null, (String(req.body?.source || "").slice(0, 60)) || null]);
    }
  } catch {}
  res.json({ ok: true });
});

// ปิงสถานะออนไลน์ (เปิดหน้าอยู่) — หน้าเว็บยิงทุก ~45 วิ → หลังบ้านนับ "ออนไลน์ตอนนี้"
app.post("/api/presence", async (req, res) => {
  try {
    const sid = String(req.body?.session_id || "").slice(0, 80);
    if (sid) {
      const email = req.body?.email ? normEmail(req.body.email).slice(0, 120) : null;
      await run(`INSERT INTO presence (session_id,email,last_seen) VALUES ($1,$2,$3) ON CONFLICT (session_id) DO UPDATE SET email=COALESCE(EXCLUDED.email,presence.email), last_seen=EXCLUDED.last_seen`, [sid, email, Date.now()]);
    }
  } catch {}
  res.json({ ok: true });
});
app.get("/api/admin/presence", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const cutoff = Date.now() - 3 * 60 * 1000; // ออนไลน์ = มีการใช้งานใน 3 นาทีล่าสุด
  const rows = await q(`SELECT email, session_id FROM presence WHERE last_seen > $1`, [cutoff]).catch(() => []);
  const students = [...new Set(rows.filter(r => r.email).map(r => r.email))];
  const visitors = rows.filter(r => !r.email).length;
  res.json({ ok: true, online_total: students.length + visitors, students_online: students.length, students, visitors });
});

// ---------- ฟีดแบกภายในจาก testers (ไม่ใช่รีวิวสาธารณะ) ----------
app.post("/api/me/feedback", async (req, res) => {
  const email = await authEmail(req); if (!email) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const clarity = Math.max(0, Math.min(5, parseInt(req.body?.clarity, 10) || 0));
  const message = String(req.body?.message || "").slice(0, 2000);
  if (!clarity && !message) return res.status(400).json({ ok: false, error: "EMPTY", message: "บอกอะไรเราหน่อยนะคะ" });
  await run(`INSERT INTO feedback (feedback_id,email,blueprint_id,clarity,message) VALUES ($1,$2,$3,$4,$5)`,
    [uid("fb"), normEmail(email), String(req.body?.blueprint_id || ""), clarity || null, message]);
  res.json({ ok: true });
});

// ---------- admin ----------
const isAdmin = (req) => !!process.env.ADMIN_KEY && (req.headers["x-admin-key"] || req.query.admin_key) === process.env.ADMIN_KEY;
// 🎬 รหัสของทีมตัดต่อ — แยกจากรหัสแอดมิน เพื่อให้ทีมเข้าได้เฉพาะคิวงานของตัวเอง
// คิมสั่ง 2 ส.ค.: "ทำหน้าแยกสำหรับทีม production เขาจะได้ไม่ต้องมายุ่งกับสินค้าอื่น"
// ⛔ ทีมต้องไม่เห็นยอดขาย/ลูกค้า Blueprint/สถิติ — ดูได้แค่งานที่ต้องตัดเท่านั้น
const isTeam = (req) => {
  const k = req.headers["x-team-key"] || req.query.team_key || req.headers["x-admin-key"] || req.query.admin_key;
  return isAdmin(req) || (!!process.env.TEAM_KEY && k === process.env.TEAM_KEY);
};
// funnel: นับจำนวน session ต่อขั้น (N วันล่าสุด) + % ที่ผ่านแต่ละขั้น
app.get("/api/admin/funnel", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  const rows = await q(`SELECT step, COUNT(DISTINCT COALESCE(NULLIF(session_id,''), id)) c FROM funnel_events WHERE created_at > now() - ($1 || ' days')::interval GROUP BY step`, [String(days)]);
  const map = Object.fromEntries(rows.map(r => [r.step, Number(r.c)]));
  const top = map.landing || map.form_view || 1;
  const steps = FUNNEL_STEPS.map((s, i) => {
    const n = map[s] || 0, prev = i > 0 ? (map[FUNNEL_STEPS[i - 1]] || 0) : n;
    return { step: s, count: n, of_top: top ? Math.round(n / top * 100) : 0, of_prev: prev ? Math.round(n / prev * 100) : 0 };
  });
  res.json({ ok: true, days, steps });
});
// ฟีดแบกภายในทั้งหมด
app.get("/api/admin/feedback", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const feedback = await q(`SELECT feedback_id, email, blueprint_id, clarity, message, created_at FROM feedback ORDER BY created_at DESC LIMIT 200`);
  const a = await one(`SELECT COALESCE(AVG(clarity),0) avg, COUNT(*) FILTER (WHERE clarity>0) rated, COUNT(*) total FROM feedback`);
  res.json({ ok: true, feedback, avg: Math.round(Number(a.avg) * 10) / 10, rated: Number(a.rated), total: Number(a.total) });
});
// รีวิวทั้งหมดสำหรับแอดมินอนุมัติ/ซ่อน
app.get("/api/admin/reviews", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const reviews = await q(`SELECT review_id, email, blueprint_id, billing_cycle, rating, text, display_name, role, allow_public, status, updated_at FROM reviews ORDER BY updated_at DESC`);
  const counts = await one(`SELECT COUNT(*) FILTER (WHERE status='pending') pending, COUNT(*) FILTER (WHERE status='approved') approved, COALESCE(AVG(rating),0) avg FROM reviews`);
  res.json({ ok: true, reviews, pending: Number(counts.pending), approved: Number(counts.approved), avg: Math.round(Number(counts.avg) * 10) / 10 });
});
app.post("/api/admin/reviews/status", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const id = String(req.body?.review_id || ""), status = String(req.body?.status || "");
  if (!["pending", "approved", "hidden"].includes(status)) return res.status(400).json({ ok: false, error: "BAD_STATUS" });
  await run(`UPDATE reviews SET status=$1, updated_at=now() WHERE review_id=$2`, [status, id]);
  res.json({ ok: true });
});
app.get("/api/admin/overview", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const customers = Number((await one(`SELECT COUNT(*) c FROM customers`)).c);
  const blueprints = Number((await one(`SELECT COUNT(*) c FROM blueprints`)).c);
  const paid = Number((await one(`SELECT COUNT(*) c FROM blueprint_orders WHERE payment_status IN ('paid','mock_paid')`)).c);
  const pendingGen = Number((await one(`SELECT COUNT(*) c FROM blueprint_orders WHERE payment_status IN ('paid','mock_paid') AND blueprint_id IS NULL AND COALESCE(tier,'') NOT LIKE 'Video%' AND COALESCE(tier,'') NOT LIKE 'Credits%' AND COALESCE(generation_status,'pending') IN ('pending','generating')`)).c);
  const errorGen = Number((await one(`SELECT COUNT(*) c FROM blueprint_orders WHERE payment_status IN ('paid','mock_paid') AND blueprint_id IS NULL AND COALESCE(tier,'') NOT LIKE 'Video%' AND COALESCE(tier,'') NOT LIKE 'Credits%' AND generation_status='error'`)).c);
  res.json({ ok: true, customers, blueprints, paid_orders: paid, pending_gen: pendingGen, error_gen: errorGen });
});
// สร้างก้อน backup (ตารางสำคัญ ตัดรูป base64 ออก) — ใช้ทั้งปุ่มดาวน์โหลด + auto-email รายสัปดาห์
async function buildBackupDump() {
  const TABLES = ["users", "customers", "blueprint_orders", "blueprint_requests", "blueprints", "marathon_progress", "growth_analyses", "promo_codes", "credit_scripts", "script_overrides", "video_audits", "reviews", "feedback", "trend_digest", "payment_events"]; // ข้าม auth/presence/logs ชั่วคราว
  const STRIP = { // ตัดคอลัมน์ base64 รูป Insight (input อัปใหม่ได้ · ข้อมูลจริงอยู่คอลัมน์แยก + blueprint ที่เจนแล้ว)
    blueprint_orders: ["order_payload_json"],
    blueprint_requests: ["raw_payload_json", "insight_images_json", "insight_screenshot_base64"],
  };
  const dump = { exported_at: new Date().toISOString(), db: "babe-house-v2", note: "raw Insight image payloads excluded to keep size sane", tables: {} };
  let rows = 0;
  for (const t of TABLES) { // ชื่อตาราง/คอลัมน์ hardcoded — ไม่มี injection
    const strip = STRIP[t];
    const data = strip
      ? await q(`SELECT (to_jsonb(x) ${strip.map(c => `- '${c}'`).join(" ")}) AS r FROM ${t} x`).then(rs => rs.map(r => r.r)).catch(() => [])
      : await q(`SELECT * FROM ${t}`).catch(() => []);
    dump.tables[t] = data; rows += data.length;
  }
  return { dump, rows };
}
// สำรองข้อมูลทั้งหมด (ดาวน์โหลด JSON) — แอดมินกดเก็บเองได้ทุกเมื่อ
app.get("/api/admin/backup", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const { dump } = await buildBackupDump();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="babehouse-backup.json"`);
  res.send(JSON.stringify(dump));
});
// ส่งอีเมลถึงลูกค้า (จาก Babe House ผ่าน Resend) — ใช้ตอนต้องแจ้ง/ขอโทษ/ดูแลลูกค้าเป็นรายคน
app.post("/api/admin/send-email", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const to = String(req.body?.to || "").trim(), subject = String(req.body?.subject || "").trim(), body = String(req.body?.body || "");
  if (!to || !subject || !body) return res.status(400).json({ ok: false, error: "MISSING" });
  try { const sent = await sendEmail(to, subject, wrap(body)); res.json({ ok: true, to, subject, sent }); }
  catch (e) { res.status(500).json({ ok: false, error: "SEND_FAILED", message: e.message }); }
});

// ===== Academy import (เว็บเก่า) — รับข้อมูลจาก DB dump เป็น batch · upsert ด้วย legacy_id = รันซ้ำได้ไม่ซ้ำแถว =====
const ACADEMY_COLS = {
  academy_users: ["legacy_id", "username", "name", "email", "phone", "role", "gender", "age", "province", "education", "is_active", "legacy_created"],
  academy_orders: ["legacy_id", "legacy_user_id", "user_name", "course_id", "course_name", "sub_total", "total", "qty", "status", "legacy_created"],
  academy_order_lines: ["legacy_id", "order_id", "course_id", "course_name", "price", "flag_sale", "price_sale"],
  academy_courses: ["legacy_id", "name", "course_code", "detail", "price", "price_sale", "flag_sale", "category", "instructor", "featured_image_url", "duration", "tag", "material", "is_active", "legacy_created"],
  academy_course_lines: ["legacy_id", "course_id", "name", "time", "url", "parent_line_id", "seq"],
  academy_tutors: ["legacy_id", "data_json"],
  academy_categories: ["legacy_id", "data_json"],
};
app.post("/api/admin/academy-import", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const table = String(req.body?.table || "");
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const cols = ACADEMY_COLS[table];
  if (!cols) return res.status(400).json({ ok: false, error: "BAD_TABLE" });
  if (!rows.length) return res.json({ ok: true, table, upserted: 0 });
  let upserted = 0;
  try {
    for (const r of rows) {
      if (!r || r.legacy_id == null || String(r.legacy_id) === "") continue;
      const vals = cols.map(c => { const v = r[c]; return v == null || v === "" ? null : String(v); });
      const sets = cols.slice(1).map(c => `${c}=EXCLUDED.${c}`).join(",");
      await run(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")}) ON CONFLICT (legacy_id) DO UPDATE SET ${sets}`, vals);
      upserted++;
    }
    res.json({ ok: true, table, upserted });
  } catch (e) { console.error("academy-import", e.message); res.status(500).json({ ok: false, error: "IMPORT_FAILED", message: e.message, upserted }); }
});
// แก้ "รายละเอียดคอร์ส" อย่างเดียว — ส่งฟิลด์ไหนมาก็แก้เฉพาะฟิลด์นั้น ไม่แตะที่เหลือ
// (คิมส่งรายละเอียดคอร์สมาทีละตัวจากเอกสาร ต้องแก้ได้โดยไม่กระทบราคา/รูป/ผู้สอน)
app.post("/api/admin/academy/course-detail", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const id = String(req.body?.course_id || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "NO_ID" });
  const FIELDS = ["detail", "duration", "material", "tag"];   // ⛔ ไม่เปิดให้แก้ราคา/ธงลดราคา/is_active ทางนี้
  const sets = [], vals = [];
  for (const f of FIELDS) if (typeof req.body?.[f] === "string") { vals.push(req.body[f]); sets.push(`${f}=$${vals.length}`); }
  if (!sets.length) return res.status(400).json({ ok: false, error: "NOTHING_TO_UPDATE", message: `ส่งได้: ${FIELDS.join(", ")}` });
  try {
    const before = await one(`SELECT legacy_id, name, detail FROM academy_courses WHERE legacy_id=$1`, [id]);
    if (!before) return res.status(404).json({ ok: false, error: "COURSE_NOT_FOUND" });
    vals.push(id);
    await run(`UPDATE academy_courses SET ${sets.join(",")} WHERE legacy_id=$${vals.length}`, vals);
    res.json({ ok: true, course_id: id, name: before.name, updated: sets.length, was_len: (before.detail || "").length });
  } catch (e) { res.status(500).json({ ok: false, error: "UPDATE_FAILED", message: e.message }); }
});
// แก้ลิงก์วิดีโอบทเรียน "ทีละบท" — ใช้ตอนเจอบทที่วิดีโอหาย (เจอจริง 2 ส.ค.: Creative Thinking บทที่ 8)
// ⛔ ห้ามใช้ academy-import แก้บทเดียว เพราะเป็น upsert ทั้งแถว → ฟิลด์ที่ไม่ได้ส่ง (time/parent_line_id) จะกลายเป็น null
app.post("/api/admin/academy/lesson-url", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const id = String(req.body?.lesson_id || "").trim(), url = String(req.body?.url || "").trim();
  if (!id || !/^https?:\/\//.test(url)) return res.status(400).json({ ok: false, error: "BAD_INPUT", message: "ต้องมี lesson_id และ url ที่ขึ้นต้นด้วย http" });
  try {
    const before = await one(`SELECT legacy_id, course_id, name, url FROM academy_course_lines WHERE legacy_id=$1`, [id]);
    if (!before) return res.status(404).json({ ok: false, error: "LESSON_NOT_FOUND" });
    await run(`UPDATE academy_course_lines SET url=$1 WHERE legacy_id=$2`, [url, id]);
    res.json({ ok: true, course_id: before.course_id, lesson: before.name, was: before.url, now: url });
  } catch (e) { res.status(500).json({ ok: false, error: "UPDATE_FAILED", message: e.message }); }
});
// แคตตาล็อกคอร์ส (อ่านอย่างเดียว) — สำหรับหน้าพรีวิว /academy (ยังไม่ลิงก์จากเมนู ลูกค้าไม่เจอ)
// ⚠️ ธง isActive ของระบบเก่ากลับด้าน: '0' = คอร์สที่แสดงบนเว็บจริง (ตรวจเทียบเว็บเก่า 21 คอร์สแล้ว) · '1' = ซ่อน/เวอร์ชันเก่า
// ⛔ ไม่ส่ง url วิดีโอบทเรียนออกไปเด็ดขาด (เป็นคอนเทนต์ที่ลูกค้าจ่ายเงิน) — url ใช้เฉพาะฝั่งแอดมิน/ระบบเรียนในเฟสถัดไป
// คอร์สที่เลิกขายแล้ว (คิมสั่งเอาออก 2026-08-01: Creative Thinking = คอร์สเก่ามาก ไม่อยากขายต่อ)
// ซ่อนที่โค้ดแทนการแก้ธง is_active ใน DB → ลูกค้าเก่าที่ซื้อไปแล้วยังเข้าเรียนได้ตามปกติ
// "15" = Creative Thinking (คอร์สเก่ามาก คิมไม่อยากขายต่อ)
// "40","41","42" = Sky Drawing ของครูมู (จบความร่วมมือ 2026-08-01 · ขายได้ 0 ออเดอร์)
// "21" = เทคนิคการตัดต่อ ADVANCE ของพี่ก้อง (คิมสั่งเลิกขาย 2026-08-02: คอร์สเก่าแล้ว)
//        ⚠️ คนละคอร์สกับ "57" ตัดต่อ Advance ของครูพี่คิม — ชื่อคล้ายกันจนสับสน เลยเหลือขายตัวเดียว
const HIDDEN_COURSES = new Set(["15", "21", "40", "41", "42"]);
app.get("/api/academy/catalog", async (req, res) => {
  try {
    const all = await q(`SELECT c.legacy_id, c.name, c.price, c.price_sale, c.flag_sale, c.category, c.instructor, c.featured_image_url, c.duration,
        (SELECT COUNT(*) FROM academy_course_lines l WHERE l.course_id = c.legacy_id) AS lessons
      FROM academy_courses c WHERE c.is_active = '0' ORDER BY c.legacy_id::int`);
    const courses = all.filter(c => !HIDDEN_COURSES.has(String(c.legacy_id)));
    const cats = await q(`SELECT legacy_id, data_json FROM academy_categories`);
    const tutors = await q(`SELECT legacy_id, data_json FROM academy_tutors`);
    const catMap = {}, tutMap = {};
    for (const r of cats) { const d = safeJson(r.data_json) || {}; if (d.isDelete !== "1") catMap[r.legacy_id] = d.name || ""; }
    for (const r of tutors) { const d = safeJson(r.data_json) || {}; tutMap[r.legacy_id] = { name: d.name || "", image: d.profileImage || "" }; }
    res.json({ ok: true, count: courses.length, courses: courses.map(c => ({
      id: c.legacy_id, name: c.name, price: Number(c.price || 0), price_sale: Number(c.price_sale || 0), flag_sale: c.flag_sale === "1",
      category: catMap[c.category] || "อื่นๆ", instructor: (tutMap[c.instructor] || {}).name || "", instructor_image: localImg((tutMap[c.instructor] || {}).image),
      image: localImg(c.featured_image_url), lessons: Number(c.lessons || 0),
    })) });
  } catch (e) { console.error("academy catalog", e.message); res.status(500).json({ ok: false, error: "CATALOG_FAILED" }); }
});
app.get("/api/academy/course/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (HIDDEN_COURSES.has(id)) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    const c = await one(`SELECT * FROM academy_courses WHERE legacy_id=$1 AND is_active='0'`, [id]);
    if (!c) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    const lines = await q(`SELECT legacy_id, name, time, seq FROM academy_course_lines WHERE course_id=$1 ORDER BY COALESCE(NULLIF(seq,'')::int, 999), legacy_id::int`, [id]); // ⛔ ไม่ select url
    const cat = safeJson((await one(`SELECT data_json FROM academy_categories WHERE legacy_id=$1`, [c.category]))?.data_json) || {};
    const tut = safeJson((await one(`SELECT data_json FROM academy_tutors WHERE legacy_id=$1`, [c.instructor]))?.data_json) || {};
    res.json({ ok: true, course: { id: c.legacy_id, name: c.name, detail: c.detail, price: Number(c.price || 0), price_sale: Number(c.price_sale || 0), flag_sale: c.flag_sale === "1",
        image: localImg(c.featured_image_url), duration: c.duration, category: cat.name || "", instructor: tut.name || "", instructor_image: localImg(tut.profileImage), instructor_detail: tut.detail || "" },
      showcase: await q(`SELECT kind, url, caption, student_name FROM academy_showcase WHERE course_id=$1 AND active ORDER BY seq, created_at`, [id]),
      lessons: lines.map(l => ({ name: l.name, time: l.time })) });
  } catch (e) { res.status(500).json({ ok: false, error: "COURSE_FAILED" }); }
});
// ===== ระบบเรียน (เฟส 2) — สิทธิ์ดูวิดีโอผูกกับ "ซื้อแล้วจริง" (ออเดอร์ Close ของอีเมลนั้น) · แอดมินดูได้ทุกคอร์ส (พรีวิว) =====
async function academyOwnedCourseIds(email) {
  // อีเมลลูกค้า → user เก่า (อาจหลายบัญชี) → ออเดอร์ Close → คอร์สที่ซื้อ (จาก order.course_id + order_lines)
  const rows = await q(`
    SELECT DISTINCT x.course_id FROM (
      SELECT o.course_id FROM academy_orders o
        JOIN academy_users u ON u.legacy_id = o.legacy_user_id
        WHERE lower(u.email) = lower($1) AND o.status = 'Close' AND COALESCE(o.course_id,'') <> ''
      UNION
      SELECT l.course_id FROM academy_order_lines l
        JOIN academy_orders o ON o.legacy_id = l.order_id
        JOIN academy_users u ON u.legacy_id = o.legacy_user_id
        WHERE lower(u.email) = lower($1) AND o.status = 'Close' AND COALESCE(l.course_id,'') <> ''
      UNION
      -- 🎁 สิทธิ์ที่ทีมเปิดให้เพิ่ม (ลูกค้าจ่ายผ่านแอดมิน/LINE แต่ออเดอร์ในระบบเก่าค้างสถานะ Open)
      SELECT g.course_id FROM academy_grants g WHERE lower(g.email) = lower($1)
    ) x`, [email]);
  return rows.map(r => r.course_id);
}
// 🙋 ลูกค้าเก่าแจ้ง "ไม่เจอคอร์สที่เคยซื้อ" — เก็บคำขอ + เตือนทีมทางเมลทันที
// ทำแทนการไล่เทียบสลิปย้อนหลัง (คิมบอก 3 ส.ค.: ของเยอะมาก + ชื่อลูกค้าไม่ตรงกับสลิป เทียบไม่ไหวจริง)
app.post("/api/academy/claim", rateLimit(5, M10), async (req, res) => {
  const email = await authEmail(req);
  if (!email) return res.status(401).json({ ok: false, error: "LOGIN_REQUIRED", message: "เข้าสู่ระบบก่อนนะคะ" });
  const note = String(req.body?.note || "").trim().slice(0, 2000);
  try {
    const dup = await one(`SELECT claim_id FROM academy_claims WHERE lower(email)=lower($1) AND status='open'`, [email]);
    if (dup) return res.json({ ok: true, already: true, message: "เราได้รับเรื่องของคุณแล้วนะคะ ทีมกำลังตรวจสอบให้อยู่ค่ะ" });
    const id = uid("clm");
    await run(`INSERT INTO academy_claims (claim_id,email,note) VALUES ($1,lower($2),$3)`, [id, email, note || null]);
    // เตือนทีมทันที — ลูกค้าที่จ่ายเงินแล้วแต่เข้าเรียนไม่ได้ ต้องรีบที่สุด
    sendEmail(OPS_EMAIL, `🙋 ลูกค้าแจ้งไม่เจอคอร์สที่เคยซื้อ — ${email}`,
      wrap(`<b>${email}</b> แจ้งว่าเข้าระบบแล้วไม่เห็นคอร์สที่เคยซื้อค่ะ<br><br>
        <b>สิ่งที่ลูกค้าเล่ามา:</b><br>${(note || "(ไม่ได้เขียนเพิ่ม)").replace(/\n/g, "<br>")}<br><br>
        เปิดสิทธิ์ให้ได้ที่หน้าหลังบ้าน → หัวข้อ "🙋 ลูกค้าแจ้งไม่เจอคอร์ส"`)).catch(() => {});
    res.json({ ok: true, claim_id: id });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});
// ทีมดูรายการคำขอ + ประวัติสิทธิ์ที่เปิดให้
app.get("/api/admin/academy/claims", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const claims = await q(`SELECT * FROM academy_claims ORDER BY (status<>'open'), created_at DESC LIMIT 200`);
    // แนบออเดอร์ค้างของอีเมลนั้นมาให้ทีมดูประกอบการตัดสินใจ (ซื้ออะไรไว้ เมื่อไหร่ ยอดเท่าไหร่)
    const out = [];
    for (const c of claims) {
      const orders = await q(`SELECT o.legacy_id, o.status, o.total, o.legacy_created,
          COALESCE(NULLIF(o.course_id,'0'), (SELECT l.course_id FROM academy_order_lines l WHERE l.order_id=o.legacy_id LIMIT 1)) cid
        FROM academy_orders o JOIN academy_users u ON u.legacy_id=o.legacy_user_id
        WHERE lower(u.email)=lower($1) ORDER BY o.legacy_created DESC LIMIT 20`, [c.email]);
      const names = await q(`SELECT legacy_id, name FROM academy_courses`);
      const nmap = Object.fromEntries(names.map(n => [n.legacy_id, n.name]));
      out.push({ ...c, orders: orders.map(o => ({ ...o, course_name: nmap[o.cid] || (o.cid ? `คอร์ส ${o.cid}` : "(ไม่ระบุคอร์ส)") })) });
    }
    const grants = await q(`SELECT * FROM academy_grants ORDER BY created_at DESC LIMIT 100`);
    const courses = await q(`SELECT legacy_id id, name FROM academy_courses ORDER BY legacy_id::int`);
    res.json({ ok: true, claims: out, grants, courses });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});
// ทีมเปิดสิทธิ์เรียนให้ลูกค้า (ทีละคอร์ส) — ไม่แตะออเดอร์เก่า เก็บเป็นสิทธิ์เพิ่มแยกไว้
app.post("/api/admin/academy/grant", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const email = normEmail(req.body?.email || ""), courseId = String(req.body?.course_id || "").trim();
  if (!email || !courseId) return res.status(400).json({ ok: false, error: "MISSING", message: "ต้องมีอีเมลและคอร์ส" });
  try {
    await run(`INSERT INTO academy_grants (grant_id,email,course_id,granted_by,note) VALUES ($1,lower($2),$3,$4,$5)
      ON CONFLICT (lower(email), course_id) DO NOTHING`,
      [uid("gr"), email, courseId, String(req.body?.granted_by || "kim").slice(0, 40), String(req.body?.note || "").slice(0, 500)]);
    if (req.body?.claim_id) await run(`UPDATE academy_claims SET status='granted', handled_by=$2, handled_at=now() WHERE claim_id=$1`,
      [String(req.body.claim_id), String(req.body?.granted_by || "kim").slice(0, 40)]);
    res.json({ ok: true, email, course_id: courseId });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});
app.get("/api/academy/my-courses", async (req, res) => {
  try {
    const email = await authEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "LOGIN_REQUIRED" });
    const ids = await academyOwnedCourseIds(email);
    if (!ids.length) return res.json({ ok: true, courses: [] });
    const courses = await q(`SELECT c.legacy_id, c.name, c.featured_image_url, c.category,
        (SELECT COUNT(*) FROM academy_course_lines l WHERE l.course_id = c.legacy_id) AS lessons,
        (SELECT COUNT(*) FROM academy_progress p WHERE p.email = lower($2) AND p.course_id = c.legacy_id) AS done,
        (SELECT cert_id FROM academy_certificates ce WHERE lower(ce.email) = lower($2) AND ce.course_id = c.legacy_id LIMIT 1) AS cert_id
      FROM academy_courses c WHERE c.legacy_id = ANY($1)`, [ids, email]);
    res.json({ ok: true, courses: courses.map(c => ({ id: c.legacy_id, name: c.name, image: localImg(c.featured_image_url), lessons: Number(c.lessons || 0), done: Number(c.done || 0), cert_id: c.cert_id || null })) });
  } catch (e) { console.error("my-courses", e.message); res.status(500).json({ ok: false, error: "FAILED" }); }
});
app.get("/api/academy/learn/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const admin = isAdmin(req);
    const email = admin ? null : await authEmail(req);
    if (!admin && !email) return res.status(401).json({ ok: false, error: "LOGIN_REQUIRED", message: "กรุณาเข้าสู่ระบบก่อนนะคะ" });
    if (!admin) {
      const owned = await academyOwnedCourseIds(email);
      if (!owned.includes(id)) return res.status(403).json({ ok: false, error: "NOT_OWNED", message: "คุณยังไม่ได้ซื้อคอร์สนี้ค่ะ" });
    }
    const c = await one(`SELECT legacy_id, name, detail, duration, featured_image_url FROM academy_courses WHERE legacy_id=$1`, [id]);
    if (!c) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    const lines = await q(`SELECT legacy_id, name, time, url, seq FROM academy_course_lines WHERE course_id=$1 ORDER BY COALESCE(NULLIF(seq,'')::int, 999), legacy_id::int`, [id]);
    const doneRows = email ? await q(`SELECT lesson_id FROM academy_progress WHERE email=lower($1) AND course_id=$2`, [email, id]) : [];
    const doneSet = new Set(doneRows.map(r => r.lesson_id));
    const cert = email ? await one(`SELECT cert_id FROM academy_certificates WHERE lower(email)=lower($1) AND course_id=$2`, [email, id]) : null;
    // 🔒 บันทึกการเปิดคอร์ส — ใช้จับพฤติกรรมผิดปกติ (บัญชีเดียวเปิดจากหลาย IP = แชร์รหัส/ดูดคลิป)
    if (email) logVideoAccess(email, id, null, req).catch(() => {});
    res.json({ ok: true, course: { id: c.legacy_id, name: c.name, detail: c.detail, duration: c.duration }, cert_id: cert?.cert_id || null,
      watermark: email || "",   // ลายน้ำอีเมลผู้เรียนทับบนวิดีโอ — อัดจอไปก็ติดชื่อคนอัดไปด้วย
      lessons: lines.map(l => ({ id: l.legacy_id, name: l.name, time: l.time, url: l.url, done: doneSet.has(l.legacy_id) })) });
  } catch (e) { console.error("learn", e.message); res.status(500).json({ ok: false, error: "FAILED" }); }
});
// 🔒 ระบบกันดูดคลิป ชั้นที่ 1: บันทึกทุกครั้งที่เปิดคอร์ส + เตือนคิมเมื่อเจอพฤติกรรมแชร์บัญชี
// ⚠️ พูดตามตรง: เว็บไหนก็กันการ "อัดหน้าจอ" 100% ไม่ได้ (คลิปต้องเล่นให้คนดูเห็น = อัดได้เสมอ)
// สิ่งที่ทำได้จริงคือทำให้ "ดูดแล้วไม่คุ้ม/จับได้ว่าใครทำ" → ลายน้ำอีเมล + ล็อกการเข้าถึง + จับบัญชีที่แชร์กัน
const SHARE_ALERT_AT = 5;   // จำนวน IP ต่างกันใน 24 ชม. ที่ถือว่าผิดปกติ
async function logVideoAccess(email, courseId, lessonId, req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim().slice(0, 60);
  // นับ IP "ก่อน" บันทึกแถวนี้ เพื่อรู้ว่าการเปิดครั้งนี้เป็นตัวที่ทำให้ทะลุเกณฑ์พอดีหรือเปล่า
  // (ถ้านับหลังบันทึกแล้วเช็ก ==5 เฉยๆ จะยิงเมลซ้ำทุกครั้งที่เขาเปิดหน้าใหม่)
  let before = null;
  if (ip) before = await q(`SELECT DISTINCT ip FROM academy_video_access
    WHERE lower(email)=lower($1) AND created_at > now() - interval '24 hours' AND COALESCE(ip,'')<>''`, [email]);
  await run(`INSERT INTO academy_video_access (email, course_id, lesson_id, ip, ua) VALUES (lower($1),$2,$3,$4,$5)`,
    [email, courseId, lessonId, ip, String(req.headers["user-agent"] || "").slice(0, 200)]);
  if (!ip || !before) return;
  const known = before.map(r => r.ip);
  const isNewIp = !known.includes(ip);
  if (isNewIp && known.length + 1 === SHARE_ALERT_AT) {   // ยิงครั้งเดียวตอนแตะเกณฑ์พอดี
    sendEmail(OPS_EMAIL, "🔒 สงสัยมีการแชร์บัญชีเรียน",
      wrap(`บัญชี <b>${email}</b> เปิดคอร์สจาก ${SHARE_ALERT_AT} IP ที่ต่างกันภายใน 24 ชั่วโมง<br><br>อาจเป็นการแชร์รหัสให้คนอื่นเรียนฟรี หรือลูกค้าเปลี่ยนเน็ตบ่อยจริงๆ ก็ได้ค่ะ<br>ลองเช็กในหน้าแอดมิน → ความปลอดภัย ก่อนตัดสินใจนะคะ<br><br>${btn(appBaseUrl() + "/admin", "เปิดหน้าแอดมิน")}`)).catch(() => {});
  }
}
app.post("/api/academy/lesson-view", async (req, res) => {
  try {
    const email = await authEmail(req);
    if (!email) return res.json({ ok: true });
    await logVideoAccess(email, String(req.body?.course_id || ""), String(req.body?.lesson_id || ""), req);
    res.json({ ok: true });
  } catch { res.json({ ok: true }); }
});

// ===== ซื้อคอร์สผ่าน Stripe (เฟส 3) — ลูกค้าจ่ายเอง เรียนได้ทันที ไม่ต้องรอแอดมิน =====
async function finalizeAcademyPurchase(p) {
  if (!p || p.status === "paid") return;
  await run(`UPDATE academy_purchases SET status='paid', paid_at=now() WHERE purchase_id=$1 AND status<>'paid'`, [p.purchase_id]);
  // ให้ ownership ผ่านท่อเดิม: มี user เก่าอีเมลนี้ใช้เลย ไม่มีก็สร้างแถวใหม่ → แล้วบันทึกออเดอร์ Close
  let u = await one(`SELECT legacy_id FROM academy_users WHERE lower(email)=lower($1) LIMIT 1`, [p.email]);
  if (!u) { const nid = "nw_" + p.purchase_id.slice(-10); await run(`INSERT INTO academy_users (legacy_id, email, role, legacy_created) VALUES ($1, lower($2), 'student', now()::text) ON CONFLICT DO NOTHING`, [nid, p.email]); u = { legacy_id: nid }; }
  await run(`INSERT INTO academy_orders (legacy_id, legacy_user_id, user_name, course_id, course_name, total, qty, status, legacy_created)
    VALUES ($1,$2,$3,$4,$5,$6,'1','Close',now()::text) ON CONFLICT (legacy_id) DO NOTHING`,
    ["sp_" + p.purchase_id.slice(-12), u.legacy_id, p.email, p.course_id, p.course_name, String((p.amount_satang || 0) / 100), ]);
  console.log(`[academy] purchase paid: ${p.email} → course ${p.course_id}`);
}
app.post("/api/academy/buy", async (req, res) => {
  try {
    const email = await authEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "LOGIN_REQUIRED", message: "เข้าสู่ระบบก่อนซื้อคอร์สนะคะ" });
    const courseId = String(req.body?.course_id || "");
    if (HIDDEN_COURSES.has(courseId)) return res.status(404).json({ ok: false, error: "COURSE_NOT_FOUND", message: "คอร์สนี้ปิดการขายแล้วค่ะ" });
    const c = await one(`SELECT legacy_id, name, price, price_sale, flag_sale FROM academy_courses WHERE legacy_id=$1 AND is_active='0'`, [courseId]);
    if (!c) return res.status(404).json({ ok: false, error: "COURSE_NOT_FOUND" });
    const owned = await academyOwnedCourseIds(email);
    if (owned.includes(courseId)) return res.status(409).json({ ok: false, error: "ALREADY_OWNED", message: "คุณมีคอร์สนี้อยู่แล้วค่ะ เข้าเรียนได้เลย" });
    const baht = (c.flag_sale === "1" && Number(c.price_sale) > 0) ? Number(c.price_sale) : Number(c.price);
    if (!(baht > 0)) return res.status(400).json({ ok: false, error: "BAD_PRICE" });
    if (!String(process.env.STRIPE_SECRET_KEY || "").trim()) return res.status(503).json({ ok: false, error: "PAYMENT_NOT_CONFIGURED", message: "ระบบชำระเงินยังไม่พร้อม" });
    const purchaseId = uid("apay");
    const promo = await redeemPromo(String(req.body?.code || ""), email, Math.round(baht * 100));
    if (promo.error) return res.status(400).json({ ok: false, error: promo.error, message: promo.message });
    const amountSatang = promo.final;
    const origin = appBaseUrl();
    // โค้ดส่วนลด 100% → ข้าม Stripe ให้สิทธิ์เรียนเลย
    if (amountSatang <= 0) {
      await run(`INSERT INTO academy_purchases (purchase_id, email, course_id, course_name, amount_satang) VALUES ($1, lower($2), $3, $4, 0)`, [purchaseId, email, courseId, c.name]);
      await finalizeAcademyPurchase(await one(`SELECT * FROM academy_purchases WHERE purchase_id=$1`, [purchaseId]));
      return res.json({ ok: true, free: true, purchase_id: purchaseId, redirect_url: `/academy/paid?purchase_id=${encodeURIComponent(purchaseId)}` });
    }
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const s = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: (process.env.STRIPE_PAYMENT_METHODS || "card,promptpay").split(",").map(x => x.trim()).filter(Boolean),
      customer_email: email,
      line_items: [{ price_data: { currency: "thb", product_data: { name: `คอร์ส ${c.name} · Babe House Academy` }, unit_amount: amountSatang }, quantity: 1 }],
      success_url: `${origin}/academy/paid?purchase_id=${encodeURIComponent(purchaseId)}`,
      cancel_url: `${origin}/academy?payment=cancelled`,
      metadata: { academy_purchase_id: purchaseId, course_id: courseId },
    });
    await run(`INSERT INTO academy_purchases (purchase_id, email, course_id, course_name, amount_satang, provider_session_id) VALUES ($1, lower($2), $3, $4, $5, $6)`,
      [purchaseId, email, courseId, c.name, amountSatang, s.id]);
    res.json({ ok: true, checkout_url: s.url, purchase_id: purchaseId });
  } catch (e) { console.error("academy buy", e.message); res.status(500).json({ ok: false, error: "BUY_FAILED", message: e.message }); }
});
// เช็กสถานะ + self-finalize (กันเคส webhook หลุด — ถาม Stripe ตรงๆ)
app.get("/api/academy/purchase/:id", async (req, res) => {
  try {
    const p = await one(`SELECT * FROM academy_purchases WHERE purchase_id=$1`, [String(req.params.id || "")]);
    if (!p) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    if (p.status !== "paid" && p.provider_session_id && String(process.env.STRIPE_SECRET_KEY || "").trim()) {
      try {
        const { default: Stripe } = await import("stripe");
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const s = await stripe.checkout.sessions.retrieve(p.provider_session_id);
        if (s && s.payment_status === "paid") { await finalizeAcademyPurchase(p); p.status = "paid"; }
      } catch {}
    }
    res.json({ ok: true, status: p.status, course_id: p.course_id });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED" }); }
});
// ===== ประกาศนียบัตร (สาธารณะ อ่านได้ด้วย cert_id — มีแค่ชื่อ+คอร์ส ไม่มีข้อมูลอ่อนไหว) =====
app.get("/api/academy/certificate/:id", async (req, res) => {
  const c = await one(`SELECT cert_id, course_name, student_name, issued_at FROM academy_certificates WHERE cert_id=$1`, [String(req.params.id || "")]);
  if (!c) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  res.json({ ok: true, cert: c });
});
app.post("/api/academy/progress", async (req, res) => {
  try {
    const email = await authEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "LOGIN_REQUIRED" });
    const courseId = String(req.body?.course_id || ""), lessonId = String(req.body?.lesson_id || ""), done = req.body?.done !== false;
    if (!courseId || !lessonId) return res.status(400).json({ ok: false, error: "MISSING" });
    const owned = await academyOwnedCourseIds(email);
    if (!owned.includes(courseId)) return res.status(403).json({ ok: false, error: "NOT_OWNED" });
    if (done) await run(`INSERT INTO academy_progress (email, course_id, lesson_id) VALUES (lower($1),$2,$3) ON CONFLICT DO NOTHING`, [email, courseId, lessonId]);
    else await run(`DELETE FROM academy_progress WHERE email=lower($1) AND course_id=$2 AND lesson_id=$3`, [email, courseId, lessonId]);
    const total = await one(`SELECT COUNT(*) c FROM academy_course_lines WHERE course_id=$1`, [courseId]);
    const doneN = await one(`SELECT COUNT(*) c FROM academy_progress WHERE email=lower($1) AND course_id=$2`, [email, courseId]);
    const cert = await maybeIssueCertificate(email, courseId);
    res.json({ ok: true, done: Number(doneN.c), total: Number(total.c), cert_id: cert.cert_id, cert_blocked_by: cert.blocked_by });
  } catch (e) { console.error("progress", e.message); res.status(500).json({ ok: false, error: "FAILED" }); }
});
// ✉️ เมลแจ้งเมื่อได้ใบประกาศ — ⛔ ปิดไว้จนกว่าคิมจะอ่านร่างและอนุมัติ (ตั้ง CERT_EMAIL_ENABLED=1 เพื่อเปิด)
async function sendCertificateEmail(email, studentName, courseName, certId) {
  // ✅ คิมอนุมัติร่างแล้ว 2026-08-01 → เปิดใช้เป็นค่าเริ่มต้น (ตั้ง CERT_EMAIL_ENABLED=0 เพื่อปิดชั่วคราวได้)
  if (String(process.env.CERT_EMAIL_ENABLED || "1") === "0") { console.log(`[cert-email] ปิดอยู่ — จะส่งถึง ${email} เรื่อง ${courseName}`); return; }
  const url = `${appBaseUrl()}/academy/certificate/${encodeURIComponent(certId)}`;
  await sendEmail(email, `🎓 ยินดีด้วยค่ะ! ประกาศนียบัตรคอร์ส ${courseName} พร้อมแล้ว`, wrap(
    `สวัสดีค่ะ คุณ${studentName}<br><br>` +
    `คุณเรียนจบคอร์ส <b>${courseName}</b> ครบทุกบทและส่งการบ้านผ่านเรียบร้อยแล้ว ครูพี่คิมขอแสดงความยินดีด้วยจริงๆ ค่ะ 🎉<br><br>` +
    `${btn(url, "🎓 เปิดประกาศนียบัตรของฉัน")}<br><br>` +
    `ประกาศนียบัตรใบนี้เก็บอยู่ในบัญชีของคุณตลอด กลับมาเปิดหรือสั่งพิมพ์ใหม่ได้ทุกเมื่อ ไม่ต้องเก็บลิงก์นี้ไว้ก็ได้ค่ะ<br><br>` +
    `สิ่งที่อยากฝากไว้: ความรู้ที่เพิ่งเรียนจบจะอยู่กับเรานานที่สุดตอนที่ได้ <b>ลงมือใช้จริง</b> ลองหยิบไปทำงานจริงสักชิ้นในสัปดาห์นี้นะคะ<br><br>` +
    `แล้วเจอกันในคอร์สต่อไปค่ะ<br>ครูพี่คิม · Babe House Academy`
  ));
}

// ===== 🎓 ประกาศนียบัตร — ออกอัตโนมัติเมื่อ "เรียนครบทุกบท + ผ่านการบ้านที่บังคับครบ" =====
// เดิมแอดมินต้องแจกมือในแชทไลน์แล้วตามไม่ได้ว่าใครได้แล้วบ้าง ตอนนี้ระบบออกให้เองและลูกค้าโหลดซ้ำได้ตลอดในบัญชี
async function maybeIssueCertificate(email, courseId) {
  const ex = await one(`SELECT cert_id FROM academy_certificates WHERE lower(email)=lower($1) AND course_id=$2`, [email, courseId]);
  if (ex) return { cert_id: ex.cert_id, blocked_by: null };
  const total = Number((await one(`SELECT COUNT(*) c FROM academy_course_lines WHERE course_id=$1`, [courseId]))?.c || 0);
  const done = Number((await one(`SELECT COUNT(*) c FROM academy_progress WHERE email=lower($1) AND course_id=$2`, [email, courseId]))?.c || 0);
  if (!(total > 0 && done >= total)) return { cert_id: null, blocked_by: "lessons" };
  // การบ้านที่ตั้ง required=true ต้องมี submission ที่ผ่านครบทุกชิ้น (คอร์สที่ยังไม่ได้ตั้งการบ้าน = ผ่านอัตโนมัติ)
  const pending = Number((await one(`SELECT COUNT(*) c FROM academy_assignments a WHERE a.course_id=$1 AND a.required
      AND NOT EXISTS (SELECT 1 FROM academy_submissions s WHERE s.assignment_id=a.assignment_id AND lower(s.email)=lower($2) AND s.status='passed')`,
    [courseId, email]))?.c || 0);
  if (pending > 0) return { cert_id: null, blocked_by: "homework", homework_left: pending };
  const u = await one(`SELECT name, username FROM academy_users WHERE lower(email)=lower($1) AND COALESCE(name,'')<>'' LIMIT 1`, [email]);
  const student = (u && (u.name || u.username)) || email.split("@")[0];
  const cName = (await one(`SELECT name FROM academy_courses WHERE legacy_id=$1`, [courseId]))?.name || "";
  const certId = uid("cert");
  await run(`INSERT INTO academy_certificates (cert_id, email, course_id, course_name, student_name) VALUES ($1, lower($2), $3, $4, $5)`, [certId, email, courseId, cName, student]);
  console.log(`[academy] 🎓 cert issued: ${email} → ${cName}`);
  sendCertificateEmail(email, student, cName, certId).catch(e => console.error("cert email", e.message));
  return { cert_id: certId, blocked_by: null, just_issued: true };
}

// ===== 📝 การบ้าน — นักเรียนอัปคลิป/รูป · AI (สมองครูพี่คิม) ตรวจให้ทันที =====
// ส่งได้กี่ครั้งต่อชิ้น: ต้นทุนตรวจ ~฿1/ครั้ง เทียบค่าคอร์ส 3,745 ไม่ใช่ปัญหาเรื่องเงิน
// แต่จำกัดไว้เพราะ (1) กันคนยิงรัวจนระบบแน่น (2) ฟีดแบ็กที่ได้ไม่จำกัดจะไม่ถูกให้ค่า
const MAX_HW_TRIES = Number(process.env.MAX_HW_TRIES) || 5;
app.get("/api/academy/homework/:courseId", async (req, res) => {
  try {
    const email = await authEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "LOGIN_REQUIRED" });
    const courseId = String(req.params.courseId || "");
    const owned = await academyOwnedCourseIds(email);
    if (!owned.includes(courseId)) return res.status(403).json({ ok: false, error: "NOT_OWNED" });
    const asgs = await q(`SELECT assignment_id, title, brief, submit_type, required, seq FROM academy_assignments WHERE course_id=$1 ORDER BY seq, created_at`, [courseId]);
    // ⚠️ ไม่ select file_data (ไฟล์รูปใหญ่ — เคยทำหน้าแอดมินช้ามาแล้ว) ดึงเฉพาะตอนเปิดดูทีละชิ้น
    const subs = await q(`SELECT submission_id, assignment_id, status, score, ai_json, teacher_note, file_kind, created_at
      FROM academy_submissions WHERE lower(email)=lower($1) AND course_id=$2 ORDER BY created_at DESC`, [email, courseId]);
    const latest = {};
    // ai เป็น null ถ้ายังไม่มีผลตรวจ (safeJson คืน {} ทำให้หน้าเว็บโชว์กล่องผลตรวจว่างๆ)
    for (const s of subs) if (!latest[s.assignment_id]) latest[s.assignment_id] = { ...s, ai: s.ai_json ? safeJson(s.ai_json) : null, ai_json: undefined };
    res.json({ ok: true, assignments: asgs.map(a => ({ ...a, my: latest[a.assignment_id] || null })), tries: subs.length });
  } catch (e) { console.error("homework list", e.message); res.status(500).json({ ok: false, error: "FAILED" }); }
});
// ตัวจริงของการรับ+ตรวจการบ้าน — ใช้ร่วมกันทั้งเส้น JSON (รูปเล็ก) และเส้น multipart (คลิปใหญ่)
async function handleHomeworkSubmit(req, res, src = {}) {
  {
    const email = await authEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "LOGIN_REQUIRED" });
    const courseId = String(req.body?.course_id || ""), asgId = String(req.body?.assignment_id || "");
    const dataUrl = src.filePath ? "" : String(req.body?.file || "");
    if (!courseId || !asgId || (!dataUrl && !src.filePath)) return res.status(400).json({ ok: false, error: "MISSING", message: "กรุณาแนบไฟล์งานด้วยนะคะ" });
    const owned = await academyOwnedCourseIds(email);
    if (!owned.includes(courseId)) return res.status(403).json({ ok: false, error: "NOT_OWNED" });
    const a = await one(`SELECT * FROM academy_assignments WHERE assignment_id=$1 AND course_id=$2`, [asgId, courseId]);
    if (!a) return res.status(404).json({ ok: false, error: "ASSIGNMENT_NOT_FOUND" });
    // จำกัดจำนวนครั้งที่ส่งได้ต่อชิ้น — คุมต้นทุน AI และทำให้ฟีดแบ็กมีค่า (ผ่านแล้วไม่นับ ส่งซ้ำอวดผลงานได้)
    const tries = Number((await one(`SELECT COUNT(*) c FROM academy_submissions WHERE assignment_id=$1 AND lower(email)=lower($2)`, [asgId, email]))?.c || 0);
    const passed = await one(`SELECT 1 FROM academy_submissions WHERE assignment_id=$1 AND lower(email)=lower($2) AND status='passed' LIMIT 1`, [asgId, email]);
    if (!passed && tries >= MAX_HW_TRIES) {
      return res.status(429).json({ ok: false, error: "TOO_MANY_TRIES",
        message: `ส่งงานชิ้นนี้ครบ ${MAX_HW_TRIES} ครั้งแล้วค่ะ ทักครูพี่คิมมาได้เลย เดี๋ยวช่วยดูให้เป็นพิเศษนะคะ 🩵` });
    }
    const mime = src.mime || (dataUrl.match(/^data:([^;]+);/) || [])[1] || String(req.body?.mime || "");
    const isVideo = /^video\//.test(mime);
    if (a.submit_type === "image" && isVideo) return res.status(400).json({ ok: false, error: "WRONG_TYPE", message: "การบ้านชิ้นนี้ให้ส่งเป็นรูปภาพนะคะ" });
    if (a.submit_type === "video" && !isVideo) return res.status(400).json({ ok: false, error: "WRONG_TYPE", message: "การบ้านชิ้นนี้ให้ส่งเป็นคลิปวิดีโอนะคะ" });

    const subId = uid("sub");
    const cName = (await one(`SELECT name FROM academy_courses WHERE legacy_id=$1`, [courseId]))?.name || "";
    // เก็บเฉพาะรูป (ให้คิมเปิดดูงานจริงได้) · คลิปไม่เก็บ ใหญ่เกินไปและทำให้ DB อืด
    await run(`INSERT INTO academy_submissions (submission_id, assignment_id, course_id, email, file_kind, status, file_data, allow_marketing)
      VALUES ($1,$2,$3,lower($4),$5,'reviewing',$6,$7)`,
      [subId, asgId, courseId, email, isVideo ? "video" : "image", isVideo ? null : (dataUrl || null), String(req.body?.allow_marketing) === "true"]);

    let result = null, failed = false;
    try {
      const g = await gradeHomework({ dataUrl: dataUrl || undefined, filePath: src.filePath, mimeType: mime, courseName: cName, title: a.title, brief: a.brief, criteria: a.criteria });
      result = g.result;
      if (g.usage) await run(`INSERT INTO ai_usage (id,kind,model,input_tokens,output_tokens,total_tokens) VALUES ($1,'homework',$2,$3,$4,$5)`, [uid("use"), g.model, g.usage.input || 0, g.usage.output || 0, g.usage.total || 0]).catch(() => {});
    } catch (e) {
      console.error("[homework] grade failed", e.message);
      failed = true;
    }
    if (failed) {
      // 🛟 AI ล่ม = ห้ามตัดสินว่าตก (ลูกค้าจ่ายเงินมา) → ค้างไว้ให้ครูพี่คิมตรวจเอง แล้วเตือนทางเมล
      await run(`UPDATE academy_submissions SET status='reviewing', teacher_note=$2 WHERE submission_id=$1`, [subId, "ระบบตรวจอัตโนมัติขัดข้อง รอครูตรวจเอง"]);
      sendEmail(OPS_EMAIL, "📝 มีการบ้านรอตรวจมือ",
        wrap(`ระบบตรวจอัตโนมัติขัดข้อง มีงานค้างรอครูพี่คิมตรวจเองค่ะ<br><br>นักเรียน: <b>${email}</b><br>คอร์ส: ${cName}<br>การบ้าน: ${a.title}<br><br>${btn(appBaseUrl() + "/admin", "เปิดหน้าแอดมิน")}`)).catch(() => {});
      return res.json({ ok: true, status: "reviewing", message: "ได้รับงานแล้วค่ะ ระบบตรวจไม่ว่างพอดี ครูพี่คิมจะเข้ามาตรวจให้เองนะคะ" });
    }
    const status = result.passed ? "passed" : "revise";
    await run(`UPDATE academy_submissions SET status=$2, score=$3, ai_json=$4, reviewed_at=now() WHERE submission_id=$1`,
      [subId, status, result.score, JSON.stringify(result)]);
    const cert = result.passed ? await maybeIssueCertificate(email, courseId) : { cert_id: null };
    return res.json({ ok: true, status, result, cert_id: cert.cert_id, submission_id: subId });
  }
}

// เส้นเดิม: รูป/ไฟล์เล็กส่งมาเป็น JSON base64
app.post("/api/academy/homework/submit", async (req, res) => {
  try { await handleHomeworkSubmit(req, res); }
  catch (e) { console.error("homework submit", e.message); if (!res.headersSent) res.status(500).json({ ok: false, error: "FAILED", message: "ส่งงานไม่สำเร็จ ลองใหม่อีกครั้งนะคะ" }); }
});

// เส้นใหม่: คลิปใหญ่ถึง 200MB — multer เขียนลงดิสก์ทีละชิ้น ไม่โหลดเข้าแรมทั้งก้อน
// ⚠️ ใช้ multer เฉพาะเส้นนี้ ไม่แตะ express.json ของทั้งระบบ
const HW_MAX_MB = Number(process.env.HW_MAX_MB) || 200;
const hwUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => cb(null, `hwup_${Date.now()}_${Math.random().toString(36).slice(2)}${path.extname(file.originalname || "") || ".mp4"}`),
  }),
  limits: { fileSize: HW_MAX_MB * 1024 * 1024, files: 1 },
});
app.post("/api/academy/homework/submit-file", (req, res) => {
  hwUpload.single("file")(req, res, async (err) => {
    if (err) {
      const tooBig = err.code === "LIMIT_FILE_SIZE";
      return res.status(tooBig ? 413 : 400).json({ ok: false, error: tooBig ? "FILE_TOO_LARGE" : "UPLOAD_FAILED",
        message: tooBig ? `ไฟล์ใหญ่เกิน ${HW_MAX_MB}MB ค่ะ ลองบีบไฟล์หรือตัดให้สั้นลงนะคะ` : "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้งนะคะ" });
    }
    try {
      if (!req.file) return res.status(400).json({ ok: false, error: "MISSING", message: "กรุณาแนบไฟล์งานด้วยนะคะ" });
      await handleHomeworkSubmit(req, res, { filePath: req.file.path, mime: req.file.mimetype || "" });
    } catch (e) {
      console.error("homework upload", e.message);
      if (!res.headersSent) res.status(500).json({ ok: false, error: "FAILED", message: "ส่งงานไม่สำเร็จ ลองใหม่อีกครั้งนะคะ" });
    } finally { try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch {} }
  });
});
// ประกาศนียบัตรทั้งหมดของฉัน — กลับมาโหลดซ้ำได้ตลอด ไม่ต้องทักแอดมิน
app.get("/api/academy/my-certificates", async (req, res) => {
  try {
    const email = await authEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "LOGIN_REQUIRED" });
    const rows = await q(`SELECT cert_id, course_id, course_name, student_name, issued_at FROM academy_certificates WHERE lower(email)=lower($1) ORDER BY issued_at DESC`, [email]);
    res.json({ ok: true, certificates: rows });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED" }); }
});

// ===== 🎟️ WORKSHOP (คลาสสด) — ลูกค้าดูตาราง เห็นที่นั่งเรียลไทม์ จองและจ่ายเองได้ =====
// เดิมจองผ่านไลน์กับแอดมิน ทำให้เราไม่มีข้อมูลลูกค้า workshop เลย · ระบบนี้เก็บให้อัตโนมัติ
// ที่นั่งที่ถูกกันไว้ = จ่ายแล้ว + กำลังจ่ายที่ยังไม่หมดเวลา (กันคนกดจองพร้อมกันแล้วเกินโควตา)
const WS_HOLD_MIN = 20;
const SEATS_TAKEN = `(SELECT COALESCE(SUM(qty),0) FROM workshop_bookings b
  WHERE b.session_id = s.session_id AND (b.status='paid' OR (b.status='pending' AND b.created_at > now() - interval '${WS_HOLD_MIN} minutes')))`;

async function seatsLeft(sessionId) {
  const r = await one(`SELECT s.seats, ${SEATS_TAKEN} AS taken FROM workshop_sessions s WHERE s.session_id=$1`, [sessionId]);
  if (!r) return null;
  return { seats: Number(r.seats || 0), taken: Number(r.taken || 0), left: Math.max(0, Number(r.seats || 0) - Number(r.taken || 0)) };
}
app.get("/api/workshops", async (req, res) => {
  try {
    const ws = await q(`SELECT * FROM workshops WHERE active ORDER BY seq, created_at`);
    const sess = await q(`SELECT s.*, ${SEATS_TAKEN} AS taken FROM workshop_sessions s
      WHERE s.status='open' AND s.starts_at > now() ORDER BY s.starts_at`);
    const byWs = {};
    for (const s of sess) (byWs[s.workshop_id] ||= []).push({
      session_id: s.session_id, starts_at: s.starts_at, ends_at: s.ends_at, location: s.location,
      seats: Number(s.seats || 0), left: Math.max(0, Number(s.seats || 0) - Number(s.taken || 0)), price: s.price_override || null,
    });
    // ส่งคลิปรีวิวมาด้วย — คิมบอกว่ารีวิวเพื่อนๆ ทำให้นักเรียนตัดสินใจง่ายขึ้นมาก
    const shows = await q(`SELECT workshop_id, url, caption FROM workshop_showcase ORDER BY seq, showcase_id`);
    const revBy = {};
    for (const r of shows) (revBy[r.workshop_id] ||= []).push(r);
    res.json({ ok: true, workshops: ws.map(w => ({ ...w, sessions: byWs[w.workshop_id] || [], reviews: revBy[w.workshop_id] || [] })) });
  } catch (e) { console.error("workshops", e.message); res.status(500).json({ ok: false, error: "FAILED" }); }
});
// ⚠️ ต้องประกาศก่อน "/api/workshops/:id" ไม่งั้น Express จะจับ "my" เป็น id แล้วตอบ NOT_FOUND
// การจอง workshop ของฉัน + ไฟล์สรุปหลังเรียน (โหลดเองได้ ไม่ต้องทักแอดมิน)
app.get("/api/workshops/my", async (req, res) => {
  try {
    const email = await authEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "LOGIN_REQUIRED" });
    const rows = await q(`SELECT b.booking_id, b.qty, b.status, b.created_at, s.session_id, s.starts_at, s.location, s.summary_url, s.summary_note, w.name AS workshop_name, w.workshop_id
      FROM workshop_bookings b JOIN workshop_sessions s ON s.session_id=b.session_id JOIN workshops w ON w.workshop_id=b.workshop_id
      WHERE lower(b.email)=lower($1) AND b.status='paid' ORDER BY s.starts_at DESC`, [email]);
    res.json({ ok: true, bookings: rows });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED" }); }
});
app.get("/api/workshops/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const w = await one(`SELECT * FROM workshops WHERE workshop_id=$1 AND active`, [id]);
    if (!w) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    const sess = await q(`SELECT s.*, ${SEATS_TAKEN} AS taken FROM workshop_sessions s
      WHERE s.workshop_id=$1 AND s.status='open' AND s.starts_at > now() ORDER BY s.starts_at`, [id]);
    const showcase = await q(`SELECT url, caption FROM workshop_showcase WHERE workshop_id=$1 AND active ORDER BY seq`, [id]);
    res.json({ ok: true, workshop: w, showcase, sessions: sess.map(s => ({
      session_id: s.session_id, starts_at: s.starts_at, ends_at: s.ends_at, location: s.location, note: s.note,
      seats: Number(s.seats || 0), left: Math.max(0, Number(s.seats || 0) - Number(s.taken || 0)), price: s.price_override || w.price,
    })) });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED" }); }
});
app.post("/api/workshops/book", async (req, res) => {
  try {
    const email = await authEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "LOGIN_REQUIRED", message: "เข้าสู่ระบบก่อนจองนะคะ" });
    const sessionId = String(req.body?.session_id || "");
    const qty = Math.max(1, Math.min(10, Number(req.body?.qty) || 1));
    const name = String(req.body?.name || "").trim(), phone = String(req.body?.phone || "").trim();
    // ข้อมูลหน้างานที่แอดมินต้องใช้จริง (เดิมต้องไล่ถามในไลน์ทีละคน)
    const food = String(req.body?.food_note || "").trim().slice(0, 300);
    const parking = req.body?.needs_parking === true;
    const note = String(req.body?.customer_note || "").trim().slice(0, 500);
    if (!sessionId || !name || !phone) return res.status(400).json({ ok: false, error: "MISSING", message: "กรอกชื่อและเบอร์โทรด้วยนะคะ" });
    const s = await one(`SELECT s.*, w.name AS ws_name, w.price AS ws_price FROM workshop_sessions s JOIN workshops w ON w.workshop_id=s.workshop_id WHERE s.session_id=$1`, [sessionId]);
    if (!s || s.status !== "open") return res.status(404).json({ ok: false, error: "SESSION_NOT_OPEN", message: "รอบนี้ปิดรับแล้วค่ะ" });
    if (new Date(s.starts_at) <= new Date()) return res.status(400).json({ ok: false, error: "PAST", message: "รอบนี้ผ่านไปแล้วค่ะ" });
    const avail = await seatsLeft(sessionId);
    if (!avail || avail.left < qty) return res.status(409).json({ ok: false, error: "SOLD_OUT", message: avail?.left ? `เหลือที่นั่งแค่ ${avail.left} ที่ค่ะ` : "รอบนี้เต็มแล้วค่ะ" });
    const unit = Number(s.price_override || s.ws_price || 0);
    if (!(unit > 0)) return res.status(400).json({ ok: false, error: "BAD_PRICE" });
    if (!String(process.env.STRIPE_SECRET_KEY || "").trim()) return res.status(503).json({ ok: false, error: "PAYMENT_NOT_CONFIGURED", message: "ระบบชำระเงินยังไม่พร้อม" });

    let amountSatang = Math.round(unit * 100) * qty;
    const promo = await redeemPromo(String(req.body?.code || ""), email, amountSatang);
    if (promo.error) return res.status(400).json({ ok: false, error: promo.error, message: promo.message });
    amountSatang = promo.final;

    const bookingId = uid("wsb");
    const origin = appBaseUrl();
    // โค้ดส่วนลด 100% → ไม่ต้องผ่าน Stripe (ยอด 0 บาทสร้าง checkout ไม่ได้) บันทึกจองให้เลย
    if (amountSatang <= 0) {
      await run(`INSERT INTO workshop_bookings (booking_id, session_id, workshop_id, email, name, phone, qty, amount_satang, promo_code, food_note, needs_parking, customer_note)
        VALUES ($1,$2,$3,lower($4),$5,$6,$7,0,$8,$9,$10,$11)`, [bookingId, sessionId, s.workshop_id, email, name, phone, qty, promo.code || null, food, parking, note]);
      await finalizeWorkshopBooking(await one(`SELECT * FROM workshop_bookings WHERE booking_id=$1`, [bookingId]));
      return res.json({ ok: true, free: true, booking_id: bookingId, redirect_url: `/workshop/paid?booking_id=${encodeURIComponent(bookingId)}` });
    }
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const when = new Date(s.starts_at).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Bangkok" });
    const ck = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: (process.env.STRIPE_PAYMENT_METHODS || "card,promptpay").split(",").map(x => x.trim()).filter(Boolean),
      customer_email: email,
      line_items: [{ price_data: { currency: "thb", product_data: { name: `${s.ws_name} · รอบ ${when}` }, unit_amount: amountSatang }, quantity: 1 }],
      success_url: `${origin}/workshop/paid?booking_id=${encodeURIComponent(bookingId)}`,
      cancel_url: `${origin}/workshop/${encodeURIComponent(s.workshop_id)}?payment=cancelled`,
      metadata: { workshop_booking_id: bookingId, session_id: sessionId },
    });
    await run(`INSERT INTO workshop_bookings (booking_id, session_id, workshop_id, email, name, phone, qty, amount_satang, provider_session_id, promo_code, food_note, needs_parking, customer_note)
      VALUES ($1,$2,$3,lower($4),$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [bookingId, sessionId, s.workshop_id, email, name, phone, qty, amountSatang, ck.id, promo.code || null, food, parking, note]);
    res.json({ ok: true, checkout_url: ck.url, booking_id: bookingId });
  } catch (e) { console.error("workshop book", e.message); res.status(500).json({ ok: false, error: "BOOK_FAILED", message: e.message }); }
});
async function finalizeWorkshopBooking(b) {
  if (!b || b.status === "paid") return;
  await run(`UPDATE workshop_bookings SET status='paid', paid_at=now() WHERE booking_id=$1 AND status<>'paid'`, [b.booking_id]);
  const s = await one(`SELECT s.*, w.name AS ws_name FROM workshop_sessions s JOIN workshops w ON w.workshop_id=s.workshop_id WHERE s.session_id=$1`, [b.session_id]);
  console.log(`[workshop] booked: ${b.email} → ${s?.ws_name} (${b.qty} ที่)`);
  const left = await seatsLeft(b.session_id);
  const when = s ? new Date(s.starts_at).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Bangkok" }) : "";
  sendEmail(b.email, `✅ ยืนยันการจอง ${s?.ws_name || "workshop"} แล้วค่ะ`, wrap(
    `สวัสดีค่ะ คุณ${b.name}<br><br>ได้รับการจองเรียบร้อยแล้วค่ะ 🎉<br><br>` +
    `<b>${s?.ws_name || ""}</b><br>📅 ${when}<br>📍 ${s?.location || "แจ้งสถานที่อีกครั้งก่อนวันเรียน"}<br>👥 จำนวน ${b.qty} ที่<br><br>` +
    (s?.note ? `${s.note}<br><br>` : "") +
    `หลังเรียนจบ ไฟล์สรุปและเอกสารประกอบจะขึ้นในบัญชีของคุณให้ดาวน์โหลดได้เองค่ะ<br><br>${btn(appBaseUrl() + "/account", "ดูการจองของฉัน")}<br><br>แล้วเจอกันในคลาสนะคะ<br>ครูพี่คิม · Babe House`
  )).catch(() => {});
  sendEmail(OPS_EMAIL, `🎟️ จอง workshop ใหม่ — ${s?.ws_name || ""}`, wrap(
    `<b>${b.name}</b> (${b.email} · ${b.phone})<br>จอง ${b.qty} ที่ · ${(b.amount_satang / 100).toLocaleString()} บาท<br>รอบ: ${when}<br><br>` +
    `🍽️ อาหาร: ${b.food_note || "ไม่ได้แจ้ง"}<br>🅿️ ที่จอดรถ: ${b.needs_parking ? "<b>ต้องการ</b>" : "ไม่ต้องการ"}<br>` +
    (b.customer_note ? `📝 โน้ตจากลูกค้า: ${b.customer_note}<br>` : "") +
    `<br>ที่นั่งเหลือรอบนี้: <b>${left?.left ?? "-"}</b> จาก ${left?.seats ?? "-"}`
  )).catch(() => {});
}
app.get("/api/workshops/booking/:id", async (req, res) => {
  try {
    const b = await one(`SELECT * FROM workshop_bookings WHERE booking_id=$1`, [String(req.params.id || "")]);
    if (!b) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    if (b.status !== "paid" && b.provider_session_id && String(process.env.STRIPE_SECRET_KEY || "").trim()) {
      try {
        const { default: Stripe } = await import("stripe");
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const ck = await stripe.checkout.sessions.retrieve(b.provider_session_id);
        if (ck && ck.payment_status === "paid") { await finalizeWorkshopBooking(b); b.status = "paid"; }
      } catch {}
    }
    res.json({ ok: true, status: b.status, workshop_id: b.workshop_id });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED" }); }
});

// ===== 📊 หลังบ้าน: ภาพรวมยอดขายทุกสินค้าในที่เดียว (Blueprint + คอร์ส + workshop + ที่จะมีในอนาคต) =====
app.get("/api/admin/sales-overview", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
    const since = `now() - interval '${days} days'`;
    // Blueprint — ใช้นิยาม "เงินเข้าจริง" ชุดเดียวกับการ์ดรายได้เดิม (ไม่นับ mock/โค้ดฟรี/โหมดทดสอบ)
    // ถ้าใช้คนละนิยาม ตัวเลขสองที่ในหน้าเดียวกันจะไม่ตรงกัน แล้วคิมจะไม่รู้ว่าอันไหนจริง
    const bpReal = `payment_status='paid' AND live_mode = true AND COALESCE(provider,'') NOT IN ('mock','code') AND COALESCE(final_amount_satang,${PRICE_SATANG}) > 0`;
    const bp = await one(`SELECT COUNT(*) n, COALESCE(SUM(COALESCE(final_amount_satang,${PRICE_SATANG})),0) rev
      FROM blueprint_orders WHERE ${bpReal} AND created_at > ${since}`);
    const bpAll = await one(`SELECT COUNT(*) n, COALESCE(SUM(COALESCE(final_amount_satang,${PRICE_SATANG})),0) rev
      FROM blueprint_orders WHERE ${bpReal}`);
    // คอร์ส — เฉพาะที่ขายผ่านเว็บใหม่ (academy_purchases) · ออเดอร์เก่าจากเว็บเดิมแยกให้ดูต่างหาก
    const ac = await one(`SELECT COUNT(*) n, COALESCE(SUM(amount_satang),0) rev FROM academy_purchases WHERE status='paid' AND created_at > ${since}`);
    const acAll = await one(`SELECT COUNT(*) n, COALESCE(SUM(amount_satang),0) rev FROM academy_purchases WHERE status='paid'`);
    const acLegacy = await one(`SELECT COUNT(*) n, COALESCE(SUM(NULLIF(regexp_replace(COALESCE(total,'0'),'[^0-9.]','','g'),'')::numeric),0) rev
      FROM academy_orders WHERE status='Close'`).catch(() => ({ n: 0, rev: 0 }));
    // Workshop
    const ws = await one(`SELECT COUNT(*) n, COALESCE(SUM(amount_satang),0) rev, COALESCE(SUM(qty),0) seats FROM workshop_bookings WHERE status='paid' AND created_at > ${since}`);
    const wsAll = await one(`SELECT COUNT(*) n, COALESCE(SUM(amount_satang),0) rev, COALESCE(SUM(qty),0) seats FROM workshop_bookings WHERE status='paid'`);
    // ขายดีรายคอร์ส (เว็บใหม่)
    const topCourses = await q(`SELECT course_id, course_name, COUNT(*) n, SUM(amount_satang) rev FROM academy_purchases
      WHERE status='paid' GROUP BY course_id, course_name ORDER BY rev DESC LIMIT 10`);
    const B = (satang) => Math.round(Number(satang || 0) / 100);
    res.json({ ok: true, days,
      blueprint: { period: { orders: Number(bp.n), revenue: B(bp.rev) }, all: { orders: Number(bpAll.n), revenue: B(bpAll.rev) } },
      courses: { period: { orders: Number(ac.n), revenue: B(ac.rev) }, all: { orders: Number(acAll.n), revenue: B(acAll.rev) },
        legacy: { orders: Number(acLegacy.n), revenue: Math.round(Number(acLegacy.rev || 0)) } },
      workshops: { period: { bookings: Number(ws.n), seats: Number(ws.seats), revenue: B(ws.rev) }, all: { bookings: Number(wsAll.n), seats: Number(wsAll.seats), revenue: B(wsAll.rev) } },
      top_courses: topCourses.map(c => ({ id: c.course_id, name: c.course_name, orders: Number(c.n), revenue: B(c.rev) })),
    });
  } catch (e) { console.error("sales-overview", e.message); res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// ===== 📝 หลังบ้าน: จัดการการบ้าน + รีวิวผลงาน + ตรวจงานที่ AI ตรวจไม่ได้ =====
app.get("/api/admin/academy/manage", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const courseId = String(req.query.course_id || "");
    const courses = await q(`SELECT legacy_id id, name, is_active FROM academy_courses ORDER BY legacy_id::int`);
    if (!courseId) return res.json({ ok: true, courses: courses.map(c => ({ ...c, visible: c.is_active === "0" })) });
    res.json({ ok: true, courses: courses.map(c => ({ ...c, visible: c.is_active === "0" })),
      assignments: await q(`SELECT * FROM academy_assignments WHERE course_id=$1 ORDER BY seq, created_at`, [courseId]),
      showcase: await q(`SELECT * FROM academy_showcase WHERE course_id=$1 ORDER BY seq, created_at`, [courseId]),
      lessons: await q(`SELECT legacy_id id, name, url, seq FROM academy_course_lines WHERE course_id=$1 ORDER BY COALESCE(NULLIF(seq,'')::int,999)`, [courseId]) });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});
app.post("/api/admin/academy/assignment", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const b = req.body || {};
    if (b.action === "delete") { await run(`DELETE FROM academy_assignments WHERE assignment_id=$1`, [String(b.assignment_id)]); return res.json({ ok: true, deleted: b.assignment_id }); }
    const id = String(b.assignment_id || "") || uid("asg");
    await run(`INSERT INTO academy_assignments (assignment_id, course_id, title, brief, submit_type, criteria, required, seq)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (assignment_id) DO UPDATE SET title=EXCLUDED.title, brief=EXCLUDED.brief, submit_type=EXCLUDED.submit_type,
        criteria=EXCLUDED.criteria, required=EXCLUDED.required, seq=EXCLUDED.seq`,
      [id, String(b.course_id || ""), String(b.title || ""), String(b.brief || ""), ["image", "video", "any"].includes(b.submit_type) ? b.submit_type : "any",
       String(b.criteria || ""), b.required !== false, Number(b.seq) || 1]);
    res.json({ ok: true, assignment: await one(`SELECT * FROM academy_assignments WHERE assignment_id=$1`, [id]) });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});
app.post("/api/admin/academy/showcase", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const b = req.body || {};
    if (b.action === "delete") { await run(`DELETE FROM academy_showcase WHERE showcase_id=$1`, [String(b.showcase_id)]); return res.json({ ok: true, deleted: b.showcase_id }); }
    const id = String(b.showcase_id || "") || uid("shw");
    await run(`INSERT INTO academy_showcase (showcase_id, course_id, kind, url, caption, student_name, seq, active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (showcase_id) DO UPDATE SET kind=EXCLUDED.kind, url=EXCLUDED.url, caption=EXCLUDED.caption,
        student_name=EXCLUDED.student_name, seq=EXCLUDED.seq, active=EXCLUDED.active`,
      // preview = คลิปตัวอย่างบทเรียนของคอร์ส (คนละอันกับ clip = รีวิวจากผู้เรียน) — ช่วยตัดสินใจซื้อมากที่สุด
      [id, String(b.course_id || ""), ["clip", "work", "quote", "preview"].includes(b.kind) ? b.kind : "clip", String(b.url || ""),
       String(b.caption || ""), String(b.student_name || ""), Number(b.seq) || 1, b.active !== false]);
    res.json({ ok: true, showcase: await one(`SELECT * FROM academy_showcase WHERE showcase_id=$1`, [id]) });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});
app.get("/api/admin/academy/submissions", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const status = String(req.query.status || "");
    // ⚠️ ไม่ select file_data — ไฟล์รูปใหญ่ ทำให้หน้ารายการช้า (บทเรียนจากบั๊กหน้านักเรียนเดิม)
    const rows = await q(`SELECT s.submission_id, s.assignment_id, s.course_id, s.email, s.file_kind, s.status, s.score,
        s.teacher_note, s.created_at, s.reviewed_at, a.title, c.name AS course_name
      FROM academy_submissions s LEFT JOIN academy_assignments a ON a.assignment_id=s.assignment_id
      LEFT JOIN academy_courses c ON c.legacy_id=s.course_id
      ${status ? "WHERE s.status=$1" : ""} ORDER BY s.created_at DESC LIMIT 200`, status ? [status] : []);
    res.json({ ok: true, submissions: rows, pending: Number((await one(`SELECT COUNT(*) c FROM academy_submissions WHERE status='reviewing'`))?.c || 0) });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});
app.get("/api/admin/academy/submission/:id", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const s = await one(`SELECT * FROM academy_submissions WHERE submission_id=$1`, [String(req.params.id || "")]);
  if (!s) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  res.json({ ok: true, submission: { ...s, ai: s.ai_json ? safeJson(s.ai_json) : null, ai_json: undefined } });
});
// ครูพี่คิมตัดสินเอง (ทับผล AI ได้เสมอ) — ผ่าน = ปลดล็อกใบประกาศให้ทันที
app.post("/api/admin/academy/submission/review", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const id = String(req.body?.submission_id || ""), pass = req.body?.pass === true;
    const note = String(req.body?.note || "");
    const s = await one(`SELECT submission_id, email, course_id FROM academy_submissions WHERE submission_id=$1`, [id]);
    if (!s) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    await run(`UPDATE academy_submissions SET status=$2, teacher_note=$3, reviewed_at=now() WHERE submission_id=$1`, [id, pass ? "passed" : "revise", note]);
    const cert = pass ? await maybeIssueCertificate(s.email, s.course_id) : { cert_id: null };
    res.json({ ok: true, status: pass ? "passed" : "revise", cert_id: cert.cert_id });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});
// ⭐ เอาผลงานนักเรียนไปโชว์ในหน้าคอร์ส (ช่วยปิดการขาย) — ทำได้เฉพาะงานที่นักเรียนติ๊กอนุญาตเท่านั้น
app.post("/api/admin/academy/submission/feature", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const s = await one(`SELECT * FROM academy_submissions WHERE submission_id=$1`, [String(req.body?.submission_id || "")]);
    if (!s) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    if (!s.allow_marketing) return res.status(403).json({ ok: false, error: "NO_CONSENT",
      message: "นักเรียนคนนี้ไม่ได้ติ๊กอนุญาตให้นำผลงานไปโปรโมตค่ะ — ต้องขออนุญาตเจ้าตัวก่อนนะคะ" });
    if (!s.file_data) return res.status(400).json({ ok: false, error: "NO_FILE",
      message: "งานชิ้นนี้เป็นคลิป ระบบไม่ได้เก็บไฟล์ไว้ — ขอไฟล์จากนักเรียนแล้วเพิ่มเป็นรีวิวเองได้ที่หัวข้อจัดการคอร์สค่ะ" });
    const id = "shw_" + s.submission_id.slice(-12);
    const seq = Number((await one(`SELECT COALESCE(MAX(seq),0)+1 n FROM academy_showcase WHERE course_id=$1`, [s.course_id]))?.n || 1);
    await run(`INSERT INTO academy_showcase (showcase_id, course_id, kind, url, caption, student_name, seq, active)
      VALUES ($1,$2,'work',$3,$4,$5,$6,true)
      ON CONFLICT (showcase_id) DO UPDATE SET url=EXCLUDED.url, caption=EXCLUDED.caption, active=true`,
      [id, s.course_id, s.file_data, String(req.body?.caption || "ผลงานจากนักเรียนในคอร์สนี้"), String(req.body?.student_name || ""), seq]);
    res.json({ ok: true, showcase_id: id });
  } catch (e) { console.error("feature", e.message); res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});
// สุขภาพข้อมูลคอร์ส — บทเรียนที่ยังไม่มีลิงก์วิดีโอ (กันลูกค้าจ่ายเงินแล้วเจอบทว่าง)
// 🚦 ตรวจความพร้อมก่อนเปิดตัว — ลูกค้าเก่ากี่คนที่ login แล้ว "เห็นคอร์สจริง"
// อ่านอย่างเดียว คืนเฉพาะตัวเลขรวม ไม่มีข้อมูลส่วนตัวลูกค้า
// 🗑️➡️ กู้เล่มที่ลูกค้าเผลอลบ — ระบบลบแบบซ่อนไว้ ข้อมูลยังอยู่ครบ
app.get("/api/admin/deleted-books", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const email = normEmail(req.query.email || "");
  const rows = await q(`SELECT b.blueprint_id, b.user_id, b.billing_cycle, b.deleted_at, b.created_at,
      r.email, r.instagram_account
    FROM blueprints b LEFT JOIN blueprint_requests r ON b.request_id=r.request_id
    WHERE b.deleted_at IS NOT NULL ${email ? "AND lower(r.email)=lower($1)" : ""}
    ORDER BY b.deleted_at DESC LIMIT 50`, email ? [email] : []);
  res.json({ ok: true, count: rows.length, books: rows });
});
app.post("/api/admin/restore-book", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const bpId = String(req.body?.blueprint_id || "").trim();
  if (!bpId) return res.status(400).json({ ok: false, error: "NO_ID" });
  const b = await one(`SELECT * FROM blueprints WHERE blueprint_id=$1`, [bpId]);
  if (!b) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  if (!b.deleted_at) return res.json({ ok: true, already_active: true, blueprint_id: bpId });
  await run(`UPDATE blueprints SET deleted_at=NULL WHERE blueprint_id=$1`, [bpId]);
  const bp = safeJson(b.blueprint_json) || {};
  res.json({ ok: true, restored: bpId, billing_cycle: b.billing_cycle,
    scripts: (bp.scripts || []).length, theme: bp.theme || null });
});
app.get("/api/admin/academy/coverage", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const hidden = [...HIDDEN_COURSES];
  const q1 = await one(`SELECT COUNT(DISTINCT lower(email)) c FROM academy_users WHERE COALESCE(email,'') <> ''`);
  // ⚠️ ต้องอ่าน "ทั้งสองทาง" แบบเดียวกับ academyOwnedCourseIds เป๊ะ
  // ออเดอร์เก่าส่วนใหญ่ course_id='0' แล้วคอร์สจริงอยู่ใน academy_order_lines
  const q2 = await one(`
    SELECT COUNT(DISTINCT lower(u.email)) c FROM academy_users u
    WHERE COALESCE(u.email,'') <> '' AND EXISTS (
      SELECT 1 FROM academy_orders o WHERE o.legacy_user_id=u.legacy_id AND o.status='Close'
        AND EXISTS (SELECT 1 FROM academy_courses c WHERE c.legacy_id=o.course_id AND c.is_active='0' AND c.legacy_id <> ALL($1::text[]))
      UNION ALL
      SELECT 1 FROM academy_orders o JOIN academy_order_lines l ON l.order_id=o.legacy_id
      WHERE o.legacy_user_id=u.legacy_id AND o.status='Close'
        AND EXISTS (SELECT 1 FROM academy_courses c WHERE c.legacy_id=l.course_id AND c.is_active='0' AND c.legacy_id <> ALL($1::text[]))
    )`, [hidden]);
  const q3 = await q(`
    SELECT c.legacy_id, c.name, COUNT(DISTINCT x.email) students FROM (
      SELECT lower(u.email) email, o.course_id cid FROM academy_orders o
        JOIN academy_users u ON u.legacy_id=o.legacy_user_id WHERE o.status='Close' AND COALESCE(u.email,'')<>''
      UNION
      SELECT lower(u.email) email, l.course_id cid FROM academy_orders o
        JOIN academy_order_lines l ON l.order_id=o.legacy_id
        JOIN academy_users u ON u.legacy_id=o.legacy_user_id WHERE o.status='Close' AND COALESCE(u.email,'')<>''
    ) x JOIN academy_courses c ON c.legacy_id=x.cid
    WHERE c.is_active='0' GROUP BY c.legacy_id, c.name ORDER BY students DESC LIMIT 10`);
  // 🔍 ไล่ทีละขั้นว่าข้อมูลขาดตอนตรงไหน
  const diag = {
    orders_total: Number((await one(`SELECT COUNT(*) c FROM academy_orders`))?.c || 0),
    orders_closed: Number((await one(`SELECT COUNT(*) c FROM academy_orders WHERE status='Close'`))?.c || 0),
    status_values: await q(`SELECT status, COUNT(*) c FROM academy_orders GROUP BY status ORDER BY c DESC LIMIT 6`),
    closed_with_user: Number((await one(`SELECT COUNT(*) c FROM academy_orders o JOIN academy_users u ON u.legacy_id=o.legacy_user_id WHERE o.status='Close'`))?.c || 0),
    closed_with_email: Number((await one(`SELECT COUNT(*) c FROM academy_orders o JOIN academy_users u ON u.legacy_id=o.legacy_user_id WHERE o.status='Close' AND COALESCE(u.email,'')<>''`))?.c || 0),
    closed_with_courseid: Number((await one(`SELECT COUNT(*) c FROM academy_orders o WHERE o.status='Close' AND COALESCE(o.course_id,'')<>''`))?.c || 0),
    lines_total: Number((await one(`SELECT COUNT(*) c FROM academy_order_lines`))?.c || 0),
    lines_matching_order: Number((await one(`SELECT COUNT(*) c FROM academy_order_lines l JOIN academy_orders o ON o.legacy_id=l.order_id`))?.c || 0),
    courseid_matches_course: Number((await one(`SELECT COUNT(*) c FROM academy_orders o JOIN academy_courses c ON c.legacy_id=o.course_id WHERE o.status='Close'`))?.c || 0),
    courses_active0: Number((await one(`SELECT COUNT(*) c FROM academy_courses WHERE is_active='0'`))?.c || 0),
    is_active_values: await q(`SELECT is_active, COUNT(*) c FROM academy_courses GROUP BY is_active`),
    sample_order: await one(`SELECT legacy_id, legacy_user_id, course_id, status FROM academy_orders WHERE status='Close' LIMIT 1`),
    sample_user_id: await one(`SELECT legacy_id FROM academy_users LIMIT 1`),
    // คอร์สที่ออเดอร์อ้างถึงแต่เราไม่มีข้อมูล = ต้องขอ ZeroDesign เพิ่ม
    distinct_course_ids_in_orders: Number((await one(`SELECT COUNT(DISTINCT COALESCE(NULLIF(o.course_id,''), l.course_id)) c
      FROM academy_orders o LEFT JOIN academy_order_lines l ON l.order_id=o.legacy_id WHERE o.status='Close'`))?.c || 0),
    courses_we_have: Number((await one(`SELECT COUNT(*) c FROM academy_courses`))?.c || 0),
    missing_courses: await q(`
      SELECT cid, COUNT(*) orders, COUNT(DISTINCT lower(u.email)) students FROM (
        SELECT COALESCE(NULLIF(o.course_id,''), l.course_id) cid, o.legacy_user_id
        FROM academy_orders o LEFT JOIN academy_order_lines l ON l.order_id=o.legacy_id
        WHERE o.status='Close'
      ) x LEFT JOIN academy_users u ON u.legacy_id = x.legacy_user_id
      WHERE cid IS NOT NULL AND cid <> '' AND NOT EXISTS (SELECT 1 FROM academy_courses c WHERE c.legacy_id = x.cid)
      GROUP BY cid ORDER BY students DESC LIMIT 25`),
    users_no_email: Number((await one(`SELECT COUNT(*) c FROM academy_users WHERE COALESCE(email,'')=''`))?.c || 0),
  };
  const lessons = await one(`SELECT COUNT(*) c FROM academy_course_lines WHERE COALESCE(url,'') <> ''`);
  const noVideo = await one(`SELECT COUNT(*) c FROM academy_course_lines WHERE COALESCE(url,'') = ''`);
  const wsSessions = await one(`SELECT COUNT(*) c FROM workshop_sessions WHERE status='open' AND starts_at > now()`);
  res.json({ ok: true,
    emails_total: Number(q1?.c || 0),
    emails_with_visible_course: Number(q2?.c || 0),
    lessons_with_video: Number(lessons?.c || 0),
    lessons_missing_video: Number(noVideo?.c || 0),
    workshop_open_sessions: Number(wsSessions?.c || 0),
    top_courses: q3, diag });
});
app.get("/api/admin/academy/health", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const missing = await q(`SELECT l.course_id, c.name AS course_name, l.legacy_id, l.name, l.seq
    FROM academy_course_lines l JOIN academy_courses c ON c.legacy_id=l.course_id
    WHERE c.is_active='0' AND COALESCE(l.url,'') NOT LIKE 'http%' ORDER BY l.course_id::int, l.seq`);
  const noLessons = await q(`SELECT c.legacy_id, c.name FROM academy_courses c WHERE c.is_active='0'
    AND NOT EXISTS (SELECT 1 FROM academy_course_lines l WHERE l.course_id=c.legacy_id)`);
  res.json({ ok: true, missing_url: missing, courses_without_lessons: noLessons });
});
// ความปลอดภัย — บัญชีที่เปิดคอร์สจากหลาย IP ผิดปกติ (สัญญาณแชร์รหัส/ดูดคลิป)
app.get("/api/admin/academy/security", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const days = Math.max(1, Math.min(90, Number(req.query.days) || 7));
  const rows = await q(`SELECT email, COUNT(DISTINCT ip) ips, COUNT(*) views, MAX(created_at) last_seen
    FROM academy_video_access WHERE created_at > now() - interval '${days} days' AND COALESCE(ip,'')<>''
    GROUP BY email HAVING COUNT(DISTINCT ip) >= 4 ORDER BY COUNT(DISTINCT ip) DESC LIMIT 50`);
  res.json({ ok: true, days, suspicious: rows.map(r => ({ ...r, ips: Number(r.ips), views: Number(r.views) })) });
});

// ===== 🎟️ หลังบ้าน: จัดการ workshop — คิมลงวันเองได้ทุกเดือน =====
app.get("/api/admin/workshops", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const ws = await q(`SELECT * FROM workshops ORDER BY seq, created_at`);
    const sess = await q(`SELECT s.*, ${SEATS_TAKEN} AS taken,
      (SELECT COALESCE(SUM(amount_satang),0) FROM workshop_bookings b WHERE b.session_id=s.session_id AND b.status='paid') AS revenue
      FROM workshop_sessions s ORDER BY s.starts_at DESC`);
    const byWs = {};
    for (const s of sess) (byWs[s.workshop_id] ||= []).push({ ...s, taken: Number(s.taken || 0), left: Math.max(0, Number(s.seats || 0) - Number(s.taken || 0)), revenue: Math.round(Number(s.revenue || 0) / 100) });
    const showcase = await q(`SELECT * FROM workshop_showcase ORDER BY seq`);
    const shwBy = {};
    for (const s of showcase) (shwBy[s.workshop_id] ||= []).push(s);
    res.json({ ok: true, workshops: ws.map(w => ({ ...w, sessions: byWs[w.workshop_id] || [], showcase: shwBy[w.workshop_id] || [] })) });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});
app.post("/api/admin/workshop", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const b = req.body || {};
    if (b.action === "delete") { await run(`DELETE FROM workshops WHERE workshop_id=$1`, [String(b.workshop_id)]); return res.json({ ok: true, deleted: b.workshop_id }); }
    const id = String(b.workshop_id || "") || uid("ws");
    await run(`INSERT INTO workshops (workshop_id, name, tagline, detail, who_for, what_you_get, instructor, price, duration, image_url, active, seq)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (workshop_id) DO UPDATE SET name=EXCLUDED.name, tagline=EXCLUDED.tagline, detail=EXCLUDED.detail, who_for=EXCLUDED.who_for,
        what_you_get=EXCLUDED.what_you_get, instructor=EXCLUDED.instructor, price=EXCLUDED.price, duration=EXCLUDED.duration,
        image_url=EXCLUDED.image_url, active=EXCLUDED.active, seq=EXCLUDED.seq`,
      [id, String(b.name || ""), String(b.tagline || ""), String(b.detail || ""), String(b.who_for || ""), String(b.what_you_get || ""),
       String(b.instructor || "ครูพี่คิม"), Number(b.price) || 0, String(b.duration || ""), String(b.image_url || ""), b.active !== false, Number(b.seq) || 1]);
    res.json({ ok: true, workshop: await one(`SELECT * FROM workshops WHERE workshop_id=$1`, [id]) });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});
app.post("/api/admin/workshop/session", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const b = req.body || {};
    if (b.action === "delete") {
      const booked = Number((await one(`SELECT COUNT(*) c FROM workshop_bookings WHERE session_id=$1 AND status='paid'`, [String(b.session_id)]))?.c || 0);
      if (booked > 0) return res.status(409).json({ ok: false, error: "HAS_BOOKINGS", message: `รอบนี้มีคนจ่ายเงินจองแล้ว ${booked} รายการ ลบไม่ได้ค่ะ — ปิดรับสมัครแทนได้` });
      await run(`DELETE FROM workshop_sessions WHERE session_id=$1`, [String(b.session_id)]);
      return res.json({ ok: true, deleted: b.session_id });
    }
    const id = String(b.session_id || "") || uid("wss");
    if (!b.starts_at) return res.status(400).json({ ok: false, error: "MISSING_DATE", message: "ใส่วันและเวลาเรียนด้วยนะคะ" });
    await run(`INSERT INTO workshop_sessions (session_id, workshop_id, starts_at, ends_at, location, seats, price_override, status, note, summary_url, summary_note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (session_id) DO UPDATE SET workshop_id=EXCLUDED.workshop_id, starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at,
        location=EXCLUDED.location, seats=EXCLUDED.seats, price_override=EXCLUDED.price_override, status=EXCLUDED.status,
        note=EXCLUDED.note, summary_url=EXCLUDED.summary_url, summary_note=EXCLUDED.summary_note`,
      [id, String(b.workshop_id || ""), b.starts_at, b.ends_at || null, String(b.location || ""), Number(b.seats) || 10,
       b.price_override ? Number(b.price_override) : null, ["open", "closed", "done"].includes(b.status) ? b.status : "open",
       String(b.note || ""), String(b.summary_url || ""), String(b.summary_note || "")]);
    res.json({ ok: true, session: await one(`SELECT * FROM workshop_sessions WHERE session_id=$1`, [id]) });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});
app.post("/api/admin/workshop/showcase", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const b = req.body || {};
    if (b.action === "delete") { await run(`DELETE FROM workshop_showcase WHERE showcase_id=$1`, [String(b.showcase_id)]); return res.json({ ok: true }); }
    const id = String(b.showcase_id || "") || uid("wsc");
    await run(`INSERT INTO workshop_showcase (showcase_id, workshop_id, url, caption, seq, active) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (showcase_id) DO UPDATE SET url=EXCLUDED.url, caption=EXCLUDED.caption, seq=EXCLUDED.seq, active=EXCLUDED.active`,
      [id, String(b.workshop_id || ""), String(b.url || ""), String(b.caption || ""), Number(b.seq) || 1, b.active !== false]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});
app.get("/api/admin/workshop/bookings", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const sid = String(req.query.session_id || "");
  const rows = await q(`SELECT b.*, s.starts_at, w.name AS workshop_name FROM workshop_bookings b
    JOIN workshop_sessions s ON s.session_id=b.session_id JOIN workshops w ON w.workshop_id=b.workshop_id
    ${sid ? "WHERE b.session_id=$1" : ""} ORDER BY b.created_at DESC LIMIT 300`, sid ? [sid] : []);
  res.json({ ok: true, bookings: rows });
});
// เพิ่มคนที่จองผ่านไลน์/โอนตรงเข้าระบบเอง (ช่วงเปลี่ยนผ่าน จะได้มีข้อมูลลูกค้าครบ)
app.post("/api/admin/workshop/booking", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const b = req.body || {};
    if (b.action === "attend") { await run(`UPDATE workshop_bookings SET attended=$2 WHERE booking_id=$1`, [String(b.booking_id), b.attended !== false]); return res.json({ ok: true }); }
    if (b.action === "confirm") { await run(`UPDATE workshop_bookings SET confirmed=$2 WHERE booking_id=$1`, [String(b.booking_id), b.confirmed !== false]); return res.json({ ok: true }); }
    if (b.action === "parking") { await run(`UPDATE workshop_bookings SET parking_notified=$2 WHERE booking_id=$1`, [String(b.booking_id), b.parking_notified !== false]); return res.json({ ok: true }); }
    if (b.action === "cancel") { await run(`UPDATE workshop_bookings SET status='cancelled' WHERE booking_id=$1`, [String(b.booking_id)]); return res.json({ ok: true }); }
    const s = await one(`SELECT s.*, w.price FROM workshop_sessions s JOIN workshops w ON w.workshop_id=s.workshop_id WHERE s.session_id=$1`, [String(b.session_id || "")]);
    if (!s) return res.status(404).json({ ok: false, error: "SESSION_NOT_FOUND" });
    const qty = Math.max(1, Number(b.qty) || 1);
    const id = uid("wsb");
    const amt = b.amount_satang != null ? Number(b.amount_satang) : Math.round(Number(s.price_override || s.price || 0) * 100) * qty;
    await run(`INSERT INTO workshop_bookings (booking_id, session_id, workshop_id, email, name, phone, qty, amount_satang, status, paid_at)
      VALUES ($1,$2,$3,lower($4),$5,$6,$7,$8,'paid',now())`,
      [id, s.session_id, s.workshop_id, String(b.email || ""), String(b.name || ""), String(b.phone || ""), qty, amt]);
    res.json({ ok: true, booking_id: id });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

app.get("/api/admin/academy-stats", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const out = {};
  for (const t of Object.keys(ACADEMY_COLS)) {
    const r = await one(`SELECT COUNT(*) c FROM ${t}`).catch(() => ({ c: -1 }));
    out[t] = Number(r.c);
  }
  const em = await one(`SELECT COUNT(DISTINCT lower(email)) c FROM academy_users WHERE email LIKE '%@%'`).catch(() => ({ c: -1 }));
  out.unique_emails = Number(em.c);
  const paid = await one(`SELECT COUNT(*) c, COALESCE(SUM(NULLIF(total,'')::numeric),0) rev FROM academy_orders WHERE status='Close'`).catch(() => ({ c: -1, rev: 0 }));
  out.closed_orders = Number(paid.c); out.closed_revenue = Number(paid.rev);
  res.json({ ok: true, stats: out });
});
// ส่ง backup เข้าอีเมลแอดมินเป็นไฟล์แนบ (auto-email ทุกสัปดาห์ — สำรองนอกเซิร์ฟเวอร์ ฟรี ไม่ต้อง Railway Pro)
async function emailBackup() {
  const { dump, rows } = await buildBackupDump();
  const json = JSON.stringify(dump);
  const b64 = Buffer.from(json, "utf-8").toString("base64");
  const day = new Date().toISOString().slice(0, 10);
  const to = OPS_EMAIL;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.APP_FROM_EMAIL || "Babe House <onboarding@resend.dev>", to: [to],
      subject: `💾 Babe House backup อัตโนมัติ · ${day}`,
      html: `<p>สำรองข้อมูลอัตโนมัติประจำสัปดาห์ค่ะ 🩵</p><p>ไฟล์แนบ: ข้อมูลลูกค้า · ออเดอร์ · เล่ม Blueprint · เครดิต · สคริปต์ ฯลฯ รวม <b>${rows}</b> แถว (~${Math.round(json.length / 1024)} KB) · ตัดรูป Insight ออกเพื่อลดขนาด</p><p>เก็บเมลนี้ไว้ = มีสำเนาข้อมูลนอกเซิร์ฟเวอร์ กันข้อมูลหายค่ะ</p>`,
      attachments: [{ filename: `babehouse-backup-${day}.json`, content: b64 }],
    }),
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`resend ${r.status} ${t.slice(0, 150)}`); }
  await run(`INSERT INTO backup_log (id,rows,bytes) VALUES ($1,$2,$3)`, [uid("bk"), rows, json.length]).catch(() => {});
  return { rows, bytes: json.length };
}
// ส่งถ้าครบกำหนด (ครั้งล่าสุด > 7 วัน) — เรียกจาก cron รายวัน เลยรอด deploy ที่รีเซ็ต timer
async function emailWeeklyBackupIfDue() {
  try {
    const last = await one(`SELECT emailed_at FROM backup_log ORDER BY emailed_at DESC LIMIT 1`);
    if (last && (Date.now() - new Date(last.emailed_at).getTime()) < 7 * 24 * 3600 * 1000) return; // ยังไม่ถึง 7 วัน
    const r = await emailBackup();
    console.log(`[backup] weekly backup emailed · ${r.rows} rows · ${Math.round(r.bytes / 1024)} KB`);
  } catch (e) { console.error("weekly backup", e.message); }
}
// ส่ง backup เข้าเมลเดี๋ยวนี้ (ปุ่มทดสอบ/สั่งเอง)
app.post("/api/admin/backup-email-now", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try { const r = await emailBackup(); res.json({ ok: true, ...r, to: OPS_EMAIL }); }
  catch (e) { res.status(500).json({ ok: false, error: "EMAIL_FAILED", message: e.message }); }
});
// เติม "ข้อความขึ้นจอ + วิธีถ่าย" (ost/vis) ให้เล่มเก่าที่ถูกเจนตอน prompt ยังไม่บังคับ (คง say เดิม 100%)
app.post("/api/admin/enrich-directions", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const bpId = String(req.body?.blueprint_id || "").trim();
  if (!bpId) return res.status(400).json({ ok: false, error: "NO_ID" });
  const row = await one(`SELECT blueprint_id, blueprint_json FROM blueprints WHERE blueprint_id=$1 AND deleted_at IS NULL`, [bpId]);
  if (!row) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  const bp = safeJson(row.blueprint_json) || {};
  if (!Array.isArray(bp.scripts) || !bp.scripts.length) return res.json({ ok: false, error: "NO_SCRIPTS" });
  const totalBeats = bp.scripts.reduce((n, s) => n + (s.beats || []).length, 0);
  const hadVis = bp.scripts.reduce((n, s) => n + (s.beats || []).filter(b => b.vis && String(b.vis).trim()).length, 0);
  await acquireGen();
  let result;
  try { result = await enrichDirections(bp.scripts, bp, req.body?.lang === "en" ? "en" : "th"); }
  finally { releaseGen(); }
  bp.scripts = result.scripts;
  await run(`UPDATE blueprints SET blueprint_json=$1 WHERE blueprint_id=$2`, [JSON.stringify(bp), bpId]);
  res.json({ ok: true, blueprint_id: bpId, total_beats: totalBeats, had_vis_before: hadVis, filled: result.filled, model: result.model });
});
// คืนสิทธิ์ "เพิ่มข้อมูลฟรี" (improve) ให้ลูกค้า — ใช้ตอนบั๊กฝั่งเราทำให้เขาเสียสิทธิ์ไปฟรีๆ
app.post("/api/admin/reset-improve", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const bpId = String(req.body?.blueprint_id || "").trim();
  if (!bpId) return res.status(400).json({ ok: false, error: "NO_ID" });
  const r = await run(`UPDATE blueprints SET improve_count=0 WHERE blueprint_id=$1 AND deleted_at IS NULL`, [bpId]);
  res.json({ ok: true, blueprint_id: bpId, reset: true });
});
// หาเล่มที่ content_status=ready แต่สคริปต์หาย (โดนบั๊ก improve เขียนทับ) — ไว้ตรวจ+กู้
app.get("/api/admin/broken-content", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  // จับ 2 แบบ: (1) บอกว่าเสร็จแล้วแต่สคริปต์หาย  (2) ค้างที่ 'pending' นานเกิน 30 นาที = เจนค้าง ไม่มีใครรู้
  // เดิมดูแค่ ready → เล่มค้าง pending 11 เล่มหลุดสายตาไปเป็นเดือน (ลูกค้าจ่ายเงินแล้วไม่มีเล่ม)
  const rows = await q(`SELECT b.blueprint_id, b.user_id, b.billing_cycle, b.content_status, b.created_at, r.email, r.instagram_account
    FROM blueprints b LEFT JOIN blueprint_requests r ON b.request_id=r.request_id
    WHERE b.deleted_at IS NULL AND (
      (b.content_status='ready'   AND b.blueprint_json NOT LIKE '%"scripts":[{%') OR
      (b.content_status<>'ready'  AND b.created_at < now() - interval '30 minutes')
    ) ORDER BY b.created_at DESC`);
  res.json({ ok: true, count: rows.length, stuck: rows.filter(x => x.content_status !== "ready").length, books: rows });
});
// กู้เล่มที่สคริปต์หาย: สร้างคอนเทนต์ใหม่จากบทวิเคราะห์เดิม (bypass guard 'ready')
app.post("/api/admin/regen-content", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const bpId = String(req.body?.blueprint_id || "").trim();
  if (!bpId) return res.status(400).json({ ok: false, error: "NO_ID" });
  const bp = await one(`SELECT * FROM blueprints WHERE blueprint_id=$1 AND deleted_at IS NULL`, [bpId]);
  if (!bp) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  const current = safeJson(bp.blueprint_json) || {};
  const reqRow = await one(`SELECT raw_payload_json FROM blueprint_requests WHERE request_id=$1`, [bp.request_id]);
  const raw = safeJson(reqRow?.raw_payload_json) || {};
  const lang = (req.body?.lang === "th" || req.body?.lang === "en") ? req.body.lang : (raw.lang === "en" ? "en" : "th"); // override ได้
  const parsed = GenSchema.parse(normalizePayload(raw));
  const fr = parsed.form_responses || {};
  if (req.body?.dry) return res.json({ ok: true, dry: true, raw_lang: raw.lang || null, will_use_lang: lang, self_term: fr.self_term || null, audience_term: fr.audience_term || null, tone: fr.tone || null, catchphrase: fr.catchphrase || null }); // peek โดยไม่เจน
  parsed.prev_context = await getPrevContext(parsed.email, bp.billing_cycle, parsed.instagram_account);
  await acquireGen();
  let result;
  try { result = await generateContent(parsed, current, lang); }
  finally { releaseGen(); }
  const merged = { ...current, calendar: result.content.calendar, scripts: result.content.scripts };
  const flags = checkBlueprintQuality(merged, true); // คำนวณธงคุณภาพใหม่ → ธง "เล่มที่ควรเช็ค" จะอัปเดตเอง ไม่ค้างค่าเก่า
  await run(`UPDATE blueprints SET blueprint_json=$1, model=$2, content_status='ready', quality_flags_json=$3 WHERE blueprint_id=$4`, [JSON.stringify(merged), result.model, JSON.stringify(flags), bpId]);
  res.json({ ok: true, blueprint_id: bpId, scripts: (result.content.scripts || []).length, calendar: (result.content.calendar || []).length, flags });
});
// วิเคราะห์ใหม่ทั้งเล่ม (analysis + content) ด้วย prompt ล่าสุด — ใช้ตอนบทวิเคราะห์จับนิชผิด (เช่น เอาบริการ/เครื่องมือมาเป็นแนวคอนเทนต์). ใส่ focus_hint ชี้แนวคอนเทนต์จริงได้
// ✏️ แก้ "ธีมเล่ม" อย่างเดียว — ไม่แตะสคริปต์/ปฏิทินที่ลูกค้าอาจใช้ไปแล้ว (ถูกกว่า+ปลอดภัยกว่า reanalyze ทั้งเล่ม)
// ไม่ส่ง blueprint_id = กวาดทุกเล่มที่ธีมเป็น "ชื่อเอกสาร" แทนคำโปรยของช่องลูกค้า
// ===== 🎬 ให้ทีมช่วยลงมือทำ (ตัดต่อจากแผนของลูกค้า) =====
// ราคาคิมเคาะ 2026-08-02 — ยิ่งสั่งเยอะยิ่งถูกลง ไม่มีเพดาน · ต้นทุนฟรีแลนซ์ ~400/คลิป
// ⛔ ไม่รับงานถ่ายในเว็บ (ตัวแปรเยอะ ตั้งราคาตายตัวแล้วขาดทุน) → มีปุ่มให้ทีมโทรกลับแทน
// ⏰ เวลาทำงานจริงของทีม (คิมให้ข้อมูล 2026-08-02): จันทร์-ศุกร์ 12:00-19:00 · ส่งงาน ~3 วันทำการ
const WORK_DAYS = [1, 2, 3, 4, 5];          // จ-ศ
const WORK_START = 12, WORK_END = 19;        // เวลาไทย
const EDIT_DAYS_PER_CLIP = Number(process.env.EDIT_DAYS_PER_CLIP) || 3;   // คิมเคาะ 2 ส.ค.: 3 วันทำการต่อคลิป
// ทีมทำหลายคลิปขนานกันได้ (พี่ก้อง + โบว์ + ฟรีแลนซ์) — ไม่ใช่ทำทีละคลิปจนจบ
// ⚠️ เลข 3 นี้เป็นสมมติฐาน ปรับได้ที่ EDIT_PARALLEL — ยิ่งมากยิ่งสัญญาเร็ว ต้องแน่ใจว่าทีมทำทัน
const EDIT_PARALLEL = Number(process.env.EDIT_PARALLEL) || 3;
const leadDaysFor = (clips) => Math.max(EDIT_DAYS_PER_CLIP,
  Math.ceil(EDIT_DAYS_PER_CLIP * Math.max(1, Number(clips) || 1) / EDIT_PARALLEL));
// วันหยุดนักขัตฤกษ์ที่วันที่ตายตัวทุกปี — วันหยุดตามจันทรคติ (มาฆบูชา/วิสาขบูชา/อาสาฬหบูชา) เปลี่ยนทุกปี
// ⚠️ ต้องให้คิมใส่เพิ่มเอง อย่าเดา — ใส่ผ่าน env HOLIDAYS="2026-03-03,2026-05-31" (คั่นด้วยจุลภาค)
const FIXED_HOLIDAYS = ["01-01", "04-06", "04-13", "04-14", "04-15", "05-01", "07-28", "08-12", "10-13", "10-23", "12-05", "12-10", "12-31"];
const EXTRA_HOLIDAYS = new Set(String(process.env.HOLIDAYS || "").split(",").map(x => x.trim()).filter(Boolean));
const bkk = (d) => new Date(d.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
function isHoliday(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return FIXED_HOLIDAYS.includes(`${mm}-${dd}`) || EXTRA_HOLIDAYS.has(`${d.getFullYear()}-${mm}-${dd}`);
}
const isWorkDay = (d) => WORK_DAYS.includes(d.getDay()) && !isHoliday(d);
// นับไปข้างหน้า n วันทำการ (ข้ามเสาร์-อาทิตย์ + วันหยุด)
function addWorkDays(from, n) {
  const d = bkk(from); let left = n;
  while (left > 0) { d.setDate(d.getDate() + 1); if (isWorkDay(d)) left--; }
  d.setHours(WORK_END, 0, 0, 0);
  return d;
}
function isWorkingNow() {
  const d = bkk(new Date());
  return isWorkDay(d) && d.getHours() >= WORK_START && d.getHours() < WORK_END;
}
const thDate = (d) => new Date(d).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", weekday: "long", day: "numeric", month: "long" });

// 💰 ราคาปรับใหม่ 3 ส.ค. 2569 — ราคาเดิมขาดทุนจริง (คิมเคาะ: "ขึ้นราคาไปเลย เพราะคลิปส่วนใหญ่รวมกราฟฟิกอยู่แล้ว")
// ต้นทุนจริงต่อคลิปสั้น: ตัดต่อฟรีแลนซ์ 600-800 (เฉลี่ย 700) + กราฟฟิก 500 = 1,200 บาท
// ราคาเดิมแพ็ก 30 = 1,250 → หักค่าธรรมเนียม Stripe (3.65% + 11฿) แล้วเหลือกำไร 4 บาท/คลิป = ทำฟรี
// ยังไม่นับเวลาตรวจ 2 ชั้น (senior editor + AE) ที่เป็นต้นทุนคนของเราเอง
// ราคาใหม่ตั้งให้กำไรขั้นต้น 36-55% ทุกแพ็ก · ยิ่งซื้อเยอะยังถูกลงเหมือนเดิม
const EDIT_COST_PER_CLIP = Number(process.env.EDIT_COST_PER_CLIP) || 1200;  // ต้นทุนจริง ใช้คำนวณกำไรในหลังบ้าน
const EDIT_TIERS = [
  { min: 30, price: 2000 }, { min: 20, price: 2200 }, { min: 10, price: 2400 },
  { min: 4, price: 2600 }, { min: 1, price: 2900 },
];
const editPrice = (n) => (EDIT_TIERS.find(t => Number(n) >= t.min) || EDIT_TIERS[EDIT_TIERS.length - 1]).price;
// กำไรสุทธิต่อคลิปหลังหักต้นทุน + ค่าธรรมเนียมรับเงิน (ไว้โชว์ในหลังบ้านของคิมเท่านั้น ⛔ ไม่ส่งให้ลูกค้า/ทีม)
const editMargin = (n) => {
  const per = editPrice(n), clips = Math.max(1, Number(n) || 1);
  const fee = (per * clips * 0.0365 + 11) / clips;          // Stripe 3.65% + 11฿ ต่อรายการ
  const net = per - EDIT_COST_PER_CLIP - fee;
  return { price_per_clip: per, cost: EDIT_COST_PER_CLIP, fee: Math.round(fee), net: Math.round(net), pct: Math.round(net / per * 100) };
};
const EDIT_FREE_REVISIONS = 2;
// 🔁 เกินโควตาแก้ คิดเพิ่ม 50% ของราคาต่อคลิป (คิมเคาะ 4 ส.ค. 2569)
// ⛔ นับเฉพาะ "ลูกค้าเปลี่ยนใจ" — ถ้าเป็นความผิดเรา แก้ฟรีไม่จำกัด ไม่แตะโควตา
const REVISION_OVER_PCT = Number(process.env.REVISION_OVER_PCT || 50);
const EDIT_STATUS = {
  awaiting_files: "รอไฟล์จากคุณ", editing: "ทีมกำลังตัด", draft_sent: "ส่งงานให้ดูแล้ว",
  revising: "กำลังแก้ตามคอมเมนต์", done: "เสร็จเรียบร้อย", canceled: "ยกเลิกแล้ว",
  // 🔁 สถานะใหม่สำหรับสายตรวจงานภายใน (ลูกค้าไม่เห็นสถานะพวกนี้ — เห็นแค่ "ทีมกำลังตัด")
  assigned: "มอบหมายแล้ว รอคนตัด", senior_review: "รอหัวหน้าตรวจ", ae_review: "รอ AE ตรวจก่อนส่ง",
};
// สถานะที่ลูกค้าเห็น — สถานะภายในทั้งหมดถูกแปลงเป็น "ทีมกำลังตัด" เพื่อไม่ให้ลูกค้าสับสนกับกระบวนการหลังบ้าน
const INTERNAL_STATUSES = new Set(["assigned", "senior_review", "ae_review"]);
const customerStatus = (s) => (INTERNAL_STATUSES.has(s) ? "editing" : s);

app.get("/api/edit/price", (req, res) => {
  const n = Math.max(1, Math.min(200, Number(req.query.clips) || 1));
  res.json({ ok: true, clips: n, price_per_clip: editPrice(n), total: editPrice(n) * n, tiers: EDIT_TIERS,
    free_revisions: EDIT_FREE_REVISIONS, days_per_clip: EDIT_DAYS_PER_CLIP, parallel: EDIT_PARALLEL, lead_days: leadDaysFor(n),
    hours: "จันทร์-ศุกร์ 12:00-19:00 น.", working_now: isWorkingNow(),
    eta_if_send_now: thDate(addWorkDays(new Date(), leadDaysFor(n))) });
});

// ===== 🎟️ เครดิตตัดต่อ — ซื้อไว้ก่อน แล้วค่อยเลือกว่าจะให้ทีมตัดวันไหนในตาราง 30 วัน =====
// คิมเคาะ 2 ส.ค.: "น่าจะซื้อเครดิตตัดต่อ แล้วมาเลือกว่าจะให้เค้าตัดคลิปไหน"
// เดิมบังคับเลือกจำนวนคลิปตอนสั่ง ทั้งที่บรีฟมีวันเดียว → ลูกค้างงว่าอีก 29 คลิปคืออะไร และไม่กล้าจ่าย

// เครดิตคงเหลือ + วันที่สั่งตัดไปแล้วในเล่มนี้ (ไว้ให้ตาราง 30 วันขึ้นป้ายว่าวันไหนทีมกำลังตัด)
app.get("/api/edit/credits", async (req, res) => {
  const email = await authEmail(req); if (!email) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const c = await one(`SELECT COALESCE(edit_credits,0) n FROM customers WHERE lower(email)=lower($1)`, [email]);
    const bp = String(req.query.blueprint_id || "").trim();
    const rows = bp
      ? await q(`SELECT script_day, order_id, status FROM edit_orders WHERE lower(email)=lower($1) AND blueprint_id=$2 AND script_day IS NOT NULL`, [email, bp])
      : [];
    res.json({ ok: true, credits: Number(c?.n || 0),
      used_days: rows.map(r => ({ day: Number(r.script_day), order_id: r.order_id, status: r.status })) });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// ซื้อเครดิต — ยิ่งซื้อเยอะ ราคาต่อคลิปยิ่งถูก (ใช้ตารางราคาเดิม)
app.post("/api/edit/credits/buy", rateLimit(20, M10), async (req, res) => {
  const email = await authEmail(req);
  if (!email) return res.status(401).json({ ok: false, error: "LOGIN_REQUIRED", message: "เข้าสู่ระบบก่อนนะคะ" });
  const n = Math.max(1, Math.min(200, Number(req.body?.credits) || 1));
  const per = editPrice(n), total = per * n;
  try {
    const id = uid("ecp");
    await run(`INSERT INTO edit_credit_purchases (purchase_id,email,credits,price_per_clip,amount_satang,payment_status,provider)
      VALUES ($1,lower($2),$3,$4,$5,'paid','mock')`, [id, email, n, per, total * 100]);
    await run(`UPDATE customers SET edit_credits=COALESCE(edit_credits,0)+$1 WHERE lower(email)=lower($2)`, [n, email]);
    const c = await one(`SELECT COALESCE(edit_credits,0) x FROM customers WHERE lower(email)=lower($1)`, [email]);
    res.json({ ok: true, purchase_id: id, credits_added: n, price_per_clip: per, total, credits: Number(c?.x || 0) });
  } catch (e) { res.status(500).json({ ok: false, error: "BUY_FAILED", message: e.message }); }
});

// ใช้ 1 เครดิตกับวันใดวันหนึ่งในแผน → กลายเป็นงานตัดต่อ 1 ชิ้น (บรีฟ = สคริปต์วันนั้น)
app.post("/api/edit/use-credit", rateLimit(60, M10), async (req, res) => {
  const email = await authEmail(req);
  if (!email) return res.status(401).json({ ok: false, error: "LOGIN_REQUIRED", message: "เข้าสู่ระบบก่อนนะคะ" });
  const bp = String(req.body?.blueprint_id || "").trim();
  const day = Number(req.body?.script_day);
  if (!bp || !Number.isFinite(day)) return res.status(400).json({ ok: false, error: "MISSING", message: "ต้องระบุเล่มและวัน" });
  try {
    const dup = await one(`SELECT order_id FROM edit_orders WHERE lower(email)=lower($1) AND blueprint_id=$2 AND script_day=$3`, [email, bp, day]);
    if (dup) return res.status(409).json({ ok: false, error: "ALREADY_ORDERED", order_id: dup.order_id, message: "วันนี้สั่งให้ทีมตัดไปแล้วค่ะ" });
    // หักเครดิตแบบมีเงื่อนไข — ถ้าเครดิตไม่พอจะไม่มีแถวไหนถูกแก้ (กันติดลบตอนกดรัวๆ)
    const upd = await run(`UPDATE customers SET edit_credits=edit_credits-1 WHERE lower(email)=lower($1) AND COALESCE(edit_credits,0) > 0`, [email]);
    if (!upd?.rowCount) return res.status(402).json({ ok: false, error: "NO_CREDITS", message: "เครดิตตัดต่อหมดแล้วค่ะ ซื้อเพิ่มได้เลยนะคะ" });
    const id = uid("eo");
    // รับรายละเอียดที่ลูกค้ากรอกมาด้วย (ฟุตเทจ/เสียง/ตัวอย่างที่ชอบ/โน้ต)
    // คิมทัก 3 ส.ค.: "ให้เขาใส่รายละเอียดก่อน แล้วหักเครดิตตอนกดปุ่มด้านใน"
    await run(`INSERT INTO edit_orders (order_id,email,blueprint_id,billing_cycle,script_day,brief_json,clips,price_per_clip,amount_satang,payment_status,provider,paid_by,note,footage_url,voice_url,ref_links,ref_picks)
      VALUES ($1,lower($2),$3,$4,$5,$6,1,0,0,'paid','credit','credit',$7,$8,$9,$10,$11)`,
      [id, email, bp, req.body?.billing_cycle || null, day,
       req.body?.brief ? JSON.stringify(req.body.brief).slice(0, 20000) : null,
       String(req.body?.note || "").slice(0, 2000),
       String(req.body?.footage_url || "").slice(0, 1000) || null,
       String(req.body?.voice_url || "").slice(0, 1000) || null,
       String(req.body?.ref_links || "").slice(0, 2000) || null,
       Array.isArray(req.body?.ref_picks) && req.body.ref_picks.length ? JSON.stringify(req.body.ref_picks.slice(0, 12)) : null]);
    const c = await one(`SELECT COALESCE(edit_credits,0) x FROM customers WHERE lower(email)=lower($1)`, [email]);
    res.json({ ok: true, order_id: id, script_day: day, credits_left: Number(c?.x || 0) });
  } catch (e) { res.status(500).json({ ok: false, error: "USE_FAILED", message: e.message }); }
});

// สั่งงาน — บรีฟมาจากสคริปต์ในแผนลูกค้าเอง ไม่ต้องเขียนใหม่
app.post("/api/edit/order", rateLimit(30, M10), async (req, res) => {
  const email = await authEmail(req);
  if (!email) return res.status(401).json({ ok: false, error: "LOGIN_REQUIRED", message: "เข้าสู่ระบบก่อนสั่งงานนะคะ" });
  const clips = Math.max(1, Math.min(200, Number(req.body?.clips) || 1));
  const per = editPrice(clips), total = per * clips;
  const id = uid("eo");
  await run(`INSERT INTO edit_orders (order_id,email,blueprint_id,billing_cycle,script_day,brief_json,clips,price_per_clip,amount_satang,payment_status,provider,note,ref_links,ref_picks)
    VALUES ($1,lower($2),$3,$4,$5,$6,$7,$8,$9,'pending','mock',$10,$11,$12)`,
    [id, email, req.body?.blueprint_id || null, req.body?.billing_cycle || null,
     req.body?.script_day != null ? Number(req.body.script_day) : null,
     req.body?.brief ? JSON.stringify(req.body.brief).slice(0, 20000) : null,
     clips, per, total * 100, String(req.body?.note || "").slice(0, 2000),
     String(req.body?.ref_links || "").slice(0, 2000) || null,
     Array.isArray(req.body?.ref_picks) && req.body.ref_picks.length ? JSON.stringify(req.body.ref_picks.slice(0, 12)) : null]);
  res.json({ ok: true, order_id: id, clips, price_per_clip: per, total });
});

// งานของฉัน
app.get("/api/edit/my", async (req, res) => {
  const email = await authEmail(req);
  if (!email) return res.status(401).json({ ok: false, error: "LOGIN_REQUIRED" });
  const rows = await q(`SELECT * FROM edit_orders WHERE lower(email)=lower($1) ORDER BY created_at DESC`, [email]);
  res.json({ ok: true, orders: rows.map(r => { const s = customerStatus(r.status);   // ⛔ ลูกค้าไม่เห็นสถานะภายใน/ชื่อคนตัด
    const { internal_note, assigned_to, assigned_at, senior_by, senior_at, ae_by, ae_at, ...pub } = r;
    return { ...pub, status: s, status_th: EDIT_STATUS[s] || s }; }), free_revisions: EDIT_FREE_REVISIONS });
});
app.get("/api/edit/order/:id", async (req, res) => {
  const email = await authEmail(req);
  const o = await one(`SELECT * FROM edit_orders WHERE order_id=$1`, [String(req.params.id)]);
  if (!o) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  const isTeam = isAdmin(req);
  if (!isTeam && (!email || email.toLowerCase() !== String(o.email).toLowerCase())) return res.status(403).json({ ok: false, error: "FORBIDDEN" });
  // ⛔ ลูกค้าเห็นเฉพาะที่คุยกับตัวเอง — คอมเมนต์ที่ทีมคุยกันเอง (internal=1) ต้องไม่หลุดออกไป
  const comments = await q(`SELECT * FROM edit_comments WHERE order_id=$1 ${isTeam ? "" : "AND COALESCE(internal,0)=0"} ORDER BY created_at`, [o.order_id]);
  // ⛔ ลูกค้าเห็นแค่ "ทีมกำลังตัด" — ไม่เห็นว่าอยู่ด่านตรวจไหน ใครตัด ใครตรวจ หรือโน้ตภายใน
  const { internal_note, assigned_to, assigned_at, senior_by, senior_at, ae_by, ae_at, ...pub } = o;
  const cs = isTeam ? o.status : customerStatus(o.status);
  res.json({ ok: true, order: { ...(isTeam ? o : pub), status: cs, status_th: EDIT_STATUS[cs] || cs, brief: safeJson(o.brief_json), ref_picks: safeJson(o.ref_picks) || [],
    due_th: o.due_at ? thDate(o.due_at) : null }, comments, free_revisions: EDIT_FREE_REVISIONS,
    hours: "จันทร์-ศุกร์ 12:00-19:00 น.", working_now: isWorkingNow() });
});

// ลูกค้าส่งลิงก์ฟุตเทจ/เสียง → เด้งให้ทีมรู้
app.post("/api/edit/files", async (req, res) => {
  const email = await authEmail(req);
  if (!email) return res.status(401).json({ ok: false, error: "LOGIN_REQUIRED" });
  const o = await one(`SELECT * FROM edit_orders WHERE order_id=$1 AND lower(email)=lower($2)`, [String(req.body?.order_id || ""), email]);
  if (!o) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  const f = String(req.body?.footage_url || "").trim(), v = String(req.body?.voice_url || "").trim();
  if (!/^https?:\/\//.test(f)) return res.status(400).json({ ok: false, error: "BAD_LINK", message: "ใส่ลิงก์ฟุตเทจให้ถูกต้องนะคะ (ขึ้นต้นด้วย http)" });
  const due = addWorkDays(new Date(), leadDaysFor(o.clips));
  await run(`UPDATE edit_orders SET footage_url=$1, voice_url=$2, due_at=COALESCE(due_at,$3),
    status=CASE WHEN status='awaiting_files' THEN 'editing' ELSE status END, updated_at=now() WHERE order_id=$4`,
    [f, v || null, due.toISOString(), o.order_id]);
  await run(`INSERT INTO edit_comments (id,order_id,author,author_name,text,is_auto) VALUES ($1,$2,'team','ระบบ Babe House',$3,1)`,
    [uid("ec"), o.order_id, `ได้รับไฟล์แล้วค่ะ 🩵 ทีมจะเริ่มตัดให้เลยนะคะ — คาดว่าส่งงานให้ดูได้ประมาณ ${thDate(due)} ค่ะ`]);
  sendEmail(OPS_EMAIL, `🎬 ลูกค้าส่งไฟล์แล้ว — ${o.email}`, wrap(
    `งาน <b>${o.order_id}</b> · ${o.clips} คลิป<br>ฟุตเทจ: ${f}<br>${v ? `เสียง: ${v}<br>` : ""}<br>${btn(`${appBaseUrl()}/admin`, "เปิดหลังบ้าน")}`)).catch(() => {});
  res.json({ ok: true });
});

// คอมเมนต์ — ลูกค้าและทีมคุยกันในงานเดียวกัน
app.post("/api/edit/comment", async (req, res) => {
  const orderId = String(req.body?.order_id || "");
  const text = String(req.body?.text || "").trim();
  if (!orderId || !text) return res.status(400).json({ ok: false, error: "MISSING" });
  const o = await one(`SELECT * FROM edit_orders WHERE order_id=$1`, [orderId]);
  if (!o) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  const team = isAdmin(req);
  const email = team ? null : await authEmail(req);
  if (!team && (!email || email.toLowerCase() !== String(o.email).toLowerCase())) return res.status(403).json({ ok: false, error: "FORBIDDEN" });
  await run(`INSERT INTO edit_comments (id,order_id,author,author_name,text,at_time) VALUES ($1,$2,$3,$4,$5,$6)`,
    [uid("ec"), orderId, team ? "team" : "customer", team ? "ทีม Babe House" : (email || ""), text.slice(0, 3000), String(req.body?.at_time || "").slice(0, 12) || null]);

  // 🤖 ตอบรับอัตโนมัติทันที — ลูกค้าจะได้ไม่รู้สึกว่าพิมพ์ไปแล้วเงียบ
  // ⚠️ ตั้งใจใช้ข้อความคงที่ ไม่ใช้ AI แต่งเอง: AI อาจเผลอสัญญาเวลาส่งงานหรือตอบคำถามผิดแทนทีม
  // ไม่ตอบซ้ำถ้าข้อความก่อนหน้าเป็นตัวตอบอัตโนมัติอยู่แล้ว (ลูกค้าพิมพ์รัวๆ จะได้ไม่รก)
  if (!team) {
    const last = await one(`SELECT author, is_auto FROM edit_comments WHERE order_id=$1 ORDER BY created_at DESC OFFSET 1 LIMIT 1`, [orderId]);
    if (!(last && Number(last.is_auto) === 1)) {
      const ACK = {
        awaiting_files: "รับเรื่องแล้วค่ะ 🩵 ทีมเห็นข้อความแล้วนะคะ — พอส่งลิงก์ฟุตเทจเข้ามา ทีมจะเริ่มตัดให้เลยค่ะ",
        editing: "รับเรื่องแล้วค่ะ 🩵 ทีมกำลังตัดงานของคุณอยู่ เดี๋ยวมีความคืบหน้าจะแจ้งให้ทราบนะคะ",
        draft_sent: "รับเรื่องแล้วค่ะ 🩵 ทีมจะแก้ให้ตามที่บอกเลยนะคะ เดี๋ยวส่งกลับมาให้ดูใหม่ค่ะ",
        revising: "รับเรื่องเพิ่มแล้วค่ะ 🩵 ทีมจะรวมแก้ไปพร้อมกันในรอบนี้เลยนะคะ",
        done: "รับเรื่องแล้วค่ะ 🩵 งานนี้ปิดไปแล้ว เดี๋ยวทีมอ่านแล้วติดต่อกลับนะคะ",
      };
      const offHours = isWorkingNow() ? "" : " (ตอนนี้นอกเวลาทำการนะคะ ทีมทำงาน จันทร์-ศุกร์ 12:00-19:00 น. เดี๋ยวเปิดทำการแล้วทีมจะเห็นเลยค่ะ)";
      await run(`INSERT INTO edit_comments (id,order_id,author,author_name,text,is_auto) VALUES ($1,$2,'team','ระบบ Babe House',$3,1)`,
        [uid("ec"), orderId, (ACK[o.status] || ACK.editing) + offHours]);
    }
  }
  // ลูกค้าคอมเมนต์ตอนงานส่งมาแล้ว = ขอแก้ → นับรอบแก้ + เด้งทีม
  if (!team && o.status === "draft_sent") {
    const redue = addWorkDays(new Date(), Math.max(1, EDIT_DAYS_PER_CLIP - 1));   // รอบแก้เร็วกว่ารอบแรก
    // 🔁 นับเป็น "ลูกค้าขอแก้" ไว้ก่อน — ทีมกดเปลี่ยนเป็น "เราพลาด" ได้ทีหลัง (แก้ฟรี ไม่นับโควตา)
    await run(`UPDATE edit_orders SET status='revising', revisions_used=revisions_used+1,
       client_revisions=COALESCE(client_revisions,0)+1, due_at=$2, updated_at=now() WHERE order_id=$1`, [orderId, redue.toISOString()]);
    const usedNow = Number(o.client_revisions || 0) + 1;
    const over = usedNow > EDIT_FREE_REVISIONS;
    sendEmail(OPS_EMAIL, `💬 ลูกค้าขอแก้งาน — ${o.client_name || o.email}${over ? " ⚠️ เกินโควตา" : ""}`, wrap(
      `งาน <b>${orderId}</b> · ลูกค้าขอแก้ครั้งที่ ${usedNow} (ฟรี ${EDIT_FREE_REVISIONS} ครั้ง)` +
      (over ? `<br><b style="color:#b42318">เกินโควตาแล้ว — คิดเพิ่ม ${REVISION_OVER_PCT}% ของราคาต่อคลิป</b>` : "") +
      `<br><br>“${text.slice(0, 300)}”<br><br>${btn(`${appBaseUrl()}/team`, "เปิดหน้าทีม")}`)).catch(() => {});
  }
  res.json({ ok: true });
});

// ลูกค้ากดรับงาน
app.post("/api/edit/approve", async (req, res) => {
  const email = await authEmail(req);
  if (!email) return res.status(401).json({ ok: false, error: "LOGIN_REQUIRED" });
  const o = await one(`SELECT * FROM edit_orders WHERE order_id=$1 AND lower(email)=lower($2)`, [String(req.body?.order_id || ""), email]);
  if (!o) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  await run(`UPDATE edit_orders SET status='done', final_url=COALESCE(draft_url, final_url), updated_at=now() WHERE order_id=$1`, [o.order_id]);
  res.json({ ok: true });
});

// ═══════════ 👥 Babe House Team — ระบบทำงานภายใน (คิมออกแบบ 3 ส.ค. 2569) ═══════════
// ทุกคนมีรหัสของตัวเอง · ล็อกอินแล้วเห็นเฉพาะสิ่งที่เกี่ยวกับตัวเอง · แยกฝั่งโปรดักชั่น/อะคาเดมี่
// สายงาน: ลูกค้าสั่ง → AE มอบหมาย → คนตัด → หัวหน้าตรวจ → AE ตรวจอีกชั้น → ส่งลูกค้า
// ⛔ ทุกบทบาทยกเว้น owner ไม่เห็นยอดเงิน/อีเมลลูกค้า

// ตั้งทีมเริ่มต้นให้อัตโนมัติถ้ายังไม่มีใครในระบบ (ทีมจริงของคิม ณ 3 ส.ค. 2569)
async function seedTeamIfEmpty() {
  const n = Number((await one(`SELECT COUNT(*) c FROM team_members`))?.c || 0);
  if (n > 0) return;
  const T = [
    ["คิม", "kim", "owner", "เจ้าของ", "both"],
    ["ลูกตาล", "lookthan", "ae", "AE / Motion (AE)", "production"],
    ["โบ", "bow", "senior", "ตัดต่อ", "both"],
    ["พี่ก้อง", "gong", "senior", "ตัดต่อ", "production"],
    ["กัน", "gun", "editor", "Content + ตัดต่อ", "both"],
    ["เบนเซ่", "benz", "teacher", "คอนเทนต์ Academy", "academy"],
    ["แฟรี่", "fairy", "teacher", "กราฟฟิก", "academy"],
  ];
  for (const [name, code, role, position, side] of T) {
    await run(`INSERT INTO team_members (member_id,name,code,role,position,side) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (code) DO NOTHING`, [uid("tm"), name, code, role, position, side]).catch(() => {});
  }
  console.log("[team] ตั้งทีมเริ่มต้น 7 คนแล้ว");
}
// หาว่าคนที่ยิงคำขอมาคือใคร (จากรหัสส่วนตัว) — แอดมินคีย์ของคิมนับเป็น owner เสมอ
async function teamWho(req) {
  const code = String(req.headers["x-team-code"] || req.query.code || "").trim();
  if (code) {
    const m = await one(`SELECT * FROM team_members WHERE code=$1 AND active`, [code]);
    if (m) return m;
  }
  if (isAdmin(req)) return { member_id: "admin", name: "คิม", role: "owner", position: "เจ้าของ", side: "both" };
  return null;
}
// คอมเมนต์ที่ทีมคุยกันเอง — ติดธง internal=1 ⛔ ลูกค้าไม่มีทางเห็น
const teamComment = (orderId, name, text) =>
  run(`INSERT INTO edit_comments (id,order_id,author,author_name,text,internal) VALUES ($1,$2,'team',$3,$4,1)`,
    [uid("ec"), orderId, name || "ทีม", String(text || "").slice(0, 3000)]).catch(() => {});
const teamLog = (orderId, actor, action, from, to, note) =>
  run(`INSERT INTO edit_events (event_id,order_id,actor,action,from_status,to_status,note) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [uid("ev"), orderId, actor || null, action, from || null, to || null, note || null]).catch(() => {});

// เข้าสู่ระบบทีม — ส่งรหัสมา บอกกลับว่าเป็นใคร เห็นอะไรได้บ้าง
app.post("/api/team/login", rateLimit(20, M10), async (req, res) => {
  const code = String(req.body?.code || "").trim();
  if (!code) return res.status(400).json({ ok: false, error: "NO_CODE" });
  try {
    await seedTeamIfEmpty();
    const m = await one(`SELECT member_id,name,role,position,side FROM team_members WHERE code=$1 AND active`, [code]);
    if (!m) {
      if (isAdmin({ headers: {}, query: { admin_key: code } })) return res.json({ ok: true, me: { member_id: "admin", name: "คิม", role: "owner", position: "เจ้าของ", side: "both" } });
      return res.status(401).json({ ok: false, error: "BAD_CODE", message: "รหัสไม่ถูกต้องค่ะ" });
    }
    res.json({ ok: true, me: m });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// 📋 หน้าหลักของแต่ละคน — เห็นเฉพาะสิ่งที่เกี่ยวกับตัวเอง ตามบทบาท
app.get("/api/team/me", async (req, res) => {
  const me = await teamWho(req);
  if (!me) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const isOwner = me.role === "owner", isAE = me.role === "ae", isSenior = me.role === "senior";
    // งานตัดต่อที่คนนี้ต้องเห็น
    let where = "", params = [];
    if (isOwner || isAE) where = "";                                   // เห็นทุกงาน
    else if (isSenior) { params.push(me.member_id); where = `WHERE (o.assigned_to=$1 OR o.status='senior_review')`; }
    else { params.push(me.member_id); where = `WHERE o.assigned_to=$1`; }  // คนตัด/ฟรีแลนซ์ เห็นเฉพาะของตัวเอง
    const rows = await q(`SELECT o.order_id,o.blueprint_id,o.billing_cycle,o.script_day,o.brief_json,o.clips,
        o.footage_url,o.voice_url,o.note,o.internal_note,o.status,o.draft_url,o.revisions_used,o.due_at,o.client_revisions,o.our_fix_count,o.client_name,o.source,o.client_due_at,o.deadline_risk,
        o.ref_links,o.ref_picks,o.assigned_to,o.senior_by,o.ae_by,o.created_at,
        ${isOwner ? "o.amount_satang, o.price_per_clip, o.email," : ""}
        (SELECT name FROM team_members t WHERE t.member_id=o.assigned_to) assignee_name
      FROM edit_orders o ${where}
      ORDER BY (o.status IN ('done','canceled')), o.due_at NULLS LAST, o.created_at DESC LIMIT 300`, params);
    // สายสนทนาใต้งานแต่ละชิ้น — ทีมเห็นทั้งที่คุยกันเองและที่ลูกค้าพิมพ์มา (แยกป้ายให้ชัด)
    const ids = rows.map(r => r.order_id);
    const cs = ids.length
      ? await q(`SELECT order_id, author, author_name, text, internal, created_at FROM edit_comments
                 WHERE order_id = ANY($1) ORDER BY created_at`, [ids]) : [];
    const cmap = {};
    for (const c of cs) (cmap[c.order_id] ||= []).push({ ...c, internal: Number(c.internal || 0) === 1 });
    const jobs = rows.map(({ email, ...r }) => ({ ...r, status_th: EDIT_STATUS[r.status] || r.status,
      thread: cmap[r.order_id] || [], comments: (cmap[r.order_id] || []).length,
      ref_picks: safeJson(r.ref_picks) || [], brief: safeJson(r.brief_json),
      due_th: r.due_at ? thDate(r.due_at) : null,
      customer: isOwner ? email : (String(email || "").split("@")[0].slice(0, 3) + "•••") }));

    // 🎓 ตารางสอนของคนนี้ (ฝั่ง Academy) + ค่าคอมที่จะได้
    // ค่าคอมคิดจาก "ยอดที่เก็บได้จริง" ของรอบนั้น × ส่วนแบ่ง (ไม่ใช่ราคาป้าย — บางคนใช้โค้ดส่วนลด)
    const teach = await q(`SELECT ta.teach_id, ta.share_percent, ta.paid, s.session_id, s.starts_at, s.seats, s.location,
        w.name workshop_name,
        (SELECT COALESCE(SUM(b.qty),0) FROM workshop_bookings b WHERE b.session_id=s.session_id AND b.status='paid') booked,
        (SELECT COALESCE(SUM(b.amount_satang),0) FROM workshop_bookings b WHERE b.session_id=s.session_id AND b.status='paid') revenue_satang
      FROM teach_assignments ta
      JOIN workshop_sessions s ON s.session_id=ta.session_id
      JOIN workshops w ON w.workshop_id=s.workshop_id
      ${isOwner || isAE ? "" : "WHERE ta.member_id=$1"} ORDER BY s.starts_at`, (isOwner || isAE) ? [] : [me.member_id]);

    // คนที่มอบหมายงานได้ (สำหรับ AE/owner) — เอาไว้ทำเมนูเลือกคน
    const members = (isOwner || isAE)
      ? await q(`SELECT member_id,name,role,position,side FROM team_members WHERE active ORDER BY role, name`) : [];

    res.json({ ok: true, me, jobs, teach: teach.map(t => ({ ...t,
        booked: Number(t.booked || 0), revenue_baht: Number(t.revenue_satang || 0) / 100,
        share_baht: Math.round(Number(t.revenue_satang || 0) / 100 * (Number(t.share_percent || 10) / 100)),
        starts_th: thDate(t.starts_at) })),
      members, statuses: EDIT_STATUS, hours: "จันทร์-ศุกร์ 12:00-19:00 น.", working_now: isWorkingNow() });
  } catch (e) { console.error("team/me", e.message); res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// ═══════ 📅 ตารางว่าง + ระบบมอบหมายงานอัตโนมัติ (คิมสั่ง 3 ส.ค. 2569) ═══════
// "ให้ระบบเป็นคนแอสไซน์งานให้แทน ก็จะลดขั้นตอนการทำงานของลูกตาล"
// วิธีเลือกคน (โปร่งใส บอกเหตุผลได้ทุกครั้ง):
//   1. ต้องลงว่าว่างในช่วงก่อนถึงกำหนดส่ง (ฟรีแลนซ์ลงเอง เราไม่ต้องเดา)
//   2. เลือกคนที่ "โหลดเทียบกับที่รับไหว" ต่ำสุด — ไม่ใช่แค่จำนวนงานน้อยสุด
//   3. คะแนนการทำงานดีกว่าได้เปรียบเล็กน้อย (ตรงเวลา + โดนตีกลับน้อย)
// ⛔ ระบบไม่แตะงานที่มีคนทำอยู่แล้ว และลูกตาลเปลี่ยนตัวคนทำทีหลังได้เสมอ

const AVAIL_DAYS = 14;   // มองไปข้างหน้า 14 วัน

// โหลดปัจจุบันของแต่ละคน + ที่ว่างที่ลงไว้
async function teamWorkload(days = AVAIL_DAYS) {
  const members = await q(`SELECT member_id, name, role, position FROM team_members
    WHERE active AND role IN ('editor','senior','ae') ORDER BY name`);
  const load = await q(`SELECT assigned_to, COUNT(*) jobs, COALESCE(SUM(clips),1) clips
    FROM edit_orders WHERE assigned_to IS NOT NULL AND status NOT IN ('done','canceled','draft_sent')
    GROUP BY assigned_to`);
  const avail = await q(`SELECT member_id, day, slots FROM team_availability
    WHERE day >= CURRENT_DATE AND day < CURRENT_DATE + $1::int ORDER BY day`, [days]);
  // 📦 งานนอกเว็บนับรวมด้วย — ไม่งั้นระบบจะคิดว่าคนว่างทั้งที่ติดงานโปรดักชั่นอยู่
  const ext = await q(`SELECT member_id, COUNT(*) jobs, COALESCE(SUM(clips),0) clips
    FROM external_jobs WHERE status='active' GROUP BY member_id`);
  const em = Object.fromEntries(ext.map(r => [r.member_id, r]));
  const lm = Object.fromEntries(load.map(r => [r.assigned_to, r]));
  const am = {};
  for (const a of avail) (am[a.member_id] ||= []).push({ day: String(a.day).slice(0, 10), slots: Number(a.slots || 0) });
  return members.map(m => {
    const a = am[m.member_id] || [];
    const capacity = a.reduce((t, x) => t + x.slots, 0);          // รับได้รวมกี่คลิปใน 14 วัน
    const web = Number(lm[m.member_id]?.clips || 0), outside = Number(em[m.member_id]?.clips || 0);
    const busy = web + outside;
    return { ...m, open_jobs: Number(lm[m.member_id]?.jobs || 0), busy_clips: busy,
      web_clips: web, ext_clips: outside, ext_jobs: Number(em[m.member_id]?.jobs || 0),
      capacity, free_slots: Math.max(0, capacity - busy), days: a,
      load_pct: capacity ? Math.min(999, Math.round(busy / capacity * 100)) : null };
  });
}

// คะแนนการทำงานรายคน — ส่งตรงเวลาไหม · โดนตีกลับบ่อยไหม
async function teamScorecard(month) {
  const m = month || new Date().toISOString().slice(0, 7);
  const rows = await q(`SELECT o.assigned_to, t.name,
      COUNT(*) FILTER (WHERE o.delivered_at IS NOT NULL) delivered,
      COUNT(*) FILTER (WHERE o.delivered_at IS NOT NULL AND o.due_at IS NOT NULL AND o.delivered_at <= o.due_at) on_time,
      COALESCE(SUM(o.reject_count),0) rejects, COUNT(*) total
    FROM edit_orders o JOIN team_members t ON t.member_id = o.assigned_to
    WHERE to_char(COALESCE(o.delivered_at, o.created_at) AT TIME ZONE 'Asia/Bangkok','YYYY-MM') = $1
    GROUP BY o.assigned_to, t.name ORDER BY t.name`, [m]);
  return rows.map(r => ({ member_id: r.assigned_to, name: r.name,
    total: Number(r.total), delivered: Number(r.delivered), on_time: Number(r.on_time),
    on_time_pct: Number(r.delivered) ? Math.round(Number(r.on_time) / Number(r.delivered) * 100) : null,
    rejects: Number(r.rejects),
    rejects_per_job: Number(r.total) ? +(Number(r.rejects) / Number(r.total)).toFixed(2) : 0 }));
}

// เลือกคนที่เหมาะที่สุดสำหรับงานหนึ่ง — คืนเหตุผลกลับไปด้วยเสมอ
async function pickAssignee(job) {
  const wl = await teamWorkload();
  const score = await teamScorecard();
  const sm = Object.fromEntries(score.map(s => [s.member_id, s]));
  // ต้องมีที่ว่างเหลือ — ใครไม่ลงปฏิทินเลย ระบบไม่กล้ายัดงานให้ (โดยเฉพาะฟรีแลนซ์)
  const eligible = wl.filter(m => m.capacity > 0 && m.free_slots >= (Number(job.clips) || 1));
  if (!eligible.length) return { member: null, reason: "ยังไม่มีใครลงว่างพอสำหรับงานนี้" };
  const rank = eligible.map(m => {
    const s = sm[m.member_id] || {};
    const onTime = s.on_time_pct == null ? 85 : s.on_time_pct;      // คนใหม่ให้กลางๆ ไม่เสียเปรียบ
    const penalty = (s.rejects_per_job || 0) * 5;
    return { m, points: (100 - (m.load_pct ?? 0)) + (onTime - 85) / 2 - penalty };
  }).sort((a, b) => b.points - a.points);
  const best = rank[0].m;
  return { member: best,
    reason: `ว่างเหลือ ${best.free_slots} คลิป · โหลดตอนนี้ ${best.load_pct ?? 0}%` +
            (sm[best.member_id]?.on_time_pct != null ? ` · ตรงเวลา ${sm[best.member_id].on_time_pct}%` : " · ยังไม่มีสถิติ") };
}

// 📅 ลงวันว่างของตัวเอง (ทุกคนลงของตัวเองได้ · AE/คิม ดูของทุกคนได้)
app.get("/api/team/availability", async (req, res) => {
  const me = await teamWho(req);
  if (!me) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const all = ["owner", "ae"].includes(me.role) && req.query.all === "1";
  const rows = await q(`SELECT member_id, day, slots FROM team_availability
    WHERE day >= CURRENT_DATE AND day < CURRENT_DATE + $1::int ${all ? "" : "AND member_id = $2"} ORDER BY day`,
    all ? [AVAIL_DAYS] : [AVAIL_DAYS, me.member_id]);
  res.json({ ok: true, days: AVAIL_DAYS, availability: rows.map(r => ({ ...r, day: String(r.day).slice(0, 10) })) });
});
app.post("/api/team/availability", async (req, res) => {
  const me = await teamWho(req);
  if (!me) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const day = String(req.body?.day || "").slice(0, 10);
  const slots = Math.max(0, Math.min(20, Number(req.body?.slots) || 0));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ ok: false, error: "BAD_DAY" });
  // ⛔ ลงได้เฉพาะของตัวเอง (AE/คิม ลงแทนคนอื่นได้ เผื่อฟรีแลนซ์โทรมาบอก)
  const target = (["owner", "ae"].includes(me.role) && req.body?.member_id) ? String(req.body.member_id) : me.member_id;
  if (slots === 0) { await run(`DELETE FROM team_availability WHERE member_id=$1 AND day=$2`, [target, day]); return res.json({ ok: true, cleared: true }); }
  await run(`INSERT INTO team_availability (avail_id,member_id,day,slots) VALUES ($1,$2,$3,$4)
    ON CONFLICT (member_id, day) DO UPDATE SET slots=EXCLUDED.slots, updated_at=now()`, [uid("av"), target, day, slots]);
  res.json({ ok: true, day, slots });
});

// ═══════ 📮 ระบบตามงานลูกค้าอัตโนมัติ (คิมสั่ง 4 ส.ค. 2569) ═══════
// "ถ้าใช้ระบบคนตามอาจจะมีตกหล่นและหลงลืมไปว่าจะมีงานนี้ อยากได้ระบบคอยติดตามงานลูกค้าด้วย"
// ตาม 2 เรื่อง: (1) ฟุตเทจยังไม่มา (2) ส่งดราฟต์แล้วลูกค้าเงียบ
// ⏱️ นาฬิกาส่งงานเริ่มนับตอนได้ฟุตเทจครบ — ลูกค้าส่งช้า กำหนดส่งเลื่อนตาม ไม่ใช่ทีมรับกรรม
// ตามวันที่ 2 · 5 · 9 แล้วหยุด (ไม่ตื๊อจนน่ารำคาญ) — ตั้งเป็น "0" ได้เพื่อทดสอบ
const FOLLOWUP_DAYS = String(process.env.FOLLOWUP_DAYS || "2,5,9").split(",").map(Number).filter(n => n >= 0);

async function runClientFollowups(force = false) {
  try {
    let sent = 0;
    // (1) รอฟุตเทจ
    const waitingFiles = await q(`SELECT o.*, EXTRACT(DAY FROM now() - o.created_at)::int AS age
      FROM edit_orders o WHERE o.status='awaiting_files' AND o.payment_status='paid'
      AND o.created_at > now() - interval '60 days' LIMIT 200`);
    for (const o of waitingFiles) {
      const round = FOLLOWUP_DAYS.filter(dd => Number(o.age) >= dd).length;
      if (!round) continue;
      const done = await one(`SELECT 1 FROM client_followups WHERE order_id=$1 AND kind='footage' AND round=$2`, [o.order_id, round]);
      if (done && !force) continue;
      const to = o.source === "ae" ? null : o.email;   // ลูกค้านอกเว็บไม่มีอีเมลจริง → แจ้ง AE แทน
      const who = o.client_name || o.email;
      if (to) await sendEmail(to, "🎬 รอไฟล์จากคุณอยู่นะคะ",
        wrap(`สวัสดีค่ะ 🩵<br><br>ทีมเตรียมคิวตัดคลิปให้คุณไว้แล้ว แต่ยังไม่ได้รับไฟล์เลยค่ะ<br><br>
          <b>ส่งลิงก์ฟุตเทจมาได้ที่หน้างานตัดต่อเลยนะคะ</b><br>
          ⏱️ กำหนดส่งงานจะเริ่มนับตั้งแต่วันที่เราได้ไฟล์ครบค่ะ — ยิ่งส่งเร็ว ยิ่งได้งานเร็วนะคะ<br><br>
          ${btn(appBaseUrl() + "/edit/" + o.order_id, "ส่งไฟล์ให้ทีม")}`)).catch(() => {});
      else await sendEmail(OPS_EMAIL, `📮 ตามฟุตเทจ: ${who} (รอบ ${round})`,
        wrap(`งานนี้รอไฟล์มา <b>${o.age} วัน</b>แล้วค่ะ<br><br>ลูกค้า: <b>${who}</b><br>ติดต่อ: ${o.client_contact || "-"}<br>งาน: ${(safeJson(o.brief_json) || {}).title || "-"}<br><br>ช่วยตามให้หน่อยนะคะ`)).catch(() => {});
      await run(`INSERT INTO client_followups (followup_id,order_id,kind,round,note) VALUES ($1,$2,'footage',$3,$4)`,
        [uid("fu"), o.order_id, round, `รอไฟล์ ${o.age} วัน`]);
      sent++;
    }
    // (2) ส่งดราฟต์แล้วลูกค้าเงียบ
    const waitingFb = await q(`SELECT o.*, EXTRACT(DAY FROM now() - o.updated_at)::int AS age
      FROM edit_orders o WHERE o.status='draft_sent' AND o.updated_at < now() - interval '2 days'
      AND o.updated_at > now() - interval '60 days' LIMIT 200`);
    for (const o of waitingFb) {
      const round = FOLLOWUP_DAYS.filter(dd => Number(o.age) >= dd).length;
      if (!round) continue;
      const done = await one(`SELECT 1 FROM client_followups WHERE order_id=$1 AND kind='feedback' AND round=$2`, [o.order_id, round]);
      if (done && !force) continue;
      const to = o.source === "ae" ? null : o.email;
      if (to) await sendEmail(to, "👀 ดูงานที่ทีมส่งไปหรือยังคะ",
        wrap(`สวัสดีค่ะ 🩵<br><br>ทีมส่งงานให้ดูไป <b>${o.age} วัน</b>แล้ว ยังไม่ได้รับคอมเมนต์กลับเลยค่ะ<br><br>
          ถ้าโอเคแล้วกดอนุมัติได้เลย ถ้าอยากแก้ตรงไหนบอกได้เลยนะคะ<br>
          <span style="color:#888">ถ้าเงียบเกิน 14 วัน ระบบจะถือว่างานผ่านและปิดงานให้อัตโนมัติค่ะ</span><br><br>
          ${btn(appBaseUrl() + "/edit/" + o.order_id, "เปิดดูงาน")}`)).catch(() => {});
      else await sendEmail(OPS_EMAIL, `📮 ตามฟีดแบ็ก: ${o.client_name || o.email} (รอบ ${round})`,
        wrap(`ส่งงานไปแล้ว <b>${o.age} วัน</b> ลูกค้ายังไม่ตอบค่ะ<br><br>ติดต่อ: ${o.client_contact || "-"}<br><br>ช่วยตามให้หน่อยนะคะ`)).catch(() => {});
      await run(`INSERT INTO client_followups (followup_id,order_id,kind,round,note) VALUES ($1,$2,'feedback',$3,$4)`,
        [uid("fu"), o.order_id, round, `รอฟีดแบ็ก ${o.age} วัน`]);
      sent++;
    }
    if (sent) console.log(`[followup] ส่งไป ${sent} ฉบับ`);
    return sent;
  } catch (e) { console.error("followup", e.message); return 0; }
}

// ⏱️ ได้ฟุตเทจครบแล้ว → เริ่มนับนาฬิกาส่งงานตรงนี้ (ไม่ใช่วันรับงาน)
// คิมถาม: "ถ้าลูกค้าให้เดดไลน์มาแต่ยังอัพฟุตเทจไม่ครบจะทำยังไง"
// → ระบบเลื่อนกำหนดส่งให้อัตโนมัติ + บอกลูกค้าตรงๆ ว่าเลื่อนเพราะอะไร ไม่ต้องให้คนไปเจรจาเอง
app.post("/api/team/files-ready", async (req, res) => {
  const me = await teamWho(req);
  if (!me) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const id = String(req.body?.order_id || "");
  const o = await one(`SELECT * FROM edit_orders WHERE order_id=$1`, [id]);
  if (!o) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  const lead = leadDaysFor(Number(o.clips) || 1);   // ใช้สูตรเดียวกับตอนบอกลูกค้าตอนขาย
  const due = addWorkDays(new Date(), lead);
  const late = o.client_due_at && due > new Date(o.client_due_at);
  await run(`UPDATE edit_orders SET files_ready_at=COALESCE(files_ready_at, now()), due_at=$2,
     status=CASE WHEN status='awaiting_files' THEN 'editing' ELSE status END,
     deadline_risk=$3, updated_at=now() WHERE order_id=$1`,
    [id, due.toISOString(), late ? "slipped" : "ok"]);
  await teamComment(id, me.name, `📥 ได้ไฟล์ครบแล้ว — กำหนดส่งใหม่ ${thDate(due)}${late ? " ⚠️ เลยวันที่ลูกค้าขอ" : ""}`);
  res.json({ ok: true, due_at: due.toISOString(), due_th: thDate(due), slipped: !!late,
    message: late ? "เลยวันที่ลูกค้าขอ — ระบบเตรียมข้อความแจ้งลูกค้าให้แล้ว" : "กำหนดส่งใหม่เรียบร้อย" });
});

// 🧠 AI ประเมินทีมรายสัปดาห์ → เข้าหน้าคิม (คิมเคาะ 4 ส.ค.: เอารายสัปดาห์)
const isoWeek = (d = new Date()) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 86400000 + 1) / 7)).padStart(2, "0")}`;
};
async function buildTeamReview(force = false) {
  const week = isoWeek();
  if (!force) { const had = await one(`SELECT review_json FROM team_reviews WHERE week=$1`, [week]); if (had) return safeJson(had.review_json); }
  const [wl, score] = await Promise.all([teamWorkload(), teamScorecard()]);
  const sm = Object.fromEntries(score.map(x => [x.member_id, x]));
  const people = wl.map(m => ({ ...m, score: sm[m.member_id] || null }));
  const c = await one(`SELECT
      COUNT(*) FILTER (WHERE assigned_to IS NULL AND status NOT IN ('done','canceled')) unassigned,
      COUNT(*) FILTER (WHERE due_at < now() AND status NOT IN ('done','canceled')) late,
      COUNT(*) FILTER (WHERE status='awaiting_files') awaiting_files,
      COUNT(*) FILTER (WHERE status='draft_sent') draft_sent FROM edit_orders`);
  const { review, model, usage } = await reviewTeamWeek({ people, week,
    jobs: { unassigned: Number(c?.unassigned || 0), late: Number(c?.late || 0),
            awaiting_files: Number(c?.awaiting_files || 0), draft_sent: Number(c?.draft_sent || 0) } });
  if (usage) await run(`INSERT INTO ai_usage (id,kind,model,input_tokens,output_tokens,total_tokens) VALUES ($1,'team_review',$2,$3,$4,$5)`,
    [uid("use"), model, usage.input || 0, usage.output || 0, usage.total || 0]).catch(() => {});
  await run(`INSERT INTO team_reviews (review_id,week,review_json) VALUES ($1,$2,$3)
    ON CONFLICT (week) DO UPDATE SET review_json=EXCLUDED.review_json, created_at=now()`, [uid("tr"), week, JSON.stringify(review)]);
  return review;
}
app.get("/api/team/weekly-review", async (req, res) => {
  const me = await teamWho(req);
  if (!me || me.role !== "owner") return res.status(403).json({ ok: false, error: "NOT_ALLOWED" });
  try { res.json({ ok: true, week: isoWeek(), review: await buildTeamReview(req.query.refresh === "1") }); }
  catch (e) { console.error("weekly-review", e.message); res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// 🔁 ทีมระบุว่ารอบแก้นี้ "เราพลาด" หรือ "ลูกค้าเปลี่ยนใจ" (คิมเคาะ 4 ส.ค.)
// "ถ้าเป็นที่ความผิดพลาดของเราเองจะต้องแก้ไขได้กี่ครั้ง หรือถ้าลูกค้าแก้ไขเกินกว่าเรากำหนด
//  ระบบมีวิธีจัดการยังไงบ้าง" → เราผิด = ฟรีไม่จำกัด · ลูกค้าเปลี่ยนใจ = ฟรี 2 ครั้ง เกินคิด 50%
app.post("/api/team/revision-fault", async (req, res) => {
  const me = await teamWho(req);
  if (!me || !["owner", "ae", "senior"].includes(me.role)) return res.status(403).json({ ok: false, error: "NOT_ALLOWED" });
  const id = String(req.body?.order_id || ""), ours = !!req.body?.our_fault;
  const o = await one(`SELECT * FROM edit_orders WHERE order_id=$1`, [id]);
  if (!o) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  if (ours) {
    // ย้ายรอบล่าสุดจากฝั่งลูกค้ามาเป็นฝั่งเรา — คืนโควตาให้ลูกค้า
    if (Number(o.client_revisions || 0) < 1) return res.status(409).json({ ok: false, error: "NOTHING", message: "ยังไม่มีรอบแก้ให้ย้ายค่ะ" });
    await run(`UPDATE edit_orders SET client_revisions=client_revisions-1, our_fix_count=COALESCE(our_fix_count,0)+1 WHERE order_id=$1`, [id]);
    await teamComment(id, me.name, `🔁 รอบนี้เป็นความผิดของเรา — แก้ฟรี ไม่นับโควตาลูกค้า`);
  } else {
    await run(`UPDATE edit_orders SET client_revisions=COALESCE(client_revisions,0)+1 WHERE order_id=$1`, [id]);
    await teamComment(id, me.name, `🔁 รอบนี้ลูกค้าเปลี่ยนใจ — นับโควตา`);
  }
  const r = await one(`SELECT client_revisions, our_fix_count, price_per_clip, clips FROM edit_orders WHERE order_id=$1`, [id]);
  const used = Number(r.client_revisions || 0);
  const over = Math.max(0, used - EDIT_FREE_REVISIONS);
  // ⚠️ งานที่ใช้เครดิต/งานนอกเว็บไม่มีราคาต่อคลิปเก็บไว้ → ใช้ "ราคาตัดต่อ" ตามจำนวนคลิป
  //    (เคยพลาด: ไปหยิบราคา Blueprint 1,590 มาคิดค่าแก้งานตัดต่อ ซึ่งคนละสินค้ากัน)
  const per = Number(r.price_per_clip || 0) || editPrice(Number(r.clips) || 1);
  res.json({ ok: true, client_revisions: used, our_fix_count: Number(r.our_fix_count || 0),
    free_left: Math.max(0, EDIT_FREE_REVISIONS - used), over_rounds: over,
    charge_baht: Math.round(over * per * (REVISION_OVER_PCT / 100) * (Number(r.clips) || 1)),
    over_pct: REVISION_OVER_PCT });
});

// 🏢 ลูกตาลรับบรีฟลูกค้านอกเว็บ → ระบบมอบหมายให้เอง (คิมสั่ง 4 ส.ค. 2569)
// "ลูกตาลเป็นด่านแรกในการรับหน้า รับบรีฟ เอาบรีฟมาลงในบอร์ดตัวเอง จากนั้นระบบเป็นคน assign
//  หน้าที่ของลูกตาลก็จะเหลือแค่รับหน้าลูกค้าและตรวจงาน ไม่ต้องประสาน"
// ⏱️ เดดไลน์: เก็บ "วันที่ลูกค้าขอ" แยกจาก "กำหนดส่งจริง" ที่นับจากวันได้ฟุตเทจครบ
app.post("/api/team/intake", async (req, res) => {
  const me = await teamWho(req);
  if (!me || !["owner", "ae"].includes(me.role)) return res.status(403).json({ ok: false, error: "NOT_ALLOWED", message: "เฉพาะ AE เท่านั้นค่ะ" });
  const b = req.body || {};
  const client = String(b.client_name || "").trim();
  const title = String(b.title || "").trim();
  if (!client || !title) return res.status(400).json({ ok: false, error: "MISSING", message: "ใส่ชื่อลูกค้าและชื่องานด้วยนะคะ" });
  const clips = Math.max(1, Math.min(200, Number(b.clips) || 1));
  const hasFiles = !!String(b.footage_url || "").trim();
  const id = uid("eo");
  try {
    await run(`INSERT INTO edit_orders (order_id,email,billing_cycle,brief_json,clips,price_per_clip,amount_satang,
        payment_status,provider,paid_by,note,footage_url,voice_url,ref_links,status,
        source,client_name,client_contact,client_due_at,files_ready_at,due_at)
      VALUES ($1,$2,$3,$4,$5,0,0,'paid','external','external',$6,$7,$8,$9,$10,'ae',$11,$12,$13,$14,$15)`,
      [id, String(b.client_email || `client+${id.slice(-8)}@babehouse.local`).toLowerCase(),
       currentBillingCycle(), JSON.stringify({ title, brief: String(b.brief || "") }).slice(0, 20000), clips,
       String(b.note || "").slice(0, 2000) || null,
       String(b.footage_url || "").slice(0, 1000) || null,
       String(b.voice_url || "").slice(0, 1000) || null,
       String(b.ref_links || "").slice(0, 2000) || null,
       hasFiles ? "editing" : "awaiting_files",
       client.slice(0, 200), String(b.client_contact || "").slice(0, 200) || null,
       /^\d{4}-\d{2}-\d{2}$/.test(String(b.client_due || "")) ? b.client_due : null,
       hasFiles ? new Date().toISOString() : null,
       /^\d{4}-\d{2}-\d{2}$/.test(String(b.client_due || "")) ? b.client_due : null]);
    await teamComment(id, me.name, `🏢 รับบรีฟจากลูกค้า ${client}${b.client_due ? ` · ลูกค้าขอส่ง ${b.client_due}` : ""}`);
    // ให้ระบบเลือกคนทันที — ลูกตาลไม่ต้องเลือกเอง
    const job = await one(`SELECT * FROM edit_orders WHERE order_id=$1`, [id]);
    const { member, reason } = await pickAssignee(job);
    if (member) {
      await run(`UPDATE edit_orders SET assigned_to=$1, assigned_at=now(), assigned_by='system', assign_reason=$3,
         status=CASE WHEN status='awaiting_files' THEN status ELSE 'assigned' END WHERE order_id=$2`, [member.member_id, id, reason]);
      await teamComment(id, "ระบบ", `🤖 มอบหมายให้ ${member.name} อัตโนมัติ — ${reason}`);
      const m = await one(`SELECT email, name FROM team_members WHERE member_id=$1`, [member.member_id]);
      if (m?.email) sendEmail(m.email, "🎬 มีงานตัดต่อใหม่รอคุณอยู่",
        wrap(`สวัสดีค่ะ ${m.name} 🩵<br><br>ระบบมอบหมายงานใหม่ให้คุณแล้วนะคะ<br><br>${btn(appBaseUrl() + "/team", "เปิดหน้างานของฉัน")}`)).catch(() => {});
    }
    res.json({ ok: true, order_id: id, assigned_to: member?.name || null, reason: member ? reason : "ยังไม่มีใครลงว่างพอ — รอมอบหมาย" });
  } catch (e) { console.error("intake", e.message); res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// 📦 งานนอกเว็บ — ใครก็เพิ่มของตัวเองได้ (ไม่ต้องรอลูกตาลกรอกให้)
app.get("/api/team/external", async (req, res) => {
  const me = await teamWho(req);
  if (!me) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const all = ["owner", "ae", "senior"].includes(me.role) && req.query.all === "1";
  const rows = await q(`SELECT e.*, t.name member_name FROM external_jobs e
    LEFT JOIN team_members t ON t.member_id = e.member_id
    WHERE e.status='active' ${all ? "" : "AND e.member_id = $1"} ORDER BY e.due_at NULLS LAST, e.created_at`,
    all ? [] : [me.member_id]);
  res.json({ ok: true, jobs: rows.map(r => ({ ...r, due_th: r.due_at ? thDate(r.due_at) : null })) });
});
app.post("/api/team/external", async (req, res) => {
  const me = await teamWho(req);
  if (!me) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const b = req.body || {};
  if (b.action === "done" && b.ext_id) {
    // ปิดได้เฉพาะงานตัวเอง (AE/คิม ปิดของใครก็ได้)
    const own = ["owner", "ae"].includes(me.role) ? "" : " AND member_id = $2";
    const r = await run(`UPDATE external_jobs SET status='done', done_at=now() WHERE ext_id=$1${own}`,
      own ? [String(b.ext_id), me.member_id] : [String(b.ext_id)]);
    return res.json({ ok: !!r.rowCount, done: !!r.rowCount });
  }
  const title = String(b.title || "").trim();
  if (!title) return res.status(400).json({ ok: false, error: "MISSING", message: "ใส่ชื่องานด้วยนะคะ" });
  // เพิ่มให้ตัวเองเป็นค่าเริ่มต้น — AE/คิม เพิ่มแทนคนอื่นได้
  const target = (["owner", "ae"].includes(me.role) && b.member_id) ? String(b.member_id) : me.member_id;
  await run(`INSERT INTO external_jobs (ext_id,member_id,title,clips,client,source,due_at,note,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [uid("ext"), target, title.slice(0, 200), Math.max(1, Math.min(99, Number(b.clips) || 1)),
     String(b.client || "").slice(0, 120) || null, String(b.source || "manual").slice(0, 20),
     /^\d{4}-\d{2}-\d{2}$/.test(String(b.due_at || "")) ? b.due_at : null,
     String(b.note || "").slice(0, 500) || null, me.name]);
  res.json({ ok: true });
});

// 👀 ภาพรวมตารางงานทุกคน (AE/คิม) — ใครว่าง ใครเต็ม โปรเซสไปถึงไหน
app.get("/api/team/workload", async (req, res) => {
  const me = await teamWho(req);
  // ⛔ เหลือให้คิมคนเดียว (คิมสั่ง 4 ส.ค.) — คนอื่นโฟกัสงานตัวเองพอ ระบบมอบหมายเองแล้ว
  if (!me || me.role !== "owner") return res.status(403).json({ ok: false, error: "NOT_ALLOWED" });
  try {
    const [wl, score] = await Promise.all([teamWorkload(), teamScorecard(String(req.query.month || "") || undefined)]);
    const sm = Object.fromEntries(score.map(s => [s.member_id, s]));
    const waiting = await q(`SELECT order_id, clips, due_at, status, brief_json FROM edit_orders
      WHERE assigned_to IS NULL AND status NOT IN ('done','canceled') ORDER BY due_at NULLS LAST, created_at LIMIT 50`);
    res.json({ ok: true, days: AVAIL_DAYS,
      people: wl.map(m => ({ ...m, score: sm[m.member_id] || null })),
      unassigned: waiting.map(w => ({ ...w, brief: safeJson(w.brief_json), due_th: w.due_at ? thDate(w.due_at) : null })) });
  } catch (e) { console.error("workload", e.message); res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// 🤖 ให้ระบบมอบหมายงานให้เอง (งานเดียว หรือทั้งหมดที่ยังไม่มีคนทำ)
app.post("/api/team/auto-assign", async (req, res) => {
  const me = await teamWho(req);
  if (!me || !["owner", "ae"].includes(me.role)) return res.status(403).json({ ok: false, error: "NOT_ALLOWED" });
  try {
    const one_id = String(req.body?.order_id || "");
    const jobs = one_id
      ? await q(`SELECT * FROM edit_orders WHERE order_id=$1 AND assigned_to IS NULL AND status NOT IN ('done','canceled')`, [one_id])
      : await q(`SELECT * FROM edit_orders WHERE assigned_to IS NULL AND status NOT IN ('done','canceled') ORDER BY due_at NULLS LAST, created_at LIMIT 30`);
    const done = [], skipped = [];
    for (const job of jobs) {
      const { member, reason } = await pickAssignee(job);
      if (!member) { skipped.push({ order_id: job.order_id, reason }); continue; }
      await run(`UPDATE edit_orders SET assigned_to=$1, assigned_at=now(), assigned_by='system', assign_reason=$3,
         status=CASE WHEN status='awaiting_files' THEN status ELSE 'assigned' END, updated_at=now() WHERE order_id=$2`,
        [member.member_id, job.order_id, reason]);
      teamLog(job.order_id, "ระบบ", "assign", job.status, "assigned", `ระบบเลือก ${member.name} — ${reason}`);
      await teamComment(job.order_id, "ระบบ", `🤖 มอบหมายให้ ${member.name} อัตโนมัติ — ${reason}`);
      const m = await one(`SELECT email, name FROM team_members WHERE member_id=$1`, [member.member_id]);
      if (m?.email) sendEmail(m.email, `🎬 มีงานตัดต่อใหม่รอคุณอยู่`,
        wrap(`สวัสดีค่ะ ${m.name} 🩵<br><br>ระบบมอบหมายงานใหม่ให้คุณแล้วนะคะ<br><br>
          เข้าไปดูได้ที่ <b>${appBaseUrl()}/team</b><br><br>ขอบคุณค่ะ`)).catch(() => {});
      done.push({ order_id: job.order_id, to: member.name, reason });
    }
    res.json({ ok: true, assigned: done.length, skipped: skipped.length, done, skipped });
  } catch (e) { console.error("auto-assign", e.message); res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// 🎯 AE มอบหมายงานให้คนตัด
app.post("/api/team/assign", async (req, res) => {
  const me = await teamWho(req);
  if (!me || !["owner", "ae"].includes(me.role)) return res.status(403).json({ ok: false, error: "NOT_ALLOWED", message: "เฉพาะ AE เท่านั้นค่ะ" });
  const id = String(req.body?.order_id || ""), to = String(req.body?.assigned_to || "");
  if (!id || !to) return res.status(400).json({ ok: false, error: "MISSING" });
  try {
    const o = await one(`SELECT status FROM edit_orders WHERE order_id=$1`, [id]);
    if (!o) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    const m = await one(`SELECT name,email FROM team_members WHERE member_id=$1`, [to]);
    await run(`UPDATE edit_orders SET assigned_to=$1, assigned_at=now(), status=CASE WHEN status='awaiting_files' THEN status ELSE 'assigned' END,
       internal_note=COALESCE($3, internal_note), updated_at=now() WHERE order_id=$2`, [to, id, req.body?.internal_note || null]);
    teamLog(id, me.name, "assign", o.status, "assigned", `มอบหมายให้ ${m?.name || to}`);
    await teamComment(id, me.name, `📌 มอบหมายให้ ${m?.name || to}${req.body?.internal_note ? ` — ${req.body.internal_note}` : ""}`);
    if (m?.email) sendEmail(m.email, `🎬 มีงานตัดต่อใหม่รอคุณอยู่`,
      wrap(`สวัสดีค่ะ ${m.name} 🩵<br><br>มีงานใหม่ถูกมอบหมายให้คุณแล้วนะคะ<br><br>
        เข้าไปดูรายละเอียดและส่งงานได้ที่หน้าทีม → <b>${appBaseUrl()}/team</b><br><br>ขอบคุณค่ะ`)).catch(() => {});
    res.json({ ok: true, order_id: id, assigned_to: to });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// ✂️ คนตัดส่งงาน → เข้าคิวหัวหน้าตรวจ (ถ้าคนส่งเป็นหัวหน้าเอง ข้ามไปคิว AE เลย)
app.post("/api/team/submit-work", async (req, res) => {
  const me = await teamWho(req);
  if (!me) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const id = String(req.body?.order_id || ""), url = String(req.body?.draft_url || "").trim();
  if (!id || !/^https?:\/\//.test(url)) return res.status(400).json({ ok: false, error: "BAD_URL", message: "ใส่ลิงก์งานที่ตัดเสร็จด้วยนะคะ" });
  try {
    const o = await one(`SELECT status, assigned_to FROM edit_orders WHERE order_id=$1`, [id]);
    if (!o) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    if (me.role === "editor" && o.assigned_to !== me.member_id)
      return res.status(403).json({ ok: false, error: "NOT_YOURS", message: "งานนี้ไม่ใช่ของคุณค่ะ" });
    const next = ["senior", "ae", "owner"].includes(me.role) ? "ae_review" : "senior_review";
    await run(`UPDATE edit_orders SET draft_url=$1, status=$2, updated_at=now() WHERE order_id=$3`, [url, next, id]);
    teamLog(id, me.name, "submit", o.status, next, req.body?.note || null);
    await teamComment(id, me.name, `📤 ส่งงานให้ตรวจแล้ว${req.body?.note ? ` — ${req.body.note}` : ""}`);
    res.json({ ok: true, status: next, message: next === "ae_review" ? "ส่งให้ AE ตรวจแล้วค่ะ" : "ส่งให้หัวหน้าตรวจแล้วค่ะ" });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// 👀 ตรวจงาน — หัวหน้าตรวจงานฟรีแลนซ์ · AE ตรวจด่านสุดท้ายแล้วส่งลูกค้า
app.post("/api/team/review", async (req, res) => {
  const me = await teamWho(req);
  if (!me || !["owner", "ae", "senior"].includes(me.role)) return res.status(403).json({ ok: false, error: "NOT_ALLOWED" });
  const id = String(req.body?.order_id || ""), pass = req.body?.pass !== false, note = String(req.body?.note || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "MISSING" });
  try {
    const o = await one(`SELECT status, draft_url FROM edit_orders WHERE order_id=$1`, [id]);
    if (!o) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    if (!pass) {   // ตีกลับให้แก้ — งานกลับไปหาคนตัด
      // ⚠️ ไม่อนุมัติต้องบอกเหตุผลเสมอ ไม่งั้นคนตัดไม่รู้ว่าต้องแก้อะไร
      if (!note) return res.status(400).json({ ok: false, error: "NEED_NOTE", message: "เขียนบอกด้วยนะคะว่าต้องแก้อะไร คนตัดจะได้รู้" });
      // นับรอบตีกลับไว้วัดคุณภาพงานรายคน (คิม: "feedback แก้บ่อยเกินไปหรือเปล่า")
      await run(`UPDATE edit_orders SET status='editing', reject_count=COALESCE(reject_count,0)+1, updated_at=now() WHERE order_id=$1`, [id]);
      await teamComment(id, me.name, `❌ ไม่อนุมัติ — ${note}`);
      teamLog(id, me.name, "reject", o.status, "editing", note);
      return res.json({ ok: true, status: "editing", message: "ตีกลับให้แก้แล้วค่ะ" });
    }
    // หัวหน้าผ่าน → เข้าคิว AE · AE ผ่าน → ส่งลูกค้าเลย
    // ⚠️ งานที่ยังอยู่ด่านหัวหน้า ห้ามกระโดดถึงลูกค้ารวดเดียว — ต้องผ่าน 2 ตาเสมอตามที่คิมสั่ง
    // ถ้าหัวหน้าไม่ว่าง AE กดผ่านแทนได้ แต่นับเป็นด่านหัวหน้า แล้วต้องกดตรวจอีกครั้งก่อนส่งจริง
    if (o.status === "senior_review") {
      await run(`UPDATE edit_orders SET status='ae_review', senior_by=$2, senior_at=now(), updated_at=now() WHERE order_id=$1`, [id, me.name]);
      teamLog(id, me.name, "approve", o.status, "ae_review", note);
      await teamComment(id, me.name, `✅ อนุมัติด่านหัวหน้า${note ? ` — ${note}` : ""}`);
      return res.json({ ok: true, status: "ae_review",
        message: me.role === "senior" ? "ผ่านแล้วค่ะ ส่งต่อให้ AE ตรวจ" : "รับแทนหัวหน้าแล้วค่ะ — กดตรวจอีกครั้งเพื่อส่งให้ลูกค้า" });
    }
    if (!["owner", "ae"].includes(me.role)) return res.status(403).json({ ok: false, error: "NOT_ALLOWED", message: "ด่านนี้ AE เป็นคนตรวจค่ะ" });
    // delivered_at = เวลาที่งานถึงลูกค้าจริง ใช้เทียบกับ due_at เพื่อวัด "ส่งตรงเวลาไหม"
    await run(`UPDATE edit_orders SET status='draft_sent', ae_by=$2, ae_at=now(), delivered_at=COALESCE(delivered_at, now()), updated_at=now() WHERE order_id=$1`, [id, me.name]);
    teamLog(id, me.name, "deliver", o.status, "draft_sent", note);
    await teamComment(id, me.name, `🎉 อนุมัติด่านสุดท้าย ส่งให้ลูกค้าแล้ว${note ? ` — ${note}` : ""}`);
    res.json({ ok: true, status: "draft_sent", message: "ส่งงานให้ลูกค้าแล้วค่ะ 🎉" });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// 💬 คุยกันในทีมใต้งานแต่ละชิ้น — ⛔ ลูกค้าไม่เห็น (internal=1)
app.post("/api/team/comment", async (req, res) => {
  const me = await teamWho(req);
  if (!me) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const id = String(req.body?.order_id || ""), text = String(req.body?.text || "").trim();
  if (!id || !text) return res.status(400).json({ ok: false, error: "MISSING", message: "พิมพ์ข้อความก่อนนะคะ" });
  const o = await one(`SELECT order_id, assigned_to FROM edit_orders WHERE order_id=$1`, [id]);
  if (!o) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  if (me.role === "editor" && o.assigned_to !== me.member_id)
    return res.status(403).json({ ok: false, error: "NOT_YOURS", message: "งานนี้ไม่ใช่ของคุณค่ะ" });
  await teamComment(id, me.name, text);
  res.json({ ok: true });
});

// 👑 หน้าภาพรวมของคิม — เห็นทุกอย่างรวมเงินและกำไร (เฉพาะ owner)
app.get("/api/team/overview", async (req, res) => {
  const me = await teamWho(req);
  if (!me || me.role !== "owner") return res.status(403).json({ ok: false, error: "NOT_ALLOWED" });
  try {
    const byStatus = await q(`SELECT status, COUNT(*) c FROM edit_orders GROUP BY status`);
    const byPerson = await q(`SELECT t.name, t.position, t.role,
        COUNT(o.order_id) FILTER (WHERE o.status NOT IN ('done','canceled')) open_jobs,
        COUNT(o.order_id) FILTER (WHERE o.status='done') done_jobs
      FROM team_members t LEFT JOIN edit_orders o ON o.assigned_to=t.member_id
      WHERE t.active GROUP BY t.member_id, t.name, t.position, t.role ORDER BY t.role, t.name`);
    const money = await one(`SELECT COUNT(*) n, COALESCE(SUM(amount_satang),0) sum FROM edit_orders WHERE payment_status='paid' AND paid_by IS DISTINCT FROM 'credit'`);
    const credits = await one(`SELECT COALESCE(SUM(credits),0) c, COALESCE(SUM(amount_satang),0) sum FROM edit_credit_purchases WHERE payment_status='paid'`);
    const late = await one(`SELECT COUNT(*) c FROM edit_orders WHERE due_at < now() AND status NOT IN ('done','canceled')`);
    const teachSoon = await q(`SELECT ta.teach_id, ta.paid, t.name, w.name workshop_name, s.starts_at, ta.share_percent,
        (SELECT COALESCE(SUM(b.qty),0) FROM workshop_bookings b WHERE b.session_id=s.session_id AND b.status='paid') booked,
        (SELECT COALESCE(SUM(b.amount_satang),0) FROM workshop_bookings b WHERE b.session_id=s.session_id AND b.status='paid') revenue_satang
      FROM teach_assignments ta JOIN team_members t ON t.member_id=ta.member_id
      JOIN workshop_sessions s ON s.session_id=ta.session_id JOIN workshops w ON w.workshop_id=s.workshop_id
      WHERE s.starts_at > now() - interval '60 days' ORDER BY s.starts_at LIMIT 40`);
    res.json({ ok: true,
      by_status: byStatus, by_person: byPerson, late_jobs: Number(late?.c || 0),
      revenue: { orders: Number(money?.n || 0), baht: Number(money?.sum || 0) / 100,
                 credits_sold: Number(credits?.c || 0), credits_baht: Number(credits?.sum || 0) / 100 },
      margins: [1, 4, 10, 20, 30].map(n => ({ clips: n, ...editMargin(n) })),
      teach: teachSoon.map(t => ({ ...t, booked: Number(t.booked || 0), revenue_baht: Number(t.revenue_satang || 0) / 100,
        starts_th: thDate(t.starts_at), share_baht: Math.round(Number(t.revenue_satang || 0) / 100 * (Number(t.share_percent || 10) / 100)) })) });
  } catch (e) { console.error("team/overview", e.message); res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// 👥 จัดการสมาชิกทีม (เฉพาะคิม) — เพิ่มคน/ฟรีแลนซ์ · ตั้งรหัส · ปิดการใช้งาน
app.get("/api/team/members", async (req, res) => {
  const me = await teamWho(req);
  if (!me || me.role !== "owner") return res.status(403).json({ ok: false, error: "NOT_ALLOWED" });
  await seedTeamIfEmpty();
  res.json({ ok: true, members: await q(`SELECT * FROM team_members ORDER BY active DESC, role, name`) });
});
app.post("/api/team/members/save", async (req, res) => {
  const me = await teamWho(req);
  if (!me || me.role !== "owner") return res.status(403).json({ ok: false, error: "NOT_ALLOWED" });
  const b = req.body || {};
  const name = String(b.name || "").trim(), code = String(b.code || "").trim();
  if (!name || !code) return res.status(400).json({ ok: false, error: "MISSING", message: "ต้องมีชื่อและรหัส" });
  try {
    if (b.member_id) {
      await run(`UPDATE team_members SET name=$1, code=$2, role=$3, email=$4, position=$5, side=$6, active=$7 WHERE member_id=$8`,
        [name, code, String(b.role || "editor"), b.email || null, b.position || null, String(b.side || "production"), b.active !== false, String(b.member_id)]);
    } else {
      await run(`INSERT INTO team_members (member_id,name,code,role,email,position,side) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [uid("tm"), name, code, String(b.role || "editor"), b.email || null, b.position || null, String(b.side || "production")]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: /unique/i.test(e.message) ? "รหัสนี้มีคนใช้แล้วค่ะ" : e.message }); }
});
// 🎓 ผูกคนสอนกับรอบเรียน (เฉพาะคิม)
app.post("/api/team/teach/save", async (req, res) => {
  const me = await teamWho(req);
  if (!me || me.role !== "owner") return res.status(403).json({ ok: false, error: "NOT_ALLOWED" });
  const b = req.body || {};
  if (b.action === "delete" && b.teach_id) { await run(`DELETE FROM teach_assignments WHERE teach_id=$1`, [String(b.teach_id)]); return res.json({ ok: true, deleted: true }); }
  const sid = String(b.session_id || ""), mid = String(b.member_id || "");
  if (!sid || !mid) return res.status(400).json({ ok: false, error: "MISSING" });
  try {
    await run(`INSERT INTO teach_assignments (teach_id,session_id,member_id,share_percent,note) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (session_id, member_id) DO UPDATE SET share_percent=EXCLUDED.share_percent, note=EXCLUDED.note`,
      [uid("th"), sid, mid, Number(b.share_percent) || 10, b.note || null]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// ===== 🎬 หน้าเฉพาะทีมตัดต่อ (/studio) — เข้าด้วยรหัสทีม ไม่ใช่รหัสแอดมิน =====
// ⛔ ไม่ส่งยอดเงินออกไปเลย (ตัด amount_satang / price_per_clip ทิ้งก่อนตอบ) — ทีมไม่ต้องเห็นรายได้
app.get("/api/team/jobs", async (req, res) => {
  if (!isTeam(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const rows = await q(`SELECT order_id,email,blueprint_id,billing_cycle,script_day,brief_json,clips,
      footage_url,voice_url,note,status,draft_url,final_url,revisions_used,due_at,ref_links,ref_picks,assignee,paid_by,created_at,updated_at
      FROM edit_orders ORDER BY (status='done' OR status='canceled'), due_at NULLS LAST, created_at DESC`);
    const cs = await q(`SELECT order_id, COUNT(*) n FROM edit_comments GROUP BY order_id`);
    const cmap = Object.fromEntries(cs.map(c => [c.order_id, Number(c.n)]));
    res.json({ ok: true, statuses: EDIT_STATUS, hours: "จันทร์-ศุกร์ 12:00-19:00 น.", working_now: isWorkingNow(),
      orders: rows.map(({ email, ...r }) => ({ ...r, status_th: EDIT_STATUS[r.status] || r.status, comments: cmap[r.order_id] || 0,
        ref_picks: safeJson(r.ref_picks) || [], brief: safeJson(r.brief_json), due_th: r.due_at ? thDate(r.due_at) : null,
        // 🔒 ไม่ส่งอีเมลลูกค้าให้ทีม — ส่งแค่ชื่อย่อไว้แยกว่างานไหนของลูกค้าคนเดียวกัน (คุยกันผ่านกล่องคอมเมนต์ในระบบ)
        customer: String(email || "").split("@")[0].slice(0, 3) + "•••" })) });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});
// ทีมอัปเดตงาน — เปลี่ยนสถานะ · แนบงานที่ตัดเสร็จ · รับงานเป็นของตัวเอง (ไม่มีสิทธิ์แตะเรื่องเงิน)
app.post("/api/team/job/update", async (req, res) => {
  if (!isTeam(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const id = String(req.body?.order_id || "");
  const o = await one(`SELECT * FROM edit_orders WHERE order_id=$1`, [id]);
  if (!o) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  const sets = [], vals = [];
  const put = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
  if (typeof req.body?.status === "string" && EDIT_STATUS[req.body.status]) put("status", req.body.status);
  if (typeof req.body?.draft_url === "string") put("draft_url", req.body.draft_url.trim() || null);
  if (typeof req.body?.assignee === "string") put("assignee", req.body.assignee.trim() || null);
  if (!sets.length) return res.status(400).json({ ok: false, error: "NOTHING_TO_UPDATE" });
  try {
    vals.push(id);
    await run(`UPDATE edit_orders SET ${sets.join(",")}, updated_at=now() WHERE order_id=$${vals.length}`, vals);
    res.json({ ok: true, order_id: id, updated: sets.length });
  } catch (e) { res.status(500).json({ ok: false, error: "UPDATE_FAILED", message: e.message }); }
});
// ทีมตอบลูกค้าในงานนั้น (ใช้กล่องคอมเมนต์เดียวกับที่ลูกค้าเห็น)
app.post("/api/team/job/comment", async (req, res) => {
  if (!isTeam(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const id = String(req.body?.order_id || ""), text = String(req.body?.text || "").trim();
  if (!id || !text) return res.status(400).json({ ok: false, error: "MISSING" });
  try {
    await run(`INSERT INTO edit_comments (id,order_id,author,author_name,text) VALUES ($1,$2,'team',$3,$4)`,
      [uid("ec"), id, String(req.body?.author_name || "ทีม Babe House").slice(0, 60), text.slice(0, 3000)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// ===== หลังบ้านทีม =====
app.get("/api/admin/edit-orders", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const rows = await q(`SELECT * FROM edit_orders ORDER BY (status='done'), created_at DESC`);
  const cs = await q(`SELECT order_id, COUNT(*) n FROM edit_comments GROUP BY order_id`);
  const cmap = Object.fromEntries(cs.map(c => [c.order_id, Number(c.n)]));
  res.json({ ok: true, orders: rows.map(r => ({ ...r, status_th: EDIT_STATUS[r.status] || r.status,
    comments: cmap[r.order_id] || 0, ref_picks: safeJson(r.ref_picks) || [], brief: safeJson(r.brief_json) })), statuses: EDIT_STATUS });
});
app.post("/api/admin/edit-order/update", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const id = String(req.body?.order_id || "");
  const o = await one(`SELECT * FROM edit_orders WHERE order_id=$1`, [id]);
  if (!o) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  const st = EDIT_STATUS[req.body?.status] ? req.body.status : o.status;
  await run(`UPDATE edit_orders SET status=$1, draft_url=COALESCE($2,draft_url), assignee=COALESCE($3,assignee), updated_at=now() WHERE order_id=$4`,
    [st, req.body?.draft_url || null, req.body?.assignee || null, id]);
  res.json({ ok: true });
});
// ===== 🗂️ ห้องทำงาน: ทุกโปรเจคอยู่ที่เดียว =====
app.get("/api/admin/projects", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const projects = await q(`SELECT * FROM projects ORDER BY status='done', priority ASC, sort ASC, created_at ASC`);
  const items = await q(`SELECT * FROM project_items ORDER BY priority ASC, sort ASC, created_at ASC`);
  const comments = await q(`SELECT * FROM project_comments ORDER BY created_at ASC`);
  const byItem = {};
  for (const c of comments) (byItem[c.item_id] ||= []).push(c);
  const byPid = {};
  for (const it of items) (byPid[it.project_id] ||= []).push({ ...it, comments: byItem[it.id] || [] });
  res.json({ ok: true, projects: projects.map(p => ({ ...p, items: byPid[p.id] || [] })) });
});
app.post("/api/admin/projects/save", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const b = req.body || {};
  const id = String(b.id || "").trim() || uid("prj");
  await run(`INSERT INTO projects (id,name,emoji,color,goal,status,priority,sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, emoji=EXCLUDED.emoji, color=EXCLUDED.color,
      goal=EXCLUDED.goal, status=EXCLUDED.status, priority=EXCLUDED.priority, sort=EXCLUDED.sort, updated_at=now()`,
    [id, String(b.name || "โปรเจคใหม่"), b.emoji || "📁", b.color || "#C7DEF0", b.goal || "", b.status || "active", Number(b.priority) || 5, Number(b.sort) || 100]);
  res.json({ ok: true, id });
});
// เพิ่ม/แก้รายการในโปรเจค — ใช้ทั้งตอนคิมโยนไอเดียเข้ามา และตอนระบบอัปเดตงานที่ทำเสร็จ
app.post("/api/admin/projects/item", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const b = req.body || {};
  const pid = String(b.project_id || "").trim();
  if (!pid) return res.status(400).json({ ok: false, error: "NO_PROJECT" });
  const id = String(b.id || "").trim() || uid("pit");
  const kind = ["next", "idea", "done", "blocked"].includes(b.kind) ? b.kind : "idea";
  await run(`INSERT INTO project_items (id,project_id,kind,text,note,owner,priority,sort,done_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (id) DO UPDATE SET kind=EXCLUDED.kind, text=EXCLUDED.text, note=EXCLUDED.note,
      owner=EXCLUDED.owner, priority=EXCLUDED.priority, sort=EXCLUDED.sort, done_at=EXCLUDED.done_at, updated_at=now()`,
    [id, pid, kind, String(b.text || "").slice(0, 800), b.note || null, b.owner || null, Number(b.priority) || 5, Number(b.sort) || 100,
     kind === "done" ? (b.done_at || new Date().toISOString()) : null]);
  res.json({ ok: true, id });
});
app.post("/api/admin/projects/comment", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const itemId = String(req.body?.item_id || "").trim();
  const text = String(req.body?.text || "").trim();
  if (!itemId || !text) return res.status(400).json({ ok: false, error: "MISSING" });
  const id = uid("pc");
  await run(`INSERT INTO project_comments (id,item_id,text,author) VALUES ($1,$2,$3,$4)`,
    [id, itemId, text.slice(0, 4000), String(req.body?.author || "kim")]);
  res.json({ ok: true, id });
});
app.post("/api/admin/projects/comment/delete", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const id = String(req.body?.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "NO_ID" });
  await run(`DELETE FROM project_comments WHERE id=$1`, [id]);
  res.json({ ok: true });
});
app.post("/api/admin/projects/item/delete", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const id = String(req.body?.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "NO_ID" });
  await run(`DELETE FROM project_comments WHERE item_id=$1`, [id]);
  await run(`DELETE FROM project_items WHERE id=$1`, [id]);
  res.json({ ok: true });
});
app.get("/api/admin/daily-health", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try { res.json({ ok: true, ...(await buildDailyHealth()) }); } catch (e) { res.status(500).json({ ok: false, message: e.message }); }
});
app.post("/api/admin/daily-health/send", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  if (req.body?.force) await run(`DELETE FROM daily_report_log WHERE day=$1`, [new Date().toISOString().slice(0, 10)]);
  await runDailyHealthReport();
  res.json({ ok: true });
});
app.post("/api/admin/fix-theme", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const one_id = String(req.body?.blueprint_id || "").trim();
  const limit = Math.min(Number(req.body?.limit) || 25, 60);
  const rows = one_id
    ? await q(`SELECT blueprint_id, blueprint_json FROM blueprints WHERE blueprint_id=$1 AND deleted_at IS NULL`, [one_id])
    : await q(`SELECT blueprint_id, blueprint_json FROM blueprints WHERE deleted_at IS NULL ORDER BY created_at DESC`);
  const done = [], skipped = [];
  let tried = 0;
  for (const r of rows) {
    if (tried >= limit) break;                                 // นับ "ครั้งที่ลอง" ไม่ใช่ "ครั้งที่สำเร็จ" — กันเผาโควตารัวๆ ตอน AI พลาด
    const bp = safeJson(r.blueprint_json); if (!bp) continue;
    const old = String(bp.theme || "");
    if (!one_id && !BAD_THEME_RE.test(old)) continue;          // กวาดอัตโนมัติ = แตะเฉพาะเล่มที่ธีมพัง
    tried++;
    let fresh = null;
    try { fresh = await rewriteTheme(bp, "th"); } catch (e) { skipped.push({ id: r.blueprint_id, why: e.message }); continue; }
    if (!fresh || fresh === old) { skipped.push({ id: r.blueprint_id, why: "AI ยังเขียนไม่ผ่านเกณฑ์" }); continue; }
    const merged = { ...bp, theme: fresh };
    await run(`UPDATE blueprints SET blueprint_json=$1, quality_flags_json=$2 WHERE blueprint_id=$3`,
      [JSON.stringify(merged), JSON.stringify(checkBlueprintQuality(merged, true)), r.blueprint_id]);
    done.push({ id: r.blueprint_id, from: old.slice(0, 60), to: fresh });
  }
  res.json({ ok: true, fixed: done.length, skipped: skipped.length, done, skipped });
});
app.post("/api/admin/reanalyze", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const bpId = String(req.body?.blueprint_id || "").trim();
  if (!bpId) return res.status(400).json({ ok: false, error: "NO_ID" });
  const bp = await one(`SELECT * FROM blueprints WHERE blueprint_id=$1 AND deleted_at IS NULL`, [bpId]);
  if (!bp) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  const current = safeJson(bp.blueprint_json) || {};
  const reqRow = await one(`SELECT raw_payload_json FROM blueprint_requests WHERE request_id=$1`, [bp.request_id]);
  const raw = safeJson(reqRow?.raw_payload_json) || {};
  const lang = req.body?.lang === "en" ? "en" : (raw.lang === "en" ? "en" : "th");
  const parsed = GenSchema.parse(normalizePayload(raw));
  const hasNums = (m) => m && Object.values(m).some(v => typeof v === "number" && v > 0);
  if (hasNums(current.metrics)) parsed.prior_metrics = current.metrics; // รูปถูกลบแล้ว → คงตัวเลขเดิม
  const hint = String(req.body?.focus_hint || "").trim();
  if (hint) parsed.form_responses.business_type = `${parsed.form_responses.business_type || ""}\n[หมายเหตุจากทีม: แนวคอนเทนต์หลักที่คนดูติดตามช่องนี้จริงๆ คือ "${hint.slice(0, 200)}" — ให้โฟกัสแนวนี้เป็นแกนของบทวิเคราะห์+คอนเทนต์ 30 วัน]`;
  parsed.prev_context = await getPrevContext(parsed.email, bp.billing_cycle, parsed.instagram_account);
  await acquireGen();
  let out;
  try {
    const a = await generateAnalysis(parsed, lang);
    const analysis = a.analysis;
    if (hasNums(current.metrics) && !hasNums(analysis.metrics)) analysis.metrics = current.metrics;
    const c = await generateContent(parsed, analysis, lang);
    const merged = { ...analysis, calendar: c.content.calendar, scripts: c.content.scripts };
    const flags = checkBlueprintQuality(merged, true);
    await run(`UPDATE blueprints SET blueprint_json=$1, model=$2, content_status='ready', quality_flags_json=$3 WHERE blueprint_id=$4`, [JSON.stringify(merged), c.model, JSON.stringify(flags), bpId]);
    out = { theme: analysis.theme, positioning: analysis.positioning, scripts: (c.content.scripts || []).length, flags };
  } finally { releaseGen(); }
  res.json({ ok: true, blueprint_id: bpId, ...out });
});
// ต้นทุน token Gemini (เดือนนี้ + รวมทั้งหมด) สำหรับดูในหลังบ้าน
app.get("/api/admin/ai-usage", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const rows = await q(`SELECT model, COUNT(*) n, COALESCE(SUM(input_tokens),0) inp, COALESCE(SUM(output_tokens),0) outp FROM ai_usage WHERE created_at >= date_trunc('month', now()) GROUP BY model`);
  const allTime = await one(`SELECT COUNT(*) n, COALESCE(SUM(total_tokens),0) tot FROM ai_usage`);
  const todayRow = await one(`SELECT COALESCE(SUM(total_tokens),0) tot, COUNT(*) n FROM ai_usage WHERE created_at >= date_trunc('day', now())`);
  const todayTokens = Number(todayRow.tot), dailyCap = Number(process.env.GEMINI_DAILY_TOKEN_CAP) || 2000000;
  let cost = 0, inp = 0, outp = 0, n = 0;
  const byModel = rows.map(r => {
    const ri = Number(r.inp), ro = Number(r.outp), rn = Number(r.n), c = aiCostTHB(r.model, ri, ro);
    cost += c; inp += ri; outp += ro; n += rn;
    return { model: r.model, count: rn, input: ri, output: ro, cost_thb: Math.round(c * 100) / 100 };
  });
  res.json({
    ok: true,
    month: { count: n, input: inp, output: outp, total: inp + outp, cost_thb: Math.round(cost * 100) / 100, avg_thb: n ? Math.round((cost / n) * 100) / 100 : 0, by_model: byModel },
    today: { tokens: todayTokens, count: Number(todayRow.n), cap: dailyCap, pct: Math.round(todayTokens / dailyCap * 100), over: todayTokens > dailyCap },
    all_time: { count: Number(allTime.n), total_tokens: Number(allTime.tot) }
  });
});
// สร้างเล่มใหม่ให้ลูกค้า (รีเจนด้วย prompt ล่าสุด) — ระบุ order_id หรือ user_id+billing_cycle
app.post("/api/admin/regenerate", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  let orderId = String(req.body?.order_id || "");
  if (!orderId) {
    const row = await one(`SELECT order_id FROM blueprint_orders WHERE user_id=$1 AND billing_cycle=$2 AND payment_status IN ('paid','mock_paid') ORDER BY created_at DESC LIMIT 1`, [String(req.body?.user_id || ""), String(req.body?.billing_cycle || "")]);
    orderId = row?.order_id || "";
  }
  const o = await getOrder(orderId); if (!o) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
  if (!["paid", "mock_paid"].includes(o.payment_status)) return res.status(402).json({ ok: false, error: "PAYMENT_REQUIRED" });
  await run(`UPDATE blueprint_orders SET blueprint_id=NULL, generation_status='generating', generation_error=NULL WHERE order_id=$1`, [orderId]);
  res.json({ ok: true, order_id: orderId, status: "generating" });
  inFlightOrders.add(orderId);
  (async () => {
    try {
      const result = await generateBlueprintForPayload(safeJson(o.order_payload_json));
      await run(`UPDATE blueprint_orders SET blueprint_id=$1, generation_status='ready', generation_error=NULL WHERE order_id=$2`, [result.blueprintId, orderId]);
      console.log(`[regenerate] order ${orderId} → ${result.blueprintId}`);
      if (o.email) { const url = `${appBaseUrl()}/dashboard?user_id=${encodeURIComponent(result.parsed.user_id)}&billing_cycle=${encodeURIComponent(result.parsed.meta_purchase.billing_cycle)}&blueprint_id=${encodeURIComponent(result.blueprintId)}`; const l = langOfPayload(result.parsed); await sendEmail(o.email,
        tr(l, `บทวิเคราะห์ช่องของคุณพร้อมแล้ว 🩵`, `Your channel analysis is ready 🩵`),
        wrap(tr(l,
          `ครูพี่คิมอ่านช่องของคุณเสร็จแล้วค่ะ!<br><br>กดเปิดดู <b>บทวิเคราะห์ช่อง</b> — ถ้าตรงแล้ว กดปุ่ม <b>"สร้างแผน 30 วัน"</b> ในเล่ม ครูพี่คิมจะเขียนสคริปต์ให้ครบทั้งเดือนค่ะ<br><br>${btn(url, "เปิดดูบทวิเคราะห์ของฉัน")}`,
          `Kim has finished reading your channel!<br><br>Open your <b>Channel Analysis</b> — if it looks right, hit <b>"Create my 30-day plan"</b> inside and Kim will write scripts for the whole month.<br><br>${btn(url, "Open my analysis")}`))).catch(() => {}); }
    } catch (e) { console.error("regenerate", e.message); await run(`UPDATE blueprint_orders SET generation_status='error', generation_error=$1 WHERE order_id=$2`, [String(e.message).slice(0, 300), orderId]); }
    finally { inFlightOrders.delete(orderId); }
  })();
});
async function getStudents(industry) {
  // 1 อีเมล/รอบเดือน = 1 แถว (เอาออเดอร์ที่จ่ายแล้วล่าสุด) + สถานะการสร้างเล่ม + ข้อมูลฟอร์มจาก request ล่าสุด
  const rows = await q(`
    SELECT DISTINCT ON (o.email, o.billing_cycle)
      o.created_at, o.email, o.user_id, o.billing_cycle, o.instagram_account, o.blueprint_id, o.generation_status,
      b.content_status, b.analysis_status,
      r.industry, r.business_type, r.starting_point, r.monthly_goal, r.competitor_1, r.competitor_2
    FROM blueprint_orders o
    LEFT JOIN blueprints b ON b.blueprint_id = o.blueprint_id
    LEFT JOIN LATERAL (
      SELECT industry, business_type, starting_point, monthly_goal, competitor_1, competitor_2, phone
      FROM blueprint_requests rr WHERE rr.user_id = o.user_id AND rr.billing_cycle = o.billing_cycle
      ORDER BY rr.created_at DESC LIMIT 1
    ) r ON true
    WHERE o.payment_status IN ('paid','mock_paid') AND o.email IS NOT NULL AND COALESCE(o.tier,'') NOT LIKE 'Video%' AND COALESCE(o.tier,'') NOT LIKE 'Credits%'
    ORDER BY o.email, o.billing_cycle, o.created_at DESC
  `);
  let students = rows.map(o => {
    return {
      created_at: o.created_at, email: o.email, user_id: o.user_id, billing_cycle: o.billing_cycle,
      phone: o.phone || "", // จากคอลัมน์ blueprint_requests.phone (เร็ว ไม่ต้องอ่าน payload ทั้งก้อน) — บังคับกรอกแล้วตั้งแต่ 31 ก.ค.
      instagram_account: o.instagram_account || "",
      business_type: o.business_type || "",
      starting_point: o.starting_point || "",
      monthly_goal: o.monthly_goal || "",
      competitor_1: o.competitor_1 || "", competitor_2: o.competitor_2 || "",
      industry: o.industry || null, blueprint_id: o.blueprint_id,
      status: o.blueprint_id ? "ready" : (o.generation_status || "pending"),
      // สถานะรวมที่อ่านง่ายสำหรับแอดมิน: เจนบทวิเคราะห์ → รอยืนยัน → เจน 30 วัน → ครบ
      stage: !o.blueprint_id ? (o.generation_status === "error" ? "❌ บทวิเคราะห์พัง" : o.generation_status === "generating" ? "⏳ กำลังเจนบทวิเคราะห์" : "⏳ รอเจน")
        : o.content_status === "ready" ? "✅ ครบ (แผน 30 วัน)"
        : o.content_status === "generating" ? "⏳ กำลังเจนแผน 30 วัน"
        : o.content_status === "error" ? "❌ แผน 30 วันพัง"
        : "📋 บทวิเคราะห์พร้อม (รอลูกค้ากดสร้างแผน)",
      content_status: o.content_status || null,
    };
  });
  students.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (industry) students = students.filter(s => s.industry === industry);
  return students;
}
app.get("/api/admin/students", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const industry = req.query.industry ? String(req.query.industry) : null;
  const rows = await getStudents(industry);
  res.json({ ok: true, count: rows.length, industry, students: rows });
});
app.get("/api/admin/students.csv", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).send("unauthorized");
  const industry = req.query.industry ? String(req.query.industry) : null;
  const rows = await getStudents(industry);
  const cols = ["created_at", "email", "instagram_account", "business_type", "industry", "monthly_goal", "starting_point", "competitor_1", "competitor_2", "billing_cycle", "status"];
  const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const csv = "﻿" + [cols.join(",")].concat(rows.map(r => cols.map(c => esc(r[c])).join(","))).join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="babe-students.csv"`);
  res.send(csv);
});
// ภาพรวมกลุ่มลูกค้า (ลูกค้าของเราคือใคร) — รวมจากฟิลด์ฟอร์มจริง: สถานะ/คนดู/ประสบการณ์/เป้าหมาย/อุตสาหกรรม
app.get("/api/admin/customer-overview", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  // ดึงเฉพาะ form_responses (ไม่โหลดรูป base64 ทั้งก้อน) กัน RAM แตก
  const rows = await q(`SELECT DISTINCT ON (email) email, (NULLIF(raw_payload_json,'')::jsonb -> 'form_responses') AS fr, industry FROM blueprint_requests WHERE email IS NOT NULL ORDER BY email, created_at DESC`);
  const t = {};
  const add = (k, v) => { v = String(v || "").trim(); if (!v) return; (t[k] ||= {}); t[k][v] = (t[k][v] || 0) + 1; };
  for (const r of rows) {
    const fr = (typeof r.fr === "string" ? safeJson(r.fr) : r.fr) || {};
    add("gender", fr.gender);
    add("age", fr.age_range);
    String(fr.work_style || "").split(" / ").forEach(v => add("status", v));
    String(fr.audience || "").split(",").forEach(v => add("audience", v));
    add("experience", fr.experience);
    add("goal", fr.goal_primary);
    add("industry", r.industry || "อื่นๆ");
  }
  const total = rows.length;
  const fmt = (o) => Object.entries(o || {}).map(([label, count]) => ({ label, count, pct: Math.round(count / Math.max(total, 1) * 100) })).sort((a, b) => b.count - a.count);
  const by_gender = fmt(t.gender), by_age = fmt(t.age), by_status = fmt(t.status), by_goal = fmt(t.goal), by_industry = fmt(t.industry);
  // ประโยคสรุปภาพรวม (เอาไปทำการตลาดได้เลย)
  const top = (a) => a[0]?.label, topPct = (a) => a[0]?.pct;
  const seg = [];
  if (top(by_gender)) seg.push(`ส่วนใหญ่เป็น${top(by_gender)} (${topPct(by_gender)}%)`);
  if (top(by_age)) seg.push(`อายุ ${top(by_age)}`);
  if (top(by_status)) seg.push(`เป็น${top(by_status)}`);
  if (top(by_industry) && top(by_industry) !== "อื่นๆ") seg.push(`สาย${top(by_industry)}`);
  if (top(by_goal)) seg.push(`อยากได้ "${top(by_goal)}"`);
  const summary = seg.length ? `ลูกค้าของคุณ${seg.join(" · ")}` : null;
  res.json({ ok: true, total_customers: total, summary, by_gender, by_age, by_status, by_audience: fmt(t.audience), by_experience: fmt(t.experience), by_goal, by_industry });
});

// เล่มที่ตัวตรวจคุณภาพพบ red flag (เอาไว้กดรีเจนแก้ก่อนลูกค้าเห็น)
app.get("/api/admin/quality", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const rows = await q(`SELECT b.blueprint_id, b.user_id, b.billing_cycle, b.created_at, b.quality_flags_json, r.email, r.business_type FROM blueprints b JOIN blueprint_requests r ON b.request_id=r.request_id WHERE b.quality_flags_json IS NOT NULL AND b.quality_flags_json NOT IN ('','[]') ORDER BY b.created_at DESC LIMIT 50`);
  const totalRow = await one(`SELECT COUNT(*) c FROM blueprints`);
  res.json({ ok: true, total: Number(totalRow.c), flagged: rows.map(r => ({ blueprint_id: r.blueprint_id, user_id: r.user_id, billing_cycle: r.billing_cycle, email: r.email, business_type: r.business_type, created_at: r.created_at, flags: safeJson(r.quality_flags_json) || [] })) });
});

app.get("/api/admin/revenue", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  // เงินเข้าจริง = จ่ายด้วย Stripe (บัตร/PromptPay) สำเร็จ + จำนวนเงิน > 0 (ไม่นับ mock/โค้ดฟรี/ส่วนลด 100%)
  const realWhere = `payment_status='paid' AND live_mode = true AND COALESCE(provider,'') NOT IN ('mock','code') AND COALESCE(final_amount_satang,$1) > 0`;
  const real = await one(`SELECT COALESCE(SUM(COALESCE(final_amount_satang,$1)),0) s, COUNT(*) c FROM blueprint_orders WHERE ${realWhere}`, [PRICE_SATANG]);
  const free = await one(`SELECT COUNT(*) c FROM blueprint_orders WHERE payment_status IN ('paid','mock_paid') AND (COALESCE(provider,'')='code' OR COALESCE(final_amount_satang,$1)=0)`, [PRICE_SATANG]);
  const test = await one(`SELECT COUNT(*) c FROM blueprint_orders WHERE payment_status='mock_paid' OR COALESCE(provider,'')='mock' OR (payment_status='paid' AND COALESCE(provider,'')='stripe' AND COALESCE(live_mode,false)=false)`);
  const byMonth = await q(`SELECT billing_cycle, COALESCE(SUM(COALESCE(final_amount_satang,$1)),0) revenue, COUNT(*) c FROM blueprint_orders WHERE ${realWhere} GROUP BY billing_cycle ORDER BY MIN(created_at)`, [PRICE_SATANG]);
  const byProvider = await q(`SELECT provider, COUNT(*) c, COALESCE(SUM(COALESCE(final_amount_satang,$1)),0) revenue FROM blueprint_orders WHERE ${realWhere} GROUP BY provider`, [PRICE_SATANG]);
  const orders = await q(`SELECT email, tier, COALESCE(final_amount_satang,$1) amt, paid_at, billing_cycle FROM blueprint_orders WHERE ${realWhere} ORDER BY paid_at DESC LIMIT 100`, [PRICE_SATANG]);
  res.json({ ok: true, total_satang: Number(real.s), paid_count: Number(real.c), free_count: Number(free.c), test_count: Number(test.c), by_month: byMonth.map(m => ({ ...m, revenue: Number(m.revenue), c: Number(m.c) })), by_provider: byProvider.map(p => ({ ...p, revenue: Number(p.revenue), c: Number(p.c) })), paid_orders: orders.map(o => ({ email: o.email || "(ไม่มีอีเมล)", tier: o.tier, baht: Math.round(Number(o.amt) / 100), paid_at: o.paid_at, billing_cycle: o.billing_cycle })) });
});
app.get("/api/admin/codes", async (req, res) => { if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" }); res.json({ ok: true, codes: await q(`SELECT * FROM promo_codes ORDER BY created_at DESC`) }); });
// เทรนด์ประจำสัปดาห์ (ทีม Babe curate) แยกตามกลุ่มอาชีพ — เก็บเป็นประวัติ แถวล่าสุด/กลุ่ม = ตัวที่ใช้ · AI ใช้เฉพาะที่อายุ < 30 วัน (1 เดือน)
const TREND_CATS = [...INDUSTRIES, "general"]; // "general" = ใช้ได้ทุกอาชีพ (fallback)
app.get("/api/admin/trends", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const cat = TREND_CATS.includes(req.query?.category) ? req.query.category : "general";
  const r = await one(`SELECT content, category, updated_by, created_at FROM trend_digest WHERE COALESCE(category,'general')=$1 ORDER BY created_at DESC LIMIT 1`, [cat]);
  const ageDays = r ? Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000) : null;
  // สรุปว่ากลุ่มไหนมีเทรนด์แล้วบ้าง (ให้ admin เห็นภาพรวม)
  const summary = await q(`SELECT COALESCE(category,'general') AS category, MAX(created_at) AS updated FROM trend_digest GROUP BY 1`);
  res.json({ ok: true, category: cat, categories: TREND_CATS, trends: r || null, age_days: ageDays, active: r ? ageDays < 30 : false, summary });
});
app.post("/api/admin/trends", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const content = String(req.body?.content || "").trim().slice(0, 8000);
  const cat = TREND_CATS.includes(req.body?.category) ? req.body.category : "general";
  if (!content) return res.status(400).json({ ok: false, error: "EMPTY" });
  await run(`INSERT INTO trend_digest (content, category, updated_by) VALUES ($1,$2,$3)`, [content, cat, String(req.body?.updated_by || "admin").slice(0, 60)]);
  setCuratedTrends(cat, content, Date.now());
  res.json({ ok: true, category: cat });
});
// stopgap: admin ดูรหัส OTP ล่าสุดของอีเมลลูกค้า → บอกลูกค้าตรงๆ (ระหว่างอีเมลใช้ไม่ได้)
app.get("/api/admin/peek-otp", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const email = normEmail(req.query?.email || "");
  const row = await one(`SELECT code, expires_at, attempts FROM auth_otps WHERE email=$1`, [email]);
  res.json({ ok: true, email, otp: row ? { code: row.code, expires_in_min: Math.max(0, Math.round((Number(row.expires_at) - Date.now()) / 60000)), attempts: row.attempts } : null });
});
// debug อีเมล: ยิงเทสต์ + คืน error ดิบจาก Resend (admin เท่านั้น) — ใช้ตอนอีเมลไม่ส่ง
app.post("/api/admin/email-test", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const to = String(req.body?.to || "").trim();
  lastEmailError = null;
  const ok = to ? await sendEmail(to, "Babe House · email test", wrap("email test ✓")) : false;
  res.json({ ok: true, sent: ok, from: process.env.APP_FROM_EMAIL || "(default onboarding@resend.dev)", key_present: !!process.env.RESEND_API_KEY, key_prefix: String(process.env.RESEND_API_KEY || "").slice(0, 5), last_error: lastEmailError });
});
app.post("/api/admin/codes", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  let code = String(req.body?.code || "").trim().toUpperCase() || "BABE" + Math.random().toString(36).slice(2, 7).toUpperCase();
  const note = String(req.body?.note || "").slice(0, 200);
  const maxUses = req.body?.max_uses == null || req.body?.max_uses === "" ? null : Math.max(1, parseInt(req.body.max_uses, 10) || 1);
  let percent = req.body?.discount_percent == null || req.body?.discount_percent === "" ? 100 : parseInt(req.body.discount_percent, 10);
  percent = Math.max(1, Math.min(100, isNaN(percent) ? 100 : percent));
  const lockedEmail = req.body?.locked_email ? normEmail(req.body.locked_email) : null; // โค้ดล็อกเฉพาะอีเมล (ใช้ซ้ำได้)
  const creditGrant = Math.max(0, parseInt(req.body?.credit_grant, 10) || 0); // แถมเครดิตให้เมื่อใช้โค้ด (0 = ไม่แถม)
  // upsert: ถ้าโค้ดมีอยู่แล้ว → อัปเดตค่า (แก้/เพิ่มเครดิตแถมของโค้ดเดิมได้) · used_count คงเดิม
  await run(`INSERT INTO promo_codes (code,note,max_uses,discount_percent,locked_email,credit_grant) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (code) DO UPDATE SET note=EXCLUDED.note, max_uses=EXCLUDED.max_uses, discount_percent=EXCLUDED.discount_percent, locked_email=EXCLUDED.locked_email, credit_grant=EXCLUDED.credit_grant, active=1`,
    [code, note, maxUses, percent, lockedEmail, creditGrant]);
  res.json({ ok: true, code: await one(`SELECT * FROM promo_codes WHERE code=$1`, [code]) });
});
app.post("/api/admin/codes/toggle", async (req, res) => { if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" }); const code = String(req.body?.code || "").trim().toUpperCase(); await run(`UPDATE promo_codes SET active=1-active WHERE code=$1`, [code]); res.json({ ok: true, code: await one(`SELECT * FROM promo_codes WHERE code=$1`, [code]) }); });
// ลบโค้ด (ออเดอร์เก่าเก็บ discount_code เป็น text อยู่แล้ว ไม่กระทบ)
app.post("/api/admin/codes/delete", async (req, res) => { if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" }); const code = String(req.body?.code || "").trim().toUpperCase(); await run(`DELETE FROM promo_codes WHERE code=$1`, [code]); res.json({ ok: true, deleted: code }); });
// ปล่อยผ่านเล่มที่ติดธงคุณภาพ (เคลียร์ flag — เล่มหายจากรายการ "ควรเช็ค")
app.post("/api/admin/quality/dismiss", async (req, res) => { if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" }); const bpId = String(req.body?.blueprint_id || ""); if (!bpId) return res.status(400).json({ ok: false, error: "MISSING" }); await run(`UPDATE blueprints SET quality_flags_json='[]' WHERE blueprint_id=$1`, [bpId]); res.json({ ok: true, dismissed: bpId }); });
app.get("/api/admin/ai-insight", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try { const rows = await q(`SELECT business_type, monthly_goal, starting_point FROM blueprint_requests ORDER BY created_at DESC LIMIT 500`); if (!rows.length) return res.json({ ok: true, insight: null, count: 0 }); const { insight, model } = await generateAdminInsight(rows); res.json({ ok: true, count: rows.length, model, insight }); }
  catch (err) { console.error(err); res.status(500).json({ ok: false, error: "INSIGHT_FAILED", message: err.message }); }
});
app.post("/api/admin/classify", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const force = req.body?.force === true || req.query.force === "1";
    const rows = await q(`SELECT request_id, business_type, monthly_goal FROM blueprint_requests ${force ? "" : "WHERE industry IS NULL"}`);
    if (!rows.length) return res.json({ ok: true, classified: 0 });
    const items = rows.map(r => ({ i: r.request_id, text: `${r.business_type || ""} | ${r.monthly_goal || ""}`.slice(0, 200) }));
    const map = await classifyIndustries(items);
    let n = 0; for (const id of Object.keys(map)) { await run(`UPDATE blueprint_requests SET industry=$1 WHERE request_id=$2`, [map[id], id]); n++; }
    res.json({ ok: true, classified: n, model: aiModelName() });
  } catch (err) { console.error(err); res.status(500).json({ ok: false, error: "CLASSIFY_FAILED", message: err.message }); }
});
app.get("/api/admin/industries", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const rows = await q(`SELECT industry, COUNT(DISTINCT COALESCE(email,instagram_account)) customers FROM blueprint_requests WHERE industry IS NOT NULL GROUP BY industry ORDER BY customers DESC`);
  const untagged = Number((await one(`SELECT COUNT(*) c FROM blueprint_requests WHERE industry IS NULL`)).c);
  const breakdown = rows.map(r => ({ industry: r.industry, customers: Number(r.customers) }));
  res.json({ ok: true, total_classified: breakdown.reduce((s, r) => s + r.customers, 0), untagged, breakdown });
});

// ---------- reminders ----------
async function runMonthlyReminders(force = false) {
  try {
    // ส่งอัตโนมัติเฉพาะปลายเดือน (กระตุ้นต่อแผนเดือนหน้า) — ปุ่ม admin ใช้ force=true ส่งได้ทุกเมื่อ
    const day = new Date().getDate(), startDay = Number(process.env.REMINDER_START_DAY) || 25;
    if (!force && day < startDay) return 0;
    const cycle = currentBillingCycle();
    // ดึงเล่มล่าสุดของแต่ละคนมาด้วย → ทำลิงก์พาไปหน้าส่งสถิติได้ตรงๆ ไม่ต้องให้เขาหาเอง
    const rows = await q(`SELECT DISTINCT ON (lower(r.email)) r.email, b.blueprint_id, b.user_id, b.billing_cycle,
        COALESCE(mp.uploaded_count,0) AS uploaded,
        (SELECT 1 FROM month_reviews mr WHERE mr.user_id=b.user_id AND mr.billing_cycle=b.billing_cycle) AS reviewed
      FROM blueprint_requests r
      JOIN blueprints b ON b.request_id=r.request_id AND b.deleted_at IS NULL
      LEFT JOIN marathon_progress mp ON mp.user_id=b.user_id AND mp.billing_cycle=b.billing_cycle
      WHERE r.email IS NOT NULL
        AND lower(r.email) NOT IN (SELECT lower(email) FROM blueprint_requests WHERE billing_cycle=$1 AND email IS NOT NULL)
        AND lower(r.email) NOT IN (SELECT lower(email) FROM month_reminders WHERE cycle=$1)
      ORDER BY lower(r.email), b.created_at DESC LIMIT 200`, [cycle]);
    let sent = 0;
    for (const r of rows) { try {
      const l = await langOfEmail(r.email);
      // 📸 ขอสถิติก่อน แล้วค่อยชวนต่อแผน — คิมสั่ง 3 ส.ค.
      // "จบเดือนแล้วส่งเมลไปว่าเค้าทำ 30 คลิปครบหรือยัง ส่ง insight มาเพื่อเพิ่มแผนของเดือนต่อไป"
      // ⛔ ถ้าส่งสถิติมาแล้ว ไม่ต้องขอซ้ำ — ชวนต่อแผนอย่างเดียว
      const deep = `${appBaseUrl()}/dashboard?user_id=${encodeURIComponent(r.user_id)}&billing_cycle=${encodeURIComponent(r.billing_cycle)}&blueprint_id=${encodeURIComponent(r.blueprint_id)}&tab=marathon`;
      const renew = `${appBaseUrl()}/?renew=1&email=${encodeURIComponent(r.email)}`;
      const askStats = !r.reviewed;
      await sendEmail(r.email,
        tr(l, askStats ? "เดือนนี้เป็นยังไงบ้างคะ? ส่งสถิติมาให้ครูพี่คิมดูหน่อย 🩵" : "เดือนใหม่แล้ว มาต่อแผนคอนเทนต์กันค่ะ 🩵",
              askStats ? "How did this month go? Send me your stats 🩵" : "A new month begins — let's plan your content 🩵"),
        wrap(tr(l,
          askStats
            ? `จบเดือนแล้ว เดือนนี้ลงคอนเทนต์ไปได้กี่คลิปคะ?${Number(r.uploaded) > 0 ? ` (ที่ติ๊กไว้ในระบบคือ <b>${r.uploaded} วัน</b>)` : ""}<br><br>
               <b>ก่อนเริ่มเดือนใหม่ ขอสถิติหน่อยนะคะ</b> — แคปหน้า Insights มา<b>รูปเดียวก็พอ</b>
               ครูพี่คิมจะอ่านให้เองว่าคลิปไหนไปได้ดี แล้ว<b>เขียนแผนเดือนหน้าจากของจริง</b> ไม่ใช่เริ่มคิดใหม่จากศูนย์ค่ะ<br><br>
               ${btn(deep, "📸 ส่งสถิติเดือนนี้ (ใช้เวลาไม่ถึงนาที)")}<br><br>
               ส่งแล้วค่อยมาต่อแผนเดือนใหม่กันนะคะ 🩵<br><br>${btn(renew, "ดูแพ็กและปลดล็อกแผนเดือนใหม่")}`
            : `เข้าสู่เดือนใหม่แล้ว! มาต่อแผน 30 วันของเดือนนี้กันค่ะ<br><br>${btn(renew, "ดูแพ็กและปลดล็อกแผนเดือนใหม่")}`,
          askStats
            ? `The month is wrapping up — how many clips did you post?${Number(r.uploaded) > 0 ? ` (You ticked <b>${r.uploaded} days</b> in the app.)` : ""}<br><br>
               <b>Before we start the new month, send me your stats</b> — one screenshot of your Insights is enough.
               I'll read it myself and build next month's plan from what actually worked.<br><br>
               ${btn(deep, "📸 Send this month's stats (under a minute)")}<br><br>
               ${btn(renew, "Unlock this month's plan (฿490)")}`
            : `It's a new month! Time to continue with this month's 30-day plan.<br><br>${btn(renew, "Unlock this month's plan (฿490)")}`)));
      } catch { continue; }
      await run(`INSERT INTO month_reminders (email,cycle) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [r.email, cycle]); sent++; }
    if (sent) console.log(`[reminders] ${cycle}: ${sent}`); return sent;
  } catch (e) { console.error("monthly", e.message); return 0; }
}
async function runHomeworkReminders() {
  try {
    const day = new Date().getDate(); if (day < 8 || day > 25) return 0;
    const cycle = currentBillingCycle();
    const rows = await q(`SELECT DISTINCT r.email, COALESCE(mp.uploaded_count,0) uploaded FROM blueprint_requests r JOIN marathon_progress mp ON mp.user_id=r.user_id AND mp.billing_cycle=r.billing_cycle WHERE r.billing_cycle=$1 AND r.email IS NOT NULL AND COALESCE(mp.uploaded_count,0)<$2 AND r.email NOT IN (SELECT email FROM homework_reminders WHERE cycle=$1) LIMIT 200`, [cycle, HOMEWORK_MIN_UPLOADS]);
    let sent = 0;
    for (const r of rows) { try { const l = await langOfEmail(r.email); await sendEmail(r.email,
      tr(l, "อย่าลืมทำคอนเทนต์ตามแผนนะคะ 🩵", "Keep going with your content plan 🩵"),
      wrap(tr(l,
        `เดือนนี้ทำไปแล้ว <b>${r.uploaded} วัน</b> สู้ๆ นะคะ! ความสม่ำเสมอคือกุญแจของการเติบโตค่ะ<br><br>${btn(`${appBaseUrl()}/account`, "เปิดแผนของฉัน ทำต่อ")}<br><br><b>ถ้าทำเองแล้วเริ่มเหนื่อย/ตัดต่อไม่ทัน — ครูพี่คิมมีตัวช่วยให้เป้าหมายคุณเป็นจริงค่ะ 🩵</b><br><br>🎓 อยากตัดต่อเองให้คล่อง เก่งขึ้นทุกคลิป:<br>${btn(appBaseUrl() + "/academy", "เรียนตัดต่อกับครูพี่คิม")}<br><br>🎬 ไม่มีเวลาทำเอง อยากให้มืออาชีพทำให้:<br>${btnG(appBaseUrl() + "/edit", "ให้ทีม Babe House ตัดให้")}`,
        // EN: ตัด upsell LINE ออก (แชท LINE เป็นภาษาไทย ยังไม่รองรับลูกค้าต่างชาติ)
        `You've done <b>${r.uploaded} days</b> this month — keep it up! Consistency is the key to growth.<br><br>${btn(`${appBaseUrl()}/account`, "Open my plan")}`))); } catch { continue; } await run(`INSERT INTO homework_reminders (email,cycle) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [r.email, cycle]); sent++; }
    if (sent) console.log(`[homework] ${cycle}: ${sent}`); return sent;
  } catch (e) { console.error("homework", e.message); return 0; }
}
// ตามคนที่กรอกฟอร์ม/เห็นสรุปแล้วแต่ไม่จ่าย — ส่งเมลชวนกลับมาทำต่อ (1 ครั้ง/อีเมล)
// เงื่อนไข: ออเดอร์ยังไม่จ่าย อายุ 2 ชม.–7 วัน, อีเมลนั้นไม่เคยจ่ายออเดอร์ใดเลย, ยังไม่เคยตามอีเมลนี้
async function runAbandonedFollowups() {
  try {
    const rows = await q(`SELECT DISTINCT ON (o.email) o.order_id, o.email, o.billing_cycle FROM blueprint_orders o
      WHERE o.payment_status IN ('pending','expired') AND o.email IS NOT NULL
        AND COALESCE(o.tier,'') NOT LIKE 'Video%'
        AND o.created_at < now() - interval '2 hours' AND o.created_at > now() - interval '7 days'
        AND o.email NOT IN (SELECT email FROM blueprint_orders WHERE payment_status IN ('paid','mock_paid') AND email IS NOT NULL)
        AND o.email NOT IN (SELECT email FROM abandoned_reminders)
      ORDER BY o.email, o.created_at DESC LIMIT 100`);
    let sent = 0;
    for (const r of rows) {
      const url = `${appBaseUrl()}/checkout?order_id=${encodeURIComponent(r.order_id)}`;
      try { const l = await langOfEmail(r.email); await sendEmail(r.email,
        tr(l, "แผนคอนเทนต์ของคุณรอเปิดอยู่นะคะ 🩵", "Your content plan is waiting for you 🩵"),
        wrap(tr(l,
          `เห็นว่าคุณเริ่มกรอกข้อมูลช่องไว้แล้ว แต่ยังไม่ได้เปิดดูแผนเต็มๆ เลยค่ะ<br><br>ครูพี่คิมวิเคราะห์ช่องของคุณและเตรียม <b>แผนคอนเทนต์ 30 วัน + สคริปต์พร้อมใช้</b> ไว้ให้แล้ว — กดปุ่มด้านล่างเพื่อดูสรุปและปลดล็อกได้เลยค่ะ<br><br>${btn(url, "ดูแผนของฉัน · ปลดล็อกเลย")}<br><br><span style="color:#888;font-size:14px">เลือกได้ทั้งรายเดือน 1,590฿ · 6 เดือน (ตกเดือนละ 1,110฿) · 12 เดือน (ตกเดือนละ 795฿) ทุกราคารวม VAT แล้วค่ะ</span>`,
          `We noticed you started filling in your channel info but haven't opened your full plan yet.<br><br>Kim has analyzed your channel and prepared a <b>30-day content plan + ready-to-use scripts</b> — tap below to see your summary and unlock it.<br><br>${btn(url, "See my plan · Unlock ฿490")}<br><br><span style="color:#888;font-size:14px">Launch offer ฿490 (regular ฿1,590) — limited spots</span>`))); }
      catch { continue; }
      await run(`INSERT INTO abandoned_reminders (email,order_id) VALUES ($1,$2) ON CONFLICT (email) DO NOTHING`, [r.email, r.order_id]);
      sent++;
    }
    if (sent) console.log(`[abandoned] ${sent}`); return sent;
  } catch (e) { console.error("abandoned", e.message); return 0; }
}
// เตือน "activation": ลูกค้าได้บทวิเคราะห์แล้ว แต่ยังไม่กด "สร้างแผน 30 วัน" เกิน 24 ชม. → เตือน 1 ครั้งต่อเล่ม (กันสแปมด้วย activation_reminded_at)
async function runActivationReminders() {
  try {
    const rows = await q(`SELECT b.blueprint_id, b.user_id, b.billing_cycle, b.blueprint_json, r.email
      FROM blueprints b JOIN blueprint_requests r ON b.request_id=r.request_id
      WHERE b.content_status='pending' AND COALESCE(b.analysis_status,'ready')='ready'
        AND b.created_at < now() - interval '24 hours'
        AND b.activation_reminded_at IS NULL
        AND r.email IS NOT NULL AND b.deleted_at IS NULL
        AND lower(r.email) <> lower($1)
      ORDER BY b.created_at ASC LIMIT 100`, [OPS_EMAIL]);
    let sent = 0;
    for (const r of rows) {
      const bp = safeJson(r.blueprint_json) || {};
      const nm = (String(bp.greeting || "").match(/คุณ\s*([^\sๆ,!.๐-๙]{1,20})/) || [])[1] || "";
      const url = `${appBaseUrl()}/dashboard?user_id=${encodeURIComponent(r.user_id)}&billing_cycle=${encodeURIComponent(r.billing_cycle)}&blueprint_id=${encodeURIComponent(r.blueprint_id)}`;
      try {
        const l = await langOfEmail(r.email);
        await sendEmail(r.email,
          tr(l, `แผน 30 วันของคุณ${nm} รออยู่แค่คลิกเดียวนะคะ 🩵`, `Your 30-day plan is one click away 🩵`),
          wrap(tr(l,
            `สวัสดีค่ะคุณ${nm} 🩵<br><br>ครูพี่คิมวิเคราะห์ช่องของคุณเสร็จเรียบร้อยแล้ว แต่เห็นว่ายังไม่ได้กด <b>"สร้างแผน 30 วัน"</b> ต่อ ซึ่งอันนี้แหละคือหัวใจของเล่ม — <b>สคริปต์พร้อมอัด + แคปชันพร้อมโพสต์ ครบทั้ง 30 วัน</b> ที่ครูพี่คิมเขียนรอให้คุณอยู่เลยค่ะ<br><br>เหลือแค่ <b>คลิกเดียว</b>เองนะคะ 👇<br>เปิดเล่ม → กดปุ่ม <b>"สร้างแผน 30 วัน"</b> → เดี๋ยวครูพี่คิมเขียนให้ครบทั้งเดือนเลยค่ะ<br><br>${btn(url, "เปิดเล่ม + สร้างแผน 30 วัน")}<br><br>ถ้าติดตรงไหน หรืออยากปรับบทวิเคราะห์ให้ตรงใจก่อน ทักครูพี่คิมมาได้เลยนะคะ ยินดีดูแลเต็มที่ค่ะ 🩵<br><br>ด้วยรักและกำลังใจ<br><b>ครูพี่คิม · Babe House</b>`,
            `Hi ${nm || "there"} 🩵<br><br>Kim finished analyzing your channel — but noticed you haven't tapped <b>"Create my 30-day plan"</b> yet. That's the heart of it: <b>30 days of ready-to-shoot scripts + captions</b>, all waiting for you.<br><br>Just <b>one click</b> away 👇<br>Open your book → tap <b>"Create my 30-day plan"</b> → Kim writes the whole month for you.<br><br>${btn(url, "Open + create my 30-day plan")}<br><br>Any questions, or want to fine-tune your analysis first — just reply. 🩵<br><br>With love,<br><b>Kim · Babe House</b>`)));
      } catch { continue; }
      await run(`UPDATE blueprints SET activation_reminded_at=now() WHERE blueprint_id=$1`, [r.blueprint_id]);
      sent++;
    }
    if (sent) console.log(`[activation] ${sent}`); return sent;
  } catch (e) { console.error("activation", e.message); return 0; }
}
app.post("/api/admin/run-reminders", async (req, res) => { if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" }); const sent = await runMonthlyReminders(true); const homework = await runHomeworkReminders(); const followups = await runClientFollowups(true); await buildTeamReview(true).catch(() => {}); const abandoned = await runAbandonedFollowups(); const activation = await runActivationReminders(); res.json({ ok: true, sent, homework, followups, abandoned, activation, cycle: currentBillingCycle() }); });
// 📣 ลูกค้ามาจากไหน + ใครจ่ายเงินจริง (ตอบคำถาม "มีคนซื้อจากแอดยัง")
app.get("/api/admin/attribution", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
    const rows = await q(`SELECT COALESCE(source,'(ไม่รู้ที่มา)') AS source,
        COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE payment_status IN ('paid','mock_paid')) AS paid,
        COALESCE(SUM(COALESCE(final_amount_satang,${PRICE_SATANG})) FILTER (WHERE payment_status='paid' AND live_mode = true AND COALESCE(provider,'') NOT IN ('mock','code')),0) AS revenue
      FROM blueprint_orders WHERE created_at > now() - interval '${days} days'
      GROUP BY 1 ORDER BY paid DESC, orders DESC`);
    const visits = await q(`SELECT COALESCE(source,'(ไม่รู้ที่มา)') AS source, COUNT(DISTINCT session_id) AS sessions
      FROM funnel_events WHERE created_at > now() - interval '${days} days' GROUP BY 1`);
    const vMap = {}; for (const v of visits) vMap[v.source] = Number(v.sessions);
    res.json({ ok: true, days,
      // ยังไม่มีข้อมูลที่มาเลย = เพิ่งเริ่มเก็บ (ออเดอร์ก่อนหน้านี้ไม่มีข้อมูลย้อนหลัง)
      tracking_started: rows.some(r => r.source !== "(ไม่รู้ที่มา)"),
      sources: rows.map(r => ({ source: r.source, orders: Number(r.orders), paid: Number(r.paid),
        revenue: Math.round(Number(r.revenue) / 100), sessions: vMap[r.source] || 0 })) });
  } catch (e) { console.error("attribution", e.message); res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});

// 👀 ใครได้บทวิเคราะห์แล้วแต่ยังไม่กด "สร้างแผน 30 วัน" — เห็นรายชื่อจริง + รู้ว่าเตือนไปหรือยัง
app.get("/api/admin/activation-pending", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const rows = await q(`SELECT b.blueprint_id, b.user_id, b.billing_cycle, b.created_at, b.activation_reminded_at,
        r.email, r.instagram_account,
        ROUND(EXTRACT(EPOCH FROM (now() - b.created_at)) / 3600)::int AS hours_waiting
      FROM blueprints b JOIN blueprint_requests r ON b.request_id = r.request_id
      WHERE b.content_status='pending' AND COALESCE(b.analysis_status,'ready')='ready' AND b.deleted_at IS NULL
      ORDER BY b.created_at ASC LIMIT 200`);
    res.json({ ok: true,
      total: rows.length,
      over_24h: rows.filter(r => r.hours_waiting >= 24).length,
      reminded: rows.filter(r => r.activation_reminded_at).length,
      pending: rows });
  } catch (e) { console.error("activation-pending", e.message); res.status(500).json({ ok: false, error: "FAILED", message: e.message }); }
});
// ปุ่มเฉพาะกิจ: ส่งเมลเตือน activation อย่างเดียว (ไม่พ่วงเตือนอื่น จะได้ไม่ช้าและอ่านผลง่าย)
app.post("/api/admin/run-activation", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const sent = await runActivationReminders();
  res.json({ ok: true, sent });
});
// ซ่อมเล่มเดียว: เจนคอนเทนต์ใหม่ในเล่มเดิม (สคริปต์ไม่ครบ/พัง)
app.post("/api/admin/regen-content", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const bpId = String(req.body?.blueprint_id || ""); if (!bpId) return res.status(400).json({ ok: false, error: "MISSING" });
  res.json({ ok: true, status: "generating" });
  regenContentForBp(bpId);
});
// ซ่อมทั้งหมด: หาเล่มสคริปต์ไม่ครบ/วันว่าง/error แล้วเจนคอนเทนต์ใหม่ให้ทีละเล่ม
app.post("/api/admin/fix-flagged", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const broken = await findBrokenBooks(7);
  res.json({ ok: true, count: broken.length, books: broken.map(b => ({ email: b.email, instagram_account: b.instagram_account, reason: b.reason })) });
  (async () => { for (const b of broken) { await regenContentForBp(b.blueprint_id); } })();
});
// แก้อีเมลลูกค้า (เคสพิมพ์ผิด) — ย้ายทุกเล่ม/ออเดอร์/รีวิวไปอีเมลใหม่
app.post("/api/admin/edit-email", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const oldE = normEmail(req.body?.old_email), newE = normEmail(req.body?.new_email);
  if (!oldE || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newE)) return res.status(400).json({ ok: false, error: "INVALID", message: "อีเมลไม่ถูกต้อง" });
  const r1 = await run(`UPDATE blueprint_requests SET email=$1 WHERE lower(email)=lower($2)`, [newE, oldE]);
  await run(`UPDATE blueprint_orders SET email=$1 WHERE lower(email)=lower($2)`, [newE, oldE]).catch(() => {});
  await run(`UPDATE customers SET email=$1 WHERE lower(email)=lower($2)`, [newE, oldE]).catch(() => {});
  await run(`UPDATE reviews SET email=$1 WHERE lower(email)=lower($2)`, [newE, oldE]).catch(() => {});
  res.json({ ok: true, moved_books: r1.rowCount || 0, old: oldE, new: newE });
});

app.get("/api/health", (req, res) => {
  const sk = String(process.env.STRIPE_SECRET_KEY || "");
  const stripe_mode = sk.startsWith("sk_live_") ? "live" : sk.startsWith("sk_test_") ? "test" : "none";
  const key_dbg = { present: sk.length > 0, len: sk.length, prefix: sk.slice(0, 8), leading_space: sk !== sk.trimStart(), trailing_space: sk !== sk.trimEnd() };
  res.json({ ok: true, service: "babe-house-v2", ai: aiModelName(), payment_provider: PROVIDER, stripe_mode, key_dbg, stripe_webhook: process.env.STRIPE_WEBHOOK_SECRET ? "set" : "missing", email: EMAIL_ENABLED ? "resend" : "dev", time: new Date().toISOString() });
});

// ---------- serve React build (SPA fallback) ----------
app.use(express.static(WEB_DIST));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  // 🔴 สำคัญ: ห้ามตอบ index.html ให้ไฟล์ asset ที่ไม่มีอยู่จริง
  // ทุกครั้งที่ deploy ชื่อไฟล์ .js เปลี่ยน → ลูกค้าที่เปิดหน้าค้างไว้จะขอไฟล์เก่าที่หายไปแล้ว
  // ถ้าตอบ index.html (HTTP 200 + text/html) เบราว์เซอร์จะเอา HTML ไปรันเป็น JavaScript → พังทั้งหน้า
  // ("ระบบขัดข้องชั่วคราว") · ตอบ 404 ตรงๆ แทน แล้วให้ฝั่งหน้าเว็บโหลดหน้าใหม่เองอัตโนมัติ
  if (/\.(js|mjs|css|map|json|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot)$/i.test(req.path)) {
    return res.status(404).type("text/plain").send("Not found");
  }
  res.sendFile(path.join(WEB_DIST, "index.html"));
});
app.use((err, req, res, next) => { console.error("Unhandled:", err?.message); if (res.headersSent) return next(err); res.status(500).json({ ok: false, error: "SERVER_ERROR", message: "ระบบขัดข้อง" }); });

// ตาข่ายกันพลาด: ลองสร้างเล่มซ้ำให้ order ที่จ่ายแล้วแต่ generation ค้าง error (เช่น Gemini 503 ชั่วคราว)
// ลูกค้าที่จ่ายเงินต้องได้เล่มเสมอ — จำกัดเฉพาะที่จ่ายภายใน 24 ชม. กันลูปไม่รู้จบ
async function retryStuckGenerations() {
  try {
    // กู้: (ก) error (ข) ค้าง 'generating' >8 นาที (โดน deploy ตัด) (ค) 'pending'/ยังไม่เริ่มเจน >2 นาที (จ่ายแล้วแต่ไม่ได้เข้าหน้า processing เช่นปิดแท็บ) — ยกเว้นออเดอร์ Video Audit
    const rows = await q(`SELECT order_id, email, billing_cycle, order_payload_json FROM blueprint_orders WHERE payment_status IN ('paid','mock_paid') AND blueprint_id IS NULL AND COALESCE(tier,'') NOT LIKE 'Video%' AND COALESCE(tier,'') NOT LIKE 'Credits%' AND (generation_status='error' OR (generation_status='generating' AND paid_at < now() - interval '8 minutes') OR (COALESCE(generation_status,'pending')='pending' AND paid_at < now() - interval '2 minutes')) AND paid_at > now() - interval '24 hours' LIMIT 5`);
    for (const o of rows) {
      if (inFlightOrders.has(o.order_id)) continue; // กำลังเจน/เข้าคิวอยู่แล้วใน process นี้ — อย่าเจนซ้ำ
      const claim = await run(`UPDATE blueprint_orders SET generation_status='generating', generation_error=NULL WHERE order_id=$1 AND blueprint_id IS NULL AND COALESCE(generation_status,'pending') IN ('pending','error','generating')`, [o.order_id]);
      if (claim.rowCount !== 1) continue;
      inFlightOrders.add(o.order_id);
      try {
        const result = await generateBlueprintForPayload(safeJson(o.order_payload_json));
        await run(`UPDATE blueprint_orders SET blueprint_id=$1, generation_status='ready', generation_error=NULL WHERE order_id=$2`, [result.blueprintId, o.order_id]);
        console.log(`[retry-gen] order ${o.order_id} สำเร็จ`);
        if (o.email) {
          const url = `${appBaseUrl()}/dashboard?user_id=${encodeURIComponent(result.parsed.user_id)}&billing_cycle=${encodeURIComponent(result.parsed.meta_purchase.billing_cycle)}&blueprint_id=${encodeURIComponent(result.blueprintId)}`;
          const l = langOfPayload(result.parsed);
          await sendEmail(o.email,
            tr(l, `เล่ม Blueprint เดือน ${o.billing_cycle} พร้อมแล้ว 🩵`, `Your ${o.billing_cycle} Blueprint is ready 🩵`),
            wrap(tr(l,
              `ครูพี่คิมวิเคราะห์เสร็จแล้ว เล่มแผน 30 วันพร้อมเปิดดูค่ะ<br><br>${btn(url, "เปิด Dashboard ของฉัน")}`,
              `Kim has finished the analysis — your 30-day plan is ready to open.<br><br>${btn(url, "Open my dashboard")}`))).catch(() => {});
        }
      } catch (e) {
        console.error(`[retry-gen] order ${o.order_id} ยังไม่สำเร็จ:`, e.message);
        await run(`UPDATE blueprint_orders SET generation_status='error', generation_error=$1 WHERE order_id=$2`, [String(e.message).slice(0, 300), o.order_id]);
      } finally { inFlightOrders.delete(o.order_id); }
    }
  } catch (e) { console.error("retryStuckGenerations", e.message); }
}

// ตาข่ายกันพลาดสเต็ป 2: คอนเทนต์ 30 วันที่ค้าง 'generating' (เช่นเซิร์ฟเวอร์รีสตาร์ตกลางคัน) → เจนต่อให้เสร็จ + ส่งเมล
// (ลูกค้ายืนยันบทวิเคราะห์แล้วถึงจะมาสเต็ปนี้ = อยากได้แผนแน่นอน → ทำให้เสร็จเสมอ) · refine ที่ค้าง → ปลดล็อก UI
async function retryStuckContent() {
  try {
    const rows = await q(`SELECT blueprint_id, request_id, blueprint_json, billing_cycle FROM blueprints WHERE content_status='generating' AND content_started_at < now() - interval '8 minutes' AND created_at > now() - interval '24 hours' LIMIT 3`);
    for (const b of rows) {
      if (inFlightBp.has(b.blueprint_id)) continue;
      inFlightBp.add(b.blueprint_id);
      try {
        const current = safeJson(b.blueprint_json) || {};
        if (Array.isArray(current.scripts) && current.scripts.length) { await run(`UPDATE blueprints SET content_status='ready' WHERE blueprint_id=$1`, [b.blueprint_id]); continue; }
        await acquireGen();
        try {
          const reqRow = await one(`SELECT raw_payload_json FROM blueprint_requests WHERE request_id=$1`, [b.request_id]);
          const rawP = safeJson(reqRow?.raw_payload_json) || {};
          const parsed = GenSchema.parse(normalizePayload(rawP));
          const { content, model } = await generateContent(parsed, current, rawP.lang === "en" ? "en" : "th");
          const merged = { ...current, calendar: content.calendar, scripts: content.scripts };
          await run(`UPDATE blueprints SET blueprint_json=$1, model=$2, content_status='ready' WHERE blueprint_id=$3`, [JSON.stringify(merged), model, b.blueprint_id]);
          console.log(`[retry-content] ${b.blueprint_id} สำเร็จ`);
          if (parsed.email) { const url = `${appBaseUrl()}/dashboard?user_id=${encodeURIComponent(parsed.user_id)}&billing_cycle=${encodeURIComponent(parsed.meta_purchase.billing_cycle)}&blueprint_id=${encodeURIComponent(b.blueprint_id)}`; const l = langOfPayload(parsed); await sendEmail(parsed.email,
            tr(l, `แผนคอนเทนต์ 30 วันของคุณพร้อมแล้ว 🎉`, `Your 30-day content plan is ready 🎉`),
            wrap(tr(l,
              `ครูพี่คิมเขียนสคริปต์พร้อมอัดให้ครบทั้ง 30 วันแล้วค่ะ! 🩵<br><br>${btn(url, "เปิดดูแผน 30 วันของฉัน")}`,
              `Kim has written all 30 days of ready-to-shoot scripts! 🩵<br><br>${btn(url, "Open my 30-day plan")}`))).catch(() => {}); }
        } finally { releaseGen(); }
      } catch (e) { console.error(`[retry-content] ${b.blueprint_id}`, e.message); await run(`UPDATE blueprints SET content_status='error' WHERE blueprint_id=$1`, [b.blueprint_id]).catch(() => {}); }
      finally { inFlightBp.delete(b.blueprint_id); }
    }
    // refine บทวิเคราะห์ที่ค้าง → ปลดล็อก UI (บทวิเคราะห์เดิมยังอยู่ครบ ลูกค้ากดแก้ใหม่ได้)
    await run(`UPDATE blueprints SET analysis_status='ready' WHERE analysis_status='generating' AND content_started_at < now() - interval '8 minutes'`).catch(() => {});
  } catch (e) { console.error("retryStuckContent", e.message); }
}

// ซ่อมเล่ม: เจน "คอนเทนต์" ใหม่ในเล่มเดิม (bp_id เดิม ลิงก์เดิม) — ใช้ตอนสคริปต์ไม่ครบ/พัง
async function regenContentForBp(bpId) {
  if (inFlightBp.has(bpId)) return false;
  const b = await one(`SELECT * FROM blueprints WHERE blueprint_id=$1`, [bpId]);
  if (!b) return false;
  inFlightBp.add(bpId);
  try {
    await run(`UPDATE blueprints SET content_status='generating', content_started_at=now() WHERE blueprint_id=$1`, [bpId]);
    await acquireGen();
    try {
      const current = safeJson(b.blueprint_json) || {};
      const reqRow = await one(`SELECT raw_payload_json FROM blueprint_requests WHERE request_id=$1`, [b.request_id]);
      const raw = safeJson(reqRow?.raw_payload_json) || {};
      const parsed = GenSchema.parse(normalizePayload(raw));
      parsed.prev_context = await getPrevContext(parsed.email, b.billing_cycle, parsed.instagram_account);
      const { content, model } = await generateContent(parsed, current, raw.lang === "en" ? "en" : "th");
      const merged = { ...current, calendar: content.calendar, scripts: content.scripts };
      const flags = checkBlueprintQuality(merged, true);
      await run(`UPDATE blueprints SET blueprint_json=$1, model=$2, content_status='ready', quality_flags_json=$3 WHERE blueprint_id=$4`, [JSON.stringify(merged), model, JSON.stringify(flags), bpId]);
      console.log(`[regen-content] ${bpId} สำเร็จ (${(merged.scripts || []).length} สคริปต์)`);
      return true;
    } finally { releaseGen(); }
  } catch (e) { console.error(`[regen-content] ${bpId}`, e.message); await run(`UPDATE blueprints SET content_status='error' WHERE blueprint_id=$1`, [bpId]).catch(() => {}); return false; }
  finally { inFlightBp.delete(bpId); }
}
// หาเล่มที่สคริปต์ไม่ครบ/วันว่าง/error (ใช้ทั้ง watchdog + ปุ่มซ่อมทั้งหมด)
async function findBrokenBooks(days = 7) {
  // ⚠️ เดิมมี 2 รูรั่วที่ทำให้ 11 เล่มของลูกค้าที่จ่ายเงินแล้วหลุดสายตาไปเป็นเดือน:
  //   1) ดูแค่ status ready/error → เล่มที่ค้างที่ 'pending' ตลอดกาลไม่เคยถูกตรวจ
  //   2) เงื่อนไข `scr.length && scr.length < 30` → เล่มที่มี "0 สคริปต์" รอดทุกครั้ง (0 เป็น falsy)
  // ตอนนี้จับทั้ง 2 แบบแล้ว · เล่มที่เพิ่งซื้อ (<30 นาที) ยังไม่นับ เพราะกำลังเจนอยู่จริง
  const rows = await q(`SELECT b.blueprint_id, b.user_id, b.billing_cycle, b.content_status, b.blueprint_json, b.created_at, r.email, r.instagram_account
    FROM blueprints b JOIN blueprint_requests r ON b.request_id=r.request_id
    WHERE b.deleted_at IS NULL AND b.created_at > now() - interval '${Number(days)} days'`);
  // ร่างซ้ำ: ลูกค้ากดสร้างหลายรอบ เหลือแถวเปล่าค้างไว้ ทั้งที่มีเล่มดีอยู่แล้ว → อย่าเผาค่า AI ซ่อมของที่ไม่มีใครใช้
  const healthy = new Set(rows.filter(r => r.content_status === "ready" && ((safeJson(r.blueprint_json) || {}).scripts || []).length >= 30)
    .map(r => `${r.user_id}|${r.billing_cycle}`));
  const broken = [];
  for (const r of rows) {
    if (healthy.has(`${r.user_id}|${r.billing_cycle}`) && !(r.content_status === "ready" && ((safeJson(r.blueprint_json) || {}).scripts || []).length >= 30)) continue;
    const ageMin = (Date.now() - new Date(r.created_at).getTime()) / 60000;
    let reason = "";
    if (r.content_status === "error") reason = "เจนคอนเทนต์ error";
    else if (r.content_status !== "ready") {
      if (ageMin < 30) continue;                 // เพิ่งซื้อ กำลังเจนอยู่ ปล่อยไว้ก่อน
      reason = `ค้างที่ ${r.content_status} มา ${Math.round(ageMin)} นาที`;
    } else {
      const bp = safeJson(r.blueprint_json) || {};
      const scr = Array.isArray(bp.scripts) ? bp.scripts : [];
      const empty = scr.filter(s => (s.beats || []).reduce((a, x) => a + String(x.say || "").length, 0) < 50).length;
      if (scr.length < 30) reason = `สคริปต์ ${scr.length}/30`;   // ครอบคลุม 0 ด้วย
      else if (empty > 0) reason = `${empty} วันว่าง`;
    }
    if (reason) broken.push({ blueprint_id: r.blueprint_id, email: r.email, instagram_account: r.instagram_account, reason });
  }
  return broken;
}
// ☀️ รายงานสุขภาพระบบรายวัน — คิมจะได้ไม่ต้องมานั่งถามว่า "เล่มพังไหม" ทุกวัน
// หลักคิด: เงียบ = ปกติ ต้องพิสูจน์ได้ ไม่ใช่แค่ "ไม่มีใครบ่น" · ส่งทุกวันแม้ไม่มีปัญหา เพื่อให้ "ไม่ได้เมล" = ระบบล่ม (สังเกตได้)
async function buildDailyHealth() {
  // ยอดขายใส่ได้ — รายงานนี้ส่งเข้า OPS_EMAIL (กล่องส่วนตัวคิม) ไม่ใช่กล่องที่ทีมเห็น
  const since = `now() - interval '24 hours'`;
  const sold = await one(`SELECT COUNT(*) n, COALESCE(SUM(final_amount_satang),0)/100 baht FROM blueprint_orders
    WHERE payment_status='paid' AND COALESCE(provider,'') <> 'code' AND created_at > ${since}`);
  const made = await one(`SELECT COUNT(*) n FROM blueprints WHERE deleted_at IS NULL AND created_at > ${since}`);
  // ลูกค้าที่ได้บทวิเคราะห์แล้ว แต่ยังไม่กดปุ่ม "สร้างแผน 30 วัน" (ไม่ใช่ระบบพัง — แต่เขายังไม่ได้ของที่จ่ายไป)
  const waiting = await q(`SELECT r.instagram_account, r.email, b.billing_cycle, b.created_at
    FROM blueprints b JOIN blueprint_requests r ON b.request_id=r.request_id
    WHERE b.deleted_at IS NULL AND b.content_status='pending' AND b.content_started_at IS NULL
      AND b.created_at < now() - interval '6 hours' ORDER BY b.created_at ASC LIMIT 20`);
  const broken = await findBrokenBooks(14);
  const flagged = await q(`SELECT r.instagram_account, b.quality_flags_json FROM blueprints b JOIN blueprint_requests r ON b.request_id=r.request_id
    WHERE b.deleted_at IS NULL AND b.created_at > ${since} AND COALESCE(b.quality_flags_json,'[]') <> '[]'`);
  return { sold, made: Number(made?.n || 0), waiting, broken, flagged };
}
async function runDailyHealthReport() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const done = await one(`SELECT day FROM daily_report_log WHERE day=$1`, [today]);
    if (done) return;                                   // ส่งไปแล้ววันนี้
    if (new Date().getUTCHours() < 2) return;           // ~09:00 เวลาไทย
    const h = await buildDailyHealth();
    await run(`INSERT INTO daily_report_log (day, summary_json) VALUES ($1,$2) ON CONFLICT (day) DO NOTHING`,
      [today, JSON.stringify({ sold: h.sold, made: h.made, waiting: h.waiting.length, broken: h.broken.length })]);
    const problems = h.broken.length + h.waiting.length;
    const li = (x) => `<li style="margin:3px 0">${x}</li>`;
    const body =
      `<p style="font-size:15px">สรุป 24 ชม.ที่ผ่านมาค่ะ 🩵</p>` +
      `<table style="font-size:15px;line-height:2"><tr><td>ขายได้&nbsp;&nbsp;</td><td><b>${h.sold?.n || 0} เล่ม · ฿${Number(h.sold?.baht || 0).toLocaleString()}</b></td></tr>` +
      `<tr><td>เล่มที่สร้าง&nbsp;&nbsp;</td><td><b>${h.made} เล่ม</b></td></tr></table>` +
      (h.broken.length
        ? `<p style="color:#b00"><b>⚠️ เล่มที่ระบบกำลังซ่อม ${h.broken.length} เล่ม</b></p><ul>${h.broken.slice(0, 10).map(b => li(`${b.instagram_account || "?"} — ${b.reason}`)).join("")}</ul>` +
          `<p style="font-size:13px;color:#666">ระบบซ่อมเองอัตโนมัติ ถ้าซ่อม 2 ครั้งไม่ผ่านจะมีเมลแยกแจ้งคิมค่ะ</p>`
        : `<p style="color:#1a7f43;font-size:15px"><b>✅ เล่มที่สร้างใน 24 ชม.ที่ผ่านมาสมบูรณ์ครบทุกเล่ม</b><br>ไม่มีเล่มพัง ไม่มีเล่มค้าง</p>`) +
      (h.waiting.length
        ? `<p><b>⏳ ${h.waiting.length} คนได้บทวิเคราะห์แล้วแต่ยังไม่กดสร้างแผน 30 วัน</b> (ระบบส่งเมลเตือนให้แล้ว)</p><ul>${h.waiting.slice(0, 10).map(w => li(`${w.instagram_account || "?"} · ${w.email || ""} — ${new Date(w.created_at).toISOString().slice(0, 10)}`)).join("")}</ul>`
        : "") +
      (h.flagged.length ? `<p>🔎 เล่มใหม่ที่มีธงคุณภาพ ${h.flagged.length} เล่ม — ดูได้ที่หลังบ้าน → "คุณภาพเล่ม"</p>` : "") +
      `<p style="color:#999;font-size:12px;margin-top:18px">เมลนี้ส่งทุกวัน 9 โมงเช้าเข้ากล่องนี้กล่องเดียว (ไม่เข้า babehouse555) ถ้าวันไหนไม่ได้รับ = ระบบมีปัญหา ให้เช็กทันทีค่ะ</p>`;
    await sendEmail(OPS_EMAIL, `${problems ? "⚠️" : "✅"} Babe House รายงานประจำวัน · ขาย ${h.sold?.n || 0} เล่ม${problems ? ` · ต้องดู ${problems} รายการ` : " · ระบบปกติดี"}`, wrap(body));
    console.log(`[daily-report] ส่งแล้ว · พัง ${h.broken.length} · รอกดสร้างแผน ${h.waiting.length}`);
  } catch (e) { console.error("daily-report", e.message); }
}
// Watchdog: เจอเล่มพัง → เมลแจ้งแอดมินทันที (ไม่ต้องรอลูกค้าบอก)
// 📬 เมลหลังบ้านทั้งหมด (รายงานรายวัน · เตือนปัญหา · แจ้งยอดขาย) ส่งเข้ากล่องนี้กล่องเดียว
// คิมสั่ง 1 ส.ค.: ห้ามเข้า babehouse555@gmail.com เพราะทีมเห็นด้วย → ยอดขายใส่ได้ตามปกติในกล่องนี้
// ใช้ตัวแปรใหม่ (ไม่ใช่ ADMIN_ALERT_EMAIL เดิม) เพื่อไม่ให้ค่า env เก่าบน Railway มาทับ
const OPS_EMAIL = process.env.OPS_EMAIL || "babehouse.work@gmail.com";
const ADMIN_ALERT_EMAIL = OPS_EMAIL;
const alertedBp = new Set();
// 🔧 ยามคุณภาพ: เจอเล่มพัง → "ซ่อมเองก่อน" แล้วค่อยเตือนคิมเฉพาะเคสที่ซ่อมไม่ขึ้น
// เดิมมันแค่ส่งเมลบอกให้คิมไปกดปุ่มซ่อมเอง = งานมือที่ไม่ควรมี (ตัวซ่อม regenContentForBp มีอยู่แล้ว แค่ไม่มีใครเรียก)
const autoRepairTries = new Map();   // blueprint_id → ซ่อมไปกี่ครั้งแล้ว
const MAX_AUTO_REPAIR = 2;           // ซ่อมเองได้ 2 ครั้ง ไม่สำเร็จค่อยเรียกคน
const REPAIR_PER_ROUND = 3;          // ซ่อมรอบละไม่เกิน 3 เล่ม กันค่า AI พุ่งและกันแย่งคิวลูกค้าใหม่
async function runQualityWatch() {
  try {
    const broken = await findBrokenBooks(14);   // เดิม 2 วัน → เล่มค้างของเดือนก่อนไม่เคยถูกมองเห็น
    if (!broken.length) return;
    const giveUp = [];
    let repaired = 0;
    for (const b of broken) {
      const tries = autoRepairTries.get(b.blueprint_id) || 0;
      if (tries >= MAX_AUTO_REPAIR) {
        // ซ่อมเองครบโควตาแล้วยังพัง → ค่อยรบกวนคิม (ครั้งเดียวต่อเล่ม)
        if (!alertedBp.has(b.blueprint_id)) { alertedBp.add(b.blueprint_id); giveUp.push(b); }
        continue;
      }
      if (repaired >= REPAIR_PER_ROUND) continue;   // เหลือไว้รอบหน้า (อีก 10 นาที)
      autoRepairTries.set(b.blueprint_id, tries + 1);
      repaired++;
      console.log(`[quality-watch] 🔧 ซ่อมเอง ${b.blueprint_id} (${b.reason}) ครั้งที่ ${tries + 1}`);
      regenContentForBp(b.blueprint_id).catch(e => console.error("auto-repair", e.message));
    }
    if (giveUp.length) {
      const list = giveUp.map(b => `• ${b.email || "?"} (${b.instagram_account || "?"}) — ${b.reason}`).join("<br>");
      await sendEmail(ADMIN_ALERT_EMAIL, `⚠️ Babe House: ${giveUp.length} เล่มซ่อมเองไม่สำเร็จ`, wrap(
        `ระบบพยายามซ่อมเองแล้ว ${MAX_AUTO_REPAIR} ครั้ง แต่ยังไม่ผ่านค่ะ อันนี้ต้องให้คิมดูเอง:<br><br>${list}<br><br>` +
        `เข้าหลังบ้าน → "คุณภาพเล่ม" กดปุ่ม <b>ซ่อมเล่ม</b> หรือ <b>รีเจนใหม่ทั้งเล่ม</b><br><br>` +
        `<span style="color:#999;font-size:12px">เมลนี้ส่งเฉพาะตอนซ่อมอัตโนมัติไม่สำเร็จเท่านั้น — เล่มที่ระบบซ่อมเองได้จะไม่รบกวนคิมเลยค่ะ</span>`)).catch(() => {});
      console.warn(`[quality-watch] ยอมแพ้ ${giveUp.length} เล่ม → แจ้งคิม`);
    }
  } catch (e) { console.error("quality-watch", e.message); }
}

const PORT = Number(process.env.PORT || 3000);

// 🛟 เปิดเว็บให้ลูกค้าเข้าได้ "ก่อน" ต่อฐานข้อมูลเสมอ
// บทเรียน 2 ส.ค.: เดิมถ้า initDb ล้มแม้แค่ชั่วคราว โค้ดสั่ง process.exit(1) → Railway รีสตาร์ท → ล้มซ้ำ → เว็บดับยาว
// ตอนนี้: ฟังพอร์ตก่อน (เว็บไม่ดับ) แล้วค่อยลองต่อ DB ซ้ำเรื่อยๆ จนติด
// 🛡️ ยามกันเว็บดับ — บั๊กจุดเดียวต้องไม่ล้มทั้งเว็บ
// เจอจริง 3 ส.ค.: query ใหม่อ้างคอลัมน์ที่ไม่มี แล้วอยู่นอก try → unhandled rejection → Node ปิดตัวเอง
// ลูกค้าที่กำลังใช้งานอยู่หลุดหมดทั้งที่เป็นบั๊กของ endpoint เดียว (บทเรียนเดียวกับที่เคยดับ 25 นาที)
// ตั้งใจไม่ปิดโปรเซส: เว็บอยู่ต่อ แล้วเราไปตามแก้จาก log
process.on("unhandledRejection", (e) => console.error("[unhandledRejection] เว็บยังทำงานต่อ:", e?.stack || e));
process.on("uncaughtException", (e) => console.error("[uncaughtException] เว็บยังทำงานต่อ:", e?.stack || e));

app.listen(PORT, () => console.log(`Babe House v2 running on :${PORT} | ai=${aiModelName()} | pay=${PROVIDER}`));

async function connectDbWithRetry() {
  for (let attempt = 1; ; attempt++) {
    try { await initDb(); console.log(`[db] เชื่อมต่อสำเร็จ (ครั้งที่ ${attempt})`); return; }
    catch (e) {
      const wait = Math.min(30000, 2000 * attempt);
      console.error(`[db] เชื่อมต่อไม่ได้ (ครั้งที่ ${attempt}): ${e.message} — ลองใหม่ใน ${wait / 1000}s`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}
connectDbWithRetry().then(async () => {
  // seed ล้มก็ไม่ควรทำเว็บดับ — ของพวกนี้เป็นข้อมูลตั้งต้น ไม่ใช่หัวใจการให้บริการ
  for (const [name, fn] of [["workshops", seedWorkshops], ["assignments", seedAssignments], ["projects", seedProjects], ["playground", seedPlayground], ["team", seedTeamIfEmpty]]) {
    try { await fn(); } catch (e) { console.error(`[seed ${name}]`, e.message); }
  }
  // โหลดเทรนด์ curated ล่าสุด "ของแต่ละกลุ่มอาชีพ" เข้าหน่วยความจำ AI
  try {
    const rows = await q(`SELECT DISTINCT ON (COALESCE(category,'general')) COALESCE(category,'general') AS category, content, created_at FROM trend_digest ORDER BY COALESCE(category,'general'), created_at DESC`);
    for (const r of rows) setCuratedTrends(r.category, r.content, new Date(r.created_at).getTime());
  } catch (e) { console.warn("load trends", e.message); }
  setTimeout(() => { runMonthlyReminders(); runHomeworkReminders(); runAbandonedFollowups(); runActivationReminders(); }, 30000);
  setTimeout(retryStuckGenerations, 45000); // กู้เล่มที่ค้างหลังสตาร์ท/deploy (เช่น generation โดนตัดกลางคัน)
  // ตอนสตาร์ท: คอนเทนต์/refine ที่ค้าง 'generating' = orphan จาก process เก่าแน่นอน → มาร์คให้ "เก่า" เพื่อให้ retryStuckContent กู้ทันที
  setTimeout(() => { run(`UPDATE blueprints SET content_started_at = now() - interval '10 minutes' WHERE (content_status='generating' OR analysis_status='generating') AND (content_started_at IS NULL OR content_started_at > now() - interval '8 minutes')`).then(() => retryStuckContent()).catch(() => {}); }, 50000);
  setInterval(() => { runMonthlyReminders(); runHomeworkReminders(); }, 24 * 3600 * 1000); // วันละครั้ง (เตือนต่อแผนจะส่งจริงเฉพาะปลายเดือน วันที่ >=25)
  setInterval(runAbandonedFollowups, 6 * 3600 * 1000); // ทุก 6 ชม. ตามคนกรอกฟอร์มแล้วไม่จ่าย
  setInterval(runActivationReminders, 6 * 3600 * 1000); // ทุก 6 ชม. เตือนคนได้บทวิเคราะห์แล้วยังไม่กดสร้างแผน 30 วัน (เกิน 24 ชม.)
  setInterval(retryStuckGenerations, 3 * 60 * 1000); // ทุก 3 นาที กู้เล่มที่ค้าง error/generating
  setInterval(retryStuckContent, 3 * 60 * 1000); // ทุก 3 นาที กู้คอนเทนต์ 30 วันที่ค้าง + ปลดล็อก refine ที่ค้าง
  setInterval(() => run(`UPDATE video_audits SET video_data=NULL WHERE status='uploaded' AND video_data IS NOT NULL AND created_at < now() - interval '24 hours' AND order_id IN (SELECT order_id FROM blueprint_orders WHERE payment_status NOT IN ('paid','mock_paid'))`).catch(e => console.error("va cleanup", e.message)), 3600 * 1000); // ทุก 1 ชม. ลบคลิปที่อัปแต่ไม่จ่ายเกิน 24 ชม.
  setInterval(() => run(`DELETE FROM academy_video_access WHERE created_at < now() - interval '60 days'`).catch(() => {}), 24 * 3600 * 1000); // ล็อกการเข้าดูคลิปเก็บ 60 วันพอ (ใช้จับพฤติกรรมระยะสั้น) ไม่ให้ตารางบวม
  setTimeout(runQualityWatch, 120000); // watchdog: ตรวจเล่มพัง → ซ่อมเองก่อน แล้วค่อยเมลแจ้งคิมถ้าซ่อมไม่ขึ้น
  setInterval(runQualityWatch, 10 * 60 * 1000); // ทุก 10 นาที
  setInterval(runDailyHealthReport, 30 * 60 * 1000); // เช็กทุก 30 นาที → ส่งรายงานสุขภาพวันละครั้ง (~9 โมงเช้า)
  setTimeout(emailWeeklyBackupIfDue, 90000); // เช็กหลังสตาร์ท (ส่งถ้าครบ 7 วัน)
  setInterval(emailWeeklyBackupIfDue, 12 * 3600 * 1000); // เช็กทุก 12 ชม. → ส่ง backup เข้าเมลแอดมินสัปดาห์ละครั้ง
}).catch(e => console.error("[startup] งานหลังต่อ DB ล้ม:", e.message));   // ⛔ ห้าม process.exit — เว็บต้องอยู่ต่อ
