// ชิ้นส่วนของหน้า Dashboard ที่แยกออกมาให้ไฟล์หลักอ่านง่ายขึ้น (หน้าตาเหมือนเดิมทุกอย่าง)
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, session, filesToBase64 } from "../api.js";
import { useI18n } from "../i18n.jsx";

const LINE_ACADEMY = { id: "@babehouse_academy", url: "https://line.me/R/ti/p/%40babehouse_academy" };
const qrImg = (data) => `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(data)}`;

// ⚡ เพิ่มสคริปต์เดี่ยว (งานสปอนเซอร์/คอนเทนต์ด่วน นอกแผน 30 วัน) — ใช้ 1 เครดิต/สคริปต์
const SL = { HOOK: "#2E86DE", BODY: "#1a7f43", CTA: "#b8860b" };
const copyTxt = (txt) => navigator.clipboard?.writeText(txt);
function ScriptBlock({ s }) { // แสดงสคริปต์ 1 อัน (ใช้ทั้งอันที่เพิ่งสร้าง + ประวัติ)
  const { t } = useI18n();
  if (!s) return null;
  return <>
    <div className="between"><div style={{ fontWeight: 800, fontSize: 15 }}>{s.title || t("dp_script")}</div><button className="link" style={{ background: "none", border: 0, cursor: "pointer", fontSize: 13 }} onClick={() => copyTxt([...(s.beats || []).map(b => b.say), s.cap].filter(Boolean).join("\n\n"))}>{t("dp_copy")}</button></div>
    {(s.beats || []).map((b, i) => <div key={i} style={{ marginTop: 10 }}>
      <span style={{ background: SL[b.s] || "#888", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10 }}>{t("db_beat")[b.s] || b.s}</span>
      <div style={{ fontSize: 14, lineHeight: 1.6, marginTop: 5 }}>{b.say}</div>
      {b.vis && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>🎬 {b.vis}</div>}
    </div>)}
    {s.cap && <div style={{ marginTop: 12, fontSize: 13.5, background: "#fff", borderRadius: 8, padding: "10px 12px" }}><b>{t("dp_caption")}</b> {s.cap}</div>}
    {s.tip && <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>💡 {s.tip}</div>}
  </>;
}
export function AddScript({ channel, cycle, demo, startOpen }) {
  const { t, lang } = useI18n();
  const [credits, setCredits] = useState(null);
  const [open, setOpen] = useState(!!startOpen);
  const [brief, setBrief] = useState(""), [sponsor, setSponsor] = useState(""), [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [script, setScript] = useState(null);
  const [history, setHistory] = useState([]), [openId, setOpenId] = useState(null);
  const [buying, setBuying] = useState(false), [buyBusy, setBuyBusy] = useState(false);
  const loadCredits = () => api("/api/me/credits?" + new URLSearchParams({ ...(channel ? { channel } : {}), ...(cycle ? { cycle } : {}) }), { token: session.token }).then(d => { setCredits(d.credits); setHistory(d.scripts || []); }).catch(() => setCredits(0));
  useEffect(() => {
    if (demo) { setCredits(3); return; }
    loadCredits();
    if (typeof location !== "undefined" && location.search.includes("topup=ok")) { setOpen(true); const t1 = setTimeout(loadCredits, 2500), t2 = setTimeout(loadCredits, 7000); return () => { clearTimeout(t1); clearTimeout(t2); }; } // เติมเครดิตเสร็จ → รอ webhook แล้วรีเฟรชยอด
  }, []);
  async function buyPack(pack) {
    if (demo) { setErr(t("dp_demo_buy")); return; }
    setBuyBusy(true);
    try {
      const d = await api("/api/credits/checkout", { method: "POST", token: session.token, body: { pack, return_path: location.pathname + location.search } });
      if (d.redirect_url) window.location.href = d.redirect_url;
    } catch (e) { setErr(e.message || t("dp_err_checkout")); setBuyBusy(false); }
  }
  async function gen() {
    setErr(""); if (!brief.trim() && ![...files].length) { setErr(t("dp_err_brief")); return; }
    if (demo) { setErr(t("dp_demo_gen")); return; }
    setBusy(true); setScript(null);
    try {
      const brief_files = [...files].length ? await filesToBase64([...files], 3) : [];
      const d = await api("/api/credits/generate-script", { method: "POST", token: session.token, body: { channel, cycle, brief, sponsor, brief_files, lang } });
      setScript(d.script); setCredits(d.credits);
      setHistory(h => [{ id: "new_" + Date.now(), script: d.script, sponsor, brief, created_at: new Date().toISOString() }, ...h]);
      setBrief(""); setSponsor(""); setFiles([]);
    } catch (e) { setErr(e.message || t("dp_err_gen")); } finally { setBusy(false); }
  }
  return <div className="card" style={{ borderTop: "4px solid #9A8458", margin: "24px 0 0" }}>
    <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
      <div><div style={{ fontWeight: 800, fontSize: 16 }}>{t("dp_as_title")}</div><div className="muted" style={{ fontSize: 12.5 }}>{t("dp_as_sub")}</div></div>
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <span style={{ background: credits > 0 ? "#e8f5ee" : "#fdeaea", color: credits > 0 ? "#1a7f43" : "#b3261e", fontWeight: 800, fontSize: 13, padding: "5px 12px", borderRadius: 20 }}>{t("dp_credits")} {credits == null ? "…" : credits}</span>
        <button onClick={() => setBuying(b => !b)} className="link" style={{ background: "none", border: 0, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#9A8458" }}>{t("dp_buy_credits")}</button>
      </div>
    </div>
    {buying && <div style={{ marginTop: 12, background: "#fbf9f3", border: "1px solid #e7dfc5", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>{t("dp_pick_pack")}</div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {t("dp_packs").map(([p, lbl, price]) =>
          <button key={p} disabled={buyBusy} onClick={() => buyPack(p)} style={{ flex: "1 1 120px", border: "1.5px solid #9A8458", background: "#fff", borderRadius: 12, padding: "12px 10px", cursor: buyBusy ? "default" : "pointer", opacity: buyBusy ? .6 : 1, textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#9A8458" }}>{lbl}</div><div className="muted" style={{ fontSize: 12.5 }}>{price}</div></button>)}
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>{buyBusy ? t("dp_going_pay") : t("dp_pay_note")}</div>
    </div>}
    {!open && <button onClick={() => setOpen(true)} className="btn full" style={{ marginTop: 12, background: "#9A8458" }}>{t("dp_write_new")}</button>}
    {open && <div style={{ marginTop: 14 }}>
      <div className="field"><label>{t("dp_brief_label")}</label><textarea value={brief} onChange={e => setBrief(e.target.value)} style={{ minHeight: 80 }} placeholder={t("dp_brief_ph")} /></div>
      <div className="field"><label>{t("dp_attach_label")} <span className="muted">{t("dp_attach_sub")}</span></label>
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple onChange={e => setFiles(e.target.files)} />
        {[...files].length > 0 && <div className="hint" style={{ color: "#1a7f43" }}>{t("dp_attached")} {Math.min([...files].length, 3)} {t("dp_files_word")}</div>}
      </div>
      <div className="field"><label>{t("dp_sponsor_label")} <span className="muted">{t("dp_sponsor_sub")}</span></label><input value={sponsor} onChange={e => setSponsor(e.target.value)} placeholder={t("dp_sponsor_ph")} /></div>
      {err && <div className="msg err">{err}</div>}
      <div className="row" style={{ gap: 10 }}>
        <button className="btn" disabled={busy || credits < 1} onClick={gen} style={{ background: "#9A8458", opacity: (busy || credits < 1) ? .6 : 1 }}>{busy ? t("dp_writing") : t("dp_gen_btn")}</button>
        <button className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => { setOpen(false); setScript(null); setErr(""); }}>{t("dp_close")}</button>
      </div>
      {credits < 1 && credits != null && <div className="msg" style={{ background: "#fff7e6", color: "#8a6d1f", marginTop: 10, fontSize: 13 }}>{t("dp_no_credits")}</div>}
    </div>}
    {script && <div className="card" style={{ marginTop: 14, background: "#fbf9f3", border: "1px solid #e7dfc5" }}><div style={{ fontSize: 11.5, fontWeight: 700, color: "#1a7f43", marginBottom: 6 }}>{t("dp_created_saved")}</div><ScriptBlock s={script} /></div>}

    {history.length > 0 && <div style={{ marginTop: 16 }}>
      <div className="muted" style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("dp_history_title")} ({history.length}) {t("dp_history_sub")}</div>
      {history.map(it => <div key={it.id} className="card" style={{ margin: "0 0 8px", padding: "12px 14px" }}>
        <button onClick={() => setOpenId(openId === it.id ? null : it.id)} style={{ width: "100%", background: "none", border: 0, cursor: "pointer", textAlign: "left", padding: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span><span style={{ fontWeight: 700, fontSize: 14 }}>{(it.script && it.script.title) || t("dp_script")}</span>{it.sponsor && <span style={{ marginLeft: 8, fontSize: 11, background: "#ECEAF6", color: "#6E63A6", borderRadius: 10, padding: "2px 8px", fontWeight: 700 }}>🤝 {it.sponsor}</span>}<div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{String(it.created_at || "").slice(0, 10)}</div></span>
          <span style={{ color: "var(--blue)", fontSize: 13, flexShrink: 0 }}>{openId === it.id ? t("dp_close2") : t("dp_open")}</span>
        </button>
        {openId === it.id && <div style={{ marginTop: 12 }}><ScriptBlock s={it.script} /></div>}
      </div>)}
    </div>}
  </div>;
}

// 🧰 เครื่องมือ (AI ช่วยทำเอง) + 🎁 บริการ (คนทำให้/เรียน) — รวมเป็นโครงเดียว ลดความรก
// เครื่องมือ = ไทล์เล็ก 4 อัน (กดขยายในที่ หรือพาไปหน้าอื่น) · บริการ = แถบบางเห็นตลอด
export function ToolsAndServices({ channel, cycle, demo }) {
  const { t } = useI18n();
  const [panel, setPanel] = useState(null); // "script" | "shoot" | null
  useEffect(() => { if (typeof location !== "undefined" && location.search.includes("topup=ok")) setPanel("script"); }, []); // กลับจากซื้อเครดิต → เปิดแผงสคริปต์เลย
  const tileSt = (on) => ({ display: "flex", alignItems: "center", gap: 9, border: on ? "1.5px solid #9A8458" : "1px solid var(--border)", background: on ? "#fbf9f3" : "#fff", borderRadius: 12, padding: "11px 13px", fontSize: 13.5, fontWeight: 700, color: "var(--ink)", cursor: "pointer", textDecoration: "none", width: "100%", textAlign: "left" });
  const toggle = (p) => setPanel(panel === p ? null : p);
  return <div style={{ marginTop: 24 }}>
    <div className="card" style={{ marginTop: 0 }}>
      <div style={{ fontWeight: 800, fontSize: 15.5 }}>{t("dp_tools")}</div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 1 }}>{t("dp_tools_sub")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 13 }}>
        <button style={tileSt(panel === "script")} onClick={() => toggle("script")}><span style={{ fontSize: 19 }}>⚡</span> {t("dp_t_addscript")}</button>
        <Link to="/video-audit" style={tileSt(false)}><span style={{ fontSize: 19 }}>🤖</span> {t("dp_t_audit")}</Link>
        <Link to="/account" style={tileSt(false)}><span style={{ fontSize: 19 }}>📺</span> {t("dp_t_channel")}</Link>
        <button style={tileSt(panel === "shoot")} onClick={() => toggle("shoot")}><span style={{ fontSize: 19 }}>🎬</span> {t("dp_t_examples")}</button>
      </div>
    </div>
    {panel === "script" && <AddScript channel={channel} cycle={cycle} demo={demo} startOpen />}
    {panel === "shoot" && <div style={{ marginTop: 14 }}><ShootingGuide startOpen /></div>}
    <ServicesBlock />
  </div>;
}

// 🎁 บริการ Babe House (คนทำให้/เรียน) — เห็นตลอด "ทำเองไม่ไหววันไหน ให้เราช่วย" · QR โชว์เลย เลื่อนมาสแกนได้ทันที
export function ServicesBlock() {
  const { t } = useI18n();
  return <div className="card" style={{ borderTop: "4px solid var(--blue)", marginTop: 16 }}>
    <div className="row" style={{ gap: 9, alignItems: "flex-start" }}>
      <span style={{ fontSize: 20, lineHeight: 1.2 }}>🎁</span>
      <div><div style={{ fontWeight: 800, fontSize: 15 }}>{t("dp_sv_title")}</div><div className="muted" style={{ fontSize: 12.5 }}>{t("dp_sv_sub")}</div></div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12, marginTop: 14 }}>
      <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "16px 15px", display: "flex", flexDirection: "column" }}>
        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 26 }}>🎓</span>
          <div><div style={{ fontWeight: 800, fontSize: 15 }}>{t("dp_academy")}</div><div className="muted" style={{ fontSize: 12.5 }}>{t("dp_academy_sub")}</div></div>
        </div>
        <ul style={{ paddingLeft: 20, fontSize: 13, margin: "12px 0" }}>{t("dp_courses").map((c, i) => <li key={i} style={{ marginBottom: 3 }}>{c}</li>)}</ul>
        <div className="center" style={{ margin: "auto 0 12px" }}><img src={qrImg(LINE_ACADEMY.url)} alt="LINE Academy QR" width={150} height={150} style={{ borderRadius: 10, border: "1px solid var(--border)" }} /><div className="muted" style={{ fontSize: 13, marginTop: 6, fontWeight: 700 }}>{t("dp_scan")} {LINE_ACADEMY.id}</div></div>
        <a href={LINE_ACADEMY.url} target="_blank" rel="noreferrer" className="btn full">{t("dp_add_friend_course")}</a>
      </div>
      <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "16px 15px", display: "flex", flexDirection: "column" }}>
        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 26 }}>🎬</span>
          <div><div style={{ fontWeight: 800, fontSize: 15 }}>{t("dp_production")}</div><div className="muted" style={{ fontSize: 12.5 }}>{t("dp_production_sub")}</div></div>
        </div>
        <ul style={{ paddingLeft: 20, fontSize: 13, margin: "12px 0" }}>{t("dp_prod_items").map((x, i) => <li key={i} style={{ marginBottom: 3 }}>{x}</li>)}</ul>
        <Link to="/production" className="btn full" style={{ margin: "auto 0 0", background: "#06C755", boxShadow: "0 8px 22px rgba(6,199,85,.28)" }}>{t("dp_prod_cta")}</Link>
      </div>
    </div>
  </div>;
}

