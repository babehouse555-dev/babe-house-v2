import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { api, track } from "../api.js";

export default function Processing() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const orderId = sp.get("order_id");
  const [state, setState] = useState({ phase: "checking", msg: "กำลังตรวจสอบการชำระเงิน" });
  const polling = useRef(false);

  useEffect(() => {
    let alive = true;
    async function poll(attempt = 0) {
      try {
        const { order: o } = await api(`/api/orders/${orderId}`);
        if (!alive) return;
        if (o.blueprint_id && o.generation_status === "ready") { nav(`/dashboard?user_id=${encodeURIComponent(o.user_id)}&billing_cycle=${encodeURIComponent(o.billing_cycle)}&blueprint_id=${encodeURIComponent(o.blueprint_id)}`); return; }
        // ถ้า generation พลาดชั่วคราว (เช่น AI แน่น) ระบบจะลองสร้างใหม่ให้เองทุก 5 นาที → ไม่โชว์ error ดิบ
        // คงหน้า "กำลังวิเคราะห์ + ส่งลิงก์ทางอีเมล" ไว้ แล้ว poll ต่อ (ช้าลงตอน error) จนได้เล่มหรือผู้ใช้ปิดหน้าไปเอง
        setState({ phase: "working" });
        const slow = o.generation_status === "error";
        if (attempt < 90) setTimeout(() => poll(attempt + 1), slow ? 15000 : 4000);
      } catch { if (attempt < 90) setTimeout(() => poll(attempt + 1), 6000); }
    }
    async function run() {
      try {
        if (!orderId) throw new Error("ไม่พบหมายเลขคำสั่งซื้อ");
        const { order } = await api(`/api/orders/${orderId}`);
        if (!["paid", "mock_paid"].includes(order.payment_status)) throw new Error("ยังไม่พบสถานะชำระเงินสำเร็จ");
        track("paid");
        const s = await api("/api/start-generation", { method: "POST", body: { order_id: orderId } });
        if (s.status === "ready" && s.blueprint_id) { nav(`/dashboard?user_id=${encodeURIComponent(s.user_id)}&billing_cycle=${encodeURIComponent(s.billing_cycle)}&blueprint_id=${encodeURIComponent(s.blueprint_id)}`); return; }
        setState({ phase: "working" });
        if (!polling.current) { polling.current = true; setTimeout(poll, 4000); }
      } catch (e) { setState({ phase: "error", msg: e.message }); }
    }
    run();
    return () => { alive = false; };
  }, [orderId]);

  return (
    <div className="wrap narrow page-pad center" style={{ paddingTop: 56 }}>
      <div className="card">
        {state.phase === "checking" && <><div className="spinner" /><h1 className="page">กำลังตรวจสอบการชำระเงิน</h1><p className="muted">รอสักครู่ค่ะ</p></>}
        {state.phase === "working" && <>
          <div style={{ width: 54, height: 54, borderRadius: "50%", background: "#E8F5EE", color: "#1a7f43", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto 16px" }}>✓</div>
          <h1 className="page">ได้รับข้อมูลเรียบร้อยแล้วค่ะ</h1>
          <p className="muted">ครูพี่คิมกำลังวิเคราะห์ข้อมูลและรูป Insight เพื่อสร้างแผน 30 วันเฉพาะตัว</p>
          <div className="msg" style={{ background: "#F7F9FC", color: "var(--muted)", marginTop: 18 }}>📩 ใช้เวลาไม่เกิน 30 นาที เราจะส่งลิงก์ไปที่อีเมลของคุณ — ปิดหน้านี้ได้เลย หรือรอไว้ ระบบจะเปิดให้อัตโนมัติเมื่อเสร็จ</div>
          <Link className="btn ghost" to="/account" style={{ marginTop: 18 }}>ไปที่บัญชีของฉัน</Link>
        </>}
        {state.phase === "error" && <><h1 className="page" style={{ color: "var(--down)" }}>ระบบขัดข้อง</h1><p className="muted">{state.msg}</p><Link className="btn" to="/form" style={{ marginTop: 18 }}>กลับหน้าแบบฟอร์ม</Link></>}
      </div>
    </div>
  );
}
