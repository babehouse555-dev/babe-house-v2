// ═══════ 🧾 ใบกำกับภาษี — ออกอัตโนมัติทุกการจ่ายเงิน (คิมสั่ง 3 ส.ค. 2569) ═══════
// "ทุกการจ่ายเงินน่ะเราต้องออกใบกำกับภาษีอยู่แล้ว เอาไปส่งบัญชีรายเดือน"
// ลูกค้าทั่วไป → ออกด้วยชื่อที่มีอยู่ ไม่ต้องกรอกอะไรเพิ่ม
// ลูกค้าบริษัท → ติ๊กที่หน้าจ่ายเงินแล้วกรอกชื่อบริษัท/ที่อยู่/เลขผู้เสียภาษี
//
// ⚠️ ระบบนี้ "บันทึกใบไว้ในระบบเราเสมอ" ก่อน แล้วค่อยพยายามส่งเข้า FlowAccount
//    ถ้ายังไม่ได้ตั้งรหัส FlowAccount หรือ API ล่ม → ใบยังอยู่ครบ ส่งออกให้นักบัญชีได้
//    เงินของลูกค้าต้องไม่มีทางค้างเพราะระบบบัญชีมีปัญหา
import { q, one, run } from "./db.js";

// 🌐 ที่อยู่ API — ของจริงกับ sandbox คนละที่
//    ของจริง : https://openapi.flowaccount.com/v1
//    sandbox : https://openapi.flowaccount.com/test   (FlowAccount ส่งมาให้ 8 ส.ค.)
const BASE = process.env.FLOWACCOUNT_API_BASE || "https://openapi.flowaccount.com/v1";
// ⚠️ scope ที่ถูกคือ "flowaccount-api" — เดิมเราเขียน "openapi" ไว้ ขอโทเคนไม่ผ่านแน่นอน
//    (เทียบกับเมลที่ FlowAccount ส่งมา 8 ส.ค.) เผื่อเขาเปลี่ยนทีหลังเลยทำให้แก้ผ่าน env ได้
const SCOPE = process.env.FLOWACCOUNT_SCOPE || "flowaccount-api";
const CLIENT_ID = process.env.FLOWACCOUNT_CLIENT_ID || "";
const CLIENT_SECRET = process.env.FLOWACCOUNT_CLIENT_SECRET || "";
export const flowAccountReady = () => !!(CLIENT_ID && CLIENT_SECRET);

const VAT_RATE = 0.07;
// ราคาที่ขายผ่านเว็บ "รวม VAT แล้ว" → ถอดออกมาแสดงแยกบรรทัดในใบกำกับ
export function splitVat(totalSatang) {
  const total = Math.round(Number(totalSatang) || 0);
  const net = Math.round(total / (1 + VAT_RATE));
  return { total, net, vat: total - net };
}

