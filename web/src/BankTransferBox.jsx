import { useState } from "react";
import { api } from "./api.js";
import { BANK_TRANSFER_LIVE } from "./config.js";

// 🏦 กล่อง "โอนเข้าบัญชีบริษัท" — ใช้ร่วมกันทุกสินค้า (เล่ม Blueprint · คอร์ส · workshop · เครดิตตัดต่อ)
//
// คิมสั่ง 17 ส.ค. 2569 หลังแอดมินแจ้งว่า "ต้องเพิ่มเลขบัญชีสำหรับลูกค้าบริษัท"
// เหตุผล: ฝ่ายบัญชีของบริษัทลูกค้าหลายที่จ่ายบัตร/พร้อมเพย์ไม่ได้ ต้องโอนจากบัญชีบริษัทเท่านั้น
//
// ⚠️ จงใจ "ซ่อนไว้ก่อน" แล้วโผล่เฉพาะคนที่ติ๊กว่าออกใบกำกับในนามบริษัท
//    ถ้าโชว์ให้ทุกคนเห็น คนทั่วไปจะเลือกโอนกันหมด แล้วงานตรวจสลิปจะกลับมาเต็มมือแอดมินเหมือนเว็บเก่า
//    (ทางนี้ช้ากว่าจริง — ต้องรอคิมตรวจ ไม่ได้ของทันทีเหมือนจ่ายบัตร)
export default function BankTransferBox({ kind, orderId, isCompany, amountSatang = 0 }) {
  const [t, setT] = useState(null);        // ข้อมูลการโอน (หลังกดเริ่ม)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(false);

  // ⛔ ปิดทั้งก้อนถ้าสวิตช์ยังไม่เปิด (คิมยังไม่เคาะว่าจะรับโอน) · ลูกค้าบุคคลไม่เห็นทางนี้อยู่แล้ว
  if (!BANK_TRANSFER_LIVE || !isCompany || !orderId) return null;

  const baht = (n) => "฿" + (Number(n || 0) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function start() {
    setBusy(true); setMsg(null);
    try {
      const d = await api("/api/bank-transfer/start", { method: "POST", body: { kind, order_id: orderId } });
      setT(d); setOpen(true);
    } catch (e) { setMsg({ k: "err", t: e.message || "เริ่มรายการไม่สำเร็จค่ะ" }); }
    setBusy(false);
  }

  async function upload(file) {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      // อ่านไฟล์เป็น base64 ฝั่งเบราว์เซอร์ — ไม่ต้องมีที่เก็บไฟล์แยก สลิปอยู่คู่ออเดอร์เสมอ
      const b64 = await new Promise((ok, no) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(",")[1] || "");
        r.onerror = () => no(new Error("อ่านไฟล์ไม่สำเร็จค่ะ"));
        r.readAsDataURL(file);
      });
      const d = await api("/api/bank-transfer/slip", { method: "POST",
        body: { transfer_id: t.transfer_id, name: file.name, mime: file.type, data_b64: b64 } });
      setMsg({ k: "ok", t: d.message });
      setT(v => ({ ...v, status: "waiting", sent: true }));
    } catch (e) { setMsg({ k: "err", t: e.message || "ส่งสลิปไม่สำเร็จค่ะ" }); }
    setBusy(false);
  }

  const Row = ({ label, value, big }) => (
    <div className="between" style={{ gap: 12, padding: "7px 0", borderBottom: "1px solid var(--border)", alignItems: "baseline" }}>
      <span className="muted" style={{ fontSize: 13 }}>{label}</span>
      <b style={{ fontSize: big ? 18 : 14.5, letterSpacing: big ? ".02em" : 0, textAlign: "right",
                  fontVariantNumeric: "tabular-nums" }}>{value}</b>
    </div>
  );

  return (
    <div style={{ background: "var(--soft)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
      {!open ? (
        <>
          <div style={{ fontSize: 14, fontWeight: 700 }}>🏦 ฝ่ายบัญชีต้องโอนจากบัญชีบริษัทใช่ไหมคะ</div>
          <p className="muted" style={{ fontSize: 12.5, margin: "4px 0 10px", lineHeight: 1.7 }}>
            เรามีบัญชีบริษัทให้โอนค่ะ — แต่ทางนี้<b>ไม่ได้ของทันที</b> ต้องรอทีมตรวจสลิปก่อน (ไม่เกิน 1 วันทำการ)
            <br />ถ้าจ่ายบัตรหรือพร้อมเพย์ได้ แนะนำทางนั้นจะได้ของเลยค่ะ
          </p>
          <button type="button" className="btn ghost" onClick={start} disabled={busy} style={{ padding: "9px 16px", fontSize: 13.5 }}>
            {busy ? "กำลังเปิดรายการ…" : "ขอเลขบัญชีเพื่อโอน"}
          </button>
          {msg && <p style={{ fontSize: 13, marginTop: 8, marginBottom: 0, color: "#b42318" }}>{msg.t}</p>}
        </>
      ) : (
        <>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>🏦 โอนเข้าบัญชีบริษัท</div>
          <div style={{ background: "#fff", borderRadius: 10, padding: "10px 13px" }}>
            <Row label="ธนาคาร" value={t.bank.bank} />
            <Row label="ชื่อบัญชี" value={t.bank.account_name} />
            <Row label="เลขที่บัญชี" value={t.bank.account_no} big />
            <Row label="สาขา" value={t.bank.branch} />
            <Row label="ยอดที่ต้องโอน" value={baht(t.amount_satang || amountSatang)} big />
            <div className="between" style={{ gap: 12, padding: "7px 0", alignItems: "baseline" }}>
              <span className="muted" style={{ fontSize: 13 }}>รหัสอ้างอิง</span>
              <b style={{ fontSize: 15, letterSpacing: ".08em" }}>{t.ref_code}</b>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: "8px 0 10px", lineHeight: 1.7 }}>
            📝 รบกวนใส่รหัส <b>{t.ref_code}</b> ในช่องหมายเหตุตอนโอนด้วยนะคะ จะได้จับคู่สลิปกับออเดอร์ได้ถูก
            <br />⚠️ โอนยอดให้ตรงเป๊ะ ถ้ายอดไม่ตรงทีมจะยืนยันให้ไม่ได้ค่ะ
          </p>

          {t.status === "confirmed" ? (
            <div style={{ background: "#F3FAF5", border: "1px solid #cfe8d8", borderRadius: 10, padding: "11px 13px", fontSize: 13.5 }}>
              ✅ ยืนยันการชำระเงินเรียบร้อยแล้วค่ะ เข้าใช้งานได้เลยนะคะ
            </div>
          ) : t.sent ? (
            <div style={{ background: "#F2F8FC", border: "1px solid #cfe0ee", borderRadius: 10, padding: "11px 13px", fontSize: 13.5, lineHeight: 1.7 }}>
              ⏳ ได้รับสลิปแล้วค่ะ ทีมจะตรวจสอบและเปิดให้ภายใน 1 วันทำการ แล้วส่งอีเมลแจ้งนะคะ 🩵
              <br /><span className="muted" style={{ fontSize: 12.5 }}>ปิดหน้านี้ได้เลยค่ะ ไม่ต้องรอ</span>
            </div>
          ) : (
            <>
              <label className="btn full" style={{ display: "block", textAlign: "center", cursor: busy ? "default" : "pointer", padding: "11px 16px" }}>
                {busy ? "กำลังส่ง…" : "📎 แนบสลิปการโอน"}
                <input type="file" accept="image/*,application/pdf" hidden disabled={busy}
                  onChange={e => upload(e.target.files?.[0])} />
              </label>
              <p className="muted" style={{ fontSize: 12, margin: "7px 0 0", lineHeight: 1.6 }}>
                โอนแล้วค่อยแนบก็ได้ค่ะ — กลับมาที่ลิงก์นี้ได้ตลอด หรือส่งสลิปทางไลน์ก็ได้เหมือนกัน
              </p>
            </>
          )}
          {msg && <p style={{ fontSize: 13, marginTop: 9, marginBottom: 0, lineHeight: 1.7,
            color: msg.k === "err" ? "#b42318" : "#1a7f43" }}>{msg.t}</p>}
        </>
      )}
    </div>
  );
}
