import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { pool, q, one, run, initDb } from "./db.js";
import { generateBlueprint, generateGrowthAnalysis, generateAdminInsight, classifyIndustries, classifyKeyword, INDUSTRIES, aiModelName, aiCostTHB } from "./ai.js";

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
// กันซ้ำ: 1 อีเมล = 1 เล่ม/รอบเดือน — คืนเล่มที่มีอยู่แล้ว (ถ้ามี) จะได้ไม่เจนซ้ำ/ไม่กินโค้ดซ้ำ
async function existingBlueprintForEmail(email, cycle) {
  const e = normEmail(email); if (!e || !cycle) return null;
  return one(`SELECT order_id, user_id, billing_cycle, blueprint_id FROM blueprint_orders WHERE email=$1 AND billing_cycle=$2 AND blueprint_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`, [e, cycle]);
}
const dashUrlOf = (o) => `/dashboard?user_id=${encodeURIComponent(o.user_id)}&billing_cycle=${encodeURIComponent(o.billing_cycle)}&blueprint_id=${encodeURIComponent(o.blueprint_id)}`;

// ---------- email (Resend) ----------
async function sendEmail(to, subject, html) {
  if (!EMAIL_ENABLED) { console.log(`[DEV EMAIL] -> ${to} | ${subject}`); return false; }
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.APP_FROM_EMAIL || "Babe House <onboarding@resend.dev>", to: [to], subject, html }) });
  return r.ok;
}
const wrap = (body) => `<div style="font-family:sans-serif;font-size:16px;line-height:1.8">${body}</div>`;
const btn = (href, label) => `<a href="${href}" style="display:inline-block;background:#2E86DE;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${label}</a>`;

// ---------- payment / referral ----------
async function markOrderPaid(orderId, provider = "mock", sid = "") {
  // live_mode = จ่ายด้วย Stripe จริง (คีย์ sk_live_) เท่านั้น = เงินเข้าจริง; mock/code/test = false
  const liveMode = provider === "stripe" && String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_");
  await run(`UPDATE blueprint_orders SET payment_status='paid', provider=$1, provider_session_id=COALESCE($2,provider_session_id), live_mode=$3, paid_at=now() WHERE order_id=$4`, [provider, sid || null, liveMode, orderId]);
  processReferralReward(orderId).catch(e => console.error("referral", e.message));
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
    form_responses: z.object({ business_type: z.string().min(1), gender: z.string().optional().default(""), age_range: z.string().optional().default(""), work_style: z.string().optional().default(""), audience: z.string().optional().default(""), experience: z.string().optional().default(""), goal_primary: z.string().optional().default(""), starting_point: z.string().optional().default(""), monthly_goal: z.string().min(1), competitor_1: z.string().optional().default(""), competitor_2: z.string().optional().default(""), display_name: z.string().optional().default("") }),
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
    // กันซ้ำ: ถ้าอีเมลนี้มีเล่มของรอบเดือนนี้แล้ว → เด้งไปเล่มเดิม ไม่สร้าง order/เจนใหม่
    const dup = await existingBlueprintForEmail(payload.email, payload.meta_purchase.billing_cycle);
    if (dup) return res.json({ ok: true, existing: true, order_id: dup.order_id, checkout_url: dashUrlOf(dup), redirect_url: dashUrlOf(dup), message: "อีเมลนี้มีเล่มของเดือนนี้แล้วค่ะ" });
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
  const dupCode = await existingBlueprintForEmail(o.email, o.billing_cycle);
  if (dupCode) return res.json({ ok: true, existing: true, free: true, redirect_url: dashUrlOf(dupCode), message: "อีเมลนี้มีเล่มของเดือนนี้แล้ว ใช้โค้ดซ้ำไม่ได้ค่ะ" });
  const row = await one(`SELECT * FROM promo_codes WHERE code=$1`, [code]);
  if (!row || !row.active) return res.status(400).json({ ok: false, error: "INVALID_CODE", message: "โค้ดไม่ถูกต้องหรือถูกปิด" });
  const upd = await run(`UPDATE promo_codes SET used_count=used_count+1 WHERE code=$1 AND active=1 AND (max_uses IS NULL OR used_count<max_uses)`, [code]);
  if (upd.rowCount !== 1) return res.status(400).json({ ok: false, error: "CODE_USED_UP", message: "โค้ดถูกใช้ครบแล้ว" });
  const percent = row.discount_percent == null ? 100 : Math.max(1, Math.min(100, row.discount_percent));
  const finalAmount = Math.round(PRICE_SATANG * (100 - percent) / 100);
  await run(`UPDATE blueprint_orders SET discount_code=$1, discount_percent=$2, final_amount_satang=$3 WHERE order_id=$4`, [code, percent, finalAmount, orderId]);
  if (percent >= 100 || finalAmount <= 0) { await markOrderPaid(orderId, "code", code); return res.json({ ok: true, free: true, percent, redirect_url: `/processing?order_id=${encodeURIComponent(orderId)}` }); }
  res.json({ ok: true, free: false, percent, original_satang: PRICE_SATANG, final_satang: finalAmount });
}
app.post("/api/apply-code", applyCode);
app.post("/api/redeem-code", applyCode);