// การ์ดให้ลูกค้ารีวิวเล่มของตัวเอง → เก็บไว้โชว์เป็น social proof ตอนเปิดขาย
export function ReviewCard({ demo, bpId }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false), [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0), [hover, setHover] = useState(0);
  const [text, setText] = useState(""), [name, setName] = useState(""), [role, setRole] = useState("");
  const [pub, setPub] = useState(true), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => {
    if (demo || !bpId) return;
    api(`/api/me/review?blueprint_id=${encodeURIComponent(bpId)}`, { token: session.token })
      .then(d => { if (d.review) { setRating(d.review.rating || 0); setText(d.review.text || ""); setName(d.review.display_name || ""); setRole(d.review.role || ""); setPub(d.review.allow_public !== 0); setDone(true); } }).catch(() => {});
  }, [bpId]);
  const submit = async () => {
    setErr(""); if (!rating) { setErr(t("dp_rv_give_star")); return; }
    if (demo) { setDone(true); setOpen(false); return; }
    setBusy(true);
    try { await api("/api/me/review", { method: "POST", token: session.token, body: { blueprint_id: bpId, rating, text, display_name: name, role, allow_public: pub } }); setDone(true); setOpen(false); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const stars = (sz, on) => <div className="row" style={{ gap: 4 }}>{[1, 2, 3, 4, 5].map(n => <span key={n} onClick={on ? () => setRating(n) : undefined} onMouseEnter={on ? () => setHover(n) : undefined} onMouseLeave={on ? () => setHover(0) : undefined} style={{ fontSize: sz, color: n <= (hover || rating) ? "#f5b301" : "#dcdce3", cursor: on ? "pointer" : "default", lineHeight: 1 }}>★</span>)}</div>;
  if (done && !open) return <div className="card" style={{ background: "#fff8ef", border: "1px solid #f0d9a8", textAlign: "center" }}>
    <div style={{ fontSize: 15.5, fontWeight: 800, color: "#9a6b1f" }}>{t("dp_rv_thanks")}</div>
    <div style={{ display: "inline-flex", margin: "8px 0" }}>{stars(26, false)}</div>
    <p className="muted" style={{ fontSize: 13, maxWidth: 460, margin: "0 auto" }}>{t("dp_rv_thanks_sub")}</p>
    <button className="link" style={{ background: "none", border: 0, cursor: "pointer", marginTop: 6 }} onClick={() => setOpen(true)}>{t("dp_rv_edit")}</button>
  </div>;
  return <div className="card" style={{ border: "1px solid #f0d9a8", background: "#fffdf8" }}>
    <div style={{ fontWeight: 800, fontSize: 17, color: "#9a6b1f", textAlign: "center" }}>{t("dp_rv_title")}</div>
    <p className="muted" style={{ fontSize: 14, textAlign: "center", margin: "6px auto 14px", maxWidth: 480 }}>{t("dp_rv_sub")}</p>
    <div className="center" style={{ marginBottom: 14 }}>{stars(38, true)}</div>
    <div className="field"><textarea value={text} onChange={e => setText(e.target.value)} style={{ minHeight: 80 }} placeholder={t("dp_rv_ph")} /></div>
    <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
      <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}><label style={{ fontSize: 13 }}>{t("dp_rv_name")}</label><input value={name} onChange={e => setName(e.target.value)} placeholder={t("dp_rv_name_ph")} /></div>
      <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}><label style={{ fontSize: 13 }}>{t("dp_rv_role")}</label><input value={role} onChange={e => setRole(e.target.value)} placeholder={t("dp_rv_role_ph")} /></div>
    </div>
    <label className="row" style={{ gap: 8, fontSize: 13.5, margin: "12px 0 4px", cursor: "pointer" }}><input type="checkbox" checked={pub} onChange={e => setPub(e.target.checked)} style={{ width: 18, height: 18 }} />{t("dp_rv_public")}</label>
    {err && <div className="msg err">{err}</div>}
    <div className="center" style={{ marginTop: 12 }}><button className="btn" disabled={busy} onClick={submit} style={{ background: "#f5b301", color: "#5b4400", boxShadow: "0 8px 22px rgba(245,179,1,.3)" }}>{busy ? t("dp_rv_sending") : t("dp_rv_submit")}</button></div>
  </div>;
}

