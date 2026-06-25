import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { pool, q, one, run, initDb } from "./db.js";
import { generateBlueprint, generateAnalysis, generateContent, generateSingleScript, generateGrowthAnalysis, generateAdminInsight, classifyIndustries, classifyKeyword, INDUSTRIES, aiModelName, aiCostTHB, analyzeVideo, checkBlueprintQuality } from "./ai.js";

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
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        if (orderId) await markOrderPaid(orderId, "stripe", session.id); break;
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
function normalizePayload(p) {
  return { ...p, email: normEmail(p.email) || undefined, meta_purchase: { tier: "Premium_490", billing_cycle: p.meta_purchase?.billing_cycle || currentBillingCycle() }, form_responses: cleanCompetitors(p.form_responses || {}) };
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
async function sendEmail(to, subject, html) {
  if (!EMAIL_ENABLED) { console.log(`[DEV EMAIL] -> ${to} | ${subject}`); return false; }
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.APP_FROM_EMAIL || "Babe House <onboarding@resend.dev>", to: [to], subject, html }) });
  return r.ok;
}
const wrap = (body) => `<div style="font-family:sans-serif;font-size:16px;line-height:1.8">${body}</div>`;
const btn = (href, label) => `<a href="${href}" style="display:inline-block;background:#2E86DE;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${label}</a>`;
const btnG = (href, label) => `<a href="${href}" style="display:inline-block;background:#06C755;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${label}</a>`;
const LINE_ACADEMY_URL = process.env.LINE_ACADEMY_URL || "https://line.me/R/ti/p/%40babehouse_academy";
const LINE_WORK_URL = process.env.LINE_WORK_URL || "https://line.me/ti/p/0yBlh9zXFl";

// ---------- payment / referral ----------
async function markOrderPaid(orderId, provider = "mock", sid = "") {
  // live_mode = จ่ายด้วย Stripe จริง (คีย์ sk_live_) เท่านั้น = เงินเข้าจริง; mock/code/test = false
  const liveMode = provider === "stripe" && String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_");
  await run(`UPDATE blueprint_orders SET payment_status='paid', provider=$1, provider_session_id=COALESCE($2,provider_session_id), live_mode=$3, paid_at=now() WHERE order_id=$4`, [provider, sid || null, liveMode, orderId]);
  grantCreditsIfCreditOrder(orderId).catch(e => console.error("grant-credits", e.message));
  processReferralReward(orderId).catch(e => console.error("referral", e.message));
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
  await sendEmail(ref.email, `เพื่อนของคุณสมัครแล้ว! รับโค้ดลด ${REFERRAL_PERCENT}% 🎁`, wrap(`ขอบคุณที่แนะนำ Babe House ค่ะ 🩵<br><br>โค้ดลด <b>${REFERRAL_PERCENT}%</b> สำหรับเดือนถัดไป:<br><div style="font-size:26px;font-weight:800;letter-spacing:3px;margin:14px 0;color:#2E86DE">${code}</div>ใช้ได้ 1 ครั้ง<br><br>${btn(appBaseUrl() + "/account", "ไปที่บัญชีของฉัน")}`)).catch(() => {});
}

