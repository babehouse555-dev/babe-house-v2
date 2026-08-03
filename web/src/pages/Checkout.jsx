import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api, baht, track } from "../api.js";
import { useI18n } from "../i18n.jsx";
import { PlanCards } from "../PlanCards.jsx";

export default function Checkout() {
  const { t } = useI18n();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const orderId = sp.get("order_id");
  const [order, setOrder] = useState(null);
  const [code, setCode] = useState("");
  const [codeMsg, setCodeMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  // 🧾 ใบกำกับภาษี — คิมสั่ง 3 ส.ค.: ออกให้ทุกคนอยู่แล้วด้วยชื่อที่มี
  // ติ๊กช่องนี้เฉพาะคนที่ต้องการ "ในนามบริษัท" จะได้ไม่ต้องให้ลูกค้าทั่วไปกรอกเยอะ
  const [wantCompany, setWantCompany] = useState(false);
  const [taxF, setTaxF] = useState({ name: "", tax_id: "", branch: "สำนักงานใหญ่", address: "" });
  const [taxMsg, setTaxMsg] = useState(null);
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
  // ตั้งต้นตามแพ็กที่ลูกค้าเลือกมาจากหน้าแรก ถ้าไม่ได้เลือกมาให้ตั้งที่คุ้มที่สุด
  useEffect(() => {
    if (!orderId || !plans.length || !order) return;
    // เลือกมาจากหน้าแรก = เคารพที่เขาเลือก · ยังไม่ได้เลือก = ตั้งที่คุ้มที่สุดให้ (กดเปลี่ยนได้ 1 ครั้ง)
    pickPlan(order.plan_chosen ? order.plan : "12m", true);
  }, [orderId, plans.length, order?.order_id]);   // eslint-disable-line

  async function pay() {
    if (!orderId) return;
    setBusy(true); setTaxMsg(null);
    try {
      // บันทึกข้อมูลใบกำกับก่อนจ่าย — จ่ายแล้วแก้ไม่ได้ (ใบออกอัตโนมัติทันทีที่เงินเข้า)
      if (wantCompany) {
        await api("/api/order/tax-info", { method: "POST", body: { order_id: orderId, is_company: true, ...taxF } });
      }
      const d = await api("/api/create-payment-session", { method: "POST", body: { order_id: orderId } });
      location.href = d.redirect_url;
    } catch (e) { setTaxMsg({ k: "err", t: e.message }); setBusy(false); }
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
    <div className="wrap page-pad">
      <div className="brand">BABE HOUSE · SECURE CHECKOUT</div>
      <h1 className="page">{t("co_title")}</h1>
      <p className="sub">{t("co_sub")}</p>

      {/* เลือกแพ็ก — 3 ช่องเรียงกัน เทียบง่ายในตาเดียว ไม่ต้องเลื่อนลงไปดู (คิมสั่ง 3 ส.ค.)
          จอแคบจะเรียงลงมาเองอัตโนมัติ */}
      {plans.length > 0 && <div style={{ marginBottom: 26 }}>
        <div className="center" style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>{t("co_pick_plan")}</div>
        <p className="center muted" style={{ fontSize: 13.5, margin: "0 auto 24px", lineHeight: 1.7, maxWidth: 620 }}>{t("co_pick_plan_sub")}</p>
        <PlanCards selected={plan} onPick={pickPlan} busy={busy} />
      </div>}

      <div className="card" style={{ maxWidth: 460, margin: "0 auto" }}>
        <div className="between" style={{ background: "var(--soft)", borderRadius: 14, padding: 14, marginBottom: 12 }}>
          <span>{t("co_total")}</span><span style={{ fontSize: 26, fontWeight: 800, color: "var(--blue-d)" }}>{baht(price)}</span>
        </div>
        <p className="muted" style={{ fontSize: 12, textAlign: "right", margin: "-6px 0 12px" }}>{t("co_vat_note")}</p>
        {order?.discount_percent > 0 && order.discount_percent < 100 && <p style={{ textAlign: "right", color: "var(--up)", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{order.discount_percent}% {t("co_off")}</p>}
        {/* 🧾 ใบกำกับภาษี — ออกให้ทุกคนอยู่แล้ว ติ๊กเฉพาะคนที่ต้องการในนามบริษัท */}
        <div style={{ background: "var(--soft)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
          <label className="row" style={{ gap: 9, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
            <input type="checkbox" style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
              checked={wantCompany} onChange={e => { setWantCompany(e.target.checked); setTaxMsg(null); }} />
            <span>ต้องการ<b>ใบกำกับภาษีในนามบริษัท</b>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.6 }}>
                ไม่ติ๊กก็ได้ใบกำกับนะคะ — ระบบออกให้อัตโนมัติในนามของคุณทุกครั้งที่ชำระเงิน
              </div>
            </span>
          </label>
          {wantCompany && <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <input placeholder="ชื่อบริษัท (เช่น บริษัท เอบีซี จำกัด)" value={taxF.name}
              onChange={e => setTaxF(v => ({ ...v, name: e.target.value }))} />
            <input inputMode="numeric" placeholder="เลขประจำตัวผู้เสียภาษี 13 หลัก" value={taxF.tax_id}
              onChange={e => setTaxF(v => ({ ...v, tax_id: e.target.value.replace(/\D/g, "").slice(0, 13) }))} />
            <input placeholder="สำนักงานใหญ่ / สาขาที่ ..." value={taxF.branch}
              onChange={e => setTaxF(v => ({ ...v, branch: e.target.value }))} />
            <textarea placeholder="ที่อยู่บริษัทตามที่จดทะเบียน" value={taxF.address} style={{ minHeight: 62 }}
              onChange={e => setTaxF(v => ({ ...v, address: e.target.value }))} />
            <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>
              ⚠️ ตรวจให้ถูกก่อนชำระเงินนะคะ — ใบกำกับจะออกทันทีที่ชำระสำเร็จ แก้เองทีหลังไม่ได้ค่ะ
            </p>
          </div>}
        </div>
        {taxMsg && <div className="msg" style={{ background: "#fde8e8", color: "#b42318", marginBottom: 10 }}>{taxMsg.t}</div>}

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
