import { useState, useEffect, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api, session, filesToBase64 } from "../api.js";
import { sampleBlueprint } from "../sample.js";

const G_COLORS = { Awareness: "#2E86DE", Conversion: "#1a7f43", Branding: "#b8860b" };
// แปลงคำศัพท์เทคนิคเป็นไทยบ้านๆ ก่อนโชว์ลูกค้า (ลูกค้างงคำอังกฤษ)
const G_LABEL = { Awareness: "เรียกคนรู้จัก", Conversion: "พาไปซื้อ/ทักเรา", Branding: "สร้างตัวตน" };
const BEAT_LABEL = { HOOK: "เปิดให้สะดุด", BODY: "เนื้อหา", CTA: "ปิดท้าย · ชวนคนดูทำต่อ" };
const Num = ({ n }) => <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--blue)", color: "#fff", fontWeight: 800, fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", marginRight: 8, flexShrink: 0 }}>{n}</span>;
const modH = { display: "flex", alignItems: "center", margin: 0 };
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
// 🔧 LINE Official Account (2 บริการ) — แนะนำใส่ลิงก์ทางการ "https://lin.ee/xxxx"
//    จาก LINE OA Manager (โฮม → เพิ่มเพื่อน → คัดลอกลิงก์) จะสแกน/กดได้ชัวร์ที่สุด
const LINE_ACADEMY = { id: "@babehouse_academy", url: "https://line.me/R/ti/p/%40babehouse_academy" };
const LINE_WORK = { id: "@babehouse_work", url: "https://line.me/ti/p/0yBlh9zXFl" };
const qrImg = (data) => `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(data)}`;
const ACADEMY_COURSES = ["📱 All in Your Phone — ตัดต่อในมือถือ (3,745฿)", "🎬 ตัดต่อ Advance — สายเล่าเรื่อง (5,990฿)", "👑 Workshop ตัวต่อตัว"];

