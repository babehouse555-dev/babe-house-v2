import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";

// หน้ารอยืนยันการชำระเงินคอร์ส — poll สถานะ (self-finalize ฝั่ง server ถาม Stripe ตรงๆ กัน webhook หลุด)
export default function AcademyPaid() {
  const [sp] = useSearchParams();
  const pid = sp.get("purchase_id") || "";
  const [state, setState] = useState("checking"); // checking | paid | timeout
  const [courseId, setCourseId] = useState(null);

  useEffect(() => {
    if (!pid) { setState("timeout"); return; }
    let tries = 0, stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const d = await api(`/api/academy/purchase/${pid}`);
        if (d.status === "paid") { setCourseId(d.course_id); setState("paid"); return; }
      } catch {}
      if (++tries > 40) { setState("timeout"); return; }
      setTimeout(tick, 2500);
    };
    tick();
    return () => { stop = true; };
  }, [pid]);

  return (
    <div className="wrap narrow page-pad center" style={{ minHeight: "65vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {state === "checking" && <>
        <div className="spinner" style={{ margin: "0 auto 14px" }} />
        <h2 style={{ fontSize: 20 }}>กำลังยืนยันการชำระเงิน...</h2>
        <p className="muted">รอสักครู่นะคะ ปกติไม่เกิน 1 นาทีค่ะ</p>
      </>}
      {state === "paid" && <>
        <div style={{ fontSize: 50 }}>🎉</div>
        <h2 style={{ fontSize: 22, margin: "8px 0 6px" }}>ชำระเงินสำเร็จ! คอร์สปลดล็อกแล้วค่ะ</h2>
        <p className="muted" style={{ marginBottom: 18 }}>เริ่มเรียนได้ทันทีเลยนะคะ 🩵</p>
        <div><Link className="btn" to={`/academy/learn?course=${courseId}`}>เริ่มเรียนเลย →</Link></div>
      </>}
      {state === "timeout" && <>
        <div style={{ fontSize: 44 }}>⏳</div>
        <h2 style={{ fontSize: 20, margin: "8px 0 6px" }}>ยังยืนยันไม่สำเร็จ</h2>
        <p className="muted" style={{ marginBottom: 16 }}>ถ้าชำระเงินแล้ว ระบบจะปลดล็อกให้ภายในไม่กี่นาทีค่ะ ลองรีเฟรชหน้านี้ หรือติดต่อทีมงานได้เลย</p>
        <div><button className="btn ghost" onClick={() => location.reload()}>รีเฟรช</button> <Link className="btn" to="/academy" style={{ marginLeft: 6 }}>กลับหน้าคอร์ส</Link></div>
      </>}
    </div>
  );
}
