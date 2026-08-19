// ═══════ 📧 กล่องเตือน "อีเมลน่าจะพิมพ์ผิด" — ใช้ร่วมทุกหน้าที่ลูกค้าพิมพ์อีเมล ═══════
//
// ⚠️ เคสจริง 19 ส.ค. 2569: ลูกค้าพิมพ์ saranya.kanr@gmail.con (ตกตัว m)
//    จ่ายเงินสำเร็จ · เล่มสร้างเสร็จ · แต่อีเมลแจ้งเล่มส่งไปไม่ถึงตลอดกาล
//    ลูกค้าเข้าใจว่า "จ่ายแล้วไม่ได้ของ" ทักมาต่อว่า ทีมต้องไล่หาย้อนหลังทีละคน
//
// 📌 จงใจ "เตือนอย่างเดียว ไม่บล็อก" — โดเมนแปลกๆ ที่ถูกจริงก็มี
//    ห้ามกันลูกค้าไม่ให้จ่ายเงินเด็ดขาด แค่ถามยืนยันก่อนพอ
//
// ⚠️ อยู่แยกไฟล์ตั้งใจ — ถ้าฝังไว้ในหน้าใดหน้าหนึ่งแล้วอีกหน้าไป import
//    วันหลังจะกลายเป็น import วนกัน (เว็บดับทั้งเว็บโดยที่ build ยังผ่าน)

import { emailTypoHint } from "./validate.js";

export default function EmailTypoWarn({ value, onFix }) {
  const hint = emailTypoHint(value);
  if (!hint) return null;
  return (
    <div style={{ background: "#FFF8E6", border: "1px solid #F2D98C", borderRadius: 9,
                  padding: "9px 11px", marginTop: 7, fontSize: 13, lineHeight: 1.7 }}>
      ⚠️ อีเมลนี้น่าจะพิมพ์ตกนะคะ — หมายถึง <b>{hint.suggest}</b> หรือเปล่า?
      <br /><span className="muted" style={{ fontSize: 12.3 }}>ถ้าอีเมลผิด เราจะส่งของให้ไม่ถึงค่ะ</span>
      <div style={{ marginTop: 7 }}>
        <button type="button" className="btn ghost" style={{ padding: "6px 13px", fontSize: 13 }}
          onClick={() => onFix(hint.suggest)}>ใช่ แก้ให้เลย</button>
      </div>
    </div>
  );
}
