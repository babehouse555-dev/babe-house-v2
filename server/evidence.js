// ═══════ 📎 ไฟล์หลักฐานการชำระเงิน — แนบเข้าเอกสารใน FlowAccount ═══════
// นักบัญชีขอ 11 ส.ค. 2569: "อยากได้หลักฐานว่าเราได้รับการชำระเงินแล้วจริงๆ"
// ลูกค้าเราจ่ายผ่าน Stripe (บัตร/พร้อมเพย์) ไม่มีสลิปโอนให้แนบ → สร้างไฟล์หลักฐานจากข้อมูลการรับเงินจริงแทน
//
// ⚠️ ทำไมเป็นภาษาอังกฤษล้วน: PDF ที่ไม่ฝังฟอนต์ใช้ได้แค่ฟอนต์มาตรฐาน 14 ตัวซึ่งไม่มีภาษาไทย
//    ถ้าใส่ไทยลงไปจะกลายเป็นตัวขยะ · ข้อมูลในนี้เป็นตัวเลข/วันที่/รหัสอ้างอิง อ่านได้ไม่ต้องแปล
//    (ถ้านักบัญชีอยากได้ภาษาไทย ต้องหาไฟล์ฟอนต์ไทยมาฝัง — ทำได้แต่ไฟล์จะใหญ่ขึ้นมาก)

const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
// ตัดอักขระที่ฟอนต์มาตรฐานวาดไม่ได้ (ไทย/อีโมจิ) ทิ้ง กันไฟล์เสีย
const ascii = (s) => String(s ?? "").replace(/[^\x20-\x7E]/g, "").trim();

const baht = (satang) => (Number(satang || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thDate = (d) => {
  if (!d) return "-";
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? "-"
    : x.toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" }).replace("T", " ") + " (UTC+7)";
};

// สร้าง PDF หน้าเดียวด้วยมือ — ไม่ต้องลงไลบรารีเพิ่ม (โปรเจคนี้ไม่มี pdfkit)
function makePdf(lines) {
  const H = 842, W = 595;
  let y = H - 70;
  const parts = [];
  for (const ln of lines) {
    if (ln === null) { y -= 10; continue; }                 // เว้นบรรทัด
    const [txt, style] = Array.isArray(ln) ? ln : [ln, ""];
    const font = style === "h1" ? "/F2 17" : style === "h2" ? "/F2 11" : style === "b" ? "/F2 10" : "/F1 10";
    parts.push(`BT ${font} Tf 56 ${y} Td (${esc(ascii(txt))}) Tj ET`);
    y -= style === "h1" ? 30 : style === "h2" ? 20 : 16;
  }
  // เส้นคั่นใต้หัวเรื่อง
  parts.unshift(`0.72 0.78 0.86 RG 1 w 56 ${H - 84} m ${W - 56} ${H - 84} l S`);
  const stream = parts.join("\n");

  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${W} ${H}]/Resources<</Font<</F1 5 0 R/F2 6 0 R>>>>/Contents 4 0 R>>`,
    `<</Length ${Buffer.byteLength(stream, "latin1")}>>\nstream\n${stream}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>",
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, "latin1")); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
       + offsets.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("")
       + `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1").toString("base64");
}

// inv = แถวจาก tax_invoices · pay = ข้อมูลการรับเงินเพิ่มเติม (วิธีจ่าย/เลขอ้างอิง/เวลาที่จ่าย)
export function paymentEvidencePdf(inv, pay = {}) {
  const lines = [
    ["PAYMENT EVIDENCE", "h1"],
    ["Babe House Limited Partnership", "b"],
    null,
    ["Transaction", "h2"],
    `Order ID        : ${inv.order_id || "-"}`,
    `Customer email  : ${inv.email || "-"}`,
    `Description     : ${inv.description || "-"}`,
    null,
    ["Amount received", "h2"],
    `Before VAT      : ${baht(inv.net_satang)} THB`,
    `VAT 7%          : ${baht(inv.vat_satang)} THB`,
    [`Total paid      : ${baht(inv.amount_satang)} THB`, "b"],
    ...(Number(inv.wht_satang || 0) > 0
      ? [`Withholding 3%  : ${baht(inv.wht_satang)} THB`,
         `Net transferred : ${baht(Number(inv.amount_satang) - Number(inv.wht_satang))} THB`]
      : []),
    null,
    ["Payment", "h2"],
    `Paid at         : ${thDate(pay.paid_at || inv.doc_date || inv.created_at)}`,
    `Method          : ${ascii(pay.method || "Stripe (card / PromptPay)")}`,
    `Payment ref     : ${ascii(pay.ref || "-")}`,
    `Status          : PAID`,
    null,
    null,
    "Generated automatically by the Babe House system from the payment record",
    "received through Stripe. This file is attached as proof that the amount",
    "above was actually collected from the customer.",
  ];
  return { fileName: `payment-evidence-${String(inv.order_id || inv.invoice_id).slice(-14)}.pdf`, base64: makePdf(lines) };
}
