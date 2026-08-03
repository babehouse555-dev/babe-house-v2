import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api, baht, track } from "../api.js";
import { useI18n } from "../i18n.jsx";

export default function Checkout() {
  const { t } = useI18n();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const orderId = sp.get("order_id");
  const [order, setOrder] = useState(null);
  const [code, setCode] = useState("");
  const [codeMsg, setCodeMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState(159000);
  // 💳 3 แพ็ก (คิมเคาะ 3 ส.ค.) — ข้อมูลจริงตอนตัดสินใจ: ลูกค้า 232 คน 231 คนซื้อเดือนเดียวแล้วหาย
  // จ่ายก้อนเดียวล่วงหน้าจึงคุ้มกว่ามากทั้งสองฝ่าย: ลูกค้าถูกลง 30-50% เราได้เงินก้อนและได้เวลา 6-12 เดือนไปพิสูจน์ของ
  const [plans, setPlans] = useState([]);
  const [plan, setPlan] = useState("12m");   // ตั้งต้นที่คุ้มที่สุดให้ลูกค้า

  useEffect(() => {
    track("checkout_view");
    api("/api/plans").then(d => setPlans(d.plans || [])).catch(() => {});
    if (!orderId) return;
    api(`/api/orders/${orderId}`).then(d => { setOrder(d.order); if (d.order.final_amount_satang != null) setPrice(d.order.final_amount_satang); }).catch(() => {});
  }, [orderId]);

  // เลือกแพ็กแล้วอัปเดตยอดที่ต้องจ่ายทันที (เปลี่ยนได้จนกว่าจะกดจ่าย)
  // ⚠️ force = ตอนตั้งค่าเริ่มต้น ต้องยิงเซิร์ฟเวอร์แม้ค่า plan จะตรงกับ state อยู่แล้ว
  // เคยพลาด: ตั้งต้น plan="12m" แล้ว pickPlan("12m") เด้งออกทันที → การ์ดไฮไลต์ 12 เดือน แต่ยอดยังเป็น 1,590
  async function pickPlan(k, force = false) {
    if (!orderId || (!force && k === plan)) return;
    const prev = plan; setPlan(k);
    try { const d = await api("/api/order/set-plan", { method: "POST", body: { order_id: orderId, plan: k } }); setPrice(d.amount_satang); setCodeMsg(null); }
    catch (e) { setPlan(prev); alert(e.message); }
  }
  useEffect(() => { if (orderId && plans.length) pickPlan("12m", true); }, [orderId, plans.length]);   // eslint-disable-line

  async function pay() {
    if (!orderId) return; setBusy(true);
    try { const d = await api("/api/create-payment-session", { method: "POST", body: { order_id: orderId } }); location.href = d.redirect_url; }
    catch (e) { alert(e.message); setBusy(false); }
  }
  async function useCode() {
    if (!code.trim()) { setCodeMsg({ k: "err", t: t("co_code_empty") }); return; }
    setCodeMsg({ k: "", t: t("co_code_checking") });
    try {
      const d = await api("/api/apply-code", { method: "POST", body: { order_id: orderId, code: code.trim().toUpperCase() } });
      if (d.free) { nav(d.redirect_url); return; }
      setPrice(d.final_satang); setCodeMsg({ k: "ok", t: `${t("co_code_ok_pre")}${d.percent}%` });
    } catch (e) { setCodeMsg({ k: "err", t: e.message }); }
  }

  const isMock = !order || order.provider === "mock";
  return (
    <div className="wrap narrow page-pad">
      <div className="brand">BABE HOUSE · SECURE CHECKOUT</div>
      <h1 className="page">{t("co_title")}</h1>
      <p className="sub">{t("co_sub")}</p>
      <div className="card">
        {/* เลือกแพ็ก — ยิ่งยาวยิ่งถูก และแผนยิ่งแม่นเพราะระบบเรียนรู้จากคลิปที่ลงจริงทุกเดือน */}
        {plans.length > 0 && <>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{t("co_pick_plan")}</div>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 12px", lineHeight: 1.7 }}>{t("co_pick_plan_sub")}</p>
          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            {plans.map(p => {
              const on = plan === p.plan;
              return <button key={p.plan} type="button" onClick={() => pickPlan(p.plan)}
                style={{ position: "relative", textAlign: "left", cursor: "pointer", borderRadius: 14, padding: "14px 16px",
                  border: `2px solid ${on ? "var(--blue)" : "var(--border)"}`, background: on ? "#EAF3FD" : "#fff" }}>
                {p.off > 0 && <span style={{ position: "absolute", top: -9, right: 12, background: p.off >= 50 ? "#1a7f43" : "#B26A00", color: "#fff", fontSize: 11.5, fontWeight: 800, padding: "3px 10px", borderRadius: 999 }}>
                  {t("co_save")} {p.off}%
                </span>}
                <div className="between" style={{ alignItems: "flex-start", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15.5 }}>{t("co_plan_name")[p.plan]}</div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                      {p.months > 1 ? `${t("co_permonth_a")} ${p.per_month.toLocaleString()}฿ ${t("co_permonth_b")}` : t("co_monthly_note")}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 21, fontWeight: 800, color: on ? "var(--blue-d)" : "var(--ink)" }}>{p.baht.toLocaleString()}฿</div>
                    {p.months > 1 && <div className="muted" style={{ fontSize: 11.5, textDecoration: "line-through" }}>{(1590 * p.months).toLocaleString()}฿</div>}
                  </div>
                </div>
              </button>;
            })}
          </div>
        </>}
        <div className="between" style={{ background: "var(--soft)", borderRadius: 14, padding: 14, marginBottom: 12 }}>
          <span>{t("co_total")}</span><span style={{ fontSize: 26, fontWeight: 800, color: "var(--blue-d)" }}>{baht(price)}</span>
        </div>
        <p className="muted" style={{ fontSize: 12, textAlign: "right", margin: "-6px 0 12px" }}>{t("co_vat_note")}</p>
        {order?.discount_percent > 0 && order.discount_percent < 100 && <p style={{ textAlign: "right", color: "var(--up)", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{order.discount_percent}% {t("co_off")}</p>}
        {isMock ? <>
          <button className="btn full" onClick={pay} disabled={busy} style={{ marginBottom: 10 }}>{t("co_pay_mock")}</button>
        </> : <button className="btn full" onClick={pay} disabled={busy}>{t("co_pay")}</button>}

        {plan !== "monthly" ? <p className="muted" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.7 }}>{t("co_code_longplan")}</p> : <>
        <div className="row" style={{ margin: "18px 0 10px", color: "var(--muted)", fontSize: 12 }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />{t("co_or_code")}<div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>
        <div className="row">
          <input style={{ flex: 1, textTransform: "uppercase" }} value={code} onChange={e => setCode(e.target.value)} placeholder={t("co_code_ph")} />
          <button className="btn" onClick={useCode} style={{ padding: "13px 20px" }}>{t("co_use_code")}</button>
        </div>
        {codeMsg && <p style={{ fontSize: 13, marginTop: 8, color: codeMsg.k === "err" ? "var(--down)" : codeMsg.k === "ok" ? "var(--up)" : "var(--muted)" }}>{codeMsg.t}</p>}
        </>}
      </div>
    </div>
  );
}
