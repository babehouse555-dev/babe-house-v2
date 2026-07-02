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
  // สเต็ปความคืบหน้า (จังหวะเวลาโดยประมาณ — ให้ลูกค้าเห็นว่าระบบเดินอยู่ ไม่ใช่ค้าง)
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (state.phase !== "working") return;
    const iv = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(iv);
  }, [state.phase]);
  const STEP_AT = [0, 5, 14, 55, 100]; // วินาทีที่เริ่มแต่ละสเต็ป
  const curStep = STEP_AT.filter(s => elapsed >= s).length - 1;
  const pct = Math.min(92, Math.round(100 * (1 - Math.exp(-(elapsed + 8) / 75))));

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
          <div className="spinner" />
          <h1 className="page">{t("pr_working_title")}</h1>
          <p className="muted" style={{ marginBottom: 20 }}>{t("pr_working_sub")}</p>
          <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 10, marginBottom: 18, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
            {t("pr_steps").map((s, i) => {
              const done = i < curStep, active = i === curStep;
              return <div key={i} className="row" style={{ gap: 10, alignItems: "center" }}>
                {done
                  ? <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#E8F5EE", color: "#1a7f43", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>✓</span>
                  : active
                    ? <span style={{ width: 22, height: 22, borderRadius: "50%", border: "3px solid #EDF5FD", borderTopColor: "var(--blue)", animation: "spin .8s linear infinite", flexShrink: 0, boxSizing: "border-box" }} />
                    : <span style={{ width: 22, height: 22, borderRadius: "50%", border: "1.5px solid var(--border)", flexShrink: 0, boxSizing: "border-box" }} />}
                <span style={{ fontSize: 14, fontWeight: active ? 700 : 400, color: active ? "var(--ink)" : done ? "var(--muted)" : "#b9c2cc" }}>{s}{active ? "…" : ""}</span>
              </div>;
            })}
          </div>
          <div style={{ height: 6, background: "var(--soft)", borderRadius: 20, overflow: "hidden", marginBottom: 16 }}><div style={{ width: `${pct}%`, height: "100%", background: "var(--blue)", borderRadius: 20, transition: "width 1s linear" }} /></div>
          <div className="msg" style={{ background: "#EAF3FD", color: "#3F6BAE", textAlign: "left" }}>{t("pr_email_note")}</div>
          <Link className="btn ghost" to="/account" style={{ marginTop: 14 }}>{t("pr_go_account")}</Link>
        </>}
        {state.phase === "error" && <><h1 className="page" style={{ color: "var(--down)" }}>{t("pr_error_title")}</h1><p className="muted">{state.msg}</p><Link className="btn" to="/form" style={{ marginTop: 18 }}>{t("pr_back_form")}</Link></>}
      </div>
    </div>
  );
}
