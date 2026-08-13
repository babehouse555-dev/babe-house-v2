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
// 🔁 ตรรกะตรวจข้อมูลย้ายไปอยู่ validate.js แล้ว (ไฟล์ธรรมดา สคริปต์ตรวจอัตโนมัติเรียกทดสอบได้)
//    ที่นี่แค่ส่งต่อ เพื่อให้หน้าที่ import จากไฟล์นี้อยู่แล้วใช้ได้เหมือนเดิม ไม่ต้องไล่แก้ทุกหน้า
// ⚠️ `export { X } from "..."` เป็นการ "ส่งต่อ" เฉยๆ ชื่อนั้นจะไม่มีอยู่ในไฟล์นี้
//    ถ้าจะใช้เองต้อง import เข้ามาด้วย ไม่งั้นพังตอนลูกค้าเปิดจริง (ReferenceError)
//    เคยพลาดมาแล้วกับ WHT_PCT — จอกล่องใบกำกับดับตอนลูกค้าติ๊ก "หัก ณ ที่จ่าย"
export { validateTax, whtAmount, WHT_PCT } from "./validate.js";
import { whtAmount, WHT_PCT } from "./validate.js";

export default function TaxInvoiceBox({ onChange, totalSatang = 0 }) {
  const [want, setWant] = useState(false);
  const [wht, setWht] = useState(false);
  const [f, setF] = useState({ name: "", tax_id: "", branch: "สำนักงานใหญ่", address: "" });
  const [fullName, setFullName] = useState("");   // ชื่อ-นามสกุลจริงของผู้ซื้อ (ใช้เป็นชื่อบนใบกำกับ)

  // ส่งค่ากลับให้หน้าที่เรียกใช้ทุกครั้งที่แก้
  // ⚠️ ต้องส่ง full_name ออกไปเสมอ แม้ไม่ได้ติ๊กบริษัท — ไม่งั้นใบกำกับจะไม่มีชื่อจริงของลูกค้า
  useEffect(() => {
    const fn = fullName.trim();
    onChange?.(want ? { is_company: true, wht, full_name: fn, ...f } : (fn ? { full_name: fn } : null));
  }, [want, wht, f, fullName]);   // eslint-disable-line
  // เลิกติ๊กบริษัท = ยกเลิกหัก ณ ที่จ่ายด้วย (บุคคลธรรมดาหักไม่ได้)
  useEffect(() => { if (!want && wht) setWht(false); }, [want]);   // eslint-disable-line
  const whtSat = whtAmount(totalSatang, wht);
  const baht = (n) => (n / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    // marginTop กันชนกับของที่อยู่เหนือมัน (ช่องโค้ดส่วนลด) — บนมือถือเดิมชิดกันจนดูเหมือนซ้อนทับ (คิมเจอ 12 ส.ค.)
    <div style={{ background: "var(--soft)", borderRadius: 12, padding: "12px 14px", marginTop: 14, marginBottom: 14 }}>
      {/* 🧾 ชื่อบนใบกำกับภาษี — นักบัญชีขอ 11 ส.ค. ว่าต้องเป็นชื่อจริง ไม่ใช่ชื่อเล่น
          ถ้าไม่กรอก ใบจะระบุว่า "ลูกค้าไม่ประสงค์รับใบกำกับภาษี" ตามที่นักบัญชีกำหนด */}
      <div className="field" style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13.5, fontWeight: 700 }}>ชื่อ-นามสกุล <span className="muted" style={{ fontWeight: 400 }}>(สำหรับออกใบกำกับภาษี)</span></label>
        <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="เช่น สมหญิง ใจดี"
               style={{ width: "100%", boxSizing: "border-box" }} />
        <div className="muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.6 }}>
          กรอกเป็นชื่อจริงนะคะ เพราะใบกำกับภาษีต้องใช้ชื่อตามบัตรประชาชนค่ะ
        </div>
      </div>
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
        {/* 💸 หัก ณ ที่จ่าย 3% — เฉพาะนิติบุคคล */}
        <label className="row" style={{ gap: 9, alignItems: "flex-start", fontSize: 14, cursor: "pointer",
          background: "#fff", borderRadius: 10, padding: "10px 12px" }}>
          <input type="checkbox" style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
            checked={wht} onChange={e => setWht(e.target.checked)} />
          <span>บริษัทของเรา<b>หักภาษี ณ ที่จ่าย {WHT_PCT}%</b>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.6 }}>
              ติ๊กเฉพาะกรณีที่ฝ่ายบัญชีของคุณต้องหักนะคะ · หักจากยอดก่อน VAT ตามที่กฎหมายกำหนด
            </div>
          </span>
        </label>
        {wht && totalSatang > 0 && (
          <div style={{ background: "#fff", borderRadius: 10, padding: "11px 13px", fontSize: 13.5, lineHeight: 1.9 }}>
            <div className="between"><span>ราคาก่อน VAT</span><span>฿{baht(Math.round(totalSatang / 1.07))}</span></div>
            <div className="between"><span>VAT 7%</span><span>฿{baht(totalSatang - Math.round(totalSatang / 1.07))}</span></div>
            <div className="between" style={{ borderTop: "1px solid var(--border)", paddingTop: 4, marginTop: 4 }}>
              <span>รวมทั้งสิ้น</span><span>฿{baht(totalSatang)}</span></div>
            <div className="between" style={{ color: "#b42318" }}>
              <span>หัก ณ ที่จ่าย {WHT_PCT}%</span><span>−฿{baht(whtSat)}</span></div>
            <div className="between" style={{ fontWeight: 800, fontSize: 16, borderTop: "1px solid var(--border)", paddingTop: 5, marginTop: 4 }}>
              <span>ยอดที่ต้องชำระ</span><span>฿{baht(totalSatang - whtSat)}</span></div>
            <p className="muted" style={{ fontSize: 12, margin: "8px 0 0", lineHeight: 1.6 }}>
              📄 หลังชำระเงิน รบกวน<b>ส่งหนังสือรับรองการหักภาษี ณ ที่จ่าย</b>มาที่ babehouse.work@gmail.com นะคะ
              ทางเราต้องใช้ยื่นภาษีค่ะ
            </p>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>
          ⚠️ ตรวจให้ถูกก่อนชำระเงินนะคะ — ใบกำกับจะออกทันทีที่ชำระสำเร็จ แก้เองทีหลังไม่ได้ค่ะ
        </p>
      </div>}
    </div>
  );
}