// ── โทเคน FlowAccount (client credentials) เก็บไว้ใช้ซ้ำจนกว่าจะหมดอายุ ──
let cachedToken = null, tokenExpiresAt = 0;
async function getToken() {
  if (!flowAccountReady()) throw new Error("ยังไม่ได้ตั้งรหัส FlowAccount");
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;
  const body = new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE,
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
  const r = await fetch(`${BASE}/token`, { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error(`ขอโทเคนไม่สำเร็จ (${r.status}) ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  cachedToken = j.access_token || j.accessToken;
  tokenExpiresAt = Date.now() + (Number(j.expires_in || 3600) * 1000);
  if (!cachedToken) throw new Error("ไม่พบ access_token ในคำตอบ");
  return cachedToken;
}

// ── รูปเอกสารที่ส่งให้ FlowAccount ──
// ⚠️ อ้างอิงจากใบจริงที่คิมส่งมา: ราคาต่อหน่วยเป็น "ก่อน VAT" แล้วบวก VAT 7% ท้ายใบ
//    เราขายรวม VAT → ต้องถอดออกก่อนส่ง ไม่งั้นยอดรวมจะเกินไป 7%
function buildDocument(inv) {
  const netBaht = inv.net_satang / 100;
  // ⚠️ ใช้ "วันที่รับเงินจริง" เสมอ — ใบย้อนหลังต้องลงวันที่เดิม ไม่ใช่วันที่กดปุ่ม
  const docDate = inv.doc_date ? new Date(inv.doc_date) : new Date(inv.created_at || Date.now());
  return {
    publishedOn: docDate.toISOString().slice(0, 10),   // ✅ ชื่อฟิลด์ตามเอกสารจริง (เดิมเขียนผิดเป็น documentDate)
    isVat: true,                                       // ✅ เปิดคิด VAT ให้เอกสารนี้
    contactName: inv.customer_name,
    contactTaxId: inv.tax_id || undefined,
    contactBranch: inv.branch || (inv.is_company ? "สำนักงานใหญ่" : undefined),
    contactAddress: inv.address || undefined,
    contactEmail: inv.email || undefined,
    isVatInclusive: false,          // เราถอด VAT ออกมาแล้ว ส่งเป็นราคาก่อน VAT
    vatType: 7,
    items: [{ name: inv.description || "AI Creator Blueprint", quantity: 1,
              pricePerUnit: netBaht, total: netBaht, vatRate: 7 }],
    grandTotal: inv.amount_satang / 100,
    reference: inv.order_id,
  };
}

// ยิงเอกสารขึ้น FlowAccount — ⚠️ ยังไม่เคยทดสอบกับ API จริง (รอรหัส sandbox ~7 ส.ค. 69)
//
// เทียบกับเอกสารจริง developers.flowaccount.com แล้ว (4 ส.ค. 69)
// ตรงแน่นอน: contactName · contactTaxId · contactBranch · contactAddress
//            items[].name/quantity/pricePerUnit · isVatInclusive
// แก้แล้ว:   documentDate → publishedOn · เพิ่ม isVat
//
// ⛔ 3 จุดนี้ยังยืนยันไม่ได้ ต้องลองกับ sandbox ก่อนเปิดใช้จริง:
//   1. เส้นทาง /tax-invoices — เอกสารเขียนว่า /:document และ /:document/inline ยังไม่รู้ชื่อจริง
//   2. vatType: 7 — ไม่เจอฟิลด์นี้ในเอกสาร อาจต้องใช้ vatRate ในแต่ละรายการแทน
//   3. reference — เอกสารบอกว่าคือ "เลขที่เอกสาร" แต่เราใส่ order_id ไว้
//      ถ้าอยากให้ FlowAccount ออกเลขเองตามวันที่ อาจต้องไม่ส่งฟิลด์นี้เลย
async function pushToFlowAccount(inv) {
  const token = await getToken();
  const r = await fetch(`${BASE}/tax-invoices`, { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(buildDocument(inv)) });
  const text = await r.text();
  if (!r.ok) throw new Error(`สร้างเอกสารไม่สำเร็จ (${r.status}) ${text.slice(0, 300)}`);
  let j = {}; try { j = JSON.parse(text); } catch {}
  const d = j.data || j;
  return { doc_id: String(d.id || d.documentId || ""), doc_number: String(d.documentNumber || d.documentSerial || "") };
}

// ── ออกใบกำกับสำหรับออเดอร์หนึ่ง (เรียกตอนจ่ายเงินสำเร็จ) ──
// idempotent: ออเดอร์เดียวออกได้ใบเดียว (unique index กัน webhook ยิงซ้ำ)
export async function issueTaxInvoice({ orderId, kind, email, amountSatang, description, tax, docDate }) {
  const amount = Math.round(Number(amountSatang) || 0);
  if (!orderId || amount <= 0) return null;                 // ของฟรี/โค้ด 100% ไม่ต้องออกใบ
  const exists = await one(`SELECT invoice_id, status FROM tax_invoices WHERE order_id=$1`, [orderId]);
  if (exists) return exists;

  const t = tax || {};
  const isCompany = !!t.is_company;
  // ลูกค้าทั่วไปไม่ได้กรอกอะไร → ใช้ชื่อที่มีอยู่ ถ้าไม่มีจริงๆ ใช้ส่วนหน้าของอีเมล
  const name = String(t.name || "").trim() || String(t.fallback_name || "").trim()
    || String(email || "").split("@")[0] || "ลูกค้าทั่วไป";
  const { net, vat } = splitVat(amount);
  const id = `inv_${orderId.slice(-12)}_${Date.now().toString(36)}`;

  try {
    await run(`INSERT INTO tax_invoices (invoice_id,order_id,order_kind,email,customer_name,is_company,tax_id,branch,address,description,amount_satang,net_satang,vat_satang,status,doc_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending',$14)`,
      [id, orderId, kind || null, email || null, name.slice(0, 200), isCompany,
       String(t.tax_id || "").replace(/\D/g, "").slice(0, 13) || null,
       String(t.branch || "").slice(0, 100) || null, String(t.address || "").slice(0, 500) || null,
       String(description || "").slice(0, 300) || null, amount, net, vat,
       docDate ? new Date(docDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)]);
  } catch (e) {
    if (/unique/i.test(e.message)) return await one(`SELECT invoice_id, status FROM tax_invoices WHERE order_id=$1`, [orderId]);
    throw e;
  }

  // ยังไม่ได้ตั้งรหัส FlowAccount → ใบยังอยู่ในระบบ รอส่งทีหลัง/ส่งออกให้นักบัญชีได้เลย
  if (!flowAccountReady()) {
    await run(`UPDATE tax_invoices SET status='manual', provider='manual' WHERE invoice_id=$1`, [id]);
    return { invoice_id: id, status: "manual" };
  }
  const inv = await one(`SELECT * FROM tax_invoices WHERE invoice_id=$1`, [id]);
  try {
    const r = await pushToFlowAccount(inv);
    await run(`UPDATE tax_invoices SET status='issued', provider='flowaccount', provider_doc_id=$2, doc_number=$3, issued_at=now(), error=NULL WHERE invoice_id=$1`,
      [id, r.doc_id || null, r.doc_number || null]);
    return { invoice_id: id, status: "issued", doc_number: r.doc_number };
  } catch (e) {
    // ⛔ ออกใบไม่ได้ ห้ามทำให้การจ่ายเงินพัง — เก็บไว้ให้ลองใหม่ได้
    console.error("[tax] ออกใบไม่สำเร็จ", orderId, e.message);
    await run(`UPDATE tax_invoices SET status='failed', error=$2 WHERE invoice_id=$1`, [id, String(e.message).slice(0, 500)]);
    return { invoice_id: id, status: "failed", error: e.message };
  }
}

// ลองออกใบที่ค้างอยู่ใหม่ (แอดมินกดเอง หรือหลังตั้งรหัส FlowAccount เสร็จ)
// ⛔ ข้ามใบที่ทำมือไว้แล้วเสมอ — ออกซ้ำ = เลขที่เอกสารซ้ำ = ยื่นภาษีผิด
export async function retryPendingInvoices(limit = 50, onlyId = null) {
  if (!flowAccountReady()) return { ok: false, reason: "ยังไม่ได้ตั้งรหัส FlowAccount" };
  // onlyId = ทดลองทีละใบก่อนส่งทั้งหมด (ปลอดภัยกว่ายิงรวดเดียวแล้วฟอร์แมตผิดทั้งชุด)
  const rows = onlyId
    ? await q(`SELECT * FROM tax_invoices WHERE invoice_id=$1 AND issued_manually=false`, [onlyId])
    : await q(`SELECT * FROM tax_invoices WHERE status IN ('failed','manual','pending')
        AND issued_manually = false ORDER BY created_at LIMIT $1`, [limit]);
  let done = 0, failed = 0;
  for (const inv of rows) {
    try {
      const r = await pushToFlowAccount(inv);
      await run(`UPDATE tax_invoices SET status='issued', provider='flowaccount', provider_doc_id=$2, doc_number=$3, issued_at=now(), error=NULL WHERE invoice_id=$1`,
        [inv.invoice_id, r.doc_id || null, r.doc_number || null]);
      done++;
    } catch (e) {
      await run(`UPDATE tax_invoices SET status='failed', error=$2 WHERE invoice_id=$1`, [inv.invoice_id, String(e.message).slice(0, 500)]);
      failed++;
    }
  }
  return { ok: true, done, failed, total: rows.length };
}

// ── ส่งออกให้นักบัญชีรายเดือน (CSV) ──
// นักบัญชีขอ "1 ชุดต่อ 1 ยอดโอน" — ไฟล์นี้คือรายการขายทั้งเดือนพร้อมยอดแยก VAT
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export async function invoicesCsv(month) {
  // จัดกลุ่มตามวันที่บนใบ (= วันรับเงินจริง) ไม่ใช่วันที่กดออกใบ — นักบัญชียื่นภาษีตามวันนี้
  const rows = await q(`SELECT * FROM tax_invoices
    WHERE to_char(COALESCE(doc_date, created_at::date), 'YYYY-MM') = $1
    ORDER BY COALESCE(doc_date, created_at::date), created_at`, [month]);
  const head = ["วันที่", "เลขที่เอกสาร", "ชื่อลูกค้า", "นิติบุคคล", "เลขผู้เสียภาษี", "สาขา", "ที่อยู่",
                "รายการ", "ก่อน VAT", "VAT 7%", "รวมทั้งสิ้น", "สถานะ", "อีเมล", "เลขที่ออเดอร์"];
  const lines = [head.join(",")];
  let net = 0, vat = 0, total = 0;
  for (const r of rows) {
    net += Number(r.net_satang); vat += Number(r.vat_satang); total += Number(r.amount_satang);
    lines.push([
      new Date(r.doc_date || r.created_at).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" }),
      r.doc_number || "(ยังไม่ออก)", r.customer_name, r.is_company ? "ใช่" : "ไม่ใช่",
      r.tax_id || "", r.branch || "", r.address || "", r.description || "",
      (r.net_satang / 100).toFixed(2), (r.vat_satang / 100).toFixed(2), (r.amount_satang / 100).toFixed(2),
      r.status, r.email || "", r.order_id,
    ].map(csvCell).join(","));
  }
  lines.push(["", "", "รวมทั้งเดือน", "", "", "", "", "",
    (net / 100).toFixed(2), (vat / 100).toFixed(2), (total / 100).toFixed(2), "", "", ""].map(csvCell).join(","));
  return { csv: "﻿" + lines.join("\n"), count: rows.length, net, vat, total };
}

// 🔌 ทดสอบการเชื่อมต่อ — ขอโทเคนอย่างเดียว ไม่สร้างเอกสารอะไรทั้งนั้น
// ใช้เช็คว่ารหัส/scope/ที่อยู่ API ถูกต้องก่อน ค่อยลองออกใบจริง
export async function flowAccountPing() {
  if (!flowAccountReady()) return { ok: false, reason: "ยังไม่ได้ใส่ FLOWACCOUNT_CLIENT_ID / CLIENT_SECRET ใน Railway" };
  try {
    cachedToken = null;                     // บังคับขอใหม่ จะได้รู้ว่ารหัสใช้ได้จริง
    const t = await getToken();
    return { ok: true, base: BASE, scope: SCOPE, token_len: String(t).length,
             mode: /\/test\b/.test(BASE) ? "sandbox (ของทดสอบ)" : "production (ของจริง)" };
  } catch (e) { return { ok: false, base: BASE, scope: SCOPE, error: String(e.message).slice(0, 300) }; }
}