async function createStripeCheckout({ orderId, payload, origin, amountSatang }) {
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const s = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: (process.env.STRIPE_PAYMENT_METHODS || "card,promptpay").split(",").map(x => x.trim()).filter(Boolean),
    line_items: [{ price_data: { currency: "thb", product_data: { name: "Babe House AI Creator Blueprint Premium" }, unit_amount: amountSatang || PRICE_SATANG }, quantity: 1 }],
    success_url: `${origin}/processing?order_id=${encodeURIComponent(orderId)}`,
    cancel_url: `${origin}/checkout?order_id=${encodeURIComponent(orderId)}&payment=cancelled`,
    metadata: { order_id: orderId, user_id: payload.user_id, billing_cycle: payload.meta_purchase.billing_cycle }
  });
  return { checkout_url: s.url, provider_session_id: s.id };
}
app.post("/api/create-payment-session", async (req, res) => {
  try {
    const o = await getOrder(String(req.body?.order_id || "")); if (!o) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
    if (["paid", "mock_paid"].includes(o.payment_status)) return res.json({ ok: true, redirect_url: `/processing?order_id=${encodeURIComponent(o.order_id)}` });
    const dupPay = await existingBlueprintForEmail(o.email, o.billing_cycle);
    if (dupPay) return res.json({ ok: true, existing: true, redirect_url: dashUrlOf(dupPay), message: "อีเมลนี้มีเล่มของเดือนนี้แล้วค่ะ" });
    const amount = o.final_amount_satang || PRICE_SATANG;
    if (o.provider === "stripe") {
      // ความปลอดภัย: ถ้าตั้ง stripe แต่ไม่มีคีย์ → ห้ามแจกฟรีเงียบๆ
      if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ ok: false, error: "PAYMENT_UNAVAILABLE", message: "ระบบชำระเงินยังไม่พร้อม กรุณาติดต่อทีมงานค่ะ" });
      const origin = req.headers.origin || `${req.protocol}://${req.get("host")}`;
      const s = await createStripeCheckout({ orderId: o.order_id, payload: safeJson(o.order_payload_json), origin, amountSatang: amount });
      await run(`UPDATE blueprint_orders SET provider_session_id=$1 WHERE order_id=$2`, [s.provider_session_id, o.order_id]);
      return res.json({ ok: true, redirect_url: s.checkout_url, external: true });
    }
    // โหมด mock เท่านั้นที่ mark paid โดยไม่ตัดเงิน
    await markOrderPaid(o.order_id, "mock", "mock_paid");
    res.json({ ok: true, redirect_url: `/processing?order_id=${encodeURIComponent(o.order_id)}` });
  } catch (err) { console.error(err); res.status(500).json({ ok: false, error: "PAYMENT_SESSION_FAILED", message: err.message }); }
});

