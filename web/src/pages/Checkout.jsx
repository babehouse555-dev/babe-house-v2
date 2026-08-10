import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api, baht, track } from "../api.js";
import { useI18n } from "../i18n.jsx";
import { PlanCards } from "../PlanCards.jsx";
import TaxInvoiceBox, { validateTax } from "../TaxInvoiceBox.jsx";
import { TAX_INVOICE_LIVE } from "../config.js";

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
  const [taxF, setTaxF] = useState(null);   // null = ไม่ได้ขอในนามบริษัท
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
      const bad = validateTax(taxF);
      if (bad) { setTaxMsg({ k: "err", t: bad }); setBusy(false); return; }
      if (taxF) {
        await api("/api/order/tax-info", { method: "POST", body: { order_id: orderId, ...taxF } });
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
        {/* ⛔ เอาป้าย "N% แล้ว" ออก (คิมทัก 3 ส.ค.) — มันอ่านจาก order ที่โหลดมาตอนเปิดหน้า
            พอกดสลับแพ็ก ยอดเปลี่ยนแต่ป้ายไม่เปลี่ยน → ขึ้นเลขเก่าค้างไว้ เช่นจ่าย 9,540 แต่ป้ายบอก 10%
            ส่วนลดจริงโชว์อยู่บนการ์ดแพ็กแล้ว (−30% / −50%) และโค้ดส่วนลดมีข้อความบอกแยกอยู่แล้ว */
        }
        {TAX_INVOICE_LIVE && <TaxInvoiceBox onChange={setTaxF} />}
        {taxMsg && <div className="msg" style={{ background: "#fde8e8", color: "#b42318", marginBottom: 10 }}>{taxMsg.t}</div>}

        {isMock ? <>
          <button className="btn full" onClick={pay} disabled={busy} style={{ marginBottom: 10 }}>{t("co_pay_mock")}</button>
        </> : <button className="btn full" onClick={pay} disabled={busy}>{t("co_pay")}</button>}

        {/* ⏳ เตือนเรื่อง QR หมดอายุ — ต้นเหตุที่ลูกค้าจ่ายไม่ผ่านมากที่สุด (เจอ 77 คนใน 14 วัน)
            เคสจริง 6 ส.ค.: ลูกค้าสแกน QR ที่หมดอายุแล้ว เงินออกจากบัญชีแต่ไม่ถึงเรา
            บอกล่วงหน้าถูกกว่าตามแก้ทีหลังเยอะ */}
        {!isMock && <div style={{ background: "#fff8ed", border: "1px solid #f5dfb8", borderRadius: 12,
          padding: "11px 13px", marginTop: 12, fontSize: 12.5, lineHeight: 1.75, color: "#7a5b23" }}>
          ⏳ <b>ถ้าจ่ายด้วยพร้อมเพย์</b> QR มีอายุจำกัดนะคะ กรุณา<b>สแกนจ่ายให้เสร็จในครั้งเดียว</b> และอย่าปิดหน้าจอระหว่างรอค่ะ<br />
          ถ้า QR หมดอายุแล้ว <b>อย่าสแกนอันเดิม</b> ให้กลับมากดจ่ายใหม่เพื่อขอ QR อันใหม่ค่ะ — สแกนอันที่หมดอายุแล้วเงินจะไม่ถึงเรา
        </div>}

        {/* 🆘 ทางออกให้ลูกค้าที่จ่ายแล้วแต่ระบบไม่รู้ — เดิมต้องไปทักไอจีถึงจะมีคนตามให้ */}
        <PaidReport orderId={orderId} />

        {/* 🎟️ ใส่โค้ดได้ทุกแพ็ก — คิมสั่ง 10 ส.ค. "หน้าอัพแพ็ก อยากให้มีใส่โค้ดด้วย"
            เดิมปิดไว้สำหรับแพ็ก 6/12 เดือน (กันลดซ้อนบนราคาที่ลด 30-50% อยู่แล้ว)
            ⚠️ ส่วนลดคิดจากราคาแพ็กนั้นจริงๆ แล้ว ไม่ใช่ราคารายเดือน (แก้ที่ applyCode ฝั่งเซิร์ฟเวอร์) */}
        {plan !== "monthly" && <p className="muted" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.7 }}>
          💡 แพ็กนี้ลดราคาให้แล้ว {}
          {plan === "12m" ? "50%" : "30%"} — ถ้ามีโค้ดส่วนลดอีก ใส่เพิ่มได้เลยค่ะ
        </p>}
        <>
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

// 🆘 "จ่ายแล้วแต่ยังไม่ได้เล่ม" — ลูกค้าแจ้งเองได้ตรงนี้ เรื่องเข้าเมลทีมทันที
// เคส 6 ส.ค.: ลูกค้าจ่ายแล้วเงียบไป 17 ชม. กว่าจะมีคนรู้ เพราะไม่มีช่องทางแจ้ง
function PaidReport({ orderId }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState("");
  const [msg, setMsg] = useState(null);
  const [sending, setSending] = useState(false);
  if (!orderId) return null;
  async function send() {
    setSending(true);
    try { const r = await api("/api/order/report-paid", { method: "POST", body: { order_id: orderId, detail } });
          setMsg({ ok: true, t: r.message }); }
    catch (e) { setMsg({ ok: false, t: e.message }); }
    setSending(false);
  }
  return (
    <div style={{ marginTop: 14, textAlign: "center" }}>
      {!open
        ? <button onClick={() => setOpen(true)}
            style={{ background: "none", border: 0, color: "var(--muted)", fontSize: 12.5, textDecoration: "underline",
                     cursor: "pointer", fontFamily: "inherit", padding: 4 }}>
            จ่ายเงินไปแล้วแต่ยังไม่ได้รับเล่ม? แจ้งเราที่นี่
          </button>
        : msg
          ? <div className="msg" style={{ background: msg.ok ? "#e7f6ec" : "#fde8e8", color: msg.ok ? "#166534" : "#b42318", fontSize: 13, textAlign: "left" }}>{msg.t}</div>
          : <div style={{ textAlign: "left", background: "var(--soft)", borderRadius: 12, padding: 13 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>แจ้งทีมงานว่าจ่ายเงินแล้ว</div>
              <p className="muted" style={{ fontSize: 12.5, margin: "0 0 9px", lineHeight: 1.7 }}>
                บอกเราหน่อยนะคะว่าจ่ายตอนไหน ด้วยวิธีอะไร ทีมงานจะตรวจสอบแล้วปลดล็อกให้ค่ะ
              </p>
              <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={3}
                placeholder="เช่น จ่ายพร้อมเพย์ 490 บาท เมื่อคืนประมาณ 4 ทุ่มครึ่ง มีสลิปค่ะ"
                style={{ width: "100%", fontSize: 13.5, fontFamily: "inherit" }} />
              <button className="btn full" onClick={send} disabled={sending} style={{ marginTop: 9 }}>
                {sending ? "กำลังส่ง..." : "ส่งให้ทีมงานตรวจสอบ"}
              </button>
            </div>}
    </div>
  );
}