// ---------- schemas ----------
const CheckoutSchema = z.object({
  tier: z.literal("Premium_490"),
  payload: z.object({
    user_id: z.string().min(1), instagram_account: z.string().min(1), email: z.string().email().optional(), referred_by: z.string().optional(),
    meta_purchase: z.object({ tier: z.literal("Premium_490"), billing_cycle: z.string().min(1) }),
    form_responses: z.object({ self_term: z.string().optional().default(""), audience_term: z.string().optional().default(""), catchphrases: z.string().optional().default(""), tone: z.string().optional().default(""), business_type: z.string().optional().default(""), gender: z.string().optional().default(""), age_range: z.string().optional().default(""), work_style: z.string().optional().default(""), audience: z.string().optional().default(""), experience: z.string().optional().default(""), goal_primary: z.string().optional().default(""), starting_point: z.string().optional().default(""), monthly_goal: z.string().min(1), competitor_1: z.string().optional().default(""), competitor_2: z.string().optional().default(""), display_name: z.string().optional().default("") }),
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
    await run(`INSERT INTO blueprint_orders (order_id,user_id,instagram_account,email,tier,billing_cycle,payment_status,order_payload_json,provider,final_amount_satang,referred_by,discount_percent,checkout_url) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10,$11,$12)`,
      [orderId, payload.user_id, payload.instagram_account, payload.email || null, parsed.tier, payload.meta_purchase.billing_cycle, JSON.stringify(payload), PROVIDER, finalAmount, refValid, discountPct, checkoutUrl]);
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
    if (!video) return res.status(400).json({ ok: false, error: "NO_VIDEO", message: "ยังไม่ได้แนบวิดีโอค่ะ" });
    // มีแถว uploaded อยู่แล้ว → อัปเป็น analyzing (ไม่สร้างแถวใหม่) · ไม่งั้น insert ใหม่
    const auditId = existing && existing.status === "uploaded" ? existing.audit_id : uid("va");
    if (existing && existing.status === "uploaded") await run(`UPDATE video_audits SET status='analyzing', error=NULL WHERE audit_id=$1`, [auditId]);
    else await run(`INSERT INTO video_audits (audit_id,order_id,email,status) VALUES ($1,$2,$3,'analyzing')`, [auditId, o.order_id, o.email || null]);
    res.json({ ok: true, status: "analyzing" });
    const ctx = `บริบทจากเจ้าของคลิป (ถ้ามี): ${(contextRaw || "(ไม่ระบุ)").slice(0, 800)}\nช่วยตรวจคลิปนี้ละเอียดตามสเปก JSON`;
    (async () => {
      try {
        const { audit, model, usage } = await analyzeVideo({ dataUrl: video, mimeType: mime, contextText: ctx });
        await run(`UPDATE video_audits SET status='ready', result_json=$1, video_data=NULL WHERE audit_id=$2`, [JSON.stringify(audit), auditId]); // เคลียร์คลิปทิ้ง วิเคราะห์เสร็จแล้ว
        if (usage) await run(`INSERT INTO ai_usage (id,kind,model,input_tokens,output_tokens,total_tokens) VALUES ($1,'video_audit',$2,$3,$4,$5)`, [uid("use"), model, usage.input || 0, usage.output || 0, usage.total || 0]).catch(() => {});
      } catch (e) { console.error("video analyze bg", e.message); await run(`UPDATE video_audits SET status='uploaded', error=$1 WHERE audit_id=$2`, [String(e.message).slice(0, 300), auditId]); } // คงคลิปไว้ให้ retry ได้
    })();
  } catch (err) { console.error("video analyze", err); res.status(500).json({ ok: false, error: "VIDEO_ANALYZE_FAILED", message: err.message }); }
});

// ---------- blueprint generation ----------
// จำกัดจำนวนเจนเล่มพร้อมกัน — กันคนจ่ายพร้อมกันเยอะแล้ว Gemini โดน rate-limit / RAM พุ่งจนล่ม
// ที่เหลือเข้าคิวรอ (หน้า Processing ของลูกค้า poll อยู่แล้ว + retryStuckGenerations เป็นตาข่ายกันพลาด)
const MAX_CONCURRENT_GENS = Number(process.env.MAX_CONCURRENT_GENS) || 6;
let activeGens = 0; const genQueue = [];
// order_id ที่กำลังเจน/เข้าคิวอยู่ใน process นี้ — ให้ retryStuckGenerations ข้าม กันเจนซ้ำตอนคิวยาวเกิน 8 นาที
const inFlightOrders = new Set();
// blueprint_id ที่กำลังเจนคอนเทนต์/รีไฟน์บทวิเคราะห์อยู่ใน process นี้ (กันยิงซ้ำ)
const inFlightBp = new Set();
function acquireGen() { return new Promise(res => { if (activeGens < MAX_CONCURRENT_GENS) { activeGens++; res(); } else genQueue.push(res); }); }
function releaseGen() { activeGens = Math.max(0, activeGens - 1); const next = genQueue.shift(); if (next) { activeGens++; next(); } }

// ดึงบริบทเดือนก่อนของลูกค้าคนเดิม (จับคู่ด้วยอีเมล, คนละ billing_cycle) → ใช้เจนเดือน 2+ ให้ต่อยอด ไม่ซ้ำ
async function getPrevContext(email, cycle, channel) {
  if (!email) return null;
  try {
    const params = [email, cycle]; let chFilter = "";
    if (channel) { params.push(channel); chFilter = ` AND regexp_replace(lower(r.instagram_account),'[@\\s._-]','','g')=regexp_replace(lower($3),'[@\\s._-]','','g')`; } // เทียบเฉพาะช่องเดียวกัน (normalize @/เว้นวรรค)
    const r = await one(`SELECT b.blueprint_json FROM blueprints b JOIN blueprint_requests r ON b.request_id=r.request_id WHERE lower(r.email)=lower($1) AND b.billing_cycle<>$2${chFilter} AND b.blueprint_json IS NOT NULL ORDER BY b.created_at DESC LIMIT 1`, params);
    if (!r) return null;
    const a = safeJson(r.blueprint_json) || {};
    const topics = Array.isArray(a.calendar) ? a.calendar.map(c => c && c.t).filter(Boolean).slice(0, 30) : [];
    if (!a.positioning && !a.theme && !topics.length) return null;
    return { theme: a.theme, positioning: a.positioning, prev_topics: topics };
  } catch (e) { console.warn("getPrevContext", e.message); return null; }
}

async function generateBlueprintForPayload(payload) {
  await acquireGen();
  try {
  const parsed = GenSchema.parse(normalizePayload(payload));
  const firstImg = parsed.insight_screenshot_base64 || (Array.isArray(parsed.insight_images) ? parsed.insight_images[0] : "") || "";
  const requestId = uid("req"), blueprintId = uid("bp");
  await upsertUser({ user_id: parsed.user_id, instagram_account: parsed.instagram_account, business_type: parsed.form_responses.business_type });
  await upsertCustomer(parsed.email, parsed.instagram_account);
  const industry = classifyKeyword(`${parsed.form_responses.business_type} ${parsed.form_responses.monthly_goal}`);
  await run(`INSERT INTO blueprint_requests (request_id,user_id,instagram_account,email,billing_cycle,business_type,starting_point,monthly_goal,competitor_1,competitor_2,insight_screenshot_base64,insight_images_json,raw_payload_json,industry) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [requestId, parsed.user_id, parsed.instagram_account, parsed.email || null, parsed.meta_purchase.billing_cycle, parsed.form_responses.business_type, parsed.form_responses.starting_point, parsed.form_responses.monthly_goal, parsed.form_responses.competitor_1, parsed.form_responses.competitor_2, firstImg, JSON.stringify(parsed.insight_images || (firstImg ? [firstImg] : [])), JSON.stringify(parsed), industry]);
  // สเต็ป 1: เจน "บทวิเคราะห์" ก่อน (เร็ว) — ยังไม่เจน 30 สคริปต์ จนกว่าลูกค้าจะยืนยันว่าแม่น
  parsed.prev_context = await getPrevContext(parsed.email, parsed.meta_purchase.billing_cycle, parsed.instagram_account); // เดือน 2+ ต่อยอด แยกตามช่อง
  const { analysis, model, usage } = await generateAnalysis(parsed);
  await run(`INSERT INTO blueprints (blueprint_id,request_id,user_id,billing_cycle,blueprint_json,model,quality_flags_json,content_status,analysis_status) VALUES ($1,$2,$3,$4,$5,$6,'[]','pending','ready')`, [blueprintId, requestId, parsed.user_id, parsed.meta_purchase.billing_cycle, JSON.stringify(analysis), model]);
  // ประหยัดดิสก์: รูป base64 ใช้แค่ตอนเจน — ลบทิ้งหลังเจนสำเร็จ (กัน DB เต็มเหมือนที่เคยล่ม) คงไว้แค่ form_responses
  try { const lean = { ...parsed, insight_images: [], insight_screenshot_base64: null }; await run(`UPDATE blueprint_requests SET insight_screenshot_base64=NULL, insight_images_json='[]', raw_payload_json=$1 WHERE request_id=$2`, [JSON.stringify(lean), requestId]); } catch (e) { console.warn("strip imgs", e.message); }
  if (usage) await run(`INSERT INTO ai_usage (id,kind,model,input_tokens,output_tokens,total_tokens) VALUES ($1,'analysis',$2,$3,$4,$5)`, [uid("use"), model, usage.input || 0, usage.output || 0, usage.total || 0]).catch(() => {});
  await run(`INSERT INTO marathon_progress (progress_id,user_id,instagram_account,billing_cycle) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,billing_cycle) DO NOTHING`, [uid("marathon"), parsed.user_id, parsed.instagram_account, parsed.meta_purchase.billing_cycle]);
  return { blueprintId, requestId, parsed, blueprint: analysis };
  } finally { releaseGen(); }
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
        if (o.email) await sendEmail(o.email, `บทวิเคราะห์ช่องของคุณพร้อมแล้ว 🩵`, wrap(`ครูพี่คิมอ่านช่องของคุณเสร็จแล้วค่ะ!<br><br>กดเปิดดู <b>บทวิเคราะห์ช่อง</b> (จุดแข็ง–จุดอ่อน · กลุ่มเป้าหมาย · โอกาสโต) — ถ้าตรงแล้ว กดปุ่ม <b>"สร้างแผน 30 วัน"</b> ในเล่ม ครูพี่คิมจะเขียนสคริปต์พร้อมอัดให้ครบทั้งเดือนเลยค่ะ<br><br>${btn(url, "เปิดดูบทวิเคราะห์ของฉัน")}`)).catch(() => {});
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
    const parsed = GenSchema.parse(normalizePayload(safeJson(reqRow?.raw_payload_json) || {}));
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
          const { analysis, model, usage } = await generateAnalysis(parsed);
          await run(`UPDATE blueprints SET blueprint_json=$1, model=$2, improve_count=COALESCE(improve_count,0)+1, analysis_status='ready' WHERE blueprint_id=$3`, [JSON.stringify(analysis), model, bpId]);
          const lean = { ...parsed, insight_images: [], insight_screenshot_base64: null }; // ลบ base64 ออกก่อนเก็บ (กัน DB บวม)
          await run(`UPDATE blueprint_requests SET raw_payload_json=$1, starting_point=$2 WHERE request_id=$3`, [JSON.stringify(lean), fr.starting_point, bp.request_id]).catch(() => {});
          if (usage) await run(`INSERT INTO ai_usage (id,kind,model,input_tokens,output_tokens,total_tokens) VALUES ($1,'improve',$2,$3,$4,$5)`, [uid("use"), model, usage.input || 0, usage.output || 0, usage.total || 0]).catch(() => {});
          // ส่งเมลแจ้งเมื่อแก้บทวิเคราะห์เสร็จ — ลูกค้าจะปิดหน้าไปก็ได้ ไม่ต้องนั่งรอ
          if (parsed.email) { const url = `${appBaseUrl()}/dashboard?user_id=${encodeURIComponent(parsed.user_id)}&billing_cycle=${encodeURIComponent(parsed.meta_purchase.billing_cycle)}&blueprint_id=${encodeURIComponent(bpId)}`; await sendEmail(parsed.email, `บทวิเคราะห์ของคุณอัปเดตแล้ว 🩵`, wrap(`ครูพี่คิมอ่านข้อมูลใหม่ของคุณแล้ว ปรับบทวิเคราะห์ให้แม่นขึ้นเรียบร้อยค่ะ!<br><br>เปิดดูได้เลย ถ้าตรงใจแล้วกด <b>"สร้างแผน 30 วัน"</b> ในเล่มได้เลยนะคะ<br><br>${btn(url, "เปิดดูบทวิเคราะห์ที่อัปเดตแล้ว")}`)).catch(() => {}); }
        } finally { releaseGen(); }
      } catch (e) { console.error("improve bg", e.message); await run(`UPDATE blueprints SET analysis_status='error' WHERE blueprint_id=$1`, [bpId]).catch(() => {}); }
      finally { inFlightBp.delete(bpId); }
    })();
  } catch (err) { console.error("improve", err); res.status(500).json({ ok: false, error: "IMPROVE_FAILED", message: err.message }); }
});

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
          const parsed = GenSchema.parse(normalizePayload(safeJson(reqRow?.raw_payload_json) || {}));
          parsed.prev_context = await getPrevContext(parsed.email, cycle, parsed.instagram_account); // เดือน 2+ ห้ามซ้ำ แยกตามช่อง
          const { content, model, usage } = await generateContent(parsed, current);
          const merged = { ...current, calendar: content.calendar, scripts: content.scripts };
          const qualityFlags = checkBlueprintQuality(merged, true);
          if (qualityFlags.length) console.warn(`[quality] ${bpId}: ${qualityFlags.join(" · ")}`);
          await run(`UPDATE blueprints SET blueprint_json=$1, model=$2, content_status='ready', quality_flags_json=$3 WHERE blueprint_id=$4`, [JSON.stringify(merged), model, JSON.stringify(qualityFlags), bpId]);
          if (usage) await run(`INSERT INTO ai_usage (id,kind,model,input_tokens,output_tokens,total_tokens) VALUES ($1,'content',$2,$3,$4,$5)`, [uid("use"), model, usage.input || 0, usage.output || 0, usage.total || 0]).catch(() => {});
          // ส่งเมลแจ้งเมื่อแผน 30 วันเจนเสร็จ — ลูกค้าปิดหน้าไปก็ได้ ไม่ต้องนั่งรอ
          if (parsed.email) { const url = `${appBaseUrl()}/dashboard?user_id=${encodeURIComponent(parsed.user_id)}&billing_cycle=${encodeURIComponent(parsed.meta_purchase.billing_cycle)}&blueprint_id=${encodeURIComponent(bpId)}`; await sendEmail(parsed.email, `แผนคอนเทนต์ 30 วันของคุณพร้อมแล้ว 🎉`, wrap(`ครูพี่คิมเขียนสคริปต์พร้อมอัดให้ครบทั้ง 30 วันแล้วค่ะ! 🩵<br><br>เปิดดูปฏิทิน 30 วัน + สคริปต์ + แคปชันพร้อมโพสต์ได้เลย แล้วเริ่มลงมือทำคอนเทนต์กันค่ะ<br><br>${btn(url, "เปิดดูแผน 30 วันของฉัน")}`)).catch(() => {}); }
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
  const row = await one(`SELECT b.*, r.email AS owner_email FROM blueprints b LEFT JOIN blueprint_requests r ON b.request_id=r.request_id WHERE b.blueprint_id=$1 AND b.user_id=$2 AND b.billing_cycle=$3 AND b.deleted_at IS NULL`, [bpId, userId, cycle]);
  if (!row) return res.status(404).json({ ok: false, error: "BLUEPRINT_NOT_FOUND" });
  // เช็กเจ้าของ: ต้อง login เป็นอีเมลเจ้าของเล่มเท่านั้น (กันเปิดเล่มคนอื่นแม้มีลิงก์) — เล่มไม่มีอีเมล (เก่า) ปล่อยผ่านกันล็อกเอาต์
  const ownerEmail = row.owner_email ? normEmail(row.owner_email) : "";
  if (ownerEmail && !isAdmin(req)) { // แอดมินเปิดดูได้ทุกเล่ม (ไว้ซัพพอร์ตลูกค้า)
    const viewer = await authEmail(req);
    if (!viewer || normEmail(viewer) !== ownerEmail) return res.status(403).json({ ok: false, error: "NOT_OWNER", owner_hint: maskEmail(row.owner_email) });
  }
  const mp = await one(`SELECT uploaded_days_json FROM marathon_progress WHERE user_id=$1 AND billing_cycle=$2`, [userId, cycle]);
  const bpData = safeJson(row.blueprint_json);
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
async function sendOtp(email, code) { return sendEmail(email, `รหัสเข้าสู่ระบบ Babe House: ${code}`, wrap(`รหัสเข้าสู่ระบบของคุณคือ<br><div style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</div>ใช้ได้ภายใน 10 นาที`)); }
app.post("/api/auth/request-otp", async (req, res) => {
  try {
    const email = normEmail(req.body?.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: "INVALID_EMAIL", message: "อีเมลไม่ถูกต้อง" });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await run(`INSERT INTO auth_otps (email,code,expires_at,attempts) VALUES ($1,$2,$3,0) ON CONFLICT (email) DO UPDATE SET code=EXCLUDED.code,expires_at=EXCLUDED.expires_at,attempts=0`, [email, code, Date.now() + 600000]);
    let sent = false; try { sent = await sendOtp(email, code); } catch {}
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
  const pendRows = await q(`SELECT order_id, billing_cycle, created_at, COALESCE(generation_status,'pending') gs FROM blueprint_orders WHERE email=$1 AND payment_status IN ('paid','mock_paid') AND blueprint_id IS NULL AND COALESCE(tier,'') NOT LIKE 'Video%' ORDER BY created_at DESC`, [normEmail(email)]);
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
  res.json({ ok: true, credits: (c && c.credits) || 0, scripts: scripts.map(s => ({ id: s.id, channel: s.channel, sponsor: s.sponsor, brief: s.brief, script: safeJson(s.script_json), created_at: s.created_at })) });
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
    let result; try { result = await generateSingleScript(parsed, analysis, brief, { sponsor, files: briefFiles }); } finally { releaseGen(); }
    await run(`INSERT INTO credit_scripts (id,email,channel,sponsor,brief,script_json,cycle) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [uid("cs"), normEmail(email), channel || parsed.instagram_account || "", sponsor || null, brief, JSON.stringify(result.script), cycle || null]).catch(() => {});
    const bal = await one(`SELECT credits FROM customers WHERE lower(email)=lower($1)`, [email]);
    res.json({ ok: true, script: result.script, credits: (bal && bal.credits) || 0 });
  } catch (e) {
    await run(`UPDATE customers SET credits=credits+1 WHERE lower(email)=lower($1)`, [email]).catch(() => {}); // คืนเครดิตถ้าเจนพลาด
    console.error("gen-single", e.message);
    res.status(500).json({ ok: false, error: "GEN_FAILED", message: "สร้างไม่สำเร็จ คืนเครดิตให้แล้ว ลองใหม่นะคะ" });
  }
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
    const signature = `${channel}:${months.length}:${months[months.length - 1].blueprint_id}`;
    const cached = await one(`SELECT signature, analysis_json, model FROM growth_analyses WHERE email=$1`, [email]);
    if (cached && cached.signature === signature) return res.json({ ok: true, analysis: safeJson(cached.analysis_json), model: cached.model, count: months.length, sponsors, cached: true });
    const { analysis, model } = await generateGrowthAnalysis(months);
    await run(`INSERT INTO growth_analyses (email,signature,analysis_json,model,created_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (email) DO UPDATE SET signature=EXCLUDED.signature,analysis_json=EXCLUDED.analysis_json,model=EXCLUDED.model,created_at=now()`, [email, signature, JSON.stringify(analysis), model]);
    res.json({ ok: true, analysis, model, count: months.length, sponsors });
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
      await run(`INSERT INTO funnel_events (id,step,session_id,email) VALUES ($1,$2,$3,$4)`,
        [uid("ev"), step, String(req.body?.session_id || "").slice(0, 80), (String(req.body?.email || "").slice(0, 120)) || null]);
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
  const pendingGen = Number((await one(`SELECT COUNT(*) c FROM blueprint_orders WHERE payment_status IN ('paid','mock_paid') AND blueprint_id IS NULL AND COALESCE(generation_status,'pending') IN ('pending','generating')`)).c);
  const errorGen = Number((await one(`SELECT COUNT(*) c FROM blueprint_orders WHERE payment_status IN ('paid','mock_paid') AND blueprint_id IS NULL AND generation_status='error'`)).c);
  res.json({ ok: true, customers, blueprints, paid_orders: paid, pending_gen: pendingGen, error_gen: errorGen });
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
      if (o.email) { const url = `${appBaseUrl()}/dashboard?user_id=${encodeURIComponent(result.parsed.user_id)}&billing_cycle=${encodeURIComponent(result.parsed.meta_purchase.billing_cycle)}&blueprint_id=${encodeURIComponent(result.blueprintId)}`; await sendEmail(o.email, `บทวิเคราะห์ช่องของคุณพร้อมแล้ว 🩵`, wrap(`ครูพี่คิมอ่านช่องของคุณเสร็จแล้วค่ะ!<br><br>กดเปิดดู <b>บทวิเคราะห์ช่อง</b> — ถ้าตรงแล้ว กดปุ่ม <b>"สร้างแผน 30 วัน"</b> ในเล่ม ครูพี่คิมจะเขียนสคริปต์ให้ครบทั้งเดือนค่ะ<br><br>${btn(url, "เปิดดูบทวิเคราะห์ของฉัน")}`)).catch(() => {}); }
    } catch (e) { console.error("regenerate", e.message); await run(`UPDATE blueprint_orders SET generation_status='error', generation_error=$1 WHERE order_id=$2`, [String(e.message).slice(0, 300), orderId]); }
    finally { inFlightOrders.delete(orderId); }
  })();
});
async function getStudents(industry) {
  // 1 อีเมล/รอบเดือน = 1 แถว (เอาออเดอร์ที่จ่ายแล้วล่าสุด) + สถานะการสร้างเล่ม + ข้อมูลฟอร์มจาก request ล่าสุด
  const rows = await q(`
    SELECT DISTINCT ON (o.email, o.billing_cycle)
      o.created_at, o.email, o.user_id, o.billing_cycle, o.instagram_account, o.blueprint_id, o.generation_status, o.order_payload_json,
      b.content_status, b.analysis_status,
      r.industry, r.business_type, r.starting_point, r.monthly_goal, r.competitor_1, r.competitor_2
    FROM blueprint_orders o
    LEFT JOIN blueprints b ON b.blueprint_id = o.blueprint_id
    LEFT JOIN LATERAL (
      SELECT industry, business_type, starting_point, monthly_goal, competitor_1, competitor_2
      FROM blueprint_requests rr WHERE rr.user_id = o.user_id AND rr.billing_cycle = o.billing_cycle
      ORDER BY rr.created_at DESC LIMIT 1
    ) r ON true
    WHERE o.payment_status IN ('paid','mock_paid') AND o.email IS NOT NULL
    ORDER BY o.email, o.billing_cycle, o.created_at DESC
  `);
  let students = rows.map(o => {
    const p = safeJson(o.order_payload_json) || {}, fr = p.form_responses || {};
    return {
      created_at: o.created_at, email: o.email, user_id: o.user_id, billing_cycle: o.billing_cycle,
      instagram_account: o.instagram_account || p.instagram_account || "",
      business_type: o.business_type || fr.business_type || "",
      starting_point: o.starting_point || fr.starting_point || "",
      monthly_goal: o.monthly_goal || fr.monthly_goal || "",
      competitor_1: o.competitor_1 || fr.competitor_1 || "", competitor_2: o.competitor_2 || fr.competitor_2 || "",
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
app.post("/api/admin/codes", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  let code = String(req.body?.code || "").trim().toUpperCase() || "BABE" + Math.random().toString(36).slice(2, 7).toUpperCase();
  const note = String(req.body?.note || "").slice(0, 200);
  const maxUses = req.body?.max_uses == null || req.body?.max_uses === "" ? null : Math.max(1, parseInt(req.body.max_uses, 10) || 1);
  let percent = req.body?.discount_percent == null || req.body?.discount_percent === "" ? 100 : parseInt(req.body.discount_percent, 10);
  percent = Math.max(1, Math.min(100, isNaN(percent) ? 100 : percent));
  const lockedEmail = req.body?.locked_email ? normEmail(req.body.locked_email) : null; // โค้ดล็อกเฉพาะอีเมล (ใช้ซ้ำได้)
  try { await run(`INSERT INTO promo_codes (code,note,max_uses,discount_percent,locked_email) VALUES ($1,$2,$3,$4,$5)`, [code, note, maxUses, percent, lockedEmail]); }
  catch { return res.status(400).json({ ok: false, error: "CODE_EXISTS", message: "โค้ดนี้มีอยู่แล้ว" }); }
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
    for (const r of rows) { try { await sendEmail(r.email, "เดือนใหม่แล้ว มาต่อแผนคอนเทนต์กันค่ะ 🩵", wrap(`เข้าสู่เดือนใหม่แล้ว! มาต่อแผน 30 วันของเดือนนี้กันค่ะ<br><br>${btn(`${appBaseUrl()}/?renew=1&email=${encodeURIComponent(r.email)}`, "ปลดล็อกแผนเดือนใหม่ (490฿)")}`)); } catch { continue; } await run(`INSERT INTO month_reminders (email,cycle) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [r.email, cycle]); sent++; }
    if (sent) console.log(`[reminders] ${cycle}: ${sent}`); return sent;
  } catch (e) { console.error("monthly", e.message); return 0; }
}
async function runHomeworkReminders() {
  try {
    const day = new Date().getDate(); if (day < 8 || day > 25) return 0;
    const cycle = currentBillingCycle();
    const rows = await q(`SELECT DISTINCT r.email, COALESCE(mp.uploaded_count,0) uploaded FROM blueprint_requests r JOIN marathon_progress mp ON mp.user_id=r.user_id AND mp.billing_cycle=r.billing_cycle WHERE r.billing_cycle=$1 AND r.email IS NOT NULL AND COALESCE(mp.uploaded_count,0)<$2 AND r.email NOT IN (SELECT email FROM homework_reminders WHERE cycle=$1) LIMIT 200`, [cycle, HOMEWORK_MIN_UPLOADS]);
    let sent = 0;
    for (const r of rows) { try { await sendEmail(r.email, "อย่าลืมทำคอนเทนต์ตามแผนนะคะ 🩵", wrap(`เดือนนี้ทำไปแล้ว <b>${r.uploaded} วัน</b> สู้ๆ นะคะ! ความสม่ำเสมอคือกุญแจของการเติบโตค่ะ<br><br>${btn(`${appBaseUrl()}/account`, "เปิดแผนของฉัน ทำต่อ")}<br><br><b>ถ้าทำเองแล้วเริ่มเหนื่อย/ตัดต่อไม่ทัน — ครูพี่คิมมีตัวช่วยให้เป้าหมายคุณเป็นจริงค่ะ 🩵</b><br><br>🎓 อยากตัดต่อเองให้คล่อง เก่งขึ้นทุกคลิป:<br>${btn(LINE_ACADEMY_URL, "เรียนตัดต่อกับครูพี่คิม")}<br><br>🎬 ไม่มีเวลาทำเอง อยากให้มืออาชีพทำให้:<br>${btnG(LINE_WORK_URL, "ให้ทีม Babe House ทำให้")}`)); } catch { continue; } await run(`INSERT INTO homework_reminders (email,cycle) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [r.email, cycle]); sent++; }
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
      try { await sendEmail(r.email, "แผนคอนเทนต์ของคุณรอเปิดอยู่นะคะ 🩵", wrap(`เห็นว่าคุณเริ่มกรอกข้อมูลช่องไว้แล้ว แต่ยังไม่ได้เปิดดูแผนเต็มๆ เลยค่ะ<br><br>ครูพี่คิมวิเคราะห์ช่องของคุณและเตรียม <b>แผนคอนเทนต์ 30 วัน + สคริปต์พร้อมใช้</b> ไว้ให้แล้ว — กดปุ่มด้านล่างเพื่อดูสรุปและปลดล็อกได้เลยค่ะ<br><br>${btn(url, "ดูแผนของฉัน · ปลดล็อก 490฿")}<br><br><span style="color:#888;font-size:14px">โปรเปิดตัว 490฿ (จากเต็ม 1,590฿) มีจำนวนจำกัดนะคะ</span>`)); }
      catch { continue; }
      await run(`INSERT INTO abandoned_reminders (email,order_id) VALUES ($1,$2) ON CONFLICT (email) DO NOTHING`, [r.email, r.order_id]);
      sent++;
    }
    if (sent) console.log(`[abandoned] ${sent}`); return sent;
  } catch (e) { console.error("abandoned", e.message); return 0; }
}
app.post("/api/admin/run-reminders", async (req, res) => { if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" }); const sent = await runMonthlyReminders(true); const homework = await runHomeworkReminders(); const abandoned = await runAbandonedFollowups(); res.json({ ok: true, sent, homework, abandoned, cycle: currentBillingCycle() }); });
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
  res.sendFile(path.join(WEB_DIST, "index.html"));
});
app.use((err, req, res, next) => { console.error("Unhandled:", err?.message); if (res.headersSent) return next(err); res.status(500).json({ ok: false, error: "SERVER_ERROR", message: "ระบบขัดข้อง" }); });

// ตาข่ายกันพลาด: ลองสร้างเล่มซ้ำให้ order ที่จ่ายแล้วแต่ generation ค้าง error (เช่น Gemini 503 ชั่วคราว)
// ลูกค้าที่จ่ายเงินต้องได้เล่มเสมอ — จำกัดเฉพาะที่จ่ายภายใน 24 ชม. กันลูปไม่รู้จบ
async function retryStuckGenerations() {
  try {
    // กู้: (ก) error (ข) ค้าง 'generating' >8 นาที (โดน deploy ตัด) (ค) 'pending'/ยังไม่เริ่มเจน >2 นาที (จ่ายแล้วแต่ไม่ได้เข้าหน้า processing เช่นปิดแท็บ) — ยกเว้นออเดอร์ Video Audit
    const rows = await q(`SELECT order_id, email, billing_cycle, order_payload_json FROM blueprint_orders WHERE payment_status IN ('paid','mock_paid') AND blueprint_id IS NULL AND COALESCE(tier,'') NOT LIKE 'Video%' AND (generation_status='error' OR (generation_status='generating' AND paid_at < now() - interval '8 minutes') OR (COALESCE(generation_status,'pending')='pending' AND paid_at < now() - interval '2 minutes')) AND paid_at > now() - interval '24 hours' LIMIT 5`);
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
          await sendEmail(o.email, `เล่ม Blueprint เดือน ${o.billing_cycle} พร้อมแล้ว 🩵`, wrap(`ครูพี่คิมวิเคราะห์เสร็จแล้ว เล่มแผน 30 วันพร้อมเปิดดูค่ะ<br><br>${btn(url, "เปิด Dashboard ของฉัน")}`)).catch(() => {});
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
          const parsed = GenSchema.parse(normalizePayload(safeJson(reqRow?.raw_payload_json) || {}));
          const { content, model } = await generateContent(parsed, current);
          const merged = { ...current, calendar: content.calendar, scripts: content.scripts };
          await run(`UPDATE blueprints SET blueprint_json=$1, model=$2, content_status='ready' WHERE blueprint_id=$3`, [JSON.stringify(merged), model, b.blueprint_id]);
          console.log(`[retry-content] ${b.blueprint_id} สำเร็จ`);
          if (parsed.email) { const url = `${appBaseUrl()}/dashboard?user_id=${encodeURIComponent(parsed.user_id)}&billing_cycle=${encodeURIComponent(parsed.meta_purchase.billing_cycle)}&blueprint_id=${encodeURIComponent(b.blueprint_id)}`; await sendEmail(parsed.email, `แผนคอนเทนต์ 30 วันของคุณพร้อมแล้ว 🎉`, wrap(`ครูพี่คิมเขียนสคริปต์พร้อมอัดให้ครบทั้ง 30 วันแล้วค่ะ! 🩵<br><br>${btn(url, "เปิดดูแผน 30 วันของฉัน")}`)).catch(() => {}); }
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
      const parsed = GenSchema.parse(normalizePayload(safeJson(reqRow?.raw_payload_json) || {}));
      parsed.prev_context = await getPrevContext(parsed.email, b.billing_cycle, parsed.instagram_account);
      const { content, model } = await generateContent(parsed, current);
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
  const rows = await q(`SELECT b.blueprint_id, b.content_status, b.blueprint_json, r.email, r.instagram_account FROM blueprints b JOIN blueprint_requests r ON b.request_id=r.request_id WHERE b.created_at > now() - interval '${Number(days)} days' AND b.content_status IN ('ready','error')`);
  const broken = [];
  for (const r of rows) {
    let reason = "";
    if (r.content_status === "error") reason = "เจนคอนเทนต์ error";
    else {
      const bp = safeJson(r.blueprint_json) || {};
      const scr = Array.isArray(bp.scripts) ? bp.scripts : [];
      const empty = scr.filter(s => (s.beats || []).reduce((a, x) => a + String(x.say || "").length, 0) < 50).length;
      if (scr.length && scr.length < 30) reason = `สคริปต์ ${scr.length}/30`;
      else if (empty > 0) reason = `${empty} วันว่าง`;
    }
    if (reason) broken.push({ blueprint_id: r.blueprint_id, email: r.email, instagram_account: r.instagram_account, reason });
  }
  return broken;
}
// Watchdog: เจอเล่มพัง → เมลแจ้งแอดมินทันที (ไม่ต้องรอลูกค้าบอก)
const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL || "babehouse555@gmail.com";
const alertedBp = new Set();
async function runQualityWatch() {
  try {
    const broken = (await findBrokenBooks(2)).filter(b => !alertedBp.has(b.blueprint_id));
    if (!broken.length) return;
    for (const b of broken) alertedBp.add(b.blueprint_id);
    const list = broken.map(b => `• ${b.email || "?"} (${b.instagram_account || "?"}) — ${b.reason}`).join("<br>");
    await sendEmail(ADMIN_ALERT_EMAIL, `⚠️ Babe House: พบ ${broken.length} เล่มอาจมีปัญหา`, wrap(`ระบบตรวจพบเล่มที่อาจมีปัญหา (สคริปต์ไม่ครบ/error):<br><br>${list}<br><br>เข้าหลังบ้าน → "คุณภาพเล่ม" กดปุ่ม <b>ซ่อมเล่ม</b> ได้เลยค่ะ`)).catch(() => {});
    console.log(`[quality-watch] แจ้งเตือน ${broken.length} เล่ม`);
  } catch (e) { console.error("quality-watch", e.message); }
}

const PORT = Number(process.env.PORT || 3000);
initDb().then(() => {
  app.listen(PORT, () => console.log(`Babe House v2 running on :${PORT} | ai=${aiModelName()} | pay=${PROVIDER}`));
  setTimeout(() => { runMonthlyReminders(); runHomeworkReminders(); runAbandonedFollowups(); }, 30000);
  setTimeout(retryStuckGenerations, 45000); // กู้เล่มที่ค้างหลังสตาร์ท/deploy (เช่น generation โดนตัดกลางคัน)
  // ตอนสตาร์ท: คอนเทนต์/refine ที่ค้าง 'generating' = orphan จาก process เก่าแน่นอน → มาร์คให้ "เก่า" เพื่อให้ retryStuckContent กู้ทันที
  setTimeout(() => { run(`UPDATE blueprints SET content_started_at = now() - interval '10 minutes' WHERE (content_status='generating' OR analysis_status='generating') AND (content_started_at IS NULL OR content_started_at > now() - interval '8 minutes')`).then(() => retryStuckContent()).catch(() => {}); }, 50000);
  setInterval(() => { runMonthlyReminders(); runHomeworkReminders(); }, 24 * 3600 * 1000); // วันละครั้ง (เตือนต่อแผนจะส่งจริงเฉพาะปลายเดือน วันที่ >=25)
  setInterval(runAbandonedFollowups, 6 * 3600 * 1000); // ทุก 6 ชม. ตามคนกรอกฟอร์มแล้วไม่จ่าย
  setInterval(retryStuckGenerations, 3 * 60 * 1000); // ทุก 3 นาที กู้เล่มที่ค้าง error/generating
  setInterval(retryStuckContent, 3 * 60 * 1000); // ทุก 3 นาที กู้คอนเทนต์ 30 วันที่ค้าง + ปลดล็อก refine ที่ค้าง
  setInterval(() => run(`UPDATE video_audits SET video_data=NULL WHERE status='uploaded' AND video_data IS NOT NULL AND created_at < now() - interval '24 hours' AND order_id IN (SELECT order_id FROM blueprint_orders WHERE payment_status NOT IN ('paid','mock_paid'))`).catch(e => console.error("va cleanup", e.message)), 3600 * 1000); // ทุก 1 ชม. ลบคลิปที่อัปแต่ไม่จ่ายเกิน 24 ชม.
  setTimeout(runQualityWatch, 120000); // watchdog: ตรวจเล่มพัง → เมลแจ้งแอดมิน
  setInterval(runQualityWatch, 10 * 60 * 1000); // ทุก 10 นาที
}).catch(e => { console.error("DB init failed:", e.message); process.exit(1); });
