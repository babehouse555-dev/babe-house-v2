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
import { seedWorkshops } from "./seed-workshops.js";
import { seedAssignments } from "./seed-assignments.js";
import { generateBlueprint, generateAnalysis, generateContent, generateSingleScript, generateGrowthAnalysis, buildBaselineGrowth, generateAdminInsight, classifyIndustries, classifyKeyword, INDUSTRIES, aiModelName, aiCostTHB, analyzeVideo, gradeHomework, checkBlueprintQuality, rewriteTheme, BAD_THEME_RE, auditBlueprintMatch, setCuratedTrends, enrichDirections, complianceNote, politeKimBlueprint } from "./ai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.join(__dirname, "..", "web", "dist");
const app = express();

const PRICE_SATANG = Number(process.env.PRICE_SATANG || 49000);
const REFERRAL_PERCENT = Number(process.env.REFERRAL_PERCENT || 20);
const LOYALTY_PERCENT = Number(process.env.LOYALTY_PERCENT || 10);
const LOYALTY_MIN_MONTHS = Number(process.env.LOYALTY_MIN_MONTHS || 2);
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
const LINE_ACADEMY_URL = process.env.LINE_ACADEMY_URL || "https://line.me/R/ti/p/%40babehouse_academy";
const LINE_WORK_URL = process.env.LINE_WORK_URL || "https://line.me/ti/p/0yBlh9zXFl";

// ---------- payment / referral ----------
async function markOrderPaid(orderId, provider = "mock", sid = "") {
  // live_mode = จ่ายด้วย Stripe จริง (คีย์ sk_live_) เท่านั้น = เงินเข้าจริง; mock/code/test = false
  const liveMode = provider === "stripe" && String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_");
  // flip เฉพาะตอนยังไม่ paid → rowCount บอกว่า "เพิ่งจ่ายครั้งแรก" (กัน webhook ยิงซ้ำแล้วแจ้งเตือนซ้ำ)
  const upd = await run(`UPDATE blueprint_orders SET payment_status='paid', provider=$1, provider_session_id=COALESCE($2,provider_session_id), live_mode=$3, paid_at=now() WHERE order_id=$4 AND payment_status<>'paid'`, [provider, sid || null, liveMode, orderId]);
  grantCreditsIfCreditOrder(orderId).catch(e => console.error("grant-credits", e.message));
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
    form_responses: z.object({ self_term: z.string().optional().default(""), audience_term: z.string().optional().default(""), catchphrases: z.string().optional().default(""), tone: z.string().optional().default(""), business_type: z.string().optional().default(""), gender: z.string().optional().default(""), age_range: z.string().optional().default(""), work_style: z.string().optional().default(""), audience: z.string().optional().default(""), experience: z.string().optional().default(""), goal_primary: z.string().optional().default(""), starting_point: z.string().optional().default(""), monthly_goal: z.string().min(1), competitor_1: z.string().optional().default(""), competitor_2: z.string().optional().default(""), display_name: z.string().optional().default(""), phone: z.string().optional().default("") }),
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
    let discountPct = null, finalAmount = PRICE_SATANG, refValid = null;
    if (refBy) {
      const refC = await one(`SELECT email FROM customers WHERE referral_code=$1`, [refBy]);
      if (refC && normEmail(refC.email) !== normEmail(payload.email)) { refValid = refBy; discountPct = REFERRAL_PERCENT; finalAmount = Math.round(PRICE_SATANG * (100 - REFERRAL_PERCENT) / 100); }
    }
    if (!discountPct && payload.email) {
      const r = await one(`SELECT COUNT(DISTINCT billing_cycle) n FROM blueprint_requests WHERE email=$1`, [normEmail(payload.email)]);
      if (Number(r.n) >= LOYALTY_MIN_MONTHS) { discountPct = LOYALTY_PERCENT; finalAmount = Math.round(PRICE_SATANG * (100 - LOYALTY_PERCENT) / 100); }
    }
    const checkoutUrl = `/checkout?order_id=${encodeURIComponent(orderId)}`;
    await run(`INSERT INTO blueprint_orders (order_id,user_id,instagram_account,email,tier,billing_cycle,payment_status,order_payload_json,provider,final_amount_satang,referred_by,discount_percent,checkout_url,source) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10,$11,$12,$13)`,
      [orderId, payload.user_id, payload.instagram_account, payload.email || null, parsed.tier, payload.meta_purchase.billing_cycle, JSON.stringify(payload), PROVIDER, finalAmount, refValid, discountPct, checkoutUrl,
       (String(req.body?.source || payload.source || "").slice(0, 60)) || null]);
    res.json({ ok: true, order_id: orderId, checkout_url: checkoutUrl, provider: PROVIDER, payment_status: "pending" });
  } catch (err) { console.error(err); res.status(400).json({ ok: false, error: "CHECKOUT_FAILED", message: err.message }); }
});

