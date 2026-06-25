import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api, fileToBase64, baht, session } from "../api.js";
import { useI18n } from "../i18n.jsx";

function AuditView({ a, blurred }) {
  const { t } = useI18n();
  return (
    <div style={{ position: "relative" }}>
      <div style={{ filter: blurred ? "blur(6px)" : "none", pointerEvents: blurred ? "none" : "auto", userSelect: blurred ? "none" : "auto" }}>
        <div className="card" style={{ background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", border: "1px solid #d6e7fa" }}>
          <div style={{ fontWeight: 800, color: "var(--blue-d)", marginBottom: 6 }}>{t("va_first_impression")}</div>
          <div style={{ fontSize: 15, lineHeight: 1.7 }}>{a.first_impression}</div>
        </div>
        {t("va_sections").map(([ic, label, k]) => a[k] && (
          <div key={k} className="card">
            <div className="row" style={{ gap: 10, marginBottom: 8 }}><span style={{ fontSize: 22 }}>{ic}</span><h3 style={{ margin: 0, fontSize: 16 }}>{label}</h3></div>
            <div style={{ background: "var(--soft)", borderRadius: 12, padding: "10px 14px", marginBottom: 8 }}><div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--muted)", marginBottom: 3 }}>{t("va_what_sees")}</div><div style={{ fontSize: 14 }}>{a[k].observation}</div></div>
            <div style={{ background: "#eef7f0", borderRadius: 12, padding: "10px 14px" }}><div style={{ fontWeight: 700, fontSize: 12.5, color: "#1a7f43", marginBottom: 3 }}>{t("va_how_fix")}</div><div style={{ fontSize: 14 }}>{a[k].fix}</div></div>
          </div>
        ))}
        {a.top_fixes?.length > 0 && <div className="card" style={{ border: "1px solid var(--blue)" }}><h3 style={{ marginBottom: 10 }}>{t("va_top3")}</h3>
          {a.top_fixes.map((fx, i) => <div key={i} className="row" style={{ gap: 10, margin: "8px 0" }}><span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--blue)", color: "#fff", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span><span style={{ fontSize: 14.5 }}>{fx}</span></div>)}
        </div>}
        {a.encouragement && <div className="card" style={{ background: "#FBF9F4", fontStyle: "italic", fontSize: 14.5, lineHeight: 1.7 }}>💛 {a.encouragement}</div>}
      </div>
    </div>
  );
}

export default function VideoAudit() {
  const { t } = useI18n();
  const SAMPLE = t("va_sample");
  const [sp] = useSearchParams();
  const orderId = sp.get("order_id");
  const [phase, setPhase] = useState(orderId ? "loading" : "intro");
  const [email, setEmail] = useState(session.email || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [file, setFile] = useState(null);
  const [context, setContext] = useState("");
  const [audit, setAudit] = useState(null);
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [showSample, setShowSample] = useState(false);

  useEffect(() => { if (orderId) refresh(); }, [orderId]);

  async function refresh() {
    try {
      const d = await api(`/api/video-audit/${orderId}`);
      if (d.audit_status === "ready" && d.audit) { setAudit(d.audit); return setPhase("ready"); }
      if (d.audit_status === "analyzing") { setPhase("analyzing"); return poll(); }
      if (d.paid) { // จ่ายแล้ว — มีคลิปเก็บไว้แล้ว → เริ่มวิเคราะห์เลย
        if (d.has_video || d.audit_status === "uploaded") return startAnalysis();
        return setPhase("upload"); // จ่ายแล้วแต่คลิปหาย (เคสหายาก) → ให้อัปใหม่
      }
      return d.has_video ? setPhase("needpay") : setPhase("intro"); // ยังไม่จ่าย: อัปแล้ว→รอจ่าย, ยังไม่อัป→หน้าแนะนำ
    } catch { setPhase("intro"); }
  }

  // flow ใหม่: อัปคลิปก่อน → แล้วค่อยไปจ่าย (จ่ายเสร็จ AI ถึงเริ่มวิเคราะห์)
  async function submitUpload() {
    setErr("");
    if (!file) { setErr(t("va_err_pick")); return; }
    if (file.size > 24 * 1024 * 1024) { setErr(t("va_err_big")); return; }
    if (!email.trim()) { setErr(t("va_err_email")); return; }
    setBusy(true);
    try {
      const c = await api("/api/video-audit/create", { method: "POST", body: { email: email.trim().toLowerCase() } });
      const video = await fileToBase64(file);
      await api("/api/video-audit/upload", { method: "POST", body: { order_id: c.order_id, video, mime: file.type || "video/mp4", context } });
      if (showCode && code.trim()) { // มีโค้ด → ลองใช้ก่อน ถ้าฟรีข้ามจ่ายเลย
        const r = await api("/api/apply-code", { method: "POST", body: { order_id: c.order_id, code: code.trim() } });
        if (r.free) { window.location.href = `/video-audit?order_id=${encodeURIComponent(c.order_id)}`; return; }
      }
      const pay = await api("/api/create-payment-session", { method: "POST", body: { order_id: c.order_id } });
      window.location.href = pay.redirect_url;
    } catch (e) { setErr(e.message || t("va_err_upload")); setBusy(false); }
  }

  async function payExisting() { // กลับมาหน้าที่อัปคลิปแล้วแต่ยังไม่จ่าย
    setBusy(true); setErr("");
    try { const pay = await api("/api/create-payment-session", { method: "POST", body: { order_id: orderId } }); window.location.href = pay.redirect_url; }
    catch (e) { setErr(e.message); setBusy(false); }
  }

  async function startAnalysis() { // จ่ายแล้ว → สั่ง AI วิเคราะห์คลิปที่เก็บไว้
    setPhase("analyzing"); setErr("");
    try { await api("/api/video-audit/analyze", { method: "POST", body: { order_id: orderId } }); poll(); }
    catch (e) { setErr(e.message || t("va_err_start")); }
  }

  function poll() {
    let n = 0;
    const iv = setInterval(async () => {
      n++;
      try {
        const d = await api(`/api/video-audit/${orderId}`);
        if (d.audit_status === "ready" && d.audit) { clearInterval(iv); setAudit(d.audit); setPhase("ready"); }
        else if (d.audit_status === "error" || d.audit_status === "uploaded") { clearInterval(iv); setErr(t("va_err_poll")); setPhase("analyzeretry"); }
      } catch {}
      if (n > 75) { clearInterval(iv); setErr(t("va_err_slow")); }
    }, 4000);
  }

  return (
    <div className="wrap narrow page-pad">
      <div className="brand">BABE HOUSE · VIDEO AUDIT</div>
      <h1 className="page">{t("va_h1")}</h1>

      {phase === "loading" && <div className="card center muted">{t("va_loading")}</div>}

      {phase === "intro" && <>
        <p className="sub">{t("va_intro_sub")}</p>
        <div className="card">
          <h3 style={{ margin: "0 0 10px" }}>{t("va_checklist_title")}</h3>
          {t("va_checklist").map(([ic, title, d], i) =>
            <div key={i} className="row" style={{ gap: 11, alignItems: "flex-start", padding: "8px 0", borderTop: i ? "1px solid var(--border)" : 0 }}>
              <span style={{ fontSize: 20 }}>{ic}</span><div><div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div><div className="muted" style={{ fontSize: 12.5 }}>{d}</div></div>
            </div>)}
        </div>

        <div className="center" style={{ margin: "4px 0 8px" }}>
          <button type="button" onClick={() => setShowSample(s => !s)} style={{ background: "none", border: 0, color: "var(--blue)", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>👀 {showSample ? t("va_hide_sample") : t("va_see_sample")}</button>
        </div>
        {showSample && <><div className="card" style={{ background: "#eef7f0", border: "1px dashed #9ed3b0", color: "#1a7f43" }}>{t("va_sample_note")}</div><AuditView a={SAMPLE} /></>}

        <div className="card" style={{ border: "1px solid var(--blue)", marginTop: 8 }}>
          <div className="row" style={{ alignItems: "baseline", gap: 8, marginBottom: 4 }}><div style={{ fontSize: 30, fontWeight: 800, color: "var(--blue)" }}>{baht(19900)}</div><span className="muted">{t("va_per_clip")}</span></div>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>{t("va_intro_pay_note")}</p>
          <button className="btn full" onClick={() => { setErr(""); setPhase("upload"); }}>{t("va_start")}</button>
        </div>
      </>}

      {phase === "upload" && <>
        <div className="card">
          <h3 style={{ margin: "0 0 4px" }}>{t("va_upload_title")}</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{t("va_upload_step_a")} {baht(19900)} {t("va_upload_step_b")}</p>
          <div className="field"><label>{t("va_upload_label")}</label>
            <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={e => setFile(e.target.files?.[0] || null)} />
            {file && <div className="hint">{t("va_selected")} {file.name} ({(file.size / 1048576).toFixed(1)}MB)</div>}
          </div>
          <div className="field"><label>{t("va_email_label")}</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" /></div>
          <div className="field"><label>{t("va_context_label")} <span className="muted">{t("va_optional")}</span></label><textarea value={context} onChange={e => setContext(e.target.value)} style={{ minHeight: 64 }} placeholder={t("va_context_ph")} /></div>
          {err && <div className="msg err">{err}</div>}
          <button className="btn full" disabled={busy} onClick={submitUpload}>{busy ? t("va_uploading") : `${t("va_next_pay_a")} ${baht(19900)} ${t("va_next_pay_b")}`}</button>
          <p className="center muted" style={{ fontSize: 13, margin: "10px 0 0" }}>{t("va_pay_methods")}</p>
          {!showCode
            ? <div className="center" style={{ marginTop: 8 }}><button type="button" onClick={() => { setShowCode(true); setErr(""); }} style={{ background: "none", border: 0, color: "var(--blue)", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>{t("va_have_code")}</button></div>
            : <div style={{ borderTop: "1px dashed var(--border)", marginTop: 10, paddingTop: 12 }}>
                <div className="field" style={{ marginBottom: 0 }}><label>{t("va_code_label")}</label><input value={code} onChange={e => setCode(e.target.value)} placeholder="BABETEAM" style={{ textTransform: "uppercase" }} /></div>
                <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>{t("va_code_note")}</p>
              </div>}
        </div>
      </>}

      {phase === "needpay" && <>
        <div className="card" style={{ background: "#eef7f0", border: "1px solid #bfe3cc", color: "#1a7f43", fontWeight: 700 }}>{t("va_uploaded_ok")}</div>
        <div className="card" style={{ border: "1px solid var(--blue)" }}>
          <div className="row" style={{ alignItems: "baseline", gap: 8, marginBottom: 12 }}><div style={{ fontSize: 30, fontWeight: 800, color: "var(--blue)" }}>{baht(19900)}</div><span className="muted">{t("va_per_clip2")}</span></div>
          {err && <div className="msg err">{err}</div>}
          <button className="btn full" disabled={busy} onClick={payExisting}>{busy ? t("va_processing") : `${t("va_pay_unlock_a")} ${baht(19900)} ${t("va_pay_unlock_b")}`}</button>
          <p className="center muted" style={{ fontSize: 13, margin: "10px 0 0" }}>{t("va_pay_methods2")}</p>
        </div>
      </>}

      {phase === "analyzeretry" && <div className="card center" style={{ padding: "30px 20px" }}>
        <div style={{ fontSize: 36 }}>😅</div>
        <h3 style={{ margin: "10px 0 6px" }}>{t("va_fail_title")}</h3>
        {err && <p className="muted" style={{ fontSize: 14 }}>{err}</p>}
        <button className="btn" style={{ marginTop: 12 }} onClick={startAnalysis}>{t("va_retry")}</button>
      </div>}

      {phase === "analyzing" && <div className="card center" style={{ padding: "40px 20px" }}>
        <div style={{ fontSize: 40 }}>🎬</div>
        <h3 style={{ margin: "10px 0 6px" }}>{t("va_analyzing_title")}</h3>
        <p className="muted" style={{ fontSize: 14 }}>{t("va_analyzing_sub")}</p>
      </div>}

      {phase === "ready" && audit && <>
        <div className="card" style={{ background: "#eef7f0", border: "1px solid #bfe3cc", color: "#1a7f43", fontWeight: 700 }}>{t("va_done")}</div>
        <AuditView a={audit} />
        <div className="card center" style={{ marginTop: 8 }}>
          <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>{t("va_again_note")}</p>
          <Link className="btn" to="/video-audit">{t("va_again_btn")}</Link>
        </div>
      </>}
    </div>
  );
}
