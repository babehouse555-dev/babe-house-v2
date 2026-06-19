import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api, baht, track } from "../api.js";

export default function Checkout() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const orderId = sp.get("order_id");
  const [order, setOrder] = useState(null);
  const [code, setCode] = useState("");
  const [codeMsg, setCodeMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState(49000);

  useEffect(() => {
    track("checkout_view");
    if (!orderId) return;
    api(`/api/orders/${orderId}`).then(d => { setOrder(d.order); if (d.order.final_amount_satang != null) setPrice(d.order.final_amount_satang); }).catch(() => {});
  }, [orderId]);

  async function pay() {
    if (!orderId) return; setBusy(true);
    try { const d = await api("/api/create-payment-session", { method: "POST", body: { order_id: orderId } }); location.href = d.redirect_url; }
    catch (e) { alert(e.message); setBusy(false); }
  }
  async function useCode() {
    if (!code.trim()) { setCodeMsg({ k: "err", t: "กรุณากรอกโค้ด" }); return; }
    setCodeMsg({ k: "", t: "กำลังตรวจสอบ..." });
    try {
      const d = await api("/api/apply-code", { method: "POST", body: { order_id: orderId, code: code.trim().toUpperCase() } });
      if (d.free) { nav(d.redirect_url); return; }
      setPrice(d.final_satang); setCodeMsg({ k: "ok", t: `ใช้โค้ดสำเร็จ! ลด ${d.percent}%` });
    } catch (e) { setCodeMsg({ k: "err", t: e.message }); }
  }

  const isMock = !order || order.provider === "mock";
  return (
    <div className="wrap narrow page-pad">
      <div className="brand">BABE HOUSE · SECURE CHECKOUT</div>
      <h1 className="page">ชำระเงิน Blueprint Premium</h1>
      <p className="sub">เมื่อชำระสำเร็จ ระบบจะเริ่มให้ AI วิเคราะห์และส่งลิงก์ Dashboard ทางอีเมลค่ะ</p>
      <div className="card">
        <div className="between" style={{ background: "var(--soft)", borderRadius: 14, padding: 14, marginBottom: 12 }}>
          <span>AI Creator Blueprint</span><span style={{ fontSize: 26, fontWeight: 800, color: "var(--blue-d)" }}>{baht(price)}</span>
        </div>
        {order?.discount_percent > 0 && order.discount_percent < 100 && <p style={{ textAlign: "right", color: "var(--up)", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>ลด {order.discount_percent}% แล้ว</p>}
        {isMock ? <>
          <button className="btn full" onClick={pay} disabled={busy} style={{ marginBottom: 10 }}>จำลองชำระสำเร็จ (PromptPay/บัตร)</button>
        </> : <button className="btn full" onClick={pay} disabled={busy}>ชำระเงิน (PromptPay / บัตรเครดิต)</button>}

        <div className="row" style={{ margin: "18px 0 10px", color: "var(--muted)", fontSize: 12 }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />หรือมีโค้ดส่วนลด<div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>
        <div className="row">
          <input style={{ flex: 1, textTransform: "uppercase" }} value={code} onChange={e => setCode(e.target.value)} placeholder="กรอกโค้ด เช่น SAVE30" />
          <button className="btn" onClick={useCode} style={{ padding: "13px 20px" }}>ใช้โค้ด</button>
        </div>
        {codeMsg && <p style={{ fontSize: 13, marginTop: 8, color: codeMsg.k === "err" ? "var(--down)" : codeMsg.k === "ok" ? "var(--up)" : "var(--muted)" }}>{codeMsg.t}</p>}
      </div>
    </div>
  );
}
