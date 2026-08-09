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
    // ⚠️ 4 ช่องนี้ FlowAccount บังคับ ถ้าไม่ส่งมันจะเดาเอง แล้วเอกสารออกมาเป็น "ราคารวมภาษี"
    //    ทั้งที่คิมตั้งค่าบัญชีไว้เป็น "ราคาไม่รวมภาษี" (คิมทัก 8 ส.ค.)
    //    ส่งครบเองจะได้ตรงกับที่ตั้งไว้ และไม่มีเศษทศนิยมเพี้ยน (เคยได้ 50.0011)
    dueDate: docDate.toISOString().slice(0, 10),   // จ่ายแล้ว = ครบกำหนดวันเดียวกับวันที่ออก
    subTotal: netBaht,
    totalAfterDiscount: netBaht,
    vatAmount: inv.vat_satang / 100,
    documentStructureType: "0",
    // 💸 หัก ณ ที่จ่าย — ตามใบจริงของคิม: โชว์เป็นบรรทัดแยกท้ายใบ แล้วยอดชำระลดลงเท่าที่หัก
    ...(Number(inv.wht_satang || 0) > 0 ? {
      documentShowWithholdingTax: true,
      documentWithholdingTaxPercentage: 3,
      documentWithholdingTaxAmount: Number(inv.wht_satang) / 100,
    } : {}),
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
// 📄 ประเภทเอกสารที่จะออก — คิมสั่ง 8 ส.ค. "ต้องออกสองใบ ใบเสร็จ กับ กำกับภาษี"
//    ขายเก็บเงินทันทีแบบเรา ปกติออก "ใบเสร็จรับเงิน/ใบกำกับภาษี" ใบเดียวจบ (= receipts)
//    ถ้าคิมอยากได้แยก 2 ใบจริงๆ ตั้ง FLOWACCOUNT_DOC_TYPES=tax-invoices,receipts
// นักบัญชีของคิมยืนยัน 8 ส.ค. ว่าต้องแยก 2 ใบ → ออกทั้งใบกำกับภาษีและใบเสร็จรับเงิน
const DOC_TYPES = String(process.env.FLOWACCOUNT_DOC_TYPES || "tax-invoices,receipts").split(",").map(x => x.trim()).filter(Boolean);
const DOC_TH = { "tax-invoices": "ใบกำกับภาษี", "receipts": "ใบเสร็จรับเงิน" };
async function pushOne(path, doc, token) {
  const body = doc;
  const r = await fetch(`${BASE}/${path}`, { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`สร้าง ${path} ไม่สำเร็จ (${r.status}) ${text.slice(0, 300)}`);
  let j = {}; try { j = JSON.parse(text); } catch {}
  const d = j.data || j;
  return { doc_id: String(d.id || d.documentId || ""),
           record_id: Number(d.recordId ?? d.id ?? d.documentId ?? 0) || 0,
           doc_number: String(d.documentSerial || d.documentNumber || "") };
}
// 🧾 ใบเสร็จต้อง "ต่อยอด" มาจากใบกำกับภาษี ไม่ใช่เอกสารลอยๆ
//    FlowAccount ตอบมา 8 ส.ค.: ใช้ POST /upgrade/receipts/with-payment · referenceDocumentType = 7 (Tax Invoices)
//    ✅ อ่านสเปกจริงจาก developers.flowaccount.com แล้ว 8 ส.ค. — เอกสารต้นทางส่งใน `documentReference` (อาร์เรย์)
//       ไม่ใช่ documentId/documentType/partialAmount ลอยๆ ข้างบน (ที่ลองรอบแรกแล้ว 400 เพราะไปเข้าโหมด batch)
//    ส่วนที่เหลือคือ "ฟิลด์รับชำระ": paymentDate · collected · withheld* · remainingCollected*
function buildReceiptFrom(inv, taxInvoice) {
  const doc = buildDocument(inv);
  const total = inv.amount_satang / 100;
  const wht = Number(inv.wht_satang || 0) / 100;
  return {
    ...doc,
    creditType: 3,          // 3 = เงินสด (จ่ายแล้ว)
    creditDays: 0,
    documentReference: [{
      recordId: Number(taxInvoice.record_id || taxInvoice.id) || 0,
      referenceDocumentSerial: String(taxInvoice.number || ""),
      referenceDocumentType: 7,        // 7 = ใบกำกับภาษี (FlowAccount ระบุมา)
    }],
    paymentMethod: 1,                  // 1 = เงินสด (ตัวเลือกเดียวที่ API นี้รับ)
    paymentDate: doc.publishedOn,
    collected: Math.round((total - wht) * 100) / 100,   // ยอดรับสุทธิ = ยอดรวม − หัก ณ ที่จ่าย
    paymentDeductionType: 0,
    paymentDeductionAmount: 0,
    withheldPercentage: wht > 0 ? 3 : 0,
    withheldAmount: wht,
    paymentRemarks: inv.order_id || "",
    remainingCollectedType: 0,
    remainingCollected: 0,
  };
}
// 🧪/🏢 เอกสารที่ออกใน sandbox ไม่ใช่เอกสารจริง — พอเปลี่ยนไปใช้รหัสของจริงต้องออกใหม่ทั้งหมด
//     ถ้าไม่แยกโหมด ตัวกันออกซ้ำจะเห็นว่า "ออกไปแล้ว" แล้วข้าม = ลูกค้าจริงไม่เคยได้ใบกำกับเลย
//     ใบเก่าที่ไม่มีป้ายโหมด = ออกตอนทดสอบทั้งหมด → ถือเป็น sandbox
const FA_MODE = () => (/\/test\b/.test(BASE) ? "sandbox" : "production");
const sameMode = (d) => !!d?.id && (d.mode || "sandbox") === FA_MODE();
async function pushToFlowAccount(inv) {
  const token = await getToken();
  const doc = buildDocument(inv);
  // ⚠️ ออกเฉพาะประเภทที่ "ยังไม่เคยสำเร็จ" — กันออกซ้ำตอนกดลองใหม่หลังใบใดใบหนึ่งพัง
  const all = (() => { try { return JSON.parse(inv.docs_json || "{}"); } catch { return {}; } })();
  // เก็บของโหมดเก่าไว้ดูย้อนหลังได้ แต่ไม่เอามานับว่า "ออกแล้ว"
  const done = Object.fromEntries(Object.entries(all).filter(([, v]) => sameMode(v)));
  if (all["tax-invoices"] && !done["tax-invoices"]) done._sandbox_เดิม = all["tax-invoices"];
  // ต้องออกใบกำกับก่อนเสมอ เพราะใบเสร็จต้องอ้างอิงเลขของใบกำกับ
  if (!done["tax-invoices"]?.id) {
    const r = await pushOne("tax-invoices", doc, token);
    done["tax-invoices"] = { id: r.doc_id, record_id: r.record_id, number: r.doc_number, mode: FA_MODE() };
    await run(`UPDATE tax_invoices SET docs_json=$1 WHERE invoice_id=$2`, [JSON.stringify(done), inv.invoice_id]);
  }
  if (DOC_TYPES.includes("receipts") && !done["receipts"]?.id) {
    const r = await pushOne("upgrade/receipts/with-payment", buildReceiptFrom(inv, done["tax-invoices"]), token);
    done["receipts"] = { id: r.doc_id, record_id: r.record_id, number: r.doc_number, mode: FA_MODE() };
    await run(`UPDATE tax_invoices SET docs_json=$1 WHERE invoice_id=$2`, [JSON.stringify(done), inv.invoice_id]);
  }
  const order = ["tax-invoices", "receipts"].filter(t => done[t]?.id);
  return { doc_id: order.map(t => done[t].id).join("|"),
           doc_number: order.map(t => `${DOC_TH[t] || t} ${done[t].number}`).join(" · "), docs: done };
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
  // 💸 หัก ณ ที่จ่าย 3% จากยอดก่อน VAT (นิติบุคคลเท่านั้น)
  const wht = (isCompany && t.wht) ? Math.round(net * 3 / 100) : 0;
  const id = `inv_${orderId.slice(-12)}_${Date.now().toString(36)}`;

  try {
    await run(`INSERT INTO tax_invoices (invoice_id,order_id,order_kind,email,customer_name,is_company,tax_id,branch,address,description,amount_satang,net_satang,vat_satang,status,doc_date,wht_satang)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending',$14,$15)`,
      [id, orderId, kind || null, email || null, name.slice(0, 200), isCompany,
       String(t.tax_id || "").replace(/\D/g, "").slice(0, 13) || null,
       String(t.branch || "").slice(0, 100) || null, String(t.address || "").slice(0, 500) || null,
       String(description || "").slice(0, 300) || null, amount, net, vat,
       docDate ? new Date(docDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10), wht]);
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
  // ✅ รวมใบที่ขึ้นว่า "ออกแล้ว" แต่ออกไว้คนละโหมดด้วย (ออกใน sandbox = ยังไม่มีใบจริง)
  //    กรองในโค้ดแทน SQL เพราะต้องเทียบป้ายโหมดในกล่อง docs_json ทีละใบ
  const needsWork = (inv) => {
    const d = (() => { try { return JSON.parse(inv.docs_json || "{}"); } catch { return {}; } })();
    if (!sameMode(d["tax-invoices"])) return true;
    return DOC_TYPES.includes("receipts") && !sameMode(d["receipts"]);
  };
  const rows = onlyId
    ? await q(`SELECT * FROM tax_invoices WHERE invoice_id=$1 AND issued_manually=false`, [onlyId])
    : (await q(`SELECT * FROM tax_invoices WHERE status IN ('failed','manual','pending','issued')
        AND issued_manually = false ORDER BY created_at`)).filter(needsWork).slice(0, limit);
  let done = 0, failed = 0, stopped = null;
  // ⏱️ FlowAccount จำกัด 100 ครั้ง/นาที (แจ้ง 8 ส.ค. 69) — ใบนึงยิง 2 ครั้ง (ใบกำกับ+ใบเสร็จ)
  //    เว้นจังหวะ 1.5 วิ/ใบ = ~40 ครั้ง/นาที เหลือที่ว่างให้ลูกค้าที่จ่ายเงินสดๆ ตอนนั้นด้วย
  const PACE_MS = Number(process.env.FLOWACCOUNT_PACE_MS || 1500);
  let first = true;
  for (const inv of rows) {
    if (!first) await new Promise(r => setTimeout(r, PACE_MS));
    first = false;
    try {
      const r = await pushToFlowAccount(inv);
      await run(`UPDATE tax_invoices SET status='issued', provider='flowaccount', provider_doc_id=$2, doc_number=$3, issued_at=now(), error=NULL WHERE invoice_id=$1`,
        [inv.invoice_id, r.doc_id || null, r.doc_number || null]);
      done++;
    } catch (e) {
      await run(`UPDATE tax_invoices SET status='failed', error=$2 WHERE invoice_id=$1`, [inv.invoice_id, String(e.message).slice(0, 500)]);
      failed++;
      // 🛑 ชนลิมิต/โควตาเดือน = หยุดทั้งชุดทันที ยิงต่อมีแต่พังเปล่าและใบจะขึ้นสถานะพลาดเป็นแถบ
      if (/\(429\)|rate limit|quota|เกินจำนวน/i.test(String(e.message))) {
        stopped = "ชนลิมิตของ FlowAccount — หยุดยิงที่เหลือไว้ก่อน (ใบที่ยังไม่ได้ยิงยังอยู่ครบ กดใหม่ทีหลังได้)";
        break;
      }
    }
  }
  return { ok: true, done, failed, total: rows.length, ...(stopped ? { stopped } : {}) };
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
                "รายการ", "ก่อน VAT", "VAT 7%", "รวมทั้งสิ้น", "หัก ณ ที่จ่าย 3%", "ยอดรับจริง", "สถานะ", "อีเมล", "เลขที่ออเดอร์"];
  const lines = [head.join(",")];
  let net = 0, vat = 0, total = 0, wht = 0;
  for (const r of rows) {
    net += Number(r.net_satang); vat += Number(r.vat_satang); total += Number(r.amount_satang); wht += Number(r.wht_satang || 0);
    lines.push([
      new Date(r.doc_date || r.created_at).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" }),
      r.doc_number || "(ยังไม่ออก)", r.customer_name, r.is_company ? "ใช่" : "ไม่ใช่",
      r.tax_id || "", r.branch || "", r.address || "", r.description || "",
      (r.net_satang / 100).toFixed(2), (r.vat_satang / 100).toFixed(2), (r.amount_satang / 100).toFixed(2),
      ((r.wht_satang || 0) / 100).toFixed(2), ((r.amount_satang - (r.wht_satang || 0)) / 100).toFixed(2),
      r.status, r.email || "", r.order_id,
    ].map(csvCell).join(","));
  }
  lines.push(["", "", "รวมทั้งเดือน", "", "", "", "", "",
    (net / 100).toFixed(2), (vat / 100).toFixed(2), (total / 100).toFixed(2),
    (wht / 100).toFixed(2), ((total - wht) / 100).toFixed(2), "", "", ""].map(csvCell).join(","));
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
             // 🔎 บอกด้วยว่าโค้ดรุ่นไหนกำลังรันอยู่ — กันทดสอบก่อน deploy เสร็จแล้วสรุปผิด
             //     (เจอเอง 8 ส.ค.: เห็น ping ok เลยนึกว่าโค้ดใหม่ขึ้นแล้ว ที่จริงยังเป็นของเก่า)
             doc_types: DOC_TYPES,
             build: "receipt-documentReference-v2",   // ← เปลี่ยนทุกครั้งที่แก้รูปเอกสาร ใช้เช็คว่า deploy ขึ้นจริงยัง
             mode: /\/test\b/.test(BASE) ? "sandbox (ของทดสอบ)" : "production (ของจริง)" };
  } catch (e) { return { ok: false, base: BASE, scope: SCOPE, error: String(e.message).slice(0, 300) }; }
}

