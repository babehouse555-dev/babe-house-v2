import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, session } from "../api.js";
import { useI18n } from "../i18n.jsx";

// จำว่าลูกค้าเปิดเล่มไหนแล้ว (localStorage) — เล่มใหม่ที่ยังไม่เปิด = เด่น, เปิดแล้ว = ปกติ
const isOpened = (id) => { try { return JSON.parse(localStorage.getItem("babe_opened") || "[]").includes(id); } catch { return false; } };
const markOpened = (id) => { try { const a = JSON.parse(localStorage.getItem("babe_opened") || "[]"); if (!a.includes(id)) { a.push(id); localStorage.setItem("babe_opened", JSON.stringify(a)); } } catch {} };

export default function Account() {
  const { t } = useI18n();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [msg, setMsg] = useState(null);
  const [data, setData] = useState(null);
  const [ref, setRef] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (session.token) loadMonths(); }, []);
  // ถ้ามีเล่มกำลังสร้าง → รีเฟรชเองทุก 15 วิ จนกว่าจะเสร็จ (ลูกค้าไม่ต้องกดเอง)
  useEffect(() => {
    if (step !== "list" || !(data?.pending || []).length) return;
    const t = setInterval(() => { if (session.token) loadMonths(); }, 15000);
    return () => clearInterval(t);
  }, [step, data?.pending?.length]);

  async function loadMonths() {
    try {
      const d = await api("/api/me/blueprints", { token: session.token });
      setData(d); setStep("list");
      api("/api/me/referral", { token: session.token }).then(setRef).catch(() => {});
    } catch { session.clear(); setStep("email"); }
  }
  async function sendCode() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setMsg({ k: "err", t: t("ac_email_invalid") }); return; }
    setBusy(true); setMsg(null);
    try { const d = await api("/api/auth/request-otp", { method: "POST", body: { email: email.trim().toLowerCase() } }); setDevCode(d.dev_code || ""); setStep("otp"); }
    catch (e) { setMsg({ k: "err", t: e.message }); } finally { setBusy(false); }
  }
  async function verify() {
    if (code.length !== 6) { setMsg({ k: "err", t: t("ac_otp_len") }); return; }
    setBusy(true); setMsg(null);
    try { const d = await api("/api/auth/verify-otp", { method: "POST", body: { email: email.trim().toLowerCase(), code } }); session.set(d.token, d.email); await loadMonths(); }
    catch (e) { setMsg({ k: "err", t: e.message }); } finally { setBusy(false); }
  }
  function logout() { session.clear(); setData(null); setStep("email"); }
  async function deleteBook(bpId, cycle) {
    if (!window.confirm(`${t("ac_delete_confirm_a")} ${String(cycle).replace("_", " ")}${t("ac_delete_confirm_b")}`)) return;
    try { await api("/api/me/delete-book", { method: "POST", token: session.token, body: { blueprint_id: bpId } }); loadMonths(); }
    catch (e) { alert(e.message || t("ac_delete_fail")); }
  }
  // สร้างลิงก์จาก origin จริงของเบราว์เซอร์ — ถูกเสมอแม้ APP_BASE_URL บนเซิร์ฟเวอร์จะไม่ถูกตั้ง
  const refLink = ref ? `${window.location.origin}/?ref=${encodeURIComponent(ref.code)}` : "";
  const [copied, setCopied] = useState("");
  const shareMsg = ref ? `${t("ac_share_msg")} ${ref.percent}% ${t("ac_share_msg_tail")}\n${refLink}` : "";
  function copyRef() { if (refLink) { navigator.clipboard.writeText(refLink); setCopied("link"); setTimeout(() => setCopied(""), 1800); } }
  function copyMsg() { if (shareMsg) { navigator.clipboard.writeText(shareMsg); setCopied("msg"); setTimeout(() => setCopied(""), 1800); } }
  function shareNative() { if (navigator.share) navigator.share({ text: shareMsg }).catch(() => {}); else copyMsg(); }
  const lineShare = ref ? `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(refLink)}` : "";

  return (
    <div className="wrap narrow page-pad">
      <div className="brand">BABE HOUSE · ACADEMY</div>
      <h1 className="page">{t("ac_title")}</h1>
      <p className="sub">{t("ac_sub")}</p>

      {step === "email" && <div className="card">
        <div className="field"><label>{t("ac_email_label")}</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" /></div>
        <button className="btn full" onClick={sendCode} disabled={busy}>{t("ac_send_code")}</button>
        {msg && <div className={`msg ${msg.k}`}>{msg.t}</div>}
      </div>}

      {step === "otp" && <div className="card">
        <label>{t("ac_otp_label_pre")} <b style={{ color: "var(--blue)" }}>{email}</b></label>
        <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="______" style={{ letterSpacing: 8, textAlign: "center", fontSize: 22 }} />
        {devCode && <div className="msg" style={{ background: "#fff7e6", color: "#8a6d1f", border: "1px dashed #e0b85b" }}>{t("ac_dev_mode_pre")} <b style={{ fontSize: 18 }}>{devCode}</b></div>}
        <button className="btn full" onClick={verify} disabled={busy} style={{ marginTop: 12 }}>{t("ac_verify")}</button>
        <button className="link" onClick={() => setStep("email")} style={{ background: "none", border: 0, marginTop: 12 }}>{t("ac_change_email")}</button>
        {msg && <div className={`msg ${msg.k}`}>{msg.t}</div>}
      </div>}

      {step === "list" && data && <>
        <div className="between" style={{ marginBottom: 14 }}><span className="muted">{t("ac_books_of_pre")} <b>{data.email}</b></span><button className="link" onClick={logout} style={{ background: "none", border: 0 }}>{t("ac_logout")}</button></div>
        {(data.pending || []).map(p => p.status === "error"
          ? <div key={p.order_id} className="card" style={{ background: "#fff7e6", border: "1px solid #e8d49a" }}>
              <div style={{ fontWeight: 800, color: "#8a6d1f" }}>⚠️ {p.billing_cycle.replace("_", " ")} — {t("ac_pending_err_title")}</div>
              <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{t("ac_pending_err_sub")}</div>
              <Link className="btn full" to={`/processing?order_id=${encodeURIComponent(p.order_id)}`} style={{ marginTop: 12, background: "#8a6d1f" }}>{t("ac_view_status")}</Link>
            </div>
          : <div key={p.order_id} className="card" style={{ background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", border: "1px solid #d6e7fa" }}>
              <div className="row" style={{ gap: 12, alignItems: "center" }}>
                <div className="spinner" style={{ width: 24, height: 24, flexShrink: 0 }} />
                <div><div style={{ fontWeight: 800, color: "var(--blue-d)" }}>{t("ac_pending_title")}</div><div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>{p.billing_cycle.replace("_", " ")} {t("ac_pending_sub")}</div></div>
              </div>
              <Link className="btn full" to={`/processing?order_id=${encodeURIComponent(p.order_id)}`} style={{ marginTop: 12 }}>{t("ac_view_gen_status")}</Link>
            </div>)}
        {(data.channels || []).length === 0 && (data.pending || []).length === 0 && <div className="card center muted">{t("ac_no_books")}</div>}

        {(data.channels || []).length > 0 && <div className="muted" style={{ fontSize: 13, fontWeight: 700, margin: "4px 0 8px" }}>{t("ac_my_channels")} ({(data.channels || []).length})</div>}
        {(data.channels || []).map(ch => {
          const months = ch.months.slice().reverse(); // ใหม่ → เก่า
          const anyFresh = months.some(m => !isOpened(m.blueprint_id));
          return <div key={ch.channel} className="card" style={anyFresh ? { borderTop: "4px solid #2C8E8C" } : undefined}>
            <div className="row" style={{ gap: 11, alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 22 }}>📺</span>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 15.5 }}>{ch.channel}</div><div className="muted" style={{ fontSize: 12.5 }}>{ch.count} {t("ac_months_suffix")}</div></div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {months.map((m, i) => {
                const fresh = !isOpened(m.blueprint_id);
                const to = `/dashboard?user_id=${encodeURIComponent(m.user_id)}&billing_cycle=${encodeURIComponent(m.billing_cycle)}&blueprint_id=${encodeURIComponent(m.blueprint_id)}`;
                return <div key={m.blueprint_id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Link onClick={() => markOpened(m.blueprint_id)} to={to} style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none", borderRadius: 12, padding: "12px 14px", background: fresh ? "linear-gradient(135deg,#EAF3FD,#F4F9FF)" : "var(--bg-soft,#f7f7f8)", border: fresh ? "1px solid #d6e7fa" : "1px solid var(--border)", color: "inherit" }}>
                    <div><span style={{ fontWeight: 700, fontSize: 14.5 }}>{m.billing_cycle.replace("_", " ")}{i === 0 ? t("ac_latest") : ""}</span>{fresh && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, background: "#2C8E8C", color: "#fff", borderRadius: 20, padding: "2px 8px" }}>{t("ac_new_badge")}</span>}</div>
                    <span style={{ color: "var(--blue)", fontSize: 18 }}>›</span>
                  </Link>
                  <button onClick={() => deleteBook(m.blueprint_id, m.billing_cycle)} title="ลบเล่มนี้" style={{ background: "none", border: 0, cursor: "pointer", color: "#b9b9c2", fontSize: 16, padding: "8px 6px", flexShrink: 0 }}>🗑️</button>
                </div>;
              })}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Link className="btn" to={`/form?renew=1&email=${encodeURIComponent(data.email)}&channel=${encodeURIComponent(ch.channel)}`} style={{ flex: 1, fontSize: 13, padding: "10px" }}>{t("ac_renew")}</Link>
              {ch.count >= 1 && <Link className="btn ghost" to={`/compare?channel=${encodeURIComponent(ch.channel)}`} style={{ flex: 1, fontSize: 13, padding: "10px" }}>{t("ac_see_growth")}</Link>}
            </div>
          </div>;
        })}

        <Link className="card center" to={`/form?email=${encodeURIComponent(data.email)}`} style={{ color: "var(--blue)", fontWeight: 700, display: "block", border: "1.5px dashed var(--blue)", background: "#F4F8FD" }}>{t("ac_add_channel")}</Link>
        {ref && <div className="card" style={{ background: "linear-gradient(135deg,#E4F4F3,#EAF3FD)", border: "1px solid #bfe3df", borderTop: "4px solid #2C8E8C" }}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 2 }}>{t("ac_ref_title")}</div>
          <div className="muted" style={{ fontSize: 13.5, marginBottom: 14, lineHeight: 1.6 }}>{t("ac_ref_desc_a")} <b style={{ color: "#2C8E8C" }}>{t("ac_ref_desc_b")} {ref.percent}% {t("ac_ref_desc_c")}</b> <b style={{ color: "#2C8E8C" }}>{t("ac_ref_desc_d")}</b> {t("ac_ref_desc_e")}</div>
          <div className="row" style={{ marginBottom: 10 }}><input readOnly value={refLink} style={{ flex: 1, fontSize: 13 }} onFocus={e => e.target.select()} /><button className="btn" onClick={copyRef} style={{ padding: "11px 16px", background: "#2C8E8C" }}>{copied === "link" ? t("ac_copied_link") : t("ac_copy_link")}</button></div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn ghost" onClick={copyMsg} style={{ padding: "9px 14px", fontSize: 14 }}>{copied === "msg" ? t("ac_copied_msg") : t("ac_copy_msg")}</button>
            <a className="btn" href={lineShare} target="_blank" rel="noreferrer" style={{ padding: "9px 16px", background: "#06C755", fontSize: 14 }}>{t("ac_share_line")}</a>
            {typeof navigator !== "undefined" && navigator.share && <button className="btn ghost" onClick={shareNative} style={{ padding: "9px 14px", fontSize: 14 }}>{t("ac_share")}</button>}
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>{t("ac_ref_count_pre")} <b style={{ color: "#2C8E8C" }}>{ref.count}</b> {t("ac_people")}{ref.count > 0 ? t("ac_ref_thanks") : ""}</div>
        </div>}
      </>}
    </div>
  );
}
