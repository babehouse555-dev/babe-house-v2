// ═══════ 👋 กล่องช่วยคนที่ล็อกอินแล้วบัญชีว่างเปล่า ═══════
//
// ⚠️ ทำไมต้องมี (คิมเคาะ 21 ส.ค. 2569):
//    ตอนย้ายจากเว็บเก่า มีลูกค้า 238 รายที่จ่ายเงินแล้วแต่บัญชีเดิมไม่มีอีเมลบันทึกไว้
//    ระบบใหม่จึงจับคู่กับอีเมลที่เขาใช้ล็อกอินไม่ได้ → เข้ามาแล้วเจอหน้าว่าง
//    (เขายังเรียนที่เว็บเก่าได้อยู่ ไม่ได้เดือดร้อน แค่ยังไม่ได้ย้ายมา)
//
// 📌 คิมตัดสินใจว่า "ไม่โทรตามลูกค้า" เพราะเป็นการรบกวนคนที่ไม่ได้เดือดร้อน
//    → ใช้วิธีนี้แทน: ทำให้ "คนที่อยากย้ายมา" หาทางแจ้งเจอง่ายที่สุด
//    คนที่ไม่สนใจก็ไม่ถูกรบกวนเลย เพราะกล่องนี้ขึ้นเฉพาะคนที่บัญชีว่างจริงๆ
//
// ⛔ ห้ามขึ้นกล่องนี้กับคนที่มีของอยู่แล้ว — จะกลายเป็นสร้างความสับสน

import { useState } from "react";
import { api, session } from "./api.js";

export default function EmptyAccountHelp() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  async function send() {
    setBusy(true);
    try {
      const r = await api("/api/academy/claim", { method: "POST", token: session.token, body: { note: note.trim() } });
      setDone(r.message || "ได้รับเรื่องแล้วค่ะ ทีมจะตรวจสอบและติดต่อกลับภายใน 1 วันทำการนะคะ 🩵");
    } catch (e) {
      setDone(e.message || "ส่งไม่สำเร็จค่ะ รบกวนลองใหม่อีกครั้งนะคะ");
    }
    setBusy(false);
  }

  return (
    <div style={{ background: "#FFF8E6", border: "1px solid #F2D98C", borderRadius: 16,
                  padding: "20px 18px", marginBottom: 18 }}>
      <div style={{ fontSize: 30, lineHeight: 1, marginBottom: 8 }}>👋</div>
      <h3 style={{ margin: "0 0 6px", fontSize: 17.5 }}>เคยซื้อคอร์สกับเราแต่ไม่เห็นในบัญชีนี้?</h3>

      {done
        ? <p style={{ fontSize: 14.5, lineHeight: 1.8, margin: 0, fontWeight: 700, color: "#1a7f43" }}>✅ {done}</p>
        : !open
          ? <>
              <p style={{ fontSize: 14, lineHeight: 1.85, margin: "0 0 14px", color: "#6b6257" }}>
                ตอนนี้เราย้ายมาระบบใหม่แล้วค่ะ — บางบัญชีในเว็บเดิม<b>ไม่ได้บันทึกอีเมลไว้</b>
                ระบบใหม่เลยจับคู่กับอีเมลที่คุณใช้อยู่ไม่ได้
                <br /><br />
                🔑 <b>คอร์สของคุณไม่ได้หายไปไหนนะคะ</b> ยังเรียนที่เว็บเดิมได้ตามปกติ
                <br />ถ้าอยากย้ายมาเรียนที่นี่ กดแจ้งได้เลย เดี๋ยวเราเชื่อมให้ค่ะ
              </p>
              <button className="btn" onClick={() => setOpen(true)} style={{ padding: "11px 22px" }}>
                แจ้งย้ายคอร์สมาที่นี่
              </button>
            </>
          : <>
              <p style={{ fontSize: 13.5, lineHeight: 1.8, margin: "0 0 10px", color: "#6b6257" }}>
                บอกเราหน่อยนะคะว่า <b>ซื้อคอร์สอะไร · จ่ายด้วยชื่อไหน · เบอร์โทรที่ใช้ตอนซื้อ</b>
                <br />⭐ <b>เบอร์โทรช่วยได้มากที่สุดค่ะ</b> เพราะระบบเดิมส่วนใหญ่บันทึกเบอร์ไว้
              </p>
              <textarea value={note} onChange={e => setNote(e.target.value)} autoFocus
                style={{ width: "100%", boxSizing: "border-box", minHeight: 92 }}
                placeholder="เช่น ซื้อคอร์ส All in your Phone ประมาณเดือน พ.ค. 2569 จ่ายในชื่อ สมหญิง ใจดี เบอร์ที่ใช้ตอนซื้อ 08x-xxx-xxxx" />
              <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button className="btn" onClick={send} disabled={busy} style={{ padding: "11px 22px" }}>
                  {busy ? "กำลังส่ง…" : "ส่งให้ทีมตรวจสอบ"}
                </button>
                <button className="link" onClick={() => setOpen(false)}
                  style={{ background: "none", border: 0, fontSize: 13.5, cursor: "pointer" }}>ยกเลิก</button>
              </div>
            </>}
    </div>
  );
}
