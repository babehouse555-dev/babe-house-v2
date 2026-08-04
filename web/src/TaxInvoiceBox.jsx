import { useState, useEffect } from "react";

// 🧾 กล่องขอใบกำกับภาษีในนามบริษัท — ใช้ร่วมกันทุกหน้าที่ลูกค้าจ่ายเงิน
// (เล่ม Blueprint · เครดิตตัดต่อ · คอร์สออนไลน์ · workshop)
//
// หลักคิด: ระบบออกใบกำกับให้ "ทุกออเดอร์" อยู่แล้วโดยใช้ชื่อลูกค้าที่มีในระบบ
// กล่องนี้จึงมีไว้เก็บ "ชื่อบริษัท" เฉพาะคนที่ต้องการเท่านั้น
// ลูกค้าทั่วไปไม่ต้องกรอกอะไรเลย — กันไม่ให้หน้าจ่ายเงินยาวขึ้นจนคนกดออก
//
// ⚠️ ต้องเก็บข้อมูลก่อนจ่ายเงินเสมอ เพราะใบกำกับออกอัตโนมัติทันทีที่เงินเข้า แก้ทีหลังไม่ได้

// ตรวจก่อนส่ง — คืนข้อความ error ถ้ายังกรอกไม่ครบ, คืน null ถ้าผ่าน
export function validateTax(tax) {
  if (!tax) return null;                               // ไม่ได้ขอในนามบริษัท = ผ่าน
  if (!String(tax.name || "").trim()) return "ใส่ชื่อบริษัทด้วยนะคะ";
  if (String(tax.tax_id || "").replace(/\D/g, "").length !== 13) return "เลขประจำตัวผู้เสียภาษีต้องมี 13 หลักค่ะ";
  if (!String(tax.address || "").trim()) return "ใส่ที่อยู่บริษัทตามที่จดทะเบียนด้วยนะคะ";
  return null;
}

export default function TaxInvoiceBox({ onChange }) {
  const [want, setWant] = useState(false);
  const [f, setF] = useState({ name: "", tax_id: "", branch: "สำนักงานใหญ่", address: "" });

  // ส่งค่ากลับให้หน้าที่เรียกใช้ทุกครั้งที่แก้ — null = ไม่ได้ขอในนามบริษัท
  useEffect(() => { onChange?.(want ? { is_company: true, ...f } : null); }, [want, f]);   // eslint-disable-line

  return (
    <div style={{ background: "var(--soft)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
      <label className="row" style={{ gap: 9, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
          checked={want} onChange={e => setWant(e.target.checked)} />
        <span>ต้องการ<b>ใบกำกับภาษีในนามบริษัท</b>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.6 }}>
            ไม่ติ๊กก็ได้ใบกำกับนะคะ — ระบบออกให้อัตโนมัติในนามของคุณทุกครั้งที่ชำระเงิน
            แล้วเก็บไว้ในหน้า “บัญชีของฉัน” ให้โหลดได้ตลอด ไม่หายค่ะ
          </div>
        </span>
      </label>
      {want && <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <input placeholder="ชื่อบริษัท (เช่น บริษัท เอบีซี จำกัด)" value={f.name}
          onChange={e => setF(v => ({ ...v, name: e.target.value }))} />
        <input inputMode="numeric" placeholder="เลขประจำตัวผู้เสียภาษี 13 หลัก" value={f.tax_id}
          onChange={e => setF(v => ({ ...v, tax_id: e.target.value.replace(/\D/g, "").slice(0, 13) }))} />
        <input placeholder="สำนักงานใหญ่ / สาขาที่ ..." value={f.branch}
          onChange={e => setF(v => ({ ...v, branch: e.target.value }))} />
        <textarea placeholder="ที่อยู่บริษัทตามที่จดทะเบียน" value={f.address} style={{ minHeight: 62 }}
          onChange={e => setF(v => ({ ...v, address: e.target.value }))} />
        <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>
          ⚠️ ตรวจให้ถูกก่อนชำระเงินนะคะ — ใบกำกับจะออกทันทีที่ชำระสำเร็จ แก้เองทีหลังไม่ได้ค่ะ
        </p>
      </div>}
    </div>
  );
}