// กล่องฟีดแบกภายใน (สำหรับ testers บอกว่าอยากให้ปรับอะไร) — พับไว้ ไม่เด่นเท่ารีวิว
export function FeedbackCard({ demo, bpId }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false), [clarity, setClarity] = useState(0), [hover, setHover] = useState(0);
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [err, setErr] = useState("");
  const submit = async () => {
    setErr(""); if (!clarity && !msg.trim()) { setErr(t("dp_fb_tell")); return; }
    if (demo) { setDone(true); return; }
    setBusy(true);
    try { await api("/api/me/feedback", { method: "POST", token: session.token, body: { blueprint_id: bpId, clarity, message: msg } }); setDone(true); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (done) return <div className="center muted" style={{ fontSize: 13.5, padding: "10px 0" }}>{t("dp_fb_thanks")}</div>;
  if (!open) return <div className="center" style={{ padding: "6px 0 2px" }}><button className="link" style={{ background: "none", border: 0, cursor: "pointer", fontSize: 13.5, color: "var(--muted)" }} onClick={() => setOpen(true)}>{t("dp_fb_open")}</button></div>;
  return <div className="card" style={{ background: "var(--soft)" }}>
    <div style={{ fontWeight: 700, fontSize: 15 }}>{t("dp_fb_title")}</div>
    <div className="row" style={{ gap: 10, alignItems: "center", margin: "10px 0" }}><span className="muted" style={{ fontSize: 13.5 }}>{t("dp_fb_q")}</span><div className="row" style={{ gap: 3 }}>{[1, 2, 3, 4, 5].map(n => <span key={n} onClick={() => setClarity(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} style={{ fontSize: 24, cursor: "pointer", color: n <= (hover || clarity) ? "#f5b301" : "#dcdce3" }}>★</span>)}</div></div>
    <textarea value={msg} onChange={e => setMsg(e.target.value)} style={{ minHeight: 72, width: "100%" }} placeholder={t("dp_fb_ph")} />
    {err && <div className="msg err">{err}</div>}
    <div className="row" style={{ gap: 10, marginTop: 8 }}><button className="btn ghost" disabled={busy} onClick={submit} style={{ padding: "9px 16px" }}>{busy ? t("dp_rv_sending") : t("dp_fb_send")}</button><button className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => setOpen(false)}>{t("dp_close")}</button></div>
  </div>;
}

// 🎬 คู่มือถ่าย + คลิปตัวอย่าง — แก้ปัญหาลูกค้า "มีสคริปต์แต่ถ่ายไม่เป็น/ไม่รู้มุมกล้อง"
const SHOOT_FORMATS = [
  { emoji: "🎤", name: "พูดหน้ากล้อง", who: "คนกล้าพูด อยากให้คนเชื่อใจไว", clip: "DRrFqkeEu3H", color: ["#E7EDF8", "#3F6BAE"], steps: [
    ["📐 ตั้งกล้อง", "วางมือถือระดับสายตา ห่างประมาณ 1 ช่วงแขน · หันหน้าเข้าแสง (ริมหน้าต่างดีสุด) · ให้เห็นหัวถึงไหล่"],
    ["🎬 ถ่ายกี่ช็อต", "อัดยาวจบใน 1 เทค หรือแบ่ง 3 ช็อต: เปิด / เนื้อหา / ปิดท้าย เผื่อพูดผิดถ่ายซ้ำเฉพาะท่อนนั้น"],
    ["🎞️ เก็บภาพแทรก", "2-3 คลิปสั้น (มือ / สินค้า / หน้าจอ) ไว้แปะช่วงพูดยาว กันคนดูเบื่อ"],
    ["💡 ทิป", "มองที่เลนส์ ไม่ใช่มองหน้าตัวเองในจอ · ยิ้มก่อนเริ่มพูด 1 วิ ให้ดูเป็นมิตร"],
  ] },
  { emoji: "🛍️", name: "รีวิว / โชว์ของ", who: "สายขายของ รีวิวสินค้า สาธิต", clip: "DRv4cdTElj_", color: ["#ECEAF6", "#6E63A6"], steps: [
    ["📐 ตั้งกล้อง", "ถือของให้เห็นชัด หรือวางบนพื้น/โต๊ะที่แสงสวย · ถ่ายมือหยิบ-ใช้จริง"],
    ["🎬 ถ่ายกี่ช็อต", "3-5 ช็อต: โชว์ของ + ตอนใช้จริง + รีแอคชัน/หน้าเราพูดถึง"],
    ["🎞️ เก็บอะไร", "close-up ดีเทลของ · ก่อน/หลังใช้ (ถ้ามี จะน่าเชื่อมาก)"],
    ["💡 ทิป", "พูดจากใจว่าชอบตรงไหน อย่าอ่านสเปกแข็งๆ คนถึงจะเชื่อ"],
  ] },
  { emoji: "🎮", name: "เล่นเกม / สัมภาษณ์", who: "คอนเทนต์สนุก มีปฏิสัมพันธ์ ดึงคนมีส่วนร่วม", clip: "DTP_z0IEqM_", color: ["#E4F4F3", "#2C8E8C"], steps: [
    ["📐 ตั้งกล้อง", "ตั้งกล้องนิ่งให้เห็น 1-2 คน · ถ้าสัมภาษณ์ให้เห็นทั้งคนถาม-คนตอบ"],
    ["🎬 ถ่ายกี่ช็อต", "อัดยาวแล้วค่อยตัดเอาช่วงเด็ด · เก็บรีแอคชันเยอะๆ"],
    ["🎞️ เก็บอะไร", "ช็อตหัวเราะ/เซอร์ไพรส์ เอาไว้ทำ 3 วิแรกให้คนหยุดดู"],
    ["💡 ทิป", "ความเรียล/ฮาคือพระเอก ไม่ต้องเป๊ะ ปล่อยให้เป็นธรรมชาติ"],
  ] },
  { emoji: "🎬", name: "Insert (ภาพแทรก)", who: "อยากให้คลิปดูโปร ไม่น่าเบื่อ", clip: "DYblDL0yACB", color: ["#E9EEF6", "#5573A0"], steps: [
    ["📐 ภาพแทรกคืออะไร", "คลิปสั้นๆ ที่เอาไปวางทับช่วงเล่า (มือ/ของ/บรรยากาศ/ดีเทล) ให้คลิปไม่นิ่ง"],
    ["🎬 ถ่ายกี่ช็อต", "เก็บ 5-8 ช็อตแทรก ช็อตละ 2-4 วิ จากหลายมุม"],
    ["🎞️ มุมกล้อง", "สลับ ใกล้-กลาง-กว้าง · ขยับกล้องช้าๆ จะดูแพงขึ้น"],
    ["💡 ทิป", "เก็บภาพแทรกไว้เยอะๆ ช่วยให้คลิปพูดยาวๆ ไม่น่าเบื่อ"],
  ] },
  { emoji: "🎙️", name: "เล่าเรื่อง + พากย์เสียง", who: "คนเขินกล้อง / สายเล่าเรื่อง", clip: "DW3YKFcSDYh", color: ["#F7F4EA", "#9A8458"], steps: [
    ["📐 ขั้นตอน", "อัดเสียงพากย์ตามสคริปต์ก่อน (ห้องเงียบ ถือใกล้ปาก) แล้วค่อยถ่ายภาพประกอบ"],
    ["🎬 ถ่ายกี่ช็อต", "ฟุตเทจ 6-10 คลิปสั้น ให้เข้ากับเรื่องที่เล่าในแต่ละช่วง"],
    ["🎞️ เก็บอะไร", "ภาพ + เสียง + ซับ ให้อารมณ์ไปทางเดียวกัน"],
    ["💡 ทิป", "น้ำเสียงสำคัญกว่าภาพ เล่าให้มีจังหวะขึ้น-ลง อย่าราบเรียบ"],
  ] },
];
export function ShootingGuide({ startOpen }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(!!startOpen);
  if (!open) return <div className="card" style={{ background: "linear-gradient(135deg,#FBF7EE,#F4F9FF)", border: "1px solid #e7dfc5" }}>
    <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
      <div><div style={{ fontWeight: 800, fontSize: 16 }}>{t("dp_sg_title")}</div><div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>{t("dp_sg_sub")}</div></div>
      <button className="btn" onClick={() => setOpen(true)} style={{ flexShrink: 0, padding: "10px 18px" }}>{t("dp_sg_see")}</button>
    </div>
  </div>;
  return <div className="card">
    <div className="between" style={{ marginBottom: 4 }}><h3 style={{ margin: 0 }}>{t("dp_sg_title2")}</h3><button className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => setOpen(false)}>{t("dp_close")}</button></div>
    <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{t("dp_sg_pick")}</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
      {SHOOT_FORMATS.map((f, oi) => oi).filter(oi => SHOOT_FORMATS[oi].clip).map((oi) => { const f = SHOOT_FORMATS[oi]; return <a key={oi} href={`https://www.instagram.com/reel/${f.clip}/`} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit", background: f.color[0], borderRadius: 14, padding: "18px 12px", textAlign: "center", display: "block" }}>
        <div style={{ fontSize: 34, lineHeight: 1 }}>{f.emoji}</div>
        <div style={{ fontWeight: 800, fontSize: 14, color: f.color[1], marginTop: 8 }}>{t("dp_sg_formats")[oi]}</div>
        <div style={{ fontSize: 12.5, color: f.color[1], marginTop: 8, fontWeight: 700 }}>{t("dp_sg_watch")}</div>
      </a>; })}
    </div>
  </div>;
}
