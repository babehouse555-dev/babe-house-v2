import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";

// หน้ากลับจาก Stripe หลังจ่ายค่า workshop — วนถามสถานะจนกว่าจะยืนยัน (กัน webhook มาช้า)
export default function WorkshopPaid() {
  const [sp] = useSearchParams();
  const bookingId = sp.get("booking_id") || "";
  const [status, setStatus] = useState("pending");
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!bookingId) { setStatus("error"); return; }
    let stop = false, n = 0;
    let timer;
    const poll = async () => {
      if (stop) return;
      try {
        const r = await api(`/api/workshops/booking/${bookingId}`);
        if (stop) return;
        if (r.status === "paid") { setStatus("paid"); return; }   // จบ ไม่ตั้งรอบถัดไป
      } catch { if (stop) return; }
      n++; setTries(n);
      if (n < 30) timer = setTimeout(poll, 2500);   // ถามซ้ำ ~75 วินาที แล้วหยุด
    };
    poll();
    return () => { stop = true; clearTimeout(timer); };
  }, [bookingId]);

  if (status === "error") return <div className="wrap narrow page-pad center"><p className="muted">ไม่พบรายการจองค่ะ</p><Link className="btn ghost" to="/workshop">← คลาสทั้งหมด</Link></div>;

  return (
    <div className="wrap narrow page-pad center" style={{ minHeight: "65vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {status === "paid" ? <>
        <div style={{ fontSize: 52 }}>🎉</div>
        <h1 style={{ fontSize: 23, margin: "12px 0 6px" }}>จองสำเร็จแล้วค่ะ!</h1>
        <p className="muted" style={{ marginBottom: 20, lineHeight: 1.8 }}>
          ส่งอีเมลยืนยันพร้อมรายละเอียดวัน เวลา และสถานที่ไปให้แล้วนะคะ<br />
          ดูรายการจองของคุณได้ที่หน้าบัญชีตลอดเวลา
        </p>
        <div><Link className="btn" to="/account">ดูการจองของฉัน</Link> <Link className="btn ghost" to="/workshop" style={{ marginLeft: 6 }}>ดูคลาสอื่น</Link></div>
      </> : <>
        <div className="spinner" style={{ width: 34, height: 34, margin: "0 auto" }} />
        <h1 style={{ fontSize: 20, margin: "16px 0 6px" }}>กำลังยืนยันการชำระเงิน...</h1>
        <p className="muted">รอสักครู่นะคะ ไม่ต้องปิดหน้านี้{tries > 12 && <><br />ถ้ารอนานผิดปกติ ทักแอดมินได้เลยค่ะ ระบบบันทึกรายการไว้แล้ว</>}</p>
      </>}
    </div>
  );
}