// บล็อกบริการ Babe House (ใช้ทั้งหน้าปฏิทินและมาราธอน)
function ServicesBlock() {
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
function ReviewCard({ demo, bpId }) {
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
function FeedbackCard({ demo, bpId }) {
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
// คลิปตัวอย่าง: ใส่ YouTube id ในช่อง clip เมื่อได้ลิงก์จากทีม (เว้นว่าง = ยังโชว์เฉพาะคู่มือ)
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
function ShootingGuide() {
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

export default function Dashboard() {
  const [sp] = useSearchParams();
  const demo = sp.get("demo") === "1";
  const userId = sp.get("user_id"), cycle = sp.get("billing_cycle"), bpId = sp.get("blueprint_id");
  const [bp, setBp] = useState(demo ? sampleBlueprint() : null);
  const [err, setErr] = useState("");
  const scriptRef = useRef(null), calRef = useRef(null), deepRef = useRef(null);
  // กดวันในปฏิทิน → เลือกวัน + เลื่อนไปที่สคริปต์ทันที (ไม่ต้องเลื่อนยาวเอง)
  const selectDay = (d) => { setSel(d); setTimeout(() => scriptRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); };
  const scrollToCal = () => calRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const [tab, setTab] = useState("strategy");
  const [view, setView] = useState("info");
  const [showDeep, setShowDeep] = useState(false);
  const [sel, setSel] = useState(1);
  const [uploaded, setUploaded] = useState(new Set());
  const [startedAt, setStartedAt] = useState(null);
  const [improveCount, setImproveCount] = useState(0);
  const [improveOpen, setImproveOpen] = useState(false);
  const [improving, setImproving] = useState(false);
  const [improveErr, setImproveErr] = useState("");
  const [ix, setIx] = useState({ products: "", pain_points: "", content_likes: "", content_dislikes: "", brand_info: "", more: "" });
  const [ixFiles, setIxFiles] = useState([]);
  // โหมดแยก 2 สเต็ป: contentReady = สร้างแผน 30 วันแล้วหรือยัง · genState = สถานะปุ่มสร้างแผน
  const [contentReady, setContentReady] = useState(demo);
  const [genState, setGenState] = useState("idle"); // idle | generating | error
  const [snapEdits, setSnapEdits] = useState({}); // แก้ค่า 6 ช่องตรงๆ (index→value ใหม่) ไม่ต้องเจนใหม่
  const [editTile, setEditTile] = useState(null);  // ช่องที่กำลังแก้
  const latestUrl = `/api/blueprints/latest?user_id=${encodeURIComponent(userId || "")}&billing_cycle=${encodeURIComponent(cycle || "")}&blueprint_id=${encodeURIComponent(bpId || "")}`;

  // สเต็ป 2: ลูกค้ายืนยันบทวิเคราะห์แม่น → สร้างปฏิทิน + 30 สคริปต์ (เจนเบื้องหลัง + poll จนเสร็จ)
  async function startContentGen() {
    if (demo) { setTab("calendar"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setGenState("generating");
    // ส่งค่า 6 ช่องที่ลูกค้าแก้เอง (ถ้ามี) → backend เอาไปอัปเดตบทวิเคราะห์ก่อนเจนคอนเทนต์ (ไม่ต้องเจนวิเคราะห์ใหม่)
    const snapshot_edits = Object.keys(snapEdits).length ? Object.entries(snapEdits).map(([i, value]) => ({ i: Number(i), value })) : null;
    try { await api("/api/generate-content", { method: "POST", body: { user_id: userId, billing_cycle: cycle, blueprint_id: bpId, snapshot_edits } }); pollContent(0); }
    catch (e) { setGenState("error"); }
  }
  function pollContent(attempt) {
    setTimeout(async () => {
      try {
        const d = await api(latestUrl, { token: session.token, adminKey: localStorage.getItem("babe_admin_key") || undefined });
        if (d.content_status === "ready") { setBp(d.blueprint); setContentReady(true); setGenState("idle"); setTab("calendar"); setTimeout(() => { if (calRef.current) calRef.current.scrollIntoView({ behavior: "auto", block: "start" }); else window.scrollTo(0, 0); }, 200); return; }
        if (d.content_status === "error") { setGenState("error"); return; }
        if (attempt === 40) { try { await api("/api/generate-content", { method: "POST", body: { user_id: userId, billing_cycle: cycle, blueprint_id: bpId } }); } catch {} } // กู้กรณีค้างจาก deploy
      } catch {}
      if (attempt < 90) pollContent(attempt + 1); else setGenState("error");
    }, 4000);
  }
  // refine บทวิเคราะห์ (ฟรี 1 ครั้ง) — async + poll analysis_status
  async function submitImprove() {
    if (demo) { setImproveErr("นี่คือเล่มตัวอย่างค่ะ — ในเล่มจริงกดแล้วครูพี่คิมจะแก้บทวิเคราะห์ให้แม่นขึ้นทันที 🩵"); return; }
    setImproving(true); setImproveErr("");
    try { const images = ixFiles.length ? await filesToBase64([...ixFiles], 8) : []; await api("/api/improve-blueprint", { method: "POST", body: { user_id: userId, billing_cycle: cycle, blueprint_id: bpId, extra: ix, images } }); pollAnalysis(0); }
    catch (e) { setImproveErr(e.message || "เกิดข้อผิดพลาด ลองอีกครั้งนะคะ"); setImproving(false); }
  }
  function pollAnalysis(attempt) {
    setTimeout(async () => {
      try {
        const d = await api(latestUrl, { token: session.token, adminKey: localStorage.getItem("babe_admin_key") || undefined });
        if (d.analysis_status === "ready") { setBp(d.blueprint); setImproveCount(d.improve_count || 1); setImproveOpen(false); setImproving(false); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
        if (d.analysis_status === "error") { setImproveErr("ครูพี่คิมเจนไม่สำเร็จ ลองอีกครั้งนะคะ"); setImproving(false); return; }
      } catch {}
      if (attempt < 60) pollAnalysis(attempt + 1); else { setImproveErr("ใช้เวลานานผิดปกติ ลองรีเฟรชหน้าดูนะคะ"); setImproving(false); }
    }, 4000);
  }

  useEffect(() => {
    if (demo) return;
    if (!userId || !cycle) { setErr("ไม่พบข้อมูลเล่ม"); return; }
    api(latestUrl, { token: session.token, adminKey: localStorage.getItem("babe_admin_key") || undefined })
      .then(d => { setBp(d.blueprint); setUploaded(new Set(d.marathon || [])); setStartedAt(d.started_at || null); setImproveCount(d.improve_count || 0); const ready = d.content_status === "ready"; setContentReady(ready); if (ready) setTab("calendar"); /* นักเรียนเก่ากลับมา = เห็นแผน 30 วันเลย ไม่ต้องตามหา */ })
      .catch((e) => { if (e.code === "NOT_OWNER") setErr(`🔒 เล่มนี้เป็นของบัญชี ${e.data?.owner_hint || ""} — กรุณาเข้าสู่ระบบด้วยอีเมลนั้นก่อนเปิดดูค่ะ`); else setErr("โหลดเล่มไม่สำเร็จ — อาจกำลังสร้างอยู่ หรือลิงก์ไม่ถูกต้อง"); });
  }, [userId, cycle]);

  async function toggleDay(d) {
    const has = uploaded.has(d);
    const next = new Set(uploaded);
    if (has) next.delete(d); else next.add(d);
    setUploaded(next);
    if (demo) return; // เดโม: โชว์ติ๊กเขียวได้ แต่ไม่บันทึก
    try { await api("/api/marathon/progress", { method: "POST", body: { user_id: userId, instagram_account: bp.instagram_account, billing_cycle: cycle, blueprint_id: bpId, uploaded_days: [...next], day: d, action: has ? "remove" : "upload" } }); } catch {}
  }

  if (err) return <div className="wrap narrow page-pad center"><div className="card"><h2>{err}</h2><Link className="btn" to="/account" style={{ marginTop: 16 }}>ไปบัญชีของฉัน</Link></div></div>;
  if (!bp) return <div className="wrap narrow page-pad center"><div className="spinner" /><p className="muted">กำลังโหลดเล่มของคุณ...</p></div>;

  const m = bp.modules || {};
  const script = (bp.scripts || []).find(s => s.d === sel) || (bp.scripts || [])[0];

  return (
    <div>
      {demo && <div style={{ background: "linear-gradient(135deg,var(--blue),var(--blue-d))", color: "#fff", padding: "10px 14px" }}>
        <div className="wrap" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 10, maxWidth: 820 }}>
          <span style={{ fontSize: 13.5, textAlign: "center" }}>🎬 <b>นี่คือตัวอย่าง Blueprint</b> — เล่มจริงวิเคราะห์จากช่องคุณโดยเฉพาะ</span>
          <Link to="/form" style={{ flexShrink: 0, background: "#fff", color: "var(--blue)", fontWeight: 700, padding: "7px 16px", borderRadius: 10, fontSize: 13.5, whiteSpace: "nowrap" }}>สร้างเล่มของฉัน · 490฿</Link>
        </div>
      </div>}
      <div className="wrap page-pad" style={{ maxWidth: 820 }}>
        <Link className="link" to={demo ? "/" : "/account"}>← {demo ? "กลับหน้าแรก" : "บัญชีของฉัน"}</Link>
        <div className="brand" style={{ marginTop: 12 }}>BABE HOUSE · CREATOR PLATFORM</div>
        <h1 className="page">AI Creator Blueprint</h1>
        <p className="muted" style={{ marginBottom: 16 }}>✓ {bp.instagram_account} · {bp.market_tier || "Premium"} · {bp.theme}</p>

        <div className="row" style={{ marginBottom: 18, background: "var(--soft)", borderRadius: 14, padding: 6 }}>
          {[["strategy", "📊 กลยุทธ์"], ["calendar", "📅 30 วัน"], ["marathon", "🏃‍♀️ มาราธอน"]].map(([k, l]) =>
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "10px", border: 0, borderRadius: 10, fontWeight: 700, cursor: "pointer", background: tab === k ? "#fff" : "transparent", color: tab === k ? "var(--blue)" : "var(--muted)", boxShadow: tab === k ? "0 2px 8px rgba(0,0,0,.06)" : "none" }}>{l}</button>)}
        </div>

        {tab === "strategy" && <>
          <div style={{ background: "linear-gradient(135deg,#ECEAF6,#E4F4F3)", border: "1px solid #d9d3ec", borderRadius: 18, padding: "18px 20px", lineHeight: 1.65, marginBottom: 16, fontSize: 15 }}><span style={{ fontSize: 22, marginRight: 6 }}>🩵</span>{bp.greeting}</div>
          {demo && <div className="card" style={{ border: "1px dashed var(--blue)", background: "#F4F8FD" }}>
            <div style={{ fontWeight: 800, marginBottom: 8, color: "var(--blue-d)" }}>🔍 นี่คือ <u>เล่มตัวอย่าง</u> — บทวิเคราะห์ยังไม่เจาะลึกเท่าเล่มจริงของคุณนะคะ เพราะ...</div>
            <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.8, margin: 0 }}>
              <li>เล่มจริง ครูพี่คิม (AI) <b>อ่านรูปสถิติหลังบ้านจริง</b>ของช่องคุณ — ทุกตัวเลขคือของคุณเอง</li>
              <li>วิเคราะห์จาก <b>ธุรกิจ เป้าหมาย และปัญหาจริง</b>ที่คุณกรอก ไม่ใช่เทมเพลตกลางๆ</li>
              <li><b>30 สคริปต์เขียนใหม่ทั้งหมด</b>ให้ตรงกับสินค้า/บริการของคุณ พร้อมอัดได้ทันที</li>
              <li>ได้ <b>บทวิเคราะห์การเติบโตรายเดือน</b> + แผนอัปเลเวลต่อเนื่อง</li>
            </ul>
            <Link className="btn full" to="/form" style={{ marginTop: 12 }}>สร้างเล่มจริงของฉัน · 490฿</Link>
          </div>}
          {bp.snapshot?.length > 0 && <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 4px" }}>🎴 ช่องของคุณใน 3 วินาที</h3>
            {!contentReady && <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>ตรงกับช่องคุณไหมคะ? <b style={{ color: "var(--blue-d)" }}>แตะ "แก้" ช่องที่ยังไม่ใช่</b> ได้เลย (ไม่ต้องเจนใหม่)</p>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {bp.snapshot.map((s, i) => {
                const c = [["#ECEAF6", "#6E63A6"], ["#E7EDF8", "#3F6BAE"], ["#E4F4F3", "#2C8E8C"], ["#F3F0F5", "#7E7392"], ["#F7F4EA", "#9A8458"], ["#E9EEF6", "#5573A0"]][i % 6];
                const val = snapEdits[i] ?? s.value;
                return <div key={i} style={{ background: c[0], borderRadius: 16, padding: "14px 12px", textAlign: "center", position: "relative" }}>
                  <div style={{ fontSize: 30, lineHeight: 1 }}>{s.emoji}</div>
                  <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, margin: "6px 0 4px", letterSpacing: .2 }}>{s.label}</div>
                  {editTile === i
                    ? <textarea autoFocus value={val} onChange={e => setSnapEdits(p => ({ ...p, [i]: e.target.value }))} onBlur={() => setEditTile(null)} rows={2} style={{ width: "100%", fontSize: 13, fontWeight: 700, color: c[1], textAlign: "center", border: `1.5px solid ${c[1]}`, borderRadius: 8, padding: "4px", background: "#fff", resize: "none" }} />
                    : <div style={{ fontSize: 14.5, fontWeight: 800, color: c[1], lineHeight: 1.3 }}>{val}</div>}
                  {!contentReady && editTile !== i && <button onClick={() => setEditTile(i)} style={{ marginTop: 9, background: "#fff", border: `1.5px solid ${c[1]}`, borderRadius: 20, color: c[1], fontSize: 12, fontWeight: 800, cursor: "pointer", padding: "4px 14px", boxShadow: "0 2px 6px rgba(0,0,0,.06)" }}>{snapEdits[i] != null ? "✓ แก้แล้ว" : "✏️ แก้"}</button>}
                </div>;
              })}
            </div>
          </div>}
          {!showDeep && <div className="center" style={{ background: "linear-gradient(135deg,#6E63A6,#3F6BAE,#2C8E8C)", color: "#fff", borderRadius: 20, padding: "26px 22px", margin: "4px 0 28px", boxShadow: "0 16px 38px rgba(63,107,174,.36)" }}>
            <div style={{ fontSize: 38, lineHeight: 1 }}>🔮</div>
            <h3 style={{ margin: "10px 0 6px", color: "#fff", fontSize: 22, lineHeight: 1.35 }}>ครูพี่คิมอ่านช่องคุณจบแล้วค่ะ...</h3>
            <p style={{ fontSize: 15.5, margin: "0 auto 18px", maxWidth: 440, opacity: .96, lineHeight: 1.6 }}>เห็นทั้ง <b>ของดีที่ซ่อนอยู่</b> และ <b>จุดที่ทำให้ยังไม่โต</b> เลย — อยากรู้ไหมคะว่าช่องคุณเป็นยังไง? 👀</p>
            <button className="btn-pulse" onClick={() => { setShowDeep(true); setTimeout(() => deepRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }} style={{ background: "#fff", color: "#3F6BAE", border: 0, borderRadius: 12, padding: "16px 30px", fontWeight: 800, fontSize: 17, cursor: "pointer" }}>เปิดอ่านบทวิเคราะห์ของฉัน →</button>
            <div style={{ fontSize: 12.5, opacity: .85, marginTop: 12 }}>ใช้เวลาอ่านแค่ 2 นาที · {contentReady ? "มีแผน 30 วันพร้อมแล้ว" : "แล้วค่อยสร้างแผน 30 วันต่อ"} 🩵</div>
          </div>}
          {(showDeep || !(bp.story?.length > 0)) && <>
          <div ref={deepRef} style={{ scrollMarginTop: 70 }} />
          {bp.story?.length > 0 && <div style={{ marginBottom: 18 }}>
            <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>📖 ครูพี่คิมเล่าให้ฟังก่อนนะคะ ว่าช่องคุณอยู่ตรงไหน แล้วเราจะไปต่อยังไง 🩵</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {bp.story.map((c, i) => { const sc = [["#ECEAF6", "#6E63A6"], ["#E7EDF8", "#3F6BAE"], ["#E4F4F3", "#2C8E8C"], ["#F3F0F5", "#7E7392"], ["#F7F4EA", "#9A8458"], ["#E9EEF6", "#5573A0"]][i % 6]; return <div key={i} style={{ background: sc[0], borderRadius: 16, padding: "16px 18px" }}>
                <div className="row" style={{ gap: 10, marginBottom: 6 }}><span style={{ fontSize: 26 }}>{c.emoji}</span><h3 style={{ margin: 0, fontSize: 16.5, color: sc[1] }}>{c.title}</h3></div>
                <p style={{ fontSize: 15, lineHeight: 1.8, margin: 0 }}>{c.body}</p>
              </div>; })}
            </div>
          </div>}
          {bp.metrics && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 16 }}>
            {[["👁️ ยอดเข้าถึง (Reach)", bp.metrics.reach], ["💙 ผู้ติดตาม", bp.metrics.followers], ["👤 เข้าชมโปรไฟล์", bp.metrics.profile_visits], ["🔗 กดลิงก์ไบโอ", bp.metrics.link_taps], ["⚡ Engagement", bp.metrics.engagement_rate, "%"]].filter(([, v]) => v != null).map(([l, v, suf]) =>
              <div key={l} className="card" style={{ margin: 0, padding: "16px 14px" }}><div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{l}</div><div style={{ fontSize: 24, fontWeight: 800, color: "var(--blue)", marginTop: 4 }}>{Number(v).toLocaleString("en-US")}{suf || ""}</div></div>)}
          </div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 16 }}>
            {[["🎯 เป้าหมายเดือนนี้", bp.theme], ["💎 ตลาด", bp.market_tier], ["👥 กลุ่มเป้าหมาย", bp.audience_summary], ["💡 อินไซต์", bp.follower_insight]].map(([l, v]) => v && <div key={l} className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{l}</div><div style={{ marginTop: 6, fontSize: 14.5 }}>{v}</div></div>)}
          </div>
          <div className="card"><h3 style={{ marginBottom: 12 }}>📊 สิ่งที่ครูพี่คิมเห็น</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
              {(bp.what_we_see || []).map((x, i) => <div key={i} style={{ display: "flex", gap: 10, background: "var(--soft)", borderRadius: 12, padding: "12px 14px" }}><span style={{ color: "var(--blue)", fontWeight: 800 }}>{i + 1}</span><span style={{ fontSize: 14 }}>{x}</span></div>)}
            </div>
            {bp.kim_insight && <div style={{ display: "flex", gap: 12, marginTop: 14, background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", border: "1px solid #d6e7fa", borderRadius: 14, padding: "14px 16px" }}><div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--blue)", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13 }}>คิม</div><div style={{ fontSize: 14.5 }}>{bp.kim_insight}</div></div>}
          </div>
          <div className="card"><h3 style={{ marginBottom: 14 }}>SWOT</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
              {[["จุดแข็ง", bp.swot?.strengths, "💪", "#E4F4F3", "#2C8E8C"], ["จุดอ่อน", bp.swot?.weaknesses, "⚠️", "#F3F0F5", "#7E7392"], ["โอกาส", bp.swot?.opportunities, "🚀", "#E7EDF8", "#3F6BAE"], ["ความเสี่ยง", bp.swot?.threats, "🛡️", "#F7F4EA", "#9A8458"]].map(([l, arr, ic, bg, fg]) =>
                <div key={l} style={{ background: bg, borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ fontWeight: 700, color: fg, marginBottom: 8 }}>{ic} {l}</div>
                  <ul style={{ paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{(arr || []).map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{x}</li>)}</ul>
                </div>)}
            </div>
          </div>
          <h2 className="serif" style={{ fontSize: 22, margin: "26px 0 6px" }}>✨ 5 โมดูลปั้นแบรนด์</h2>
          {m.archetype && <div className="card"><div className="row" style={{ gap: 10 }}><span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--blue)", color: "#fff", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>1</span><h3 style={{ margin: 0 }}>ตัวตนแบรนด์ (Archetype)</h3></div>
            <div style={{ fontWeight: 700, fontSize: 17, color: "var(--blue-d)", margin: "12px 0 6px" }}>{m.archetype.name}</div>
            <p style={{ fontSize: 14.5 }}>{m.archetype.body}</p>
            {m.archetype.tone && <div style={{ background: "var(--soft)", borderRadius: 12, padding: "12px 14px", marginTop: 12 }}><div style={{ fontWeight: 700, color: "var(--blue-d)", fontSize: 13, marginBottom: 4 }}>🎙️ Tone of Voice</div><div style={{ fontSize: 14 }}>{m.archetype.tone}</div></div>}
            {m.archetype.look && <div style={{ background: "var(--soft)", borderRadius: 12, padding: "12px 14px", marginTop: 10 }}><div style={{ fontWeight: 700, color: "var(--blue-d)", fontSize: 13, marginBottom: 4 }}>📸 ลุคหน้ากล้อง</div><div style={{ fontSize: 14 }}>{m.archetype.look}</div></div>}
          </div>}
          {m.avatar && <div className="card"><h3 style={modH}><Num n={2} />👤 ลูกค้าในฝัน</h3>
            <div className="row" style={{ margin: "10px 0 14px", gap: 14 }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg,#EAF3FD,#d6e7fa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, flexShrink: 0 }}>🙋‍♀️</div>
              <div><div style={{ fontWeight: 700, fontSize: 18, color: "var(--blue-d)" }}>{m.avatar.name}</div><div className="muted" style={{ fontSize: 13 }}>ตัวแทนกลุ่มเป้าหมายในฝันของคุณ</div></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
              {[["💭", "คิดอะไรอยู่", m.avatar.think], ["👀", "เห็นอะไรรอบตัว", m.avatar.see], ["👂", "ได้ยินอะไร", m.avatar.hear], ["😰", "กลัวอะไร", m.avatar.fear]].filter(([, , v]) => v).map(([ic, l, v]) =>
                <div key={l} style={{ background: "var(--soft)", borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 22 }}>{ic}</div><div style={{ fontWeight: 700, fontSize: 12, color: "var(--muted)", margin: "4px 0" }}>{l}</div><div style={{ fontSize: 13.5 }}>{v}</div></div>)}
            </div>
            {m.avatar.hookbank && <div style={{ marginTop: 14 }}><div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>🎣 คลังฮุกที่โดนใจเขา</div><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{m.avatar.hookbank.map((h, i) => <div key={i} style={{ background: "#fff7e6", border: "1px solid #f0deb0", borderRadius: 10, padding: "10px 12px", fontSize: 13.5 }}>"{h}"</div>)}</div></div>}
          </div>}
          {m.competitor && <div className="card"><h3 style={{ ...modH, marginBottom: 6 }}><Num n={3} />⚔️ คู่แข่ง</h3><p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>{m.competitor.intro}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
              {(m.competitor.rows || []).map((r, i) => <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ background: "var(--soft)", padding: "10px 14px", fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: 13.5, marginBottom: 8 }}><span className="muted" style={{ fontWeight: 700 }}>เขาทำ: </span>{r.they}</div>
                  <div style={{ fontSize: 13.5, color: "var(--up)" }}><b>✓ เราเหนือกว่า: </b>{r.gap}</div>
                </div>
              </div>)}
            </div>
            {m.competitor.blueocean && <div style={{ marginTop: 14, background: "linear-gradient(135deg,#2E86DE,#1B6FC4)", color: "#fff", borderRadius: 14, padding: "16px 18px" }}><div style={{ fontWeight: 700, marginBottom: 4 }}>🌊 Blue Ocean ของเรา</div><div style={{ fontSize: 14.5, opacity: .95 }}>{m.competitor.blueocean}</div></div>}
          </div>}
          {m.values && <div className="card"><h3 style={modH}><Num n={4} />💛 คุณค่าหลัก (Core Values)</h3>
            {m.values.list && <div className="row" style={{ gap: 8, margin: "12px 0" }}>{m.values.list.map((v, i) => <span key={i} style={{ background: "#EAF3FD", color: "var(--blue-d)", fontWeight: 700, fontSize: 13, padding: "8px 14px", borderRadius: 20 }}>{v}</span>)}</div>}
            {m.values.manifesto && <div style={{ background: "linear-gradient(135deg,#FBF9F4,#fff)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", fontStyle: "italic", fontSize: 14.5, lineHeight: 1.7 }}>"{m.values.manifesto}"</div>}
          </div>}
          {m.funnel && <div className="card"><h3 style={modH}><Num n={5} />🫧 Funnel</h3><div style={{ marginTop: 12 }}>{["top", "middle", "bottom"].map(k => m.funnel[k] && <div key={k} style={{ margin: "8px 0" }}><div className="between" style={{ fontSize: 13 }}><span><b>{m.funnel[k].label}</b> · {m.funnel[k].body}</span><span className="muted">{m.funnel[k].pct}%</span></div><div className="bar-track"><div className="bar-fill" style={{ width: `${m.funnel[k].pct}%` }} /></div></div>)}</div><p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{m.funnel.note}</p></div>}

          {contentReady ? <div className="center" style={{ background: "linear-gradient(135deg,#6E63A6,#3F6BAE)", color: "#fff", borderRadius: 18, padding: "26px 22px", marginTop: 12, marginBottom: 28, boxShadow: "0 14px 34px rgba(110,99,166,.34)" }}>
            <div style={{ fontSize: 32 }}>📅</div>
            <h3 style={{ margin: "6px 0 6px", color: "#fff", fontSize: 21 }}>นี่เพิ่งแค่ "กลยุทธ์" นะคะ — ของจริงอยู่ที่แผน 30 วัน!</h3>
            <p style={{ fontSize: 15, marginBottom: 18, maxWidth: 540, marginInline: "auto", opacity: .95, lineHeight: 1.65 }}>ครูพี่คิมเขียน <b>สคริปต์พร้อมอัดครบทั้ง 30 วัน</b> (เปิดให้สะดุด–เล่าเรื่อง–ปิดท้ายชวนทำต่อ) + แคปชันพร้อมโพสต์ + เกม Marathon ให้แล้วค่ะ มาเริ่มลงมือทำกันเลย!</p>
            <button className="btn-pulse" onClick={() => { setTab("calendar"); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ background: "#fff", color: "#3F6BAE", border: 0, borderRadius: 12, padding: "15px 28px", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>📅 มาเริ่มทำคอนเทนต์กันเลย →</button>
          </div> : <div className="center" style={{ background: "linear-gradient(135deg,#6E63A6,#3F6BAE)", color: "#fff", borderRadius: 18, padding: "28px 22px", marginTop: 12, marginBottom: 28, boxShadow: "0 14px 34px rgba(110,99,166,.34)" }}>
            {genState === "generating" ? <>
              <div className="spinner" style={{ border: "4px solid rgba(255,255,255,.35)", borderTopColor: "#fff", margin: "0 auto 14px" }} />
              <h3 style={{ color: "#fff", fontSize: 20, margin: "0 0 6px" }}>ครูพี่คิมกำลังสร้างแผน 30 วัน + สคริปต์ให้... 🩵</h3>
              <p style={{ opacity: .95, fontSize: 14.5 }}>ใช้เวลาประมาณ 1–2 นาที · อยู่หน้านี้รอได้เลย พอเสร็จเด้งเข้าตารางเอง — หรือปิดหน้าไปก่อนก็ได้ค่ะ เดี๋ยวส่งเมลแจ้งเมื่อพร้อม 📧</p>
            </> : genState === "error" ? <>
              <div style={{ fontSize: 30 }}>🥺</div>
              <h3 style={{ color: "#fff", fontSize: 19, margin: "4px 0 6px" }}>เอ๊ะ สะดุดนิดหน่อย</h3>
              <p style={{ opacity: .95, fontSize: 14.5, marginBottom: 14 }}>ลองกดสร้างใหม่อีกครั้งนะคะ (เงินไม่หาย บทวิเคราะห์ยังอยู่ครบ)</p>
              <button className="btn-pulse" onClick={startContentGen} style={{ background: "#fff", color: "#3F6BAE", border: 0, borderRadius: 12, padding: "14px 26px", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>ลองสร้างแผน 30 วันอีกครั้ง</button>
            </> : <>
              <div style={{ fontSize: 32 }}>📋</div>
              <h3 style={{ margin: "6px 0 6px", color: "#fff", fontSize: 21 }}>บทวิเคราะห์นี้ตรงกับช่องคุณไหมคะ?</h3>
              <p style={{ fontSize: 15, marginBottom: 18, maxWidth: 540, marginInline: "auto", opacity: .95, lineHeight: 1.65 }}>ถ้าตรงแล้ว กดสร้างแผน 30 วัน — ครูพี่คิมจะเขียนสคริปต์พร้อมอัดให้ครบ <b>โดยอิงจากบทวิเคราะห์นี้</b> ถ้ายังไม่ตรง เติมข้อมูลให้แม่นก่อนได้ (ฟรี) คอนเทนต์จะได้ตรงใจกว่าค่ะ</p>
              {!improveOpen && <div className="row" style={{ gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="btn-pulse" onClick={startContentGen} style={{ background: "#fff", color: "#3F6BAE", border: 0, borderRadius: 12, padding: "15px 26px", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>✅ ตรงแล้ว! สร้างแผน 30 วัน →</button>
                {improveCount < 1 && <button onClick={() => setImproveOpen(true)} style={{ background: "transparent", color: "#fff", border: "1.5px solid rgba(255,255,255,.7)", borderRadius: 12, padding: "15px 20px", fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}>✏️ ขอแก้ให้แม่นขึ้นก่อน (ฟรี)</button>}
              </div>}
              {improveCount >= 1 && !improveOpen && <div style={{ marginTop: 12, fontSize: 13.5, opacity: .9 }}>✓ แก้บทวิเคราะห์ให้แม่นขึ้นแล้ว — ถ้าตรงใจแล้วกดสร้างแผนได้เลยค่ะ</div>}
              {improveOpen && <div style={{ background: "#fff", color: "var(--ink)", borderRadius: 14, padding: "16px", marginTop: 6, textAlign: "left" }}>
                {improving ? <div className="center" style={{ padding: "22px 10px" }}>
                  <div className="spinner" style={{ margin: "0 auto 16px" }} />
                  <div style={{ fontWeight: 800, fontSize: 16.5, color: "var(--blue-d)" }}>ครูพี่คิมกำลังอ่านข้อมูลใหม่ของคุณ... 🩵</div>
                  <p className="muted" style={{ fontSize: 14, margin: "8px auto 0", maxWidth: 360, lineHeight: 1.6 }}>กำลังปรับบทวิเคราะห์ให้แม่นและเป็นคุณมากขึ้น ใช้เวลาประมาณ 1 นาที<br /><b>ไม่ต้องปิดหน้านะคะ</b> — พอเสร็จหน้าจะอัปเดตให้เองอัตโนมัติ ✨</p>
                </div> : <>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "var(--blue-d)", marginBottom: 4 }}>✏️ เล่าเพิ่มให้ครูพี่คิมฟัง</div>
                  <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>กรอกเท่าที่อยากเล่า (ไม่ต้องครบทุกช่อง) — บอก "แนวที่อยากทำ / ไม่อยากทำ" จะช่วยให้คอนเทนต์ตรงใจมากๆ · ใช้สิทธิ์ฟรีได้ครั้งเดียว</p>
                  <div style={{ background: "#fff7e6", border: "1px dashed #e0b85b", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#8a6d1f" }}>📊 ลืมแนบรูปสถิติ? แนบตรงนี้ได้เลย!</div>
                    <p className="muted" style={{ fontSize: 12.5, margin: "4px 0 8px" }}>ถ้ารอบแรกไม่ได้ใส่รูป Insight — แนบตอนนี้ ครูพี่คิมจะอ่านตัวเลขจริงแล้ววิเคราะห์แม่นขึ้นเยอะ</p>
                    <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => setIxFiles(e.target.files)} />
                    {ixFiles.length > 0 && <div className="hint" style={{ color: "#1a7f43" }}>✓ แนบแล้ว {Math.min(ixFiles.length, 8)} รูป</div>}
                  </div>
                  {[["products", "สินค้า/บริการที่อยากขายเดือนนี้", "เช่น คอร์สออนไลน์ 1,990฿ / รับงานแต่งหน้าเจ้าสาว"], ["pain_points", "ปัญหา/อุปสรรคตอนนี้", "เช่น คนทักเยอะแต่ปิดการขายไม่ได้"], ["content_likes", "แนวคอนเทนต์ที่อยากทำ", "เช่น สายเล่าเรื่องจริงจากชีวิต / สอนเป็นขั้นๆ"], ["content_dislikes", "แนวที่ไม่อยากทำ", "เช่น ไม่อยากทำสายตลก / ไม่อยากพูดเรื่องงานอดิเรกที่เล่นบอล-สะสมการ์ด"], ["brand_info", "เล่าเรื่องแบรนด์/ตัวตนเพิ่ม", "เช่น เริ่มจากศูนย์เมื่อ 2 ปีก่อน อยากเป็นแรงบันดาลใจให้แม่ๆ"], ["more", "อื่นๆ ที่อยากบอก", "พิมพ์อะไรก็ได้ที่อยากให้ครูพี่คิมรู้"]].map(([k, label, ph]) =>
                    <div key={k} className="field"><label style={{ fontSize: 13.5 }}>{label}</label><textarea value={ix[k]} onChange={e => setIx(v => ({ ...v, [k]: e.target.value }))} style={{ minHeight: 60 }} placeholder={ph} /></div>)}
                  {improveErr && <div className="msg err">{improveErr}</div>}
                  <div className="row" style={{ gap: 10, justifyContent: "center" }}>
                    <button className="btn" onClick={submitImprove}>แก้บทวิเคราะห์ให้แม่นขึ้น 🩵</button>
                    <button className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => setImproveOpen(false)}>ยกเลิก</button>
                  </div>
                </>}
              </div>}
            </>}
          </div>}
          </>}

          <ReviewCard demo={demo} bpId={bpId} />
          <FeedbackCard demo={demo} bpId={bpId} />

          {!demo && <Link to="/video-audit" className="card" style={{ display: "block", textDecoration: "none", color: "inherit", border: "1px dashed #d6a0e0", background: "#faf3fc" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#6b3fa0" }}>🎬 ลงคลิปแล้วคนไม่ดู? ให้ครูพี่คิมตรวจคลิปให้</div>
            <p className="muted" style={{ fontSize: 14, margin: "6px 0 0" }}>อัปคลิป → AI ดูทุกวินาที บอกตรงๆ ว่า Hook/ภาพ/เสียง/ตัดต่อ ต้องแก้อะไร · 199฿/คลิป →</p>
          </Link>}
        </>}

        {tab !== "strategy" && !contentReady && <div className="card center" style={{ padding: "30px 20px" }}>
          <div style={{ fontSize: 32 }}>📋</div>
          <h3 style={{ margin: "8px 0 4px" }}>ยังไม่ได้สร้างแผน 30 วันค่ะ</h3>
          <p className="muted" style={{ fontSize: 14.5, maxWidth: 420, margin: "0 auto 14px" }}>กลับไปที่แท็บ "กลยุทธ์" อ่านบทวิเคราะห์ → ยืนยันว่าตรง → กดสร้างแผน 30 วันก่อนนะคะ 🩵</p>
          <button className="btn" onClick={() => { setTab("strategy"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>← ไปยืนยันบทวิเคราะห์</button>
        </div>}
        {tab === "calendar" && contentReady && <>
          <div ref={calRef} style={{ scrollMarginTop: 70, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginBottom: 18 }}>
            {(bp.calendar || []).map(c => { const done = uploaded.has(c.d); return <button key={c.d} onClick={() => selectDay(c.d)} style={{ border: sel === c.d ? "2px solid var(--blue)" : done ? "1.5px solid #4caf7d" : "1px solid var(--border)", borderRadius: 12, padding: 12, background: done ? "#e8f5ee" : sel === c.d ? "#EAF3FD" : "#fff", cursor: "pointer", textAlign: "left" }}>
              <div className="between"><span style={{ fontWeight: 800, fontSize: 14, color: done ? "#1a7f43" : "inherit" }}>{done ? "✓ " : ""}วันที่ {c.d}</span><span style={{ width: 9, height: 9, borderRadius: "50%", background: G_COLORS[c.g] || "var(--muted)", display: "inline-block" }} /></div>
              <div style={{ fontSize: 10, color: G_COLORS[c.g] || "var(--muted)", fontWeight: 700, margin: "2px 0 5px" }}>{G_LABEL[c.g] || c.g}</div>
              <div style={{ fontSize: 12, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", color: done ? "#1a7f43" : "inherit" }}>{c.t}</div>
            </button>; })}
          </div>
          {script && (() => {
            const BEAT = { HOOK: "#2E86DE", BODY: "#1a7f43", CTA: "#b8860b" };
            const copy = (t) => navigator.clipboard?.writeText(t);
            const title = (bp.calendar.find(c => c.d === script.d) || {}).t;
            return <div ref={scriptRef} className="card" style={{ scrollMarginTop: 70 }}>
              <div className="between" style={{ marginBottom: 8 }}><span className="tag" style={{ background: "var(--soft)", color: G_COLORS[script.g] }}>วันที่ {script.d} · {G_LABEL[script.g] || script.g}</span><button className="link" onClick={scrollToCal} style={{ background: "none", border: 0, fontSize: 13, cursor: "pointer" }}>↑ เลือกวันอื่น</button></div>
              <h3 style={{ margin: "10px 0 4px" }}>{title}</h3>
              <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>🎬 บทพูดอัดคลิป — กดคัดลอกแล้วใช้ได้เลย</p>
              {(script.beats || []).map((b, i) => <div key={i} style={{ borderLeft: `4px solid ${BEAT[b.s] || "var(--blue)"}`, background: "var(--soft)", borderRadius: "0 12px 12px 0", padding: "12px 14px", marginBottom: 10 }}>
                <div className="row" style={{ gap: 8, marginBottom: 6 }}><span style={{ background: BEAT[b.s] || "var(--blue)", color: "#fff", fontWeight: 700, fontSize: 11, padding: "2px 10px", borderRadius: 20 }}>{BEAT_LABEL[b.s] || b.s}</span><span className="muted" style={{ fontSize: 12 }}>{b.ts}</span></div>
                <p style={{ margin: "0 0 6px", fontSize: 15 }}>{b.say}</p>
                <div className="row" style={{ gap: 6 }}>{b.ost && <span style={{ fontSize: 11, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "3px 8px" }}>📺 {b.ost}</span>}{b.vis && <span style={{ fontSize: 11, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "3px 8px" }}>🎥 {b.vis}</span>}</div>
              </div>)}
              <div style={{ background: "var(--soft)", borderRadius: 12, padding: "12px 14px", marginTop: 4 }}><div className="between"><b style={{ fontSize: 13 }}>แคปชั่น & แฮชแท็ก</b><button className="link" onClick={() => copy(script.cap)} style={{ background: "none", border: 0, fontSize: 13 }}>คัดลอก 📋</button></div><p style={{ fontSize: 14, marginTop: 6 }}>{script.cap}</p></div>
              <div className="msg" style={{ background: "#fff7e6", color: "#8a6d1f", marginTop: 8 }}>💡 ทิปครูพี่คิม: {script.tip}</div>
              <button type="button" onClick={() => toggleDay(script.d)} style={{ width: "100%", marginTop: 14, padding: "14px", borderRadius: 12, border: 0, cursor: "pointer", fontWeight: 800, fontSize: 15, color: "#fff", background: uploaded.has(script.d) ? "#1a7f43" : "var(--blue)", boxShadow: uploaded.has(script.d) ? "0 6px 18px rgba(26,127,67,.28)" : "0 6px 18px rgba(46,134,222,.28)" }}>
                {uploaded.has(script.d) ? "✓ ทำคลิปวันนี้แล้ว! เก่งมากค่ะ 🎉 (กดเพื่อยกเลิก)" : "☐ ทำคลิปนี้เสร็จแล้ว — กดติ๊กเลย!"}
              </button>
            </div>;
          })()}

          {script && <ShootingGuide />}
          <ServicesBlock />
        </>}

        {tab === "marathon" && contentReady && (() => {
          const done = uploaded.size;
          // ปีศาจเวลานับจาก "วันที่เริ่มเล่ม" เริ่ม 0 แล้วเพิ่มตามเวลาจริง (ไม่ใช่วันที่ของเดือน)
          const startMs = startedAt ? new Date(startedAt).getTime() : Date.now();
          const day = Math.max(0, Math.min(30, Math.floor((Date.now() - startMs) / 86400000)));
          const youPct = Math.min(100, Math.round(done / 30 * 100));
          const ghostPct = Math.min(100, Math.round(day / 30 * 100));
          const lead = done - day;
          const rank = done >= 15 ? "💎 Diamond" : done >= 5 ? "🥇 Gold" : "🥈 Silver";
          const next = done >= 15 ? "🏆 คุณคือ Diamond แล้ว!" : done >= 5 ? `อีก ${15 - done} คลิป สู่ 💎 Diamond` : `อีก ${5 - done} คลิป สู่ 🥇 Gold`;
          return <>
            <div className="card">
              <div className="between"><h3 style={modH}>🏃‍♀️ Babe Content Marathon</h3><span style={{ background: "#fff7e6", color: "#8a6d1f", fontWeight: 700, fontSize: 12, padding: "4px 12px", borderRadius: 20 }}>ซีซั่น: {MONTHS_TH[new Date().getMonth()]}</span></div>
              <p className="muted" style={{ fontSize: 13, margin: "6px 0 18px" }}>แข่งกับเวลาจริง — ผ่านมา {day}/30 วันของแผน · อัปคลิปให้ทันก่อนปีศาจเวลาจะถึงเส้นชัย 👻🏁</p>
              {[["🐰", "ตัวคุณ", done, youPct, "46,134,222"], ["👻", "ปีศาจเวลา", day, ghostPct, "138,109,31"]].map(([emo, label, n, pct, rgb]) =>
                <div key={label} style={{ marginBottom: 14 }}>
                  <div className="between" style={{ fontSize: 13, marginBottom: 6 }}><span style={{ fontWeight: 700 }}>{emo} {label}</span><span className="muted">{n} / 30 วัน</span></div>
                  <div style={{ position: "relative", height: 36, background: "var(--soft)", borderRadius: 18 }}>
                    <div style={{ position: "absolute", inset: "0 0 0 0", width: `${pct}%`, background: `rgba(${rgb},.18)`, borderRadius: 18 }} />
                    <div style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", fontSize: 18 }}>🏁</div>
                    <div style={{ position: "absolute", top: "50%", left: `calc(${pct}% - 13px)`, transform: "translateY(-50%)", fontSize: 24, transition: "left .5s ease", filter: "drop-shadow(0 1px 2px rgba(0,0,0,.2))" }}>{emo}</div>
                  </div>
                </div>)}
              <div style={{ borderRadius: 12, padding: "14px 16px", background: lead >= 0 ? "#e8f5ee" : "#fff7e6", color: lead >= 0 ? "#1a7f43" : "#8a6d1f", fontSize: 14.5, marginTop: 4 }}>
                💬 <b>ครูพี่คิม:</b> {lead >= 0 ? `เยี่ยมมาก! คุณนำปีศาจเวลาอยู่ ${lead} วัน 🎉 รักษาจังหวะนี้ไว้นะคะ` : `ปีศาจเวลาแซงไป ${-lead} วันแล้ว ⏰ รีบอัปคลิปไล่ตามกันค่ะ — ความสม่ำเสมอคือกุญแจของการเติบโต`}
              </div>
            </div>
            <div className="card between"><div><div className="muted" style={{ fontSize: 12 }}>ระดับแรงก์สะสมผลงาน</div><div style={{ fontSize: 22, fontWeight: 800 }}>{rank}</div></div><div style={{ color: "var(--blue)", fontWeight: 700, fontSize: 14 }}>{next}</div></div>
            <div className="card"><h3 style={{ marginBottom: 4 }}>📅 ติ๊กวันที่ส่งคลิปแล้ว</h3><p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>ติ๊กแล้ว 🐰 ของคุณจะวิ่งเข้าใกล้เส้นชัยขึ้น</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8 }}>
                {Array.from({ length: 30 }, (_, i) => i + 1).map(d => <button key={d} onClick={() => toggleDay(d)} disabled={demo} style={{ aspectRatio: "1", border: 0, borderRadius: 10, cursor: demo ? "default" : "pointer", fontWeight: 700, background: uploaded.has(d) ? "var(--blue)" : "var(--soft)", color: uploaded.has(d) ? "#fff" : "var(--muted)" }}>{uploaded.has(d) ? "✓" : d}</button>)}
              </div>{demo && <p className="muted center" style={{ fontSize: 13, marginTop: 12 }}>(โหมดตัวอย่าง — ติ๊กได้เมื่อเป็นเล่มจริง)</p>}
            </div>
            <ServicesBlock />
          </>;
        })()}

        {!demo && <div className="card center" style={{ background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", border: "1px solid #d6e7fa", marginTop: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>ทำครบ 30 วันแล้วใช่ไหมคะ? 🩵</div>
          <p className="muted" style={{ margin: "6px 0 14px" }}>ปลดล็อกแผนเดือนใหม่ เพื่อต่อยอดการเติบโต</p>
          <Link className="btn" to={`/form?renew=1&email=${encodeURIComponent(session.email || "")}`}>+ เพิ่มแผนเดือนใหม่ (490฿)</Link>
        </div>}
      </div>
    </div>
  );
}