// ---------- blueprint generation ----------
async function generateBlueprintForPayload(payload) {
  const parsed = GenSchema.parse(normalizePayload(payload));
  const firstImg = parsed.insight_screenshot_base64 || (Array.isArray(parsed.insight_images) ? parsed.insight_images[0] : "") || "";
  const requestId = uid("req"), blueprintId = uid("bp");
  await upsertUser({ user_id: parsed.user_id, instagram_account: parsed.instagram_account, business_type: parsed.form_responses.business_type });
  await upsertCustomer(parsed.email, parsed.instagram_account);
  const industry = classifyKeyword(`${parsed.form_responses.business_type} ${parsed.form_responses.monthly_goal}`);
  await run(`INSERT INTO blueprint_requests (request_id,user_id,instagram_account,email,billing_cycle,business_type,starting_point,monthly_goal,competitor_1,competitor_2,insight_screenshot_base64,insight_images_json,raw_payload_json,industry) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [requestId, parsed.user_id, parsed.instagram_account, parsed.email || null, parsed.meta_purchase.billing_cycle, parsed.form_responses.business_type, parsed.form_responses.starting_point, parsed.form_responses.monthly_goal, parsed.form_responses.competitor_1, parsed.form_responses.competitor_2, firstImg, JSON.stringify(parsed.insight_images || (firstImg ? [firstImg] : [])), JSON.stringify(parsed), industry]);
  const { blueprint, model, usage } = await generateBlueprint(parsed);
  await run(`INSERT INTO blueprints (blueprint_id,request_id,user_id,billing_cycle,blueprint_json,model) VALUES ($1,$2,$3,$4,$5,$6)`, [blueprintId, requestId, parsed.user_id, parsed.meta_purchase.billing_cycle, JSON.stringify(blueprint), model]);
  if (usage) await run(`INSERT INTO ai_usage (id,kind,model,input_tokens,output_tokens,total_tokens) VALUES ($1,'blueprint',$2,$3,$4,$5)`, [uid("use"), model, usage.input || 0, usage.output || 0, usage.total || 0]).catch(() => {});
  await run(`INSERT INTO marathon_progress (progress_id,user_id,instagram_account,billing_cycle) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,billing_cycle) DO NOTHING`, [uid("marathon"), parsed.user_id, parsed.instagram_account, parsed.meta_purchase.billing_cycle]);
  return { blueprintId, requestId, parsed, blueprint };
}

app.post("/api/start-generation", async (req, res) => {
  try {
    const o = await getOrder(String(req.body?.order_id || "")); if (!o) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
    if (!["paid", "mock_paid"].includes(o.payment_status)) return res.status(402).json({ ok: false, error: "PAYMENT_REQUIRED", message: "ต้องชำระเงินก่อน" });
    if (o.blueprint_id) return res.json({ ok: true, status: "ready", order_id: o.order_id, blueprint_id: o.blueprint_id, user_id: o.user_id, billing_cycle: o.billing_cycle });
    const claim = await run(`UPDATE blueprint_orders SET generation_status='generating', generation_error=NULL WHERE order_id=$1 AND blueprint_id IS NULL AND (generation_status IS NULL OR generation_status IN ('pending','error'))`, [o.order_id]);
    if (claim.rowCount !== 1) return res.json({ ok: true, status: o.generation_status || "generating", order_id: o.order_id });
    res.json({ ok: true, status: "generating", order_id: o.order_id });
    (async () => {
      try {
        const result = await generateBlueprintForPayload(safeJson(o.order_payload_json));
        await run(`UPDATE blueprint_orders SET blueprint_id=$1, generation_status='ready', generation_error=NULL WHERE order_id=$2`, [result.blueprintId, o.order_id]);
        const url = `${appBaseUrl()}/dashboard?user_id=${encodeURIComponent(result.parsed.user_id)}&billing_cycle=${encodeURIComponent(result.parsed.meta_purchase.billing_cycle)}&blueprint_id=${encodeURIComponent(result.blueprintId)}`;
        if (o.email) await sendEmail(o.email, `เล่ม Blueprint เดือน ${o.billing_cycle} พร้อมแล้ว 🩵`, wrap(`ครูพี่คิมวิเคราะห์เสร็จแล้ว เล่มแผน 30 วันพร้อมเปิดดูค่ะ<br><br>${btn(url, "เปิด Dashboard ของฉัน")}`)).catch(() => {});
      } catch (e) { console.error("bg gen", e.message); await run(`UPDATE blueprint_orders SET generation_status='error', generation_error=$1 WHERE order_id=$2`, [String(e.message).slice(0, 300), o.order_id]); }
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
    const userId = String(req.body?.user_id || ""), cycle = String(req.body?.billing_cycle || ""), extra = req.body?.extra || {};
    if (!userId || !cycle) return res.status(400).json({ ok: false, error: "MISSING_QUERY" });
    const bp = await one(`SELECT * FROM blueprints WHERE user_id=$1 AND billing_cycle=$2 ORDER BY created_at DESC LIMIT 1`, [userId, cycle]);
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
    const { blueprint, model, usage } = await generateBlueprint(parsed);
    await run(`UPDATE blueprints SET blueprint_json=$1, model=$2, improve_count=COALESCE(improve_count,0)+1 WHERE blueprint_id=$3`, [JSON.stringify(blueprint), model, bp.blueprint_id]);
    await run(`UPDATE blueprint_requests SET raw_payload_json=$1, starting_point=$2 WHERE request_id=$3`, [JSON.stringify(parsed), fr.starting_point, bp.request_id]).catch(() => {});
    if (usage) await run(`INSERT INTO ai_usage (id,kind,model,input_tokens,output_tokens,total_tokens) VALUES ($1,'improve',$2,$3,$4,$5)`, [uid("use"), model, usage.input || 0, usage.output || 0, usage.total || 0]).catch(() => {});
    res.json({ ok: true, blueprint, improve_count: (bp.improve_count || 0) + 1 });
  } catch (err) { console.error("improve", err); res.status(500).json({ ok: false, error: "IMPROVE_FAILED", message: err.message }); }
});

app.post("/api/generate-blueprint", async (req, res) => {
  try { const r = await generateBlueprintForPayload(req.body); res.json({ ok: true, blueprint_id: r.blueprintId, user_id: r.parsed.user_id, billing_cycle: r.parsed.meta_purchase.billing_cycle, blueprint: r.blueprint }); }
  catch (err) { console.error(err); res.status(500).json({ ok: false, error: "GENERATE_FAILED", message: err.message }); }
});

app.get("/api/blueprints/latest", async (req, res) => {
  const userId = String(req.query.user_id || ""), cycle = String(req.query.billing_cycle || "");
  if (!userId || !cycle) return res.status(400).json({ ok: false, error: "MISSING_QUERY" });
  const row = await one(`SELECT * FROM blueprints WHERE user_id=$1 AND billing_cycle=$2 ORDER BY created_at DESC LIMIT 1`, [userId, cycle]);
  if (!row) return res.status(404).json({ ok: false, error: "BLUEPRINT_NOT_FOUND" });
  const mp = await one(`SELECT uploaded_days_json FROM marathon_progress WHERE user_id=$1 AND billing_cycle=$2`, [userId, cycle]);
  res.json({ ok: true, blueprint_id: row.blueprint_id, user_id: row.user_id, billing_cycle: row.billing_cycle, model: row.model, started_at: row.created_at, improve_count: row.improve_count || 0, blueprint: safeJson(row.blueprint_json), marathon: mp ? safeJson(mp.uploaded_days_json) : [] });
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
async function authEmail(req) {
  const a = String(req.headers.authorization || ""); const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return null;
  const row = await one(`SELECT email, expires_at FROM auth_sessions WHERE token=$1`, [token]);
  if (!row || Number(row.expires_at) < Date.now()) return null;
  return row.email;
}
async function getCustomerMonths(email) {
  const rows = await q(`SELECT b.blueprint_id,b.billing_cycle,b.created_at,b.user_id,b.blueprint_json,r.instagram_account,r.business_type,r.monthly_goal FROM blueprints b JOIN blueprint_requests r ON b.request_id=r.request_id WHERE r.email=$1 ORDER BY b.created_at ASC`, [email]);
  const seen = new Set(), out = [];
  for (const r of rows) { if (seen.has(r.billing_cycle)) continue; seen.add(r.billing_cycle); let metrics = null; try { metrics = (safeJson(r.blueprint_json) || {}).metrics || null; } catch {} out.push({ blueprint_id: r.blueprint_id, billing_cycle: r.billing_cycle, created_at: r.created_at, user_id: r.user_id, instagram_account: r.instagram_account, business_type: r.business_type, monthly_goal: r.monthly_goal, metrics }); }
  return out;
}
app.get("/api/me/blueprints", async (req, res) => {
  const email = await authEmail(req); if (!email) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const months = await getCustomerMonths(email);
  res.json({ ok: true, email, count: months.length, months });
});
app.get("/api/me/referral", async (req, res) => {
  const email = await authEmail(req); if (!email) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  await upsertCustomer(email, "");
  const code = await getOrCreateReferralCode(email);
  const c = await one(`SELECT referral_count FROM customers WHERE email=$1`, [email]);
  res.json({ ok: true, code, count: (c && c.referral_count) || 0, percent: REFERRAL_PERCENT, link: `${appBaseUrl()}/?ref=${encodeURIComponent(code)}` });
});
app.get("/api/me/growth-analysis", async (req, res) => {
  const email = await authEmail(req); if (!email) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  try {
    const months = await getCustomerMonths(email);
    if (months.length < 1) return res.json({ ok: true, analysis: null, count: 0 });
    const signature = `${months.length}:${months[months.length - 1].blueprint_id}`;
    const cached = await one(`SELECT signature, analysis_json, model FROM growth_analyses WHERE email=$1`, [email]);
    if (cached && cached.signature === signature) return res.json({ ok: true, analysis: safeJson(cached.analysis_json), model: cached.model, count: months.length, cached: true });
    const { analysis, model } = await generateGrowthAnalysis(months);
    await run(`INSERT INTO growth_analyses (email,signature,analysis_json,model,created_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (email) DO UPDATE SET signature=EXCLUDED.signature,analysis_json=EXCLUDED.analysis_json,model=EXCLUDED.model,created_at=now()`, [email, signature, JSON.stringify(analysis), model]);
    res.json({ ok: true, analysis, model, count: months.length });
  } catch (err) { console.error(err); res.status(500).json({ ok: false, error: "GROWTH_FAILED", message: err.message }); }
});

// ---------- admin ----------
const isAdmin = (req) => !!process.env.ADMIN_KEY && (req.headers["x-admin-key"] || req.query.admin_key) === process.env.ADMIN_KEY;
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
  let cost = 0, inp = 0, outp = 0, n = 0;
  const byModel = rows.map(r => {
    const ri = Number(r.inp), ro = Number(r.outp), rn = Number(r.n), c = aiCostTHB(r.model, ri, ro);
    cost += c; inp += ri; outp += ro; n += rn;
    return { model: r.model, count: rn, input: ri, output: ro, cost_thb: Math.round(c * 100) / 100 };
  });
  res.json({
    ok: true,
    month: { count: n, input: inp, output: outp, total: inp + outp, cost_thb: Math.round(cost * 100) / 100, avg_thb: n ? Math.round((cost / n) * 100) / 100 : 0, by_model: byModel },
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
  (async () => {
    try {
      const result = await generateBlueprintForPayload(safeJson(o.order_payload_json));
      await run(`UPDATE blueprint_orders SET blueprint_id=$1, generation_status='ready', generation_error=NULL WHERE order_id=$2`, [result.blueprintId, orderId]);
      console.log(`[regenerate] order ${orderId} → ${result.blueprintId}`);
    } catch (e) { console.error("regenerate", e.message); await run(`UPDATE blueprint_orders SET generation_status='error', generation_error=$1 WHERE order_id=$2`, [String(e.message).slice(0, 300), orderId]); }
  })();
});
async function getStudents(industry) {
  // 1 อีเมล/รอบเดือน = 1 แถว (เอาออเดอร์ที่จ่ายแล้วล่าสุด) + สถานะการสร้างเล่ม + ข้อมูลฟอร์มจาก request ล่าสุด
  const rows = await q(`
    SELECT DISTINCT ON (o.email, o.billing_cycle)
      o.created_at, o.email, o.user_id, o.billing_cycle, o.instagram_account, o.blueprint_id, o.generation_status, o.order_payload_json,
      r.industry, r.business_type, r.starting_point, r.monthly_goal, r.competitor_1, r.competitor_2
    FROM blueprint_orders o
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
  const rows = await q(`SELECT DISTINCT ON (email) email, raw_payload_json, industry FROM blueprint_requests WHERE email IS NOT NULL ORDER BY email, created_at DESC`);
  const t = {};
  const add = (k, v) => { v = String(v || "").trim(); if (!v) return; (t[k] ||= {}); t[k][v] = (t[k][v] || 0) + 1; };
  for (const r of rows) {
    const fr = (safeJson(r.raw_payload_json) || {}).form_responses || {};
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

app.get("/api/admin/revenue", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  // เงินเข้าจริง = จ่ายด้วย Stripe (บัตร/PromptPay) สำเร็จ + จำนวนเงิน > 0 (ไม่นับ mock/โค้ดฟรี/ส่วนลด 100%)
  const realWhere = `payment_status='paid' AND live_mode = true AND COALESCE(provider,'') NOT IN ('mock','code') AND COALESCE(final_amount_satang,$1) > 0`;
  const real = await one(`SELECT COALESCE(SUM(COALESCE(final_amount_satang,$1)),0) s, COUNT(*) c FROM blueprint_orders WHERE ${realWhere}`, [PRICE_SATANG]);
  const free = await one(`SELECT COUNT(*) c FROM blueprint_orders WHERE payment_status IN ('paid','mock_paid') AND (COALESCE(provider,'')='code' OR COALESCE(final_amount_satang,$1)=0)`, [PRICE_SATANG]);
  const test = await one(`SELECT COUNT(*) c FROM blueprint_orders WHERE payment_status='mock_paid' OR COALESCE(provider,'')='mock' OR (payment_status='paid' AND COALESCE(provider,'')='stripe' AND COALESCE(live_mode,false)=false)`);
  const byMonth = await q(`SELECT billing_cycle, COALESCE(SUM(COALESCE(final_amount_satang,$1)),0) revenue, COUNT(*) c FROM blueprint_orders WHERE ${realWhere} GROUP BY billing_cycle ORDER BY MIN(created_at)`, [PRICE_SATANG]);
  const byProvider = await q(`SELECT provider, COUNT(*) c, COALESCE(SUM(COALESCE(final_amount_satang,$1)),0) revenue FROM blueprint_orders WHERE ${realWhere} GROUP BY provider`, [PRICE_SATANG]);
  res.json({ ok: true, total_satang: Number(real.s), paid_count: Number(real.c), free_count: Number(free.c), test_count: Number(test.c), by_month: byMonth.map(m => ({ ...m, revenue: Number(m.revenue), c: Number(m.c) })), by_provider: byProvider.map(p => ({ ...p, revenue: Number(p.revenue), c: Number(p.c) })) });
});
app.get("/api/admin/codes", async (req, res) => { if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" }); res.json({ ok: true, codes: await q(`SELECT * FROM promo_codes ORDER BY created_at DESC`) }); });
app.post("/api/admin/codes", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  let code = String(req.body?.code || "").trim().toUpperCase() || "BABE" + Math.random().toString(36).slice(2, 7).toUpperCase();
  const note = String(req.body?.note || "").slice(0, 200);
  const maxUses = req.body?.max_uses == null || req.body?.max_uses === "" ? null : Math.max(1, parseInt(req.body.max_uses, 10) || 1);
  let percent = req.body?.discount_percent == null || req.body?.discount_percent === "" ? 100 : parseInt(req.body.discount_percent, 10);
  percent = Math.max(1, Math.min(100, isNaN(percent) ? 100 : percent));
  try { await run(`INSERT INTO promo_codes (code,note,max_uses,discount_percent) VALUES ($1,$2,$3,$4)`, [code, note, maxUses, percent]); }
  catch { return res.status(400).json({ ok: false, error: "CODE_EXISTS", message: "โค้ดนี้มีอยู่แล้ว" }); }
  res.json({ ok: true, code: await one(`SELECT * FROM promo_codes WHERE code=$1`, [code]) });
});
app.post("/api/admin/codes/toggle", async (req, res) => { if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" }); const code = String(req.body?.code || "").trim().toUpperCase(); await run(`UPDATE promo_codes SET active=1-active WHERE code=$1`, [code]); res.json({ ok: true, code: await one(`SELECT * FROM promo_codes WHERE code=$1`, [code]) }); });
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
async function runMonthlyReminders() {
  try {
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
    for (const r of rows) { try { await sendEmail(r.email, "อย่าลืมทำคอนเทนต์ตามแผนนะคะ 🩵", wrap(`เดือนนี้ทำไปแล้ว ${r.uploaded} วัน สู้ๆ นะคะ! ความสม่ำเสมอคือกุญแจ<br><br>${btn(`${appBaseUrl()}/account`, "เปิดแผนของฉัน")}`)); } catch { continue; } await run(`INSERT INTO homework_reminders (email,cycle) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [r.email, cycle]); sent++; }
    if (sent) console.log(`[homework] ${cycle}: ${sent}`); return sent;
  } catch (e) { console.error("homework", e.message); return 0; }
}
app.post("/api/admin/run-reminders", async (req, res) => { if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" }); const sent = await runMonthlyReminders(); const homework = await runHomeworkReminders(); res.json({ ok: true, sent, homework, cycle: currentBillingCycle() }); });

app.get("/api/health", (req, res) => res.json({ ok: true, service: "babe-house-v2", ai: aiModelName(), payment_provider: PROVIDER, email: EMAIL_ENABLED ? "resend" : "dev", time: new Date().toISOString() }));

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
    // กู้ทั้ง: (ก) error  (ข) ค้าง 'generating' นานเกิน 8 นาที (เช่น โดน deploy/รีสตาร์ทตัดกลางคัน)
    const rows = await q(`SELECT order_id, email, billing_cycle, order_payload_json FROM blueprint_orders WHERE payment_status IN ('paid','mock_paid') AND blueprint_id IS NULL AND (generation_status='error' OR (generation_status='generating' AND paid_at < now() - interval '8 minutes')) AND paid_at > now() - interval '24 hours' LIMIT 5`);
    for (const o of rows) {
      const claim = await run(`UPDATE blueprint_orders SET generation_status='generating', generation_error=NULL WHERE order_id=$1 AND blueprint_id IS NULL AND generation_status IN ('error','generating')`, [o.order_id]);
      if (claim.rowCount !== 1) continue;
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
      }
    }
  } catch (e) { console.error("retryStuckGenerations", e.message); }
}

const PORT = Number(process.env.PORT || 3000);
initDb().then(() => {
  app.listen(PORT, () => console.log(`Babe House v2 running on :${PORT} | ai=${aiModelName()} | pay=${PROVIDER}`));
  setTimeout(() => { runMonthlyReminders(); runHomeworkReminders(); }, 30000);
  setTimeout(retryStuckGenerations, 45000); // กู้เล่มที่ค้างหลังสตาร์ท/deploy (เช่น generation โดนตัดกลางคัน)
  setInterval(() => { runMonthlyReminders(); runHomeworkReminders(); }, 12 * 3600 * 1000);
  setInterval(retryStuckGenerations, 3 * 60 * 1000); // ทุก 3 นาที กู้เล่มที่ค้าง error/generating
}).catch(e => { console.error("DB init failed:", e.message); process.exit(1); });
