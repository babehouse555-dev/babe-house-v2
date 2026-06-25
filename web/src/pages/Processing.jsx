import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { api, track, session } from "../api.js";
import { useI18n } from "../i18n.jsx";

export default function Processing() {
  const { t } = useI18n();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const orderId = sp.get("order_id");
  const [state, setState] = useState({ phase: "checking", msg: "" });
  const polling = useRef(false);

  useEffect(() => {
    let alive = true;
    // จ่ายเงินเสร็จ → ขอ session ให้อัตโนมัติ (จะได้เปิดเล่มแรกได้เลยไม่ต้อง login) แล้วค่อยไปหน้า Dashboard
    async function goDash(u, c, b) {
      try { const r = await api("/api/auth/claim-order", { method: "POST", body: { order_id: orderId } }); if (r.token) session.set(r.token, r.email); } catch {}
      nav(`/dashboard?user_id=${encodeURIComponent(u)}&billing_cycle=${encodeURIComponent(c)}&blueprint_id=${encodeURIComponent(b)}`);
    }
    async function poll(attempt = 0) {
      try {
        const { order: o } = await api(`/api/orders/${orderId}`);
        if (!alive) return;
        if (o.blueprint_id && o.generation_status === "ready") { goDash(o.user_id, o.billing_cycle, o.blueprint_id); return; }
        // ถ้า generation พลาดชั่วคราว (เช่น AI แน่น) ระบบจะลองสร้างใหม่ให้เองทุก 5 นาที → ไม่โชว์ error ดิบ
        // คงหน้า "กำลังวิเคราะห์ + ส่งลิงก์ทางอีเมล" ไว้ แล้ว poll ต่อ (ช้าลงตอน error) จนได้เล่มหรือผู้ใช้ปิดหน้าไปเอง
        setState({ phase: "working" });
        const slow = o.generation_status === "error";
        if (attempt < 90) setTimeout(() => poll(attempt + 1), slow ? 15000 : 4000);
      } catch { if (attempt < 90) setTimeout(() => poll(attempt + 1), 6000); }
    }
    async function run() {
      try {
        if (!orderId) throw new Error(t("pr_err_noorder"));
        const { order } = await api(`/api/orders/${orderId}`);
        if (!["paid", "mock_paid"].includes(order.payment_status)) throw new Error(t("pr_err_unpaid"));
        track("paid");
        const s = await api("/api/start-generation", { method: "POST", body: { order_id: orderId } });
        if (s.status === "ready" && s.blueprint_id) { goDash(s.user_id, s.billing_cycle, s.blueprint_id); return; }
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
        {state.phase === "checking" && <><div className="spinner" /><h1 className="page">{t("pr_checking")}</h1><p className="muted">{t("pr_wait")}</p></>}
        {state.phase === "working" && <>
          <div style={{ width: 54, height: 54, borderRadius: "50%", background: "#E8F5EE", color: "#1a7f43", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto 16px" }}>✓</div>
          <h1 className="page">{t("pr_done_title")}</h1>
          <p className="muted">{t("pr_done_sub")}</p>
          <div className="msg" style={{ background: "#F7F9FC", color: "var(--muted)", marginTop: 18 }}>{t("pr_email_note")}</div>
          <Link className="btn ghost" to="/account" style={{ marginTop: 18 }}>{t("pr_go_account")}</Link>
        </>}
        {state.phase === "error" && <><h1 className="page" style={{ color: "var(--down)" }}>{t("pr_error_title")}</h1><p className="muted">{state.msg}</p><Link className="btn" to="/form" style={{ marginTop: 18 }}>{t("pr_back_form")}</Link></>}
      </div>
    </div>
  );
}
