// ชิ้นส่วนของหน้า Dashboard ที่แยกออกมาให้ไฟล์หลักอ่านง่ายขึ้น (หน้าตาเหมือนเดิมทุกอย่าง)
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, session, filesToBase64 } from "../api.js";

const LINE_ACADEMY = { id: "@babehouse_academy", url: "https://line.me/R/ti/p/%40babehouse_academy" };
const qrImg = (data) => `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(data)}`;
const ACADEMY_COURSES = ["📱 All in Your Phone — ตัดต่อในมือถือ (3,745฿)", "🎬 ตัดต่อ Advance — สายเล่าเรื่อง (5,990฿)", "👑 Workshop ตัวต่อตัว"];

// ⚡ เพิ่มสคริปต์เดี่ยว (งานสปอนเซอร์/คอนเทนต์ด่วน นอกแผน 30 วัน) — ใช้ 1 เครดิต/สคริปต์
const SL = { HOOK: ["เปิดให้สะดุด", "#2E86DE"], BODY: ["เนื้อหา", "#1a7f43"], CTA: ["ปิดท้าย", "#b8860b"] };
const copyTxt = (t) => navigator.clipboard?.writeText(t);
function ScriptBlock({ s }) { // แสดงสคริปต์ 1 อัน (ใช้ทั้งอันที่เพิ่งสร้าง + ประวัติ)
  if (!s) return null;
  return <>
    <div className="between"><div style={{ fontWeight: 800, fontSize: 15 }}>{s.title || "สคริปต์"}</div><button className="link" style={{ background: "none", border: 0, cursor: "pointer", fontSize: 13 }} onClick={() => copyTxt([...(s.beats || []).map(b => b.say), s.cap].filter(Boolean).join("\n\n"))}>คัดลอก 📋</button></div>
    {(s.beats || []).map((b, i) => <div key={i} style={{ marginTop: 10 }}>
      <span style={{ background: (SL[b.s] || ["", "#888"])[1], color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10 }}>{(SL[b.s] || [b.s])[0]}</span>
      <div style={{ fontSize: 14, lineHeight: 1.6, marginTop: 5 }}>{b.say}</div>
      {b.vis && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>🎬 {b.vis}</div>}
    </div>)}
    {s.cap && <div style={{ marginTop: 12, fontSize: 13.5, background: "#fff", borderRadius: 8, padding: "10px 12px" }}><b>แคปชั่น:</b> {s.cap}</div>}
    {s.tip && <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>💡 {s.tip}</div>}
  </>;
}
export function AddScript({ channel, demo }) {
  const [credits, setCredits] = useState(null);
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState(""), [sponsor, setSponsor] = useState(""), [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [script, setScript] = useState(null);
  const [history, setHistory] = useState([]), [openId, setOpenId] = useState(null);
  const [buying, setBuying] = useState(false), [buyBusy, setBuyBusy] = useState(false);
  const loadCredits = () => api("/api/me/credits" + (channel ? `?channel=${encodeURIComponent(channel)}` : ""), { token: session.token }).then(d => { setCredits(d.credits); setHistory(d.scripts || []); }).catch(() => setCredits(0));
  useEffect(() => {
    if (demo) { setCredits(3); return; }
    loadCredits();
    if (typeof location !== "undefined" && location.search.includes("topup=ok")) { setOpen(true); const t1 = setTimeout(loadCredits, 2500), t2 = setTimeout(loadCredits, 7000); return () => { clearTimeout(t1); clearTimeout(t2); }; } // เติมเครดิตเสร็จ → รอ webhook แล้วรีเฟรชยอด
  }, []);
  async function buyPack(pack) {
    if (demo) { setErr("เล่มตัวอย่างค่ะ — ในเล่มจริงกดแล้วไปหน้าจ่ายเงินซื้อเครดิตได้เลย 🩵"); return; }
    setBuyBusy(true);
    try {
      const d = await api("/api/credits/checkout", { method: "POST", token: session.token, body: { pack, return_path: location.pathname + location.search } });
      if (d.redirect_url) window.location.href = d.redirect_url;
    } catch (e) { setErr(e.message || "เปิดหน้าจ่ายเงินไม่สำเร็จ"); setBuyBusy(false); }
  }
  async function gen() {
    setErr(""); if (!brief.trim() && ![...files].length) { setErr("ใส่บรีฟงาน หรือแนบไฟล์บรีฟก่อนนะคะ"); return; }
    if (demo) { setErr("นี่คือเล่มตัวอย่างค่ะ — ในเล่มจริงกดแล้วครูพี่คิมจะเขียนสคริปต์งานนี้ให้ทันที 🩵"); return; }
    setBusy(true); setScript(null);
    try {
      const brief_files = [...files].length ? await filesToBase64([...files], 3) : [];
      const d = await api("/api/credits/generate-script", { method: "POST", token: session.token, body: { channel, brief, sponsor, brief_files } });
      setScript(d.script); setCredits(d.credits);
      setHistory(h => [{ id: "new_" + Date.now(), script: d.script, sponsor, brief, created_at: new Date().toISOString() }, ...h]);
      setBrief(""); setSponsor(""); setFiles([]);
    } catch (e) { setErr(e.message || "สร้างไม่สำเร็จ"); } finally { setBusy(false); }
  }
  return <div className="card" style={{ borderTop: "4px solid #9A8458", margin: "24px 0 0" }}>
    <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
      <div><div style={{ fontWeight: 800, fontSize: 16 }}>⚡ เพิ่มสคริปต์ (งานสปอนเซอร์/ด่วน)</div><div className="muted" style={{ fontSize: 12.5 }}>งานนอกแผน 30 วัน — เขียนตามบรีฟ ตรงสไตล์ช่องนี้ · เก็บไว้ในนี้ ไม่หาย</div></div>
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <span style={{ background: credits > 0 ? "#e8f5ee" : "#fdeaea", color: credits > 0 ? "#1a7f43" : "#b3261e", fontWeight: 800, fontSize: 13, padding: "5px 12px", borderRadius: 20 }}>เครดิต: {credits == null ? "…" : credits}</span>
        <button onClick={() => setBuying(b => !b)} className="link" style={{ background: "none", border: 0, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#9A8458" }}>+ ซื้อเครดิต</button>
      </div>
    </div>
    {buying && <div style={{ marginTop: 12, background: "#fbf9f3", border: "1px solid #e7dfc5", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>เลือกแพ็กเครดิต (1 เครดิต = 1 สคริปต์)</div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {[["1", "1 สคริปต์", "50฿"], ["10", "10 สคริปต์", "450฿ (45/อัน)"], ["30", "30 สคริปต์", "1,200฿ (40/อัน)"]].map(([p, t, price]) =>
          <button key={p} disabled={buyBusy} onClick={() => buyPack(p)} style={{ flex: "1 1 120px", border: "1.5px solid #9A8458", background: "#fff", borderRadius: 12, padding: "12px 10px", cursor: buyBusy ? "default" : "pointer", opacity: buyBusy ? .6 : 1, textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#9A8458" }}>{t}</div><div className="muted" style={{ fontSize: 12.5 }}>{price}</div></button>)}
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>{buyBusy ? "กำลังไปหน้าจ่ายเงิน..." : "จ่ายผ่านบัตร/พร้อมเพย์ · เติมเข้าทันทีหลังจ่าย"}</div>
    </div>}
    {!open && <button onClick={() => setOpen(true)} className="btn full" style={{ marginTop: 12, background: "#9A8458" }}>+ เขียนสคริปต์งานใหม่</button>}
    {open && <div style={{ marginTop: 14 }}>
      <div className="field"><label>บรีฟงาน / รายละเอียดที่อยากได้</label><textarea value={brief} onChange={e => setBrief(e.target.value)} style={{ minHeight: 80 }} placeholder="เช่น รีวิวครีมกันแดดแบรนด์ X เน้นว่าไม่เหนียว กันน้ำ ชวนกดลิงก์ในไบโอ / คลิปเกาะเทรนด์...อยากให้พูดถึง..." /></div>
      <div className="field"><label>📎 แนบไฟล์บรีฟ <span className="muted">(PDF/รูป — ลูกค้าส่งบรีฟมาแนบได้เลย ไม่ต้องพิมพ์)</span></label>
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple onChange={e => setFiles(e.target.files)} />
        {[...files].length > 0 && <div className="hint" style={{ color: "#1a7f43" }}>✓ แนบแล้ว {Math.min([...files].length, 3)} ไฟล์ — AI จะอ่านบรีฟให้</div>}
      </div>
      <div className="field"><label>ชื่อสปอนเซอร์/แบรนด์ <span className="muted">(ถ้ามี — เก็บไว้นับในรายงาน)</span></label><input value={sponsor} onChange={e => setSponsor(e.target.value)} placeholder="เช่น แบรนด์ X" /></div>
      {err && <div className="msg err">{err}</div>}
      <div className="row" style={{ gap: 10 }}>
        <button className="btn" disabled={busy || credits < 1} onClick={gen} style={{ background: "#9A8458", opacity: (busy || credits < 1) ? .6 : 1 }}>{busy ? "กำลังเขียน..." : "สร้างสคริปต์ (ใช้ 1 เครดิต)"}</button>
        <button className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => { setOpen(false); setScript(null); setErr(""); }}>ปิด</button>
      </div>
      {credits < 1 && credits != null && <div className="msg" style={{ background: "#fff7e6", color: "#8a6d1f", marginTop: 10, fontSize: 13 }}>เครดิตหมดแล้วค่ะ — ปุ่มซื้อแพ็กเครดิตกำลังมาเร็วๆ นี้ (ระหว่างนี้ทักทีมเติมให้ได้)</div>}
    </div>}
    {script && <div className="card" style={{ marginTop: 14, background: "#fbf9f3", border: "1px solid #e7dfc5" }}><div style={{ fontSize: 11.5, fontWeight: 700, color: "#1a7f43", marginBottom: 6 }}>✓ สร้างแล้ว · เก็บไว้ด้านล่าง</div><ScriptBlock s={script} /></div>}

    {history.length > 0 && <div style={{ marginTop: 16 }}>
      <div className="muted" style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📁 สคริปต์ที่สร้างไว้ ({history.length}) — กดเพื่อเปิด</div>
      {history.map(it => <div key={it.id} className="card" style={{ margin: "0 0 8px", padding: "12px 14px" }}>
        <button onClick={() => setOpenId(openId === it.id ? null : it.id)} style={{ width: "100%", background: "none", border: 0, cursor: "pointer", textAlign: "left", padding: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span><span style={{ fontWeight: 700, fontSize: 14 }}>{(it.script && it.script.title) || "สคริปต์"}</span>{it.sponsor && <span style={{ marginLeft: 8, fontSize: 11, background: "#ECEAF6", color: "#6E63A6", borderRadius: 10, padding: "2px 8px", fontWeight: 700 }}>🤝 {it.sponsor}</span>}<div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{String(it.created_at || "").slice(0, 10)}</div></span>
          <span style={{ color: "var(--blue)", fontSize: 13, flexShrink: 0 }}>{openId === it.id ? "▲ ปิด" : "▼ เปิด"}</span>
        </button>
        {openId === it.id && <div style={{ marginTop: 12 }}><ScriptBlock s={it.script} /></div>}
      </div>)}
    </div>}
  </div>;
}

// บล็อกบริการ Babe House (ใช้ทั้งหน้าปฏิทินและมาราธอน)
export function ServicesBlock() {
  return <>
    <Link to="/account" style={{ display: "flex", alignItems: "center", gap: 12, background: "#eef4fb", border: "1px dashed #bcd4ee", borderRadius: 14, padding: "13px 15px", textDecoration: "none", color: "var(--blue-d)", margin: "24px 0 4px" }}>
      <span style={{ fontSize: 24 }}>📺</span>
      <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 14 }}>ดูแลช่องอื่นด้วยไหม?</div><div className="muted" style={{ fontSize: 12.5 }}>เพิ่มช่องลูก/ลูกค้า — จัดการทุกช่องในบัญชีเดียว</div></div>
      <span style={{ background: "var(--blue)", color: "#fff", borderRadius: 20, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>+ เพิ่มช่อง</span>
    </Link>
    <h2 className="serif" style={{ fontSize: 20, margin: "26px 0 4px" }}>🎁 บริการของ Babe House</h2>
    <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>เลือกเส้นทางที่ใช่สำหรับคุณ — อยากเก่งขึ้นเอง · ให้เราทำให้ · หรือให้ AI ช่วยตรวจคลิป</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 14 }}>
      <div className="card" style={{ margin: 0, borderTop: "4px solid var(--blue)", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 30 }}>🎓</div>
        <h3 style={{ margin: "6px 0 4px" }}>เรียนตัดต่อเอง</h3>
        <p className="muted" style={{ fontSize: 13 }}>มีคอนเทนต์อยู่แล้ว แต่ยังตัดต่อไม่เป็น? มาเรียนกับครูพี่คิม — ทำเองได้ทุกคลิป</p>
        <ul style={{ paddingLeft: 18, fontSize: 13, margin: "10px 0" }}>{ACADEMY_COURSES.map((c, i) => <li key={i} style={{ marginBottom: 3 }}>{c}</li>)}</ul>
        <div className="center" style={{ margin: "auto 0 12px" }}><img src={qrImg(LINE_ACADEMY.url)} alt="LINE Academy QR" width={140} height={140} style={{ borderRadius: 10, border: "1px solid var(--border)" }} /><div className="muted" style={{ fontSize: 13, marginTop: 6, fontWeight: 700 }}>{LINE_ACADEMY.id}</div></div>
        <a href={LINE_ACADEMY.url} target="_blank" rel="noreferrer" className="btn full">เพิ่มเพื่อน · เรียนคอร์ส</a>
      </div>
      <div className="card" style={{ margin: 0, borderTop: "4px solid #06C755", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 30 }}>🎬</div>
        <h3 style={{ margin: "6px 0 4px" }}>ให้เราทำให้ (Production)</h3>
        <p className="muted" style={{ fontSize: 13 }}>ไม่มีเวลาทำเอง? ให้ทีม Babe House Production ตัดต่อ/ทำคอนเทนต์ให้ครบวงจร</p>
        <ul style={{ paddingLeft: 18, fontSize: 13, margin: "10px 0" }}><li style={{ marginBottom: 3 }}>🎞️ รับตัดต่อคลิป Reels/TikTok</li><li style={{ marginBottom: 3 }}>📸 ผลิตคอนเทนต์ครบวงจร</li><li>🧠 วางแผน + โปรดิวซ์โดยทีมมือโปร</li></ul>
        <div style={{ margin: "auto 0 0" }}>
          <Link to="/production" className="btn full" style={{ background: "#06C755", boxShadow: "0 8px 22px rgba(6,199,85,.28)" }}>🎬 ดูผลงาน & ส่งบรีฟ →</Link>
        </div>
      </div>
      <div className="card" style={{ margin: 0, borderTop: "4px solid #6b3fa0", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 30 }}>🤖</div>
        <h3 style={{ margin: "6px 0 4px" }}>ให้ AI ตรวจคลิป</h3>
        <p className="muted" style={{ fontSize: 13 }}>ลงคลิปแล้วคนไม่ดู? อัปคลิปให้ครูพี่คิม AI ดูทุกวินาที บอกตรงๆ ว่าต้องแก้อะไร</p>
        <ul style={{ paddingLeft: 18, fontSize: 13, margin: "10px 0" }}><li style={{ marginBottom: 3 }}>🎣 Hook 3 วิแรก</li><li style={{ marginBottom: 3 }}>🎨 ภาพ/แสง/การตัดต่อ</li><li>🎙️ น้ำเสียง/จังหวะพูด</li></ul>
        <div style={{ textAlign: "center", margin: "auto 0 12px" }}><span style={{ fontSize: 26, fontWeight: 800, color: "#6b3fa0" }}>199฿</span> <span className="muted" style={{ fontSize: 13 }}>/ คลิป</span></div>
        <Link to="/video-audit" className="btn full" style={{ background: "#6b3fa0", boxShadow: "0 8px 22px rgba(107,63,160,.28)" }}>ตรวจคลิปเลย →</Link>
      </div>
    </div>
  </>;
}

// การ์ดให้ลูกค้ารีวิวเล่มของตัวเอง → เก็บไว้โชว์เป็น social proof ตอนเปิดขาย
export function ReviewCard({ demo, bpId }) {
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
    setErr(""); if (!rating) { setErr("ให้ดาวก่อนนะคะ ⭐"); return; }
    if (demo) { setDone(true); setOpen(false); return; }
    setBusy(true);
    try { await api("/api/me/review", { method: "POST", token: session.token, body: { blueprint_id: bpId, rating, text, display_name: name, role, allow_public: pub } }); setDone(true); setOpen(false); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const stars = (sz, on) => <div className="row" style={{ gap: 4 }}>{[1, 2, 3, 4, 5].map(n => <span key={n} onClick={on ? () => setRating(n) : undefined} onMouseEnter={on ? () => setHover(n) : undefined} onMouseLeave={on ? () => setHover(0) : undefined} style={{ fontSize: sz, color: n <= (hover || rating) ? "#f5b301" : "#dcdce3", cursor: on ? "pointer" : "default", lineHeight: 1 }}>★</span>)}</div>;
  if (done && !open) return <div className="card" style={{ background: "#fff8ef", border: "1px solid #f0d9a8", textAlign: "center" }}>
    <div style={{ fontSize: 15.5, fontWeight: 800, color: "#9a6b1f" }}>⭐ ขอบคุณสำหรับรีวิวค่ะ! 🩵</div>
    <div style={{ display: "inline-flex", margin: "8px 0" }}>{stars(26, false)}</div>
    <p className="muted" style={{ fontSize: 13, maxWidth: 460, margin: "0 auto" }}>รีวิวของคุณอาจถูกนำไปเป็นกำลังใจให้คนที่กำลังตัดสินใจ — แก้ไขได้ตลอดค่ะ</p>
    <button className="link" style={{ background: "none", border: 0, cursor: "pointer", marginTop: 6 }} onClick={() => setOpen(true)}>แก้ไขรีวิว</button>
  </div>;
  return <div className="card" style={{ border: "1px solid #f0d9a8", background: "#fffdf8" }}>
    <div style={{ fontWeight: 800, fontSize: 17, color: "#9a6b1f", textAlign: "center" }}>⭐ เล่มนี้ช่วยคุณได้แค่ไหน?</div>
    <p className="muted" style={{ fontSize: 14, textAlign: "center", margin: "6px auto 14px", maxWidth: 480 }}>ให้ดาว + เล่าสั้นๆ เป็นกำลังใจให้ครูพี่คิม และช่วยคนที่กำลังลังเลให้กล้าเริ่ม 🩵</p>
    <div className="center" style={{ marginBottom: 14 }}>{stars(38, true)}</div>
    <div className="field"><textarea value={text} onChange={e => setText(e.target.value)} style={{ minHeight: 80 }} placeholder="เล่าหน่อยว่าเล่มนี้ช่วยอะไรคุณบ้าง เช่น 'ได้ไอเดียคอนเทนต์ครบเดือน ไม่ต้องนั่งคิดเองแล้ว'" /></div>
    <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
      <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}><label style={{ fontSize: 13 }}>ชื่อที่อยากให้แสดง</label><input value={name} onChange={e => setName(e.target.value)} placeholder="เช่น คุณเอ / ร้านบ้านสวน" /></div>
      <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}><label style={{ fontSize: 13 }}>อาชีพ/ทำอะไร (ไม่บังคับ)</label><input value={role} onChange={e => setRole(e.target.value)} placeholder="เช่น แม่ค้าออนไลน์ / ฟรีแลนซ์" /></div>
    </div>
    <label className="row" style={{ gap: 8, fontSize: 13.5, margin: "12px 0 4px", cursor: "pointer" }}><input type="checkbox" checked={pub} onChange={e => setPub(e.target.checked)} style={{ width: 18, height: 18 }} />ยินดีให้นำรีวิวนี้ไปโชว์เป็นตัวอย่างได้</label>
    {err && <div className="msg err">{err}</div>}
    <div className="center" style={{ marginTop: 12 }}><button className="btn" disabled={busy} onClick={submit} style={{ background: "#f5b301", color: "#5b4400", boxShadow: "0 8px 22px rgba(245,179,1,.3)" }}>{busy ? "กำลังส่ง..." : "ส่งรีวิว 🩵"}</button></div>
  </div>;
}

// กล่องฟีดแบกภายใน (สำหรับ testers บอกว่าอยากให้ปรับอะไร) — พับไว้ ไม่เด่นเท่ารีวิว
export function FeedbackCard({ demo, bpId }) {
  const [open, setOpen] = useState(false), [clarity, setClarity] = useState(0), [hover, setHover] = useState(0);
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [err, setErr] = useState("");
  const submit = async () => {
    setErr(""); if (!clarity && !msg.trim()) { setErr("บอกอะไรเราหน่อยนะคะ"); return; }
    if (demo) { setDone(true); return; }
    setBusy(true);
    try { await api("/api/me/feedback", { method: "POST", token: session.token, body: { blueprint_id: bpId, clarity, message: msg } }); setDone(true); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (done) return <div className="center muted" style={{ fontSize: 13.5, padding: "10px 0" }}>🙏 ขอบคุณสำหรับความเห็นค่ะ เราเอาไปพัฒนาต่อแน่นอน</div>;
  if (!open) return <div className="center" style={{ padding: "6px 0 2px" }}><button className="link" style={{ background: "none", border: 0, cursor: "pointer", fontSize: 13.5, color: "var(--muted)" }} onClick={() => setOpen(true)}>💬 มีอะไรอยากให้เราปรับปรุงไหมคะ? บอกทีมได้เลย</button></div>;
  return <div className="card" style={{ background: "var(--soft)" }}>
    <div style={{ fontWeight: 700, fontSize: 15 }}>💬 ช่วยบอกทีมหน่อย (ไม่เปิดเผยต่อสาธารณะ)</div>
    <div className="row" style={{ gap: 10, alignItems: "center", margin: "10px 0" }}><span className="muted" style={{ fontSize: 13.5 }}>เล่มอ่านง่าย/เข้าใจง่ายแค่ไหน?</span><div className="row" style={{ gap: 3 }}>{[1, 2, 3, 4, 5].map(n => <span key={n} onClick={() => setClarity(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} style={{ fontSize: 24, cursor: "pointer", color: n <= (hover || clarity) ? "#f5b301" : "#dcdce3" }}>★</span>)}</div></div>
    <textarea value={msg} onChange={e => setMsg(e.target.value)} style={{ minHeight: 72, width: "100%" }} placeholder="เช่น อยากให้สคริปต์สั้นลง / ตรงนี้งง / อยากได้ฟีเจอร์..." />
    {err && <div className="msg err">{err}</div>}
    <div className="row" style={{ gap: 10, marginTop: 8 }}><button className="btn ghost" disabled={busy} onClick={submit} style={{ padding: "9px 16px" }}>{busy ? "กำลังส่ง..." : "ส่งให้ทีม"}</button><button className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => setOpen(false)}>ปิด</button></div>
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
export function ShootingGuide() {
  const [open, setOpen] = useState(false);
  if (!open) return <div className="card" style={{ background: "linear-gradient(135deg,#FBF7EE,#F4F9FF)", border: "1px solid #e7dfc5" }}>
    <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
      <div><div style={{ fontWeight: 800, fontSize: 16 }}>🎬 ไม่รู้จะถ่ายคลิปยังไง?</div><div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>ดูคลิปตัวอย่างจริงของ Babe House — สคริปต์เดียวทำได้หลายแบบ</div></div>
      <button className="btn" onClick={() => setOpen(true)} style={{ flexShrink: 0, padding: "10px 18px" }}>ดูตัวอย่างคลิป →</button>
    </div>
  </div>;
  return <div className="card">
    <div className="between" style={{ marginBottom: 4 }}><h3 style={{ margin: 0 }}>🎬 ตัวอย่างการถ่าย</h3><button className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => setOpen(false)}>ปิด</button></div>
    <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>กดแบบที่ถนัด → ดูคลิปจริงได้เลยค่ะ 🩵</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
      {SHOOT_FORMATS.filter(f => f.clip).map((f, i) => <a key={i} href={`https://www.instagram.com/reel/${f.clip}/`} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit", background: f.color[0], borderRadius: 14, padding: "18px 12px", textAlign: "center", display: "block" }}>
        <div style={{ fontSize: 34, lineHeight: 1 }}>{f.emoji}</div>
        <div style={{ fontWeight: 800, fontSize: 14, color: f.color[1], marginTop: 8 }}>{f.name}</div>
        <div style={{ fontSize: 12.5, color: f.color[1], marginTop: 8, fontWeight: 700 }}>▶️ ดูคลิป</div>
      </a>)}
    </div>
  </div>;
}