app.get("/api/orders/:orderId", async (req, res) => {
  const o = await getOrder(req.params.orderId);
  if (!o) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
  res.json({ ok: true, order: { order_id: o.order_id, user_id: o.user_id, instagram_account: o.instagram_account, tier: o.tier, billing_cycle: o.billing_cycle, payment_status: o.payment_status, provider: o.provider, blueprint_id: o.blueprint_id, generation_status: o.generation_status || "pending", generation_error: o.generation_error, discount_code: o.discount_code, discount_percent: o.discount_percent, final_amount_satang: o.final_amount_satang, created_at: o.created_at, paid_at: o.paid_at } });
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
  const finalAmount = Math.round(PRICE_SATANG * (100 - percent) / 100);
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
    if (!latest.positioning && !latest.theme && !topics.length) return null;
    return { theme: latest.theme, positioning: latest.positioning, prev_topics: topics.slice(0, 100), months: rows.length + 1, growth_gist: growthGist };
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
    await sendEmail(process.env.ADMIN_ALERT_EMAIL || "babehouse555@gmail.com",
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
  res.json({ ok: true });
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
// แคตตาล็อกคอร์ส (อ่านอย่างเดียว) — สำหรับหน้าพรีวิว /academy (ยังไม่ลิงก์จากเมนู ลูกค้าไม่เจอ)
// ⚠️ ธง isActive ของระบบเก่ากลับด้าน: '0' = คอร์สที่แสดงบนเว็บจริง (ตรวจเทียบเว็บเก่า 21 คอร์สแล้ว) · '1' = ซ่อน/เวอร์ชันเก่า
// ⛔ ไม่ส่ง url วิดีโอบทเรียนออกไปเด็ดขาด (เป็นคอนเทนต์ที่ลูกค้าจ่ายเงิน) — url ใช้เฉพาะฝั่งแอดมิน/ระบบเรียนในเฟสถัดไป
// คอร์สที่เลิกขายแล้ว (คิมสั่งเอาออก 2026-08-01: Creative Thinking = คอร์สเก่ามาก ไม่อยากขายต่อ)
// ซ่อนที่โค้ดแทนการแก้ธง is_active ใน DB → ลูกค้าเก่าที่ซื้อไปแล้วยังเข้าเรียนได้ตามปกติ
// "15" = Creative Thinking (คอร์สเก่ามาก คิมไม่อยากขายต่อ)
// "40","41","42" = Sky Drawing ของครูมู (จบความร่วมมือ 2026-08-01 · ขายได้ 0 ออเดอร์)
const HIDDEN_COURSES = new Set(["15", "40", "41", "42"]);
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
    ) x`, [email]);
  return rows.map(r => r.course_id);
}
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
    sendEmail(process.env.ADMIN_ALERT_EMAIL || "babehouse555@gmail.com", "🔒 สงสัยมีการแชร์บัญชีเรียน",
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
      sendEmail(process.env.ADMIN_ALERT_EMAIL || "babehouse555@gmail.com", "📝 มีการบ้านรอตรวจมือ",
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
    res.json({ ok: true, workshops: ws.map(w => ({ ...w, sessions: byWs[w.workshop_id] || [] })) });
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
  sendEmail(process.env.ADMIN_ALERT_EMAIL || "babehouse555@gmail.com", `🎟️ จอง workshop ใหม่ — ${s?.ws_name || ""}`, wrap(
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
      [id, String(b.course_id || ""), ["clip", "work", "quote"].includes(b.kind) ? b.kind : "clip", String(b.url || ""),
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
  const to = process.env.ADMIN_ALERT_EMAIL || "babehouse555@gmail.com";
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
  try { const r = await emailBackup(); res.json({ ok: true, ...r, to: process.env.ADMIN_ALERT_EMAIL || "babehouse555@gmail.com" }); }
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
app.post("/api/admin/fix-theme", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const one_id = String(req.body?.blueprint_id || "").trim();
  const limit = Math.min(Number(req.body?.limit) || 25, 60);
  const rows = one_id
    ? await q(`SELECT blueprint_id, blueprint_json FROM blueprints WHERE blueprint_id=$1 AND deleted_at IS NULL`, [one_id])
    : await q(`SELECT blueprint_id, blueprint_json FROM blueprints WHERE deleted_at IS NULL ORDER BY created_at DESC`);
  const done = [], skipped = [];
  for (const r of rows) {
    if (done.length >= limit) break;
    const bp = safeJson(r.blueprint_json); if (!bp) continue;
    const old = String(bp.theme || "");
    if (!one_id && !BAD_THEME_RE.test(old)) continue;          // กวาดอัตโนมัติ = แตะเฉพาะเล่มที่ธีมพัง
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
    const rows = await q(`SELECT DISTINCT email FROM blueprint_requests WHERE email IS NOT NULL AND email NOT IN (SELECT email FROM blueprint_requests WHERE billing_cycle=$1 AND email IS NOT NULL) AND email NOT IN (SELECT email FROM month_reminders WHERE cycle=$1) LIMIT 200`, [cycle]);
    let sent = 0;
    for (const r of rows) { try { const l = await langOfEmail(r.email); await sendEmail(r.email,
      tr(l, "เดือนใหม่แล้ว มาต่อแผนคอนเทนต์กันค่ะ 🩵", "A new month begins — let's plan your content 🩵"),
      wrap(tr(l,
        `เข้าสู่เดือนใหม่แล้ว! มาต่อแผน 30 วันของเดือนนี้กันค่ะ<br><br>${btn(`${appBaseUrl()}/?renew=1&email=${encodeURIComponent(r.email)}`, "ปลดล็อกแผนเดือนใหม่ (490฿)")}`,
        `It's a new month! Time to continue with this month's 30-day plan.<br><br>${btn(`${appBaseUrl()}/?renew=1&email=${encodeURIComponent(r.email)}`, "Unlock this month's plan (฿490)")}`))); } catch { continue; } await run(`INSERT INTO month_reminders (email,cycle) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [r.email, cycle]); sent++; }
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
        `เดือนนี้ทำไปแล้ว <b>${r.uploaded} วัน</b> สู้ๆ นะคะ! ความสม่ำเสมอคือกุญแจของการเติบโตค่ะ<br><br>${btn(`${appBaseUrl()}/account`, "เปิดแผนของฉัน ทำต่อ")}<br><br><b>ถ้าทำเองแล้วเริ่มเหนื่อย/ตัดต่อไม่ทัน — ครูพี่คิมมีตัวช่วยให้เป้าหมายคุณเป็นจริงค่ะ 🩵</b><br><br>🎓 อยากตัดต่อเองให้คล่อง เก่งขึ้นทุกคลิป:<br>${btn(LINE_ACADEMY_URL, "เรียนตัดต่อกับครูพี่คิม")}<br><br>🎬 ไม่มีเวลาทำเอง อยากให้มืออาชีพทำให้:<br>${btnG(LINE_WORK_URL, "ให้ทีม Babe House ทำให้")}`,
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
          `เห็นว่าคุณเริ่มกรอกข้อมูลช่องไว้แล้ว แต่ยังไม่ได้เปิดดูแผนเต็มๆ เลยค่ะ<br><br>ครูพี่คิมวิเคราะห์ช่องของคุณและเตรียม <b>แผนคอนเทนต์ 30 วัน + สคริปต์พร้อมใช้</b> ไว้ให้แล้ว — กดปุ่มด้านล่างเพื่อดูสรุปและปลดล็อกได้เลยค่ะ<br><br>${btn(url, "ดูแผนของฉัน · ปลดล็อก 490฿")}<br><br><span style="color:#888;font-size:14px">โปรเปิดตัว 490฿ (จากเต็ม 1,590฿) มีจำนวนจำกัดนะคะ</span>`,
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
      ORDER BY b.created_at ASC LIMIT 100`, [process.env.ADMIN_ALERT_EMAIL || "babehouse555@gmail.com"]);
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
app.post("/api/admin/run-reminders", async (req, res) => { if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" }); const sent = await runMonthlyReminders(true); const homework = await runHomeworkReminders(); const abandoned = await runAbandonedFollowups(); const activation = await runActivationReminders(); res.json({ ok: true, sent, homework, abandoned, activation, cycle: currentBillingCycle() }); });
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
// Watchdog: เจอเล่มพัง → เมลแจ้งแอดมินทันที (ไม่ต้องรอลูกค้าบอก)
const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL || "babehouse555@gmail.com";
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
initDb().then(async () => {
  await seedWorkshops();     // ใส่รายละเอียด workshop + รีวิวให้พร้อม (ครั้งเดียว ไม่ทับของที่คิมแก้เอง)
  await seedAssignments();   // ร่างการบ้านให้ทุกคอร์ส แบบ "ไม่บังคับ" ไว้ก่อน — คิมแก้แล้วค่อยเปิดบังคับ
  // โหลดเทรนด์ curated ล่าสุด "ของแต่ละกลุ่มอาชีพ" เข้าหน่วยความจำ AI
  try {
    const rows = await q(`SELECT DISTINCT ON (COALESCE(category,'general')) COALESCE(category,'general') AS category, content, created_at FROM trend_digest ORDER BY COALESCE(category,'general'), created_at DESC`);
    for (const r of rows) setCuratedTrends(r.category, r.content, new Date(r.created_at).getTime());
  } catch (e) { console.warn("load trends", e.message); }
  app.listen(PORT, () => console.log(`Babe House v2 running on :${PORT} | ai=${aiModelName()} | pay=${PROVIDER}`));
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
  setTimeout(emailWeeklyBackupIfDue, 90000); // เช็กหลังสตาร์ท (ส่งถ้าครบ 7 วัน)
  setInterval(emailWeeklyBackupIfDue, 12 * 3600 * 1000); // เช็กทุก 12 ชม. → ส่ง backup เข้าเมลแอดมินสัปดาห์ละครั้ง
}).catch(e => { console.error("DB init failed:", e.message); process.exit(1); });