// 🧪 ยิงใบทดสอบ "หัก ณ ที่จ่าย 3%" ขึ้น sandbox — ไม่แตะฐานข้อมูล ไม่ผูกกับออเดอร์ลูกค้าคนไหน
//     มีไว้เพราะยังไม่มีลูกค้านิติบุคคลที่ติ๊กหัก 3% จริง แต่ต้องรู้ว่าทางนี้ออกใบได้ก่อนขึ้นของจริง
export async function flowAccountTestWht({ amountSatang = 159000 } = {}) {
  if (!/\/test\b/.test(BASE)) throw new Error("ใช้ได้เฉพาะโหมด sandbox เท่านั้น");
  const amount = Math.round(Number(amountSatang) || 0);
  const { net, vat } = splitVat(amount);
  const fake = {
    invoice_id: "TEST-WHT", order_id: "test-wht-" + amount,
    customer_name: "บริษัท ทดสอบ หัก ณ ที่จ่าย จำกัด",
    tax_id: "0105558096348", branch: "สำนักงานใหญ่", is_company: true,
    address: "123 ถนนทดสอบ กรุงเทพฯ 10110", email: "test-wht@babehouse.local",
    description: "ทดสอบหัก ณ ที่จ่าย 3%",
    amount_satang: amount, net_satang: net, vat_satang: vat,
    wht_satang: Math.round(net * 0.03),          // หัก 3% จากยอดก่อน VAT ตามกฎสรรพากร
    doc_date: new Date().toISOString().slice(0, 10), docs_json: "{}",
  };
  const token = await getToken();
  const ti = await pushOne("tax-invoices", buildDocument(fake), token);
  const re = await pushOne("upgrade/receipts/with-payment",
    buildReceiptFrom(fake, { record_id: ti.record_id, id: ti.doc_id, number: ti.doc_number }), token);
  return { ok: true, สรุป: { ยอดรวม: amount / 100, ก่อนVat: net / 100, vat: vat / 100, หัก3: fake.wht_satang / 100,
                             ยอดรับจริง: (amount - fake.wht_satang) / 100 },
           ใบกำกับภาษี: ti, ใบเสร็จ: re };
}

// 🔎 ดึงเอกสารที่ออกไปแล้วกลับมาดู — ใช้ตรวจว่าตัวเลขในใบถูกจริงไหม โดยไม่ต้องเปิดหน้าเว็บ FlowAccount
export async function fetchFlowDoc(type, id) {
  const token = await getToken();
  const r = await fetch(`${BASE}/${type}/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, body: j || text.slice(0, 800) };
}
