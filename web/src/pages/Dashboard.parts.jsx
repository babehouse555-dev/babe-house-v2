// ชิ้นส่วนของหน้า Dashboard ที่แยกออกมาให้ไฟล์หลักอ่านง่ายขึ้น (หน้าตาเหมือนเดิมทุกอย่าง)
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, session, filesToBase64 } from "../api.js";
import { ACADEMY_LIVE } from "../config.js";

// 📮 ทางติดต่อทางไลน์ — ยังต้องมีจนกว่าคอร์ส/คลาสสดจะเปิดขายบนเว็บครบ (คิมสั่ง 4 ส.ค.)
// ถ้าเอาออกตอนนี้ ลูกค้าที่อยากซื้อคอร์สหรือจองคลาสจะไม่เหลือทางติดต่อเลย
const LINE_ACADEMY = { id: "@babehouse_academy", url: "https://line.me/R/ti/p/%40babehouse_academy" };
const qrImg = (data) => `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(data)}`;
import { useI18n } from "../i18n.jsx";
import { ScriptEditor } from "./ScriptEditor.jsx";


// ⚡ เพิ่มสคริปต์เดี่ยว (งานสปอนเซอร์/คอนเทนต์ด่วน นอกแผน 30 วัน) — ใช้ 1 เครดิต/สคริปต์
const SL = { HOOK: "#2E86DE", BODY: "#1a7f43", CTA: "#b8860b" };
const copyTxt = (txt) => navigator.clipboard?.writeText(txt);
function ScriptBlock({ s, refId, lang, demo, onChange }) { // แสดง/แก้ไขสคริปต์ 1 อัน (ใช้ทั้งอันที่เพิ่งสร้าง + ประวัติ)
  const { t } = useI18n();
  if (!s) return null;
  const beats = (s.beats || []); // copy-all ใช้ค่าปัจจุบัน (รวมฮุกที่เลือกไว้แล้ว)
  return <>
    <div className="between"><div style={{ fontWeight: 800, fontSize: 15 }}>{s.title || t("dp_script")}</div><button className="link" style={{ background: "none", border: 0, cursor: "pointer", fontSize: 13 }} onClick={() => copyTxt([...beats.map(b => b.say), s.cap].filter(Boolean).join("\n\n"))}>{t("dp_copy")}</button></div>
    <div style={{ marginTop: 10 }}>
      <ScriptEditor script={s} scope="credit" refId={refId} day={0} lang={lang} demo={demo} onChange={onChange || (() => {})} />
    </div>
  </>;
}
export function AddScript({ channel, cycle, demo, startOpen }) {
  const { t, lang } = useI18n();
  const [credits, setCredits] = useState(null);
  const [open, setOpen] = useState(!!startOpen);
  const [brief, setBrief] = useState(""), [sponsor, setSponsor] = useState(""), [files, setFiles] = useState([]), [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [script, setScript] = useState(null);
  const [elapsed, setElapsed] = useState(0); // นับวินาทีระหว่างเจน → โชว์ขั้นตอนไม่ให้ดูค้าง
  useEffect(() => { if (!busy) { setElapsed(0); return; } const iv = setInterval(() => setElapsed(e => e + 1), 1000); return () => clearInterval(iv); }, [busy]);
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
      const d = await api("/api/credits/generate-script", { method: "POST", token: session.token, body: { channel, cycle, brief, sponsor, ref, brief_files, lang } });
      setScript(d.script); setCredits(d.credits);
      setHistory(h => [{ id: d.id || ("new_" + Date.now()), script: d.script, sponsor, brief, created_at: new Date().toISOString() }, ...h]);
      setBrief(""); setSponsor(""); setFiles([]); setRef("");
    } catch (e) { setErr(e.message || t("dp_err_gen")); } finally { setBusy(false); }
  }
  return <div className="card" style={{ borderTop: "4px solid #2E86DE", margin: "24px 0 0" }}>
    <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
      <div><div style={{ fontWeight: 800, fontSize: 16 }}>{t("dp_as_title")}</div><div className="muted" style={{ fontSize: 12.5 }}>{t("dp_as_sub")}</div></div>
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <span style={{ background: credits > 0 ? "#e8f5ee" : "#fdeaea", color: credits > 0 ? "#1a7f43" : "#b3261e", fontWeight: 800, fontSize: 13, padding: "5px 12px", borderRadius: 20 }}>{t("dp_credits")} {credits == null ? "…" : credits}</span>
        <button onClick={() => setBuying(b => !b)} className="link" style={{ background: "none", border: 0, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#2E86DE" }}>{t("dp_buy_credits")}</button>
      </div>
    </div>
    {buying && <div style={{ marginTop: 12, background: "#eef4fb", border: "1px solid #cfe0f3", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>{t("dp_pick_pack")}</div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {t("dp_packs").map(([p, lbl, price]) =>
          <button key={p} disabled={buyBusy} onClick={() => buyPack(p)} style={{ flex: "1 1 120px", border: "1.5px solid #2E86DE", background: "#fff", borderRadius: 12, padding: "12px 10px", cursor: buyBusy ? "default" : "pointer", opacity: buyBusy ? .6 : 1, textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#2E86DE" }}>{lbl}</div><div className="muted" style={{ fontSize: 12.5 }}>{price}</div></button>)}
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>{buyBusy ? t("dp_going_pay") : t("dp_pay_note")}</div>
    </div>}
    {!open && <button onClick={() => setOpen(true)} className="btn full" style={{ marginTop: 12, background: "#2E86DE" }}>{t("dp_write_new")}</button>}
    {open && <div style={{ marginTop: 14 }}>
      <div className="field"><label>{t("dp_brief_label")}</label><textarea value={brief} onChange={e => setBrief(e.target.value)} style={{ minHeight: 80 }} placeholder={t("dp_brief_ph")} /></div>
      <div className="field"><label>{t("dp_attach_label")} <span className="muted">{t("dp_attach_sub")}</span></label>
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple onChange={e => setFiles(e.target.files)} />
        {[...files].length > 0 && <div className="hint" style={{ color: "#1a7f43" }}>{t("dp_attached")} {Math.min([...files].length, 3)} {t("dp_files_word")}</div>}
      </div>
      <div className="field"><label>{t("dp_sponsor_label")} <span className="muted">{t("dp_sponsor_sub")}</span></label><input value={sponsor} onChange={e => setSponsor(e.target.value)} placeholder={t("dp_sponsor_ph")} /></div>
      <div className="field"><label>{t("dp_ref_label")} <span className="muted">{t("dp_ref_sub")}</span></label><textarea value={ref} onChange={e => setRef(e.target.value)} style={{ minHeight: 64 }} placeholder={t("dp_ref_ph")} /></div>
      {err && <div className="msg err">{err}</div>}
      {busy ? (() => {
        const steps = t("dp_gen_steps"); const at = [0, 4, 9, 16]; // วินาทีที่เริ่มแต่ละขั้น
        const cur = at.filter(s => elapsed >= s).length - 1;
        const pct = Math.min(92, Math.round(100 * (1 - Math.exp(-(elapsed + 3) / 22))));
        return <div style={{ background: "#eef4fb", border: "1px solid #cfe0f3", borderRadius: 14, padding: "16px 18px", marginTop: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#1B6FC4", marginBottom: 12 }}>⚡ {t("dp_gen_working")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 14 }}>
            {steps.map((s, i) => { const done = i < cur, active = i === cur; return <div key={i} className="row" style={{ gap: 10, alignItems: "center" }}>
              {done ? <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#e8f5ee", color: "#1a7f43", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>✓</span>
                : active ? <span style={{ width: 20, height: 20, borderRadius: "50%", border: "3px solid #dce7f4", borderTopColor: "#2E86DE", animation: "spin .8s linear infinite", flexShrink: 0, boxSizing: "border-box" }} />
                : <span style={{ width: 20, height: 20, borderRadius: "50%", border: "1.5px solid #c9d9ec", flexShrink: 0, boxSizing: "border-box" }} />}
              <span style={{ fontSize: 13.5, fontWeight: active ? 700 : 400, color: active ? "var(--ink)" : done ? "var(--muted)" : "#9fb4cc" }}>{s}{active ? "…" : ""}</span>
            </div>; })}
          </div>
          <div style={{ height: 6, background: "#dce7f4", borderRadius: 20, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: "#2E86DE", borderRadius: 20, transition: "width 1s linear" }} /></div>
        </div>;
      })() : <div className="row" style={{ gap: 10 }}>
        <button className="btn" disabled={credits < 1} onClick={gen} style={{ background: "#2E86DE", opacity: credits < 1 ? .6 : 1 }}>{t("dp_gen_btn")}</button>
        <button className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => { setOpen(false); setScript(null); setErr(""); }}>{t("dp_close")}</button>
      </div>}
      {credits < 1 && credits != null && <div className="msg" style={{ background: "#fff7e6", color: "#8a6d1f", marginTop: 10, fontSize: 13 }}>{t("dp_no_credits")}</div>}
    </div>}
    {script && <div className="card" style={{ marginTop: 14, background: "#eef4fb", border: "1px solid #cfe0f3" }}><div style={{ fontSize: 11.5, fontWeight: 700, color: "#1a7f43", marginBottom: 6 }}>{t("dp_created_saved")}</div><ScriptBlock s={script} refId={script?._id} lang={lang} demo={demo} onChange={setScript} /></div>}

    {history.length > 0 && <div style={{ marginTop: 16 }}>
      <div className="muted" style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("dp_history_title")} ({history.length}) {t("dp_history_sub")}</div>
      {history.map(it => <div key={it.id} className="card" style={{ margin: "0 0 8px", padding: "12px 14px" }}>
        <button onClick={() => setOpenId(openId === it.id ? null : it.id)} style={{ width: "100%", background: "none", border: 0, cursor: "pointer", textAlign: "left", padding: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span><span style={{ fontWeight: 700, fontSize: 14 }}>{(it.script && it.script.title) || t("dp_script")}</span>{it.sponsor && <span style={{ marginLeft: 8, fontSize: 11, background: "#ECEAF6", color: "#6E63A6", borderRadius: 10, padding: "2px 8px", fontWeight: 700 }}>🤝 {it.sponsor}</span>}<div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{String(it.created_at || "").slice(0, 10)}</div></span>
          <span style={{ color: "var(--blue)", fontSize: 13, flexShrink: 0 }}>{openId === it.id ? t("dp_close2") : t("dp_open")}</span>
        </button>
        {openId === it.id && <div style={{ marginTop: 12 }}><ScriptBlock s={it.script} refId={it.id} lang={lang} demo={demo} onChange={ns => setHistory(h => h.map(x => x.id === it.id ? { ...x, script: ns } : x))} /></div>}
      </div>)}
    </div>}
  </div>;
}

// 🧰 เครื่องมือ (AI ช่วยทำเอง) + 🎁 บริการ (คนทำให้/เรียน) — รวมเป็นโครงเดียว ลดความรก
// เครื่องมือ = ไทล์เล็ก 4 อัน (กดขยายในที่ หรือพาไปหน้าอื่น) · บริการ = แถบบางเห็นตลอด
export function ToolsAndServices({ channel, cycle, demo }) {
  const { t } = useI18n();
  const [panel, setPanel] = useState(null); // "shoot" | null (แผงเพิ่มสคริปต์เป็นแผงเดี่ยวนอกเครื่องมือแล้ว)
  const tileSt = (on) => ({ display: "flex", alignItems: "center", gap: 9, border: on ? "1.5px solid #2E86DE" : "1px solid var(--border)", background: on ? "#eef4fb" : "#fff", borderRadius: 12, padding: "11px 13px", fontSize: 13.5, fontWeight: 700, color: "var(--ink)", cursor: "pointer", textDecoration: "none", width: "100%", textAlign: "left" });
  const toggle = (p) => setPanel(panel === p ? null : p);
  return <div style={{ marginTop: 24 }}>
    <div className="card" style={{ marginTop: 0 }}>
      <div style={{ fontWeight: 800, fontSize: 15.5 }}>{t("dp_tools")}</div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 1 }}>{t("dp_tools_sub")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 13 }}>
        <Link to="/video-audit" style={tileSt(false)}><span style={{ fontSize: 19 }}>🤖</span> {t("dp_t_audit")}</Link>
        <Link to="/account" style={tileSt(false)}><span style={{ fontSize: 19 }}>📺</span> {t("dp_t_channel")}</Link>
        <button style={tileSt(panel === "shoot")} onClick={() => toggle("shoot")}><span style={{ fontSize: 19 }}>🎬</span> {t("dp_t_examples")}</button>
      </div>
    </div>
    {panel === "shoot" && <div style={{ marginTop: 14 }}><ShootingGuide startOpen /></div>}
    {/* ⛔ เอา ServicesBlock ออก 2 ส.ค. (คิมสั่ง: "ซ้ำซ้อนมาก")
        เดิมกล่องนี้โฆษณา Academy + Production ในหน้าเล่ม แต่ตอนนี้ทั้งสองอย่างมีเมนูบนหัวเว็บแล้ว
        และในสคริปต์รายวันก็มีปุ่ม "ให้ทีมตัดให้" อยู่แล้ว → หน้าเดียวชวนขาย 3-4 จุด = รกและดูยัดขาย */}

    {/* 📮 อยากเรียน/อยากจองคลาส → ทักไลน์ไปก่อน
        โผล่เฉพาะตอนคอร์สกับคลาสสดยังไม่เปิดบนเว็บ (ACADEMY_LIVE = false)
        พอเปิดขายบนเว็บครบเมื่อไหร่ การ์ดนี้จะหายไปเอง ไม่ต้องมาแก้โค้ดซ้ำ */}
    {!ACADEMY_LIVE && !demo && (
      <div className="card" style={{ marginTop: 14, background: "linear-gradient(135deg,#F0FAF3,#F7FBF8)", border: "1px solid #cfe3d6" }}>
        <div style={{ fontWeight: 800, fontSize: 15.5 }}>อยากเรียนตัดต่อ หรือจองคลาสสด?</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.7 }}>
          ทักไลน์มาคุยกับทีมได้เลยค่ะ เดี๋ยวแนะนำคอร์สที่เหมาะกับช่องของคุณให้
        </div>
        <div className="center" style={{ margin: "14px 0 10px" }}>
          <img src={qrImg(LINE_ACADEMY.url)} alt="LINE Babe House Academy" width={140} height={140}
            style={{ borderRadius: 10, border: "1px solid var(--border)", background: "#fff" }} />
          <div className="muted" style={{ fontSize: 13, marginTop: 6, fontWeight: 700 }}>{LINE_ACADEMY.id}</div>
        </div>
        <a href={LINE_ACADEMY.url} target="_blank" rel="noreferrer" className="btn full" style={{ background: "#06C755" }}>
          เพิ่มเพื่อนทางไลน์
        </a>
      </div>
    )}
  </div>;
}

// 🎁 บริการ Babe House (คนทำให้/เรียน) — เห็นตลอด "ทำเองไม่ไหววันไหน ให้เราช่วย" · QR โชว์เลย เลื่อนมาสแกนได้ทันที

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


// ═══════ 📸 สรุปสิ้นเดือน — "ยิ่งใช้ยิ่งแม่น" (คิมสั่ง 3 ส.ค. 2569) ═══════
// คิม: "ลูกค้าต้องมาส่ง insight หลายคลิปเลยหรอ มันเยอะมากเลยนะ 30 คลิป — ทำแค่ตอนจบเดือนก็พอ
//       คือเราดูว่ายอดรายเดือนมันเพิ่มขึ้นจากคลิปไหน แล้วก็ให้ AI เอาข้อมูลนี้ไปทำงานต่อ
//       ไม่ต้องให้เค้ามากรอกรายคลิป มันเยอะมาก"
//
// ลูกค้าแคปหน้าสถิติมารูปเดียว (สูงสุด 4) → AI อ่านทุกโพสต์ + จับคู่กับปฏิทิน 30 วันเอง
// → เดือนหน้าแผนถูกเขียนจากของจริง ไม่ใช่เริ่มคิดใหม่จากศูนย์
export function MonthReview({ userId, cycle, bpId, demo }) {
  const [review, setReview] = useState(null);
  const [clipsDone, setClipsDone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (demo || !userId || !cycle) return;
    api(`/api/month-review?user_id=${encodeURIComponent(userId)}&billing_cycle=${encodeURIComponent(cycle)}`)
      .then(d => { if (d.review) { setReview(d.review); setClipsDone(d.clips_done ?? ""); } }).catch(() => {});
  }, [userId, cycle, demo]);

  async function upload(e) {
    const files = [...(e.target.files || [])].slice(0, 4);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true); setErr("");
    try {
      const images = await filesToBase64(files);
      const r = await api("/api/month-review", { method: "POST", body: {
        user_id: userId, billing_cycle: cycle, blueprint_id: bpId, images,
        clips_done: clipsDone === "" ? null : Number(clipsDone) } });
      setReview(r.review);
    } catch (e2) { setErr(e2.message || "อ่านรูปไม่สำเร็จ ลองใหม่อีกครั้งนะคะ"); }
    finally { setBusy(false); }
  }

  if (demo) return null;

  return <div className="card" style={{ background: "linear-gradient(135deg,#F3F0FB,#F7F9FF)", border: "1px solid #e2dcf3" }}>
    <h3 style={{ margin: 0 }}>📸 จบเดือนแล้ว ส่งสถิติมาให้ครูพี่คิมดู</h3>
    <p className="muted" style={{ fontSize: 13.5, margin: "6px 0 0", lineHeight: 1.75 }}>
      แคปหน้าสถิติมา<b>รูปเดียวก็พอ</b> — ครูพี่คิมจะอ่านให้เองว่าคลิปไหนไปได้ดี
      แล้ว<b>เขียนแผนเดือนหน้าจากของจริง</b> ไม่ใช่เริ่มคิดใหม่จากศูนย์ค่ะ
    </p>

    {!review && <>
      <div className="field" style={{ marginTop: 14, marginBottom: 10 }}>
        <label style={{ fontSize: 13.5 }}>เดือนที่ผ่านมาลงไปกี่คลิป? <span className="muted">(ไม่ครบก็ไม่เป็นไรค่ะ)</span></label>
        <input inputMode="numeric" value={clipsDone} placeholder="เช่น 18"
          onChange={e => setClipsDone(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
          style={{ maxWidth: 120 }} />
      </div>
      <label className="btn full" style={{ display: "block", textAlign: "center", cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1 }}>
        {busy ? "ครูพี่คิมกำลังอ่านสถิติ…" : "📷 แนบแคปหน้าสถิติ (สูงสุด 4 รูป)"}
        <input type="file" accept="image/*" multiple hidden disabled={busy} onChange={upload} />
      </label>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.7 }}>
        💡 แคปหน้าที่เห็น<b>ยอดวิวของแต่ละโพสต์</b> — Instagram: โปรไฟล์ → ☰ → Insights → เนื้อหาที่คุณแชร์ ·
        TikTok: โปรไฟล์ → ☰ → เครื่องมือครีเอเตอร์ → ข้อมูลเชิงลึก → เนื้อหา
      </p>
    </>}

    {err && <div className="msg" style={{ background: "#fde8e8", color: "#b42318", marginTop: 12 }}>{err}</div>}

    {review && <div style={{ marginTop: 16, background: "#fff", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>🧠 สิ่งที่เรารู้เกี่ยวกับคนดูของคุณแล้ว</div>

      {review.summary && <div style={{ background: "#F3F0FB", borderRadius: 10, padding: "10px 12px", fontSize: 13.5, lineHeight: 1.75, marginBottom: 12 }}>
        💬 <b>ครูพี่คิม:</b> {review.summary}
      </div>}

      {review.worked?.length > 0 && <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1a7f43", marginBottom: 4 }}>✅ แนวที่เวิร์กกับช่องคุณ</div>
        {review.worked.map((w, i) => <div key={i} style={{ fontSize: 13.5, lineHeight: 1.75 }}>• {w}</div>)}
      </div>}

      {review.didnt_work?.length > 0 && <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#B26A00", marginBottom: 4 }}>⚠️ แนวที่ยังไม่ไป</div>
        {review.didnt_work.map((w, i) => <div key={i} style={{ fontSize: 13.5, lineHeight: 1.75 }}>• {w}</div>)}
      </div>}

      {review.posts?.length > 0 && <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--muted)" }}>ดูตัวเลขที่อ่านได้จากรูป ({review.posts.length} โพสต์)</summary>
        <div style={{ marginTop: 8 }}>
          {[...review.posts].sort((a, b) => (b.views || 0) - (a.views || 0)).map((p, i) =>
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "4px 0", borderTop: i ? "1px solid var(--border)" : 0 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</span>
              <span style={{ fontWeight: 700, flexShrink: 0 }}>{Number(p.views || 0).toLocaleString()}</span>
            </div>)}
        </div>
      </details>}

      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)", fontSize: 13, color: "var(--muted)" }}>
        ✨ ข้อมูลนี้จะถูกใช้เขียนแผนเดือนหน้าให้คุณอัตโนมัติค่ะ
        <button className="link" style={{ background: "none", border: 0, cursor: "pointer", padding: 0, marginLeft: 6, fontSize: 13 }}
          onClick={() => { setReview(null); setOpen(true); }}>ส่งรูปใหม่</button>
      </div>
    </div>}
  </div>;
}
