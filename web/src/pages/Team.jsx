import { useState, useEffect } from "react";
import { api } from "../api.js";

// ═══════════ 👥 Babe House Team — หน้าทำงานของทีม (คิมออกแบบ 3 ส.ค. 2569) ═══════════
// "แต่ละคนต้องมีรหัสเข้าของตัวเอง พอเข้าไปแล้วมันก็จะขึ้นเลยว่าเค้าต้องทำงานอะไรบ้าง
//  แล้วส่งวันไหน คือเห็นเฉพาะของตัวเองนะ อย่างลูกตาลก็จะเป็นหน้าตรวจงานกระจายงาน
//  แล้วก็อีกอันนึงเป็นที่ฉันเห็นภาพรวมการทำงานทุกอย่าง ซึ่งมันจะแตกต่างกันตามรหัสที่เข้า"
//
// หน้าเดียว แต่เห็นไม่เหมือนกันตามบทบาท:
//   editor  → เห็นเฉพาะงานที่ถูกมอบหมายให้ตัวเอง + ปุ่มส่งงาน
//   senior  → งานตัวเอง + คิวตรวจงานฟรีแลนซ์ (โบ / พี่ก้อง)
//   ae      → เห็นทุกงาน + กระจายงาน + ตรวจด่านสุดท้ายก่อนส่งลูกค้า (ลูกตาล)
//   owner   → ทุกอย่าง + ยอดเงิน + กำไร + จัดการสมาชิก (คิมคนเดียว)
// ⛔ ทุกบทบาทยกเว้น owner ไม่เห็นยอดเงินและอีเมลเต็มของลูกค้า — ตัดตั้งแต่ SQL ไม่ใช่ซ่อนในหน้าเว็บ

const ROLE_TH = { owner: "เจ้าของ", ae: "AE / ผู้ดูแลงาน", senior: "หัวหน้าทีมตัดต่อ", editor: "ทีมตัดต่อ", teacher: "ผู้สอน" };
const DAY = 86400000;

// กลุ่มงานเรียงตามลำดับที่ต้องลงมือจริง
const GROUPS = [
  { k: "revising", label: "✏️ แก้ตามคอมเมนต์ลูกค้า", tone: "#B26A00" },
  { k: "editing", label: "🎬 กำลังตัด", tone: "#5a3fc0" },
  { k: "assigned", label: "📌 เพิ่งได้รับงาน", tone: "#5a3fc0" },
  { k: "senior_review", label: "👀 รอหัวหน้าตรวจ", tone: "#0b6ea8" },
  { k: "ae_review", label: "✅ รอ AE ตรวจก่อนส่ง", tone: "#0b6ea8" },
  { k: "awaiting_files", label: "⏳ รอลูกค้าส่งไฟล์", tone: "#8a7f9c" },
  { k: "draft_sent", label: "📨 ส่งให้ลูกค้าดูแล้ว", tone: "#1a7f43" },
];

// งานชิ้นนี้รอ "คนนี้" ตรวจอยู่ไหม — โบ/พี่ก้องดูด่านหัวหน้า · ลูกตาล/คิมดูด่านสุดท้าย
// (AE รับแทนหัวหน้าได้ถ้าหัวหน้าไม่ว่าง แต่ต้องกดอนุมัติสองครั้ง งานถึงจะถึงลูกค้า)
const reviewGate = (j, me) =>
  (me.role === "senior" && j.status === "senior_review") ||
  (["owner", "ae"].includes(me.role) && ["senior_review", "ae_review"].includes(j.status));

const dueChip = (due) => {
  if (!due) return null;
  const left = Math.ceil((new Date(due) - Date.now()) / DAY);
  if (left < 0) return { t: `เลยกำหนด ${-left} วัน`, bg: "#fde8e8", c: "#b42318" };
  if (left === 0) return { t: "ส่งวันนี้", bg: "#fde8e8", c: "#b42318" };
  if (left <= 2) return { t: `เหลือ ${left} วัน`, bg: "#fff4e5", c: "#B26A00" };
  return { t: `เหลือ ${left} วัน`, bg: "#eef6ef", c: "#1a7f43" };
};

// 🎨 ระบบสี 3 สี (คิมกำหนดเอง 3 ส.ค.)
// แดง = ด่วน ต้องส่งแล้ว · เหลือง = ยังไม่เสร็จ แต่ไม่ด่วน · เขียว = เสร็จแล้ว
const C = { red: "#d1382c", yellow: "#d99100", green: "#1a7f43", orange: "#e8590c" };
// ปุ่มไฟล์ในบรีฟ — กดง่ายกว่าลิงก์ตัวหนังสือ และเห็นชัดว่ามีไฟล์อะไรบ้างในแวบเดียว
const fileBtn = { display: "inline-block", border: "1px solid #e5ded6", background: "#fff", borderRadius: 999,
  padding: "6px 13px", fontSize: 13, color: "#5b5147", textDecoration: "none", whiteSpace: "nowrap" };
// 🎨 สีบอกสถานะงาน (คิมเคาะเพิ่ม 8 ส.ค.)
// "โบกดส่งมันต้องเปลี่ยนเป็นสีเขียวปะ จะได้รู้ว่าตัวเองแก้ส่งไปแล้ว
//  ถ้าลูกค้าส่ง feedback มาใหม่ก็เปลี่ยนเป็นสีส้ม จะได้รู้ว่ายังไม่ได้ทำ"
// สีตอบคำถามเดียว: "ตอนนี้ลูกบอลอยู่ที่ใคร"
//   เขียว = ส่งไปแล้ว ไม่ได้อยู่ที่เรา (รอตรวจ / รอลูกค้าดู / จบ)
//   ส้ม  = ลูกค้าตีกลับมา ต้องลงมือแก้  ← เร่งกว่าเหลือง เพราะลูกค้ารออยู่
//   แดง  = เลยกำหนดส่งหรือส่งวันนี้
//   เหลือง = งานปกติที่ยังไม่เสร็จ
function jobColor(j) {
  if (j.status === "revising") return "orange";                       // ลูกค้าส่งจุดแก้มา = ยังไม่ได้ทำ
  if (["done", "draft_sent", "senior_review", "ae_review"].includes(j.status)) return "green";  // ส่งออกจากมือเราแล้ว
  if (j.due_at) {
    const left = Math.ceil((new Date(j.due_at) - Date.now()) / DAY);
    if (left <= 0) return "red";                                       // เลยกำหนดหรือส่งวันนี้
  }
  return "yellow";
}
const Dot = ({ c }) => <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: c, marginRight: 5, verticalAlign: "middle" }} />;

// 💬 ข้อความในสายสนทนา — เดิมพิมพ์ออกดิบๆ ทำให้ขึ้นบรรทัดที่ลูกค้าเว้นไว้หายหมด
// คิมทัก 11 ส.ค.: "ทำเป็นแนวตั้งดีกว่าจะอ่านง่ายกว่าแนวนอน"
// รอบแก้ที่ลูกค้าส่งมาเป็น "1. ... 2. ... 3. ..." พออยู่บรรทัดเดียวคนตัดต้องไล่อ่านหาทีละจุด อ่านตกได้ง่าย
// → แต่ละจุดขึ้นบรรทัดของตัวเอง + เวลาในคลิป [0:45] ทำเป็นป้ายสีฟ้าให้สะดุดตา (คนตัดใช้เลขนี้กระโดดไปแก้)
function CommentBody({ text }) {
  const lines = String(text || "").split("\n");
  return (
    <div style={{ display: "grid", gap: 3 }}>
      {lines.map((raw, i) => {
        const ln = raw.trimEnd();
        if (!ln.trim()) return <div key={i} style={{ height: 4 }} />;
        const m = ln.match(/^(\d+)\.\s*(?:\[([^\]]+)\]\s*)?([\s\S]*)$/);   // "3. [1:00] อย่าให้เหลือ"
        if (!m) return <div key={i} style={{ whiteSpace: "pre-wrap" }}>{ln}</div>;
        return (
          <div key={i} style={{ display: "flex", gap: 7, alignItems: "baseline" }}>
            <span style={{ color: "#a89f96", fontWeight: 700, minWidth: 16, flexShrink: 0 }}>{m[1]}.</span>
            {m[2] && <span style={{ flexShrink: 0, background: "#EAF3FD", color: "#0b4da8", fontWeight: 800,
              borderRadius: 6, padding: "1px 7px", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{m[2]}</span>}
            <span style={{ minWidth: 0, whiteSpace: "pre-wrap" }}>{m[3]}</span>
          </div>
        );
      })}
    </div>
  );
}
// แถบ กาง/ย่อ ทั้งหมด — ใช้ซ้ำหลายที่
const ExpandBar = ({ list, setOpen }) => list.length > 1 ? (
  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
    <button style={{ ...ghost, fontSize: 12.5, padding: "6px 12px" }}
      onClick={() => setOpen(o => ({ ...o, ...Object.fromEntries(list.map(j => [j.order_id, true])) }))}>กางทั้งหมด</button>
    <button style={{ ...ghost, fontSize: 12.5, padding: "6px 12px" }}
      onClick={() => setOpen(o => ({ ...o, ...Object.fromEntries(list.map(j => [j.order_id, false])) }))}>ย่อทั้งหมด</button>
  </div>
) : null;

const card = { background: "#fff", border: "1px solid #eee4dc", borderRadius: 14, padding: 16, marginBottom: 12 };
const btn = (bg = "#2f2a26") => ({ background: bg, color: "#fff", border: 0, borderRadius: 999, padding: "9px 18px", fontSize: 14, cursor: "pointer", fontWeight: 600 });
const ghost = { background: "#fff", color: "#2f2a26", border: "1px solid #ddd2c8", borderRadius: 999, padding: "8px 16px", fontSize: 14, cursor: "pointer" };
const input = { width: "100%", padding: "10px 12px", border: "1px solid #ddd2c8", borderRadius: 10, fontSize: 15, fontFamily: "inherit", boxSizing: "border-box" };


// 🔗 ทำให้ลิงก์ในข้อความกดได้ (คิมแจ้ง 7 ส.ค. "ลิงก์ของ Reference กดลิงค์ไม่ได้")
// ลูกค้าวางลิงก์มาหลายบรรทัด/ปนกับข้อความ — เดิมโชว์เป็นตัวหนังสือเฉยๆ ทีมต้องก๊อปไปวางเอง
// รับได้ทั้ง http(s):// และ www. · ตัดเครื่องหมายวรรคตอนท้ายลิงก์ออก (เช่น "ดูนี่ https://x.com/a." )
function Linkify({ text }) {
  if (!text) return null;
  const parts = String(text).split(/(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi);
  return <>{parts.map((p, i) => {
    if (!/^(https?:\/\/|www\.)/i.test(p)) return <span key={i}>{p}</span>;
    const clean = p.replace(/[.,;:!?)\]}]+$/, "");
    const tail = p.slice(clean.length);
    const href = /^www\./i.test(clean) ? `https://${clean}` : clean;
    return <span key={i}>
      <a href={href} target="_blank" rel="noreferrer noopener"
         style={{ color: "#0b6ea8", textDecoration: "underline", wordBreak: "break-all" }}>{clean}</a>{tail}
    </span>;
  })}</>;
}


// ป้ายเล็กเหนือช่องกรอก — ใช้ในหน้าตรวจคอนเทนต์
function L({ t, children }) {
  return <div style={{ marginTop: 8 }}>
    <div style={{ fontSize: 12, color: "#a89f96", marginBottom: 3 }}>{t}</div>{children}
  </div>;
}

export default function Team() {
  const [code, setCode] = useState(localStorage.getItem("babe_my_code") || "");
  const [typed, setTyped] = useState("");
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("jobs");
  const [gjUrl, setGjUrl] = useState({});      // ลิงก์ไฟล์งานที่แฟรี่กำลังพิมพ์ (แยกตามงาน)
  // ลิงก์คลิปที่คนขอมาแปะเพิ่มทีหลัง ในแท็บงานกราฟฟิก (คนละตัวกับช่องตอนสั่งงานครั้งแรกในการ์ดงานตัดต่อ)
  const [gjClipFix, setGjClipFix] = useState({});
  const [cp, setCp] = useState(null);         // คอนเทนต์ลูกค้า
  const [cpOpen, setCpOpen] = useState("");   // โปรเจคที่กางอยู่
  const [cpF, setCpF] = useState({ client_name: "", brief: "", want_count: 5, ref_links: "", due_at: "" });
  // 📥 ประตูรับงานประตูเดียว (คิมสั่ง 13 ส.ค.)
  //    เดิมมี 3 ประตูแยกกัน — ตัดต่อ/คอนเทนต์อยู่คนละแท็บ ส่วนกราฟฟิกขอได้จากในงานตัดต่อเท่านั้น
  //    ลูกตาลมองว่าเป็นเรื่องเดียวคือ "ลูกค้าสั่งงานมา" ต้องเลือกให้ถูกแท็บก่อนถึงจะกรอกได้ = พลาดง่าย
  //    → เหลือฟอร์มเดียว ติ๊กว่าเป็นงานอะไร แล้วระบบส่งให้คนที่ถูกต้องเอง
  const [kind, setKind] = useState("edit");   // edit | content | graphic
  const [ciD, setCiD] = useState({});         // ร่างที่กำลังแก้ (แยกตามชิ้น)
  const loadCp = (id) => api(`/api/team/content?code=${encodeURIComponent(code)}${id ? `&cp_id=${id}` : ""}`).then(setCp).catch(() => {});
  const [lv, setLv] = useState(null);         // ข้อมูลวันลา
  const [lvF, setLvF] = useState({ kind: "personal", day: "", reason: "", proof_url: "" });
  const [holF, setHolF] = useState({ day: "", name: "" });
  const loadLeave = () => api(`/api/team/leave?code=${encodeURIComponent(code)}`).then(setLv).catch(() => {});
  const [busy, setBusy] = useState("");
  const [draftUrl, setDraftUrl] = useState({});
  const [note, setNote] = useState({});
  const [open, setOpen] = useState({});
  const [showDone, setShowDone] = useState(false);
  const [doneQ, setDoneQ] = useState("");   // 🔎 คำค้นในกล่อง "งานที่จบแล้ว"
  // แท็บย่อย: ลูกค้าส่งจุดแก้ / รอตรวจ / งานฉัน / ดูรายคน
  // ⚠️ null = "ยังไม่ได้เลือกเอง" → ให้ระบบเปิดแท็บแรกที่มีงานจริงให้ (ดู autoSub ด้านล่าง)
  //    ของเดิมตั้งไว้ที่ "รอฉันตรวจ" ตายตัว ซึ่งของคนตัดมักว่าง เปิดมาเจอ "ไม่มีงานในหมวดนี้ค่ะ"
  //    ทั้งที่มีงานรออยู่อีกแท็บ — คิมเจอ 11 ส.ค. ลูกค้าส่งรอบแก้แล้วทีมไม่เห็น
  const [sub, setSub] = useState(null);
  const [person, setPerson] = useState(null); // ดูงานของใครอยู่ (มุมมองรายคน)
  const [ov, setOv] = useState(null);
  const [wl, setWl] = useState(null);      // 📅 ตารางงานทุกคน (AE/คิม)
  const [myAvail, setMyAvail] = useState([]);
  const [defSlots, setDefSlots] = useState(0);   // กำลังรับงานต่อวันของฉัน (คิมตั้งให้)
  const [ext, setExt] = useState([]);                 // 📦 งานนอกเว็บ
  const [intake, setIntake] = useState({ client_name: "", client_email: "", client_contact: "", title: "", brief: "", clips: 1, client_due: "", footage_url: "", ref_links: "" });
  const [intakeMsg, setIntakeMsg] = useState(null);
  const [rev, setRev] = useState(null);               // 🧠 รายงาน AI รายสัปดาห์
  const [extF, setExtF] = useState({ title: "", clips: 1, client: "", due_at: "", amount_baht: "" });

  const load = (c) => {
    const use = c ?? code; if (!use) return;
    api(`/api/team/me?code=${encodeURIComponent(use)}`)
      .then(r => { setD(r); setErr(""); setCode(use); localStorage.setItem("babe_my_code", use); })
      .catch(() => { setErr("รหัสไม่ถูกต้องค่ะ ลองใหม่นะคะ"); setD(null); });
  };
  useEffect(() => { if (code) load(code); }, []);   // eslint-disable-line
  useEffect(() => { if (!d) return; const t = setInterval(() => load(), 60000); return () => clearInterval(t); }, [d, code]);   // eslint-disable-line
  useEffect(() => { if (tab === "money" && d?.me?.role === "owner" && !ov)
    api(`/api/team/overview?code=${encodeURIComponent(code)}`).then(setOv).catch(() => {}); }, [tab, d, ov, code]);
  const loadCal = () => {
    api(`/api/team/availability?code=${encodeURIComponent(code)}`)
      .then(r => { setMyAvail(r.availability || []); setDefSlots(Number(r.default_slots || 0)); }).catch(() => {});
    const all = ["owner", "ae", "senior"].includes(d?.me?.role);
    if (all) api(`/api/team/workload?code=${encodeURIComponent(code)}`).then(setWl).catch(() => {});
    api(`/api/team/external?code=${encodeURIComponent(code)}${all ? "&all=1" : ""}`).then(r => setExt(r.jobs || [])).catch(() => {});
  };
  useEffect(() => { if (tab === "cal" && d) loadCal(); }, [tab, d]);   // eslint-disable-line
  useEffect(() => { if (tab === "leave" && d) loadLeave(); }, [tab, d]);   // eslint-disable-line
  useEffect(() => { if (tab === "content" && d) loadCp(cpOpen); }, [tab, d, cpOpen]);   // eslint-disable-line
  useEffect(() => { if (tab === "review" && d?.me?.role === "owner" && !rev)
    api(`/api/team/weekly-review?code=${encodeURIComponent(code)}`).then(setRev).catch(() => {}); }, [tab, d, rev, code]);

  const post = async (path, body, id) => {
    setBusy(id); setErr("");
    try { const r = await api(`${path}?code=${encodeURIComponent(code)}`, { method: "POST", body });
      await load(); setOv(null); return r; }
    catch (e) { setErr(e.message || "ทำรายการไม่สำเร็จค่ะ"); }
    finally { setBusy(""); }
  };

  // ── หน้าใส่รหัส ──
  if (!d) return (
    <div style={{ maxWidth: 380, margin: "12vh auto", padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>🩵</div>
      <h1 style={{ fontSize: 24, margin: "0 0 6px" }}>Babe House Team</h1>
      <p style={{ color: "#7c7268", fontSize: 14, marginBottom: 22 }}>ใส่รหัสส่วนตัวของคุณเพื่อดูงานของตัวเองค่ะ</p>
      <input style={{ ...input, textAlign: "center", letterSpacing: 1 }} type="password" placeholder="รหัสส่วนตัว"
        value={typed} onChange={e => setTyped(e.target.value)} onKeyDown={e => e.key === "Enter" && load(typed.trim())} />
      {err && <p style={{ color: "#b42318", fontSize: 13, marginTop: 10 }}>{err}</p>}
      <button style={{ ...btn(), marginTop: 14, width: "100%" }} onClick={() => load(typed.trim())}>เข้าสู่ระบบ</button>
      <p style={{ color: "#a89f96", fontSize: 12, marginTop: 20 }}>ลืมรหัส? ทักคิมได้เลยค่ะ</p>
    </div>
  );

  const me = d.me;
  const isOwner = me.role === "owner", isAE = me.role === "ae", canReview = ["owner", "ae", "senior"].includes(me.role);
  const jobs = d.jobs || [];
  const active = jobs.filter(j => !["done", "canceled"].includes(j.status));
  const late = active.filter(j => j.due_at && new Date(j.due_at) < Date.now()).length;
  const mine = active.filter(j => j.assigned_to === me.member_id).length;
  const toReview = active.filter(j => reviewGate(j, me)).length;

  // 🎨 งานกราฟฟิก (คิมสั่ง 7 ส.ค.) — แฟรี่เห็นคิวตัวเอง · คนตัดเห็นงานที่ตัวเองขอไว้
  const gjs = d.graphic_jobs || [];
  const gjOpen = gjs.filter(g => !["done", "canceled"].includes(g.status));
  const TABS = [["jobs", "🎬 งานตัดต่อ", active.length], ["cal", "📅 ตารางงาน", null]]
    .concat(gjs.length || d.me?.role === "graphic" ? [["graphic", "🎨 งานกราฟฟิก", gjOpen.length]] : [])
    .concat([["content", "📝 คอนเทนต์ลูกค้า", null]])
    .concat([["leave", "🌴 วันลา", null]])
    .concat((isOwner || isAE) ? [["intake", "📥 รับบรีฟใหม่", null]] : [])
    .concat([["teach", "🎓 คลาสที่สอน", (d.teach || []).length]])
    .concat(isOwner ? [["review", "🧠 รายงานทีม", null], ["money", "👑 ภาพรวม + รายได้", null], ["people", "👥 สมาชิกทีม", (d.members || []).length]] : []);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 60px" }}>
      {/* หัวหน้าเพจ */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>สวัสดีค่ะ {me.name} 🩵</h1>
          <p style={{ color: "#7c7268", fontSize: 13, margin: "3px 0 0" }}>
            {ROLE_TH[me.role] || me.role}{me.position && me.position !== ROLE_TH[me.role] ? ` · ${me.position}` : ""}
          </p>
        </div>
        <button style={{ ...ghost, fontSize: 13 }} onClick={() => { localStorage.removeItem("babe_my_code"); setD(null); setCode(""); setTyped(""); }}>ออกจากระบบ</button>
      </div>

      {/* สรุปวันนี้ — บอกสั้นๆ ว่าต้องทำอะไร */}
      <div style={{ ...card, background: "#fbf7f3", display: "flex", gap: 20, flexWrap: "wrap", marginTop: 14 }}>
        <Stat n={mine} label="งานของฉัน" />
        {canReview && <Stat n={toReview} label="รอฉันตรวจ" tone={toReview ? "#0b6ea8" : null} />}
        {(isOwner || isAE) && <Stat n={active.filter(j => !j.assigned_to && j.status !== "awaiting_files").length} label="ยังไม่มีคนทำ" tone="#B26A00" />}
        <Stat n={late} label="เลยกำหนดส่ง" tone={late ? "#b42318" : null} />
        <div style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "#a89f96" }}>
          {d.working_now ? "🟢 อยู่ในเวลาทำงาน" : "🌙 นอกเวลาทำงาน"} · {d.hours}
        </div>
      </div>

      {/* 📊 สรุปงานของฉันรายเดือน — คิมสั่ง 12 ส.ค. "ต้องมีสรุปปลายเดือนว่าเค้าทำงานไปทั้งหมดกี่คลิป"
          นับจากวันที่ "ส่งงานถึงลูกค้า" งานที่ยังทำอยู่ยังไม่นับ · เทียบกับเดือนที่แล้วให้เห็นว่าตัวเองขึ้นหรือลง */}
      {d.my_month && (() => {
        const m = d.my_month.this, p = d.my_month.prev;
        const diff = (m.clip_units || m.clips) - (p.clip_units || p.clips);
        // 🎨 พนักงานประจำสายกราฟฟิก (แฟรี่): งานกราฟฟิก จ-ศ = งานบริษัท กินเงินเดือน ไม่ใช่งานคลิปละ ฿800
        //    ที่นับเงินตรงนี้คือ "คลิปตัดต่อที่รับเสริมวันหยุด" เท่านั้น (คิมสั่ง 12 ส.ค.)
        const salaried = d.me?.role === "graphic";
        const Cell = ({ n, l, tone }) => (
          <div style={{ minWidth: 74 }}>
            <div style={{ fontSize: 21, fontWeight: 800, color: tone || "#2f2a26", lineHeight: 1.2 }}>{n}</div>
            <div style={{ fontSize: 12, color: "#7c7268", marginTop: 2 }}>{l}</div>
          </div>
        );
        return (
          <div style={{ ...card, marginTop: 12, background: "linear-gradient(135deg,#F6F2FE,#FBF9FF)", border: "1px solid #e4d8f2" }}>
            <div className="between" style={{ gap: 10, flexWrap: "wrap", marginBottom: 11 }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>📊 สรุปงานของฉัน · {m.label}</span>
              {p.clips > 0 && (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: diff >= 0 ? "#1a7f43" : "#B26A00" }}>
                  {diff >= 0 ? "▲" : "▼"} {Math.abs(diff)} คลิป จาก{p.label} ({p.clip_units || p.clips} คลิป · ฿{(p.pay || 0).toLocaleString()})
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
              <Cell n={m.clip_units || m.clips} l="คลิปที่ส่งแล้ว" tone="#5a3fc0" />
              {/* 💵 ยอดที่ได้เดือนนี้ — เรตเดียวเท่ากันทุกคน (คิมเคาะ 12 ส.ค.) */}
              <Cell n={`฿${(m.pay || 0).toLocaleString()}`} l={salaried ? `ค่าขนมงานตัดต่อ (คลิปละ ฿${(m.rate || 0).toLocaleString()})` : `ยอดเดือนนี้ (คลิปละ ฿${(m.rate || 0).toLocaleString()})`} tone="#1a7f43" />
              {m.graphics > 0 && <Cell n={m.graphics} l={salaried ? "งานกราฟฟิก (งานประจำ)" : "งานกราฟฟิก"} />}
              {m.on_time_pct !== null && <Cell n={`${m.on_time_pct}%`} l="ส่งตรงเวลา" tone={m.on_time_pct >= 90 ? "#1a7f43" : m.on_time_pct >= 70 ? "#B26A00" : "#b42318"} />}
              {m.client_revs > 0 && <Cell n={m.client_revs} l="รอบแก้จากลูกค้า" />}
              {m.our_fixes > 0 && <Cell n={m.our_fixes} l="แก้เพราะเราพลาด" tone={m.our_fixes > 2 ? "#B26A00" : null} />}
            </div>
            {salaried ? (
              <div className="muted" style={{ fontSize: 12.5, marginTop: 9, lineHeight: 1.6 }}>
                🎨 <b>งานกราฟฟิก จ-ศ = งานประจำของบริษัท</b> อยู่ในเงินเดือนอยู่แล้ว ไม่ได้นับเป็นคลิปละ ฿{(m.rate || 0).toLocaleString()} ค่ะ
                <br />💰 ยอดตรงนี้คือ <b>งานตัดต่อที่รับเสริมในวันหยุด</b> เท่านั้น — คลิปละ ฿{(m.rate || 0).toLocaleString()} <b>รวมงานกราฟิกในคลิปนั้นแล้ว</b>
                {m.clips === 0 && <><br />เดือนนี้ยังไม่ได้รับงานตัดต่อเสริมค่ะ อยากรับ กด <b>+</b> ที่วันหยุดในปฏิทิน "ลงวันว่างของฉัน" ได้เลย</>}
              </div>
            ) : m.clips === 0 && (
              <div className="muted" style={{ fontSize: 12.5, marginTop: 9, lineHeight: 1.6 }}>
                เดือนนี้ยังไม่มีคลิปที่ส่งถึงลูกค้าค่ะ — งานที่กำลังทำอยู่จะมานับตรงนี้ตอนส่งงานเสร็จ
                <br />คิดคลิปละ ฿{(m.rate || 0).toLocaleString()} เท่ากันทุกคน (รวมกราฟิกในคลิปแล้ว)
              </div>
            )}
          </div>
        );
      })()}

      {/* แท็บ */}
      <div style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" }}>
        {TABS.map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ ...(tab === k ? btn() : ghost), fontSize: 14 }}>{label}{n != null ? ` (${n})` : ""}</button>
        ))}
      </div>
      {err && <div style={{ ...card, background: "#fde8e8", color: "#b42318", fontSize: 14 }}>{err}</div>}

      {/* ═══════ 🎬 งานตัดต่อ — มุมมองรายคน (คิมสั่ง 3 ส.ค.) ═══════
           "หน้าตรวจงานของลูกตาลควรแยกเป็นคนเลย เช่นมีการ์ดของโบ การ์ดของกัน การ์ดของฟรีแลนซ์
            พอกดเข้าไปมันก็จะมีชื่องานขึ้นมา แล้วเค้าก็เลือกได้ว่าจะตรวจไฟล์งานไหน
            ... อาจจะใช้เรื่องของสีเข้ามาช่วย แดง=ด่วนต้องส่ง เหลือง=ยังไม่เสร็จแต่ไม่ด่วน เขียว=เสร็จแล้ว
            ... เอาโมเดลของคนที่เค้าทำสำเร็จอยู่แล้วมาใช้ ไม่ต้องคิดใหม่"
           → ใช้โมเดล "workload by assignee" แบบ Asana/Monday: การ์ดคน → กดเข้าไปเห็นงานของคนนั้น
             + ระบบสี 3 สีตามที่คิมกำหนด (ใช้ทั้งจุดสีและขอบซ้ายของการ์ด) */}
      {tab === "jobs" && (() => {
        const inReview = active.filter(j => reviewGate(j, me));
        const myJobs = active.filter(j => j.assigned_to === me.member_id && !reviewGate(j, me));
        // 🔁 ลูกค้าส่งจุดแก้เข้ามาแล้ว ยังไม่มีใครลงมือ — ด่วนที่สุดในบรรดางานทั้งหมด
        //    คิมเจอเอง 11 ส.ค.: ส่งรอบแก้จากฝั่งลูกค้าแล้ว "ไม่ขึ้นทั้งของโบแล้วก็ของตาล"
        //    ของเดิมมันขึ้นอยู่ (อยู่ในแท็บ "งานที่ฉันต้องตัด") แต่หน้าเปิดมาที่แท็บ "รอฉันตรวจ" ซึ่งว่าง
        //    คนเปิดมาเห็น "ไม่มีงานในหมวดนี้ค่ะ" ก็ปิดไป — งานลูกค้าเลยไม่มีใครแตะ
        const revising = active.filter(j => j.status === "revising" && (isOwner || isAE || j.assigned_to === me.member_id));
        // เปิดมาที่แท็บแรกที่ "มีงานจริง" เสมอ — ไล่จากด่วนสุดไปหาน้อยสุด
        // ถ้าไม่มีงานเลยค่อยตกไปที่ "งานที่ฉันต้องตัด" (จะขึ้นว่าไม่มีงาน ซึ่งเป็นความจริง)
        const autoSub = revising.length ? "revising" : inReview.length ? "review"
                      : myJobs.length ? "mine" : (isOwner || isAE) ? "people" : "mine";
        const cur = sub || autoSub;

        // ── มุมมองรายคน (เฉพาะคนที่ดูงานคนอื่นได้: AE / คิม / หัวหน้า) ──
        const canSeeTeam = isOwner || isAE || me.role === "senior";
        const people = (d.members || []).filter(m => ["editor", "senior", "ae"].includes(m.role));
        const jobsOf = (mid) => active.filter(j => j.assigned_to === mid);
        const unassigned = active.filter(j => !j.assigned_to);

        const openPerson = person && (people.find(m => m.member_id === person) || (person === "_none" ? { member_id: "_none", name: "ยังไม่มีคนทำ", position: "" } : null));
        const personJobs = openPerson ? (openPerson.member_id === "_none" ? unassigned : jobsOf(openPerson.member_id)) : [];

        const Row = (j) => <Job key={j.order_id} j={j} me={me} d={d} isOwner={isOwner} isAE={isAE}
          open={!!open[j.order_id]} toggle={() => setOpen(o => ({ ...o, [j.order_id]: !o[j.order_id] }))}
          draftUrl={draftUrl} setDraftUrl={setDraftUrl} note={note} setNote={setNote} busy={busy} post={post} />;

        return <>
          {active.length === 0 && <div style={{ ...card, textAlign: "center", color: "#7c7268" }}>
            ยังไม่มีงานที่ต้องทำตอนนี้ค่ะ พักได้เลย 🌿</div>}

          {active.length > 0 && <>
            {/* แท็บย่อย */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {[...(revising.length ? [["revising", "🔁 ลูกค้าส่งจุดแก้มา", revising.length, "#C2410C"]] : []),
                ["review", "🔍 รอฉันตรวจ", inReview.length, "#0b6ea8"],
                ["mine", "✂️ งานที่ฉันต้องตัด", myJobs.length, "#5a3fc0"],
                // 👥 ลูกตาลต้องเห็นงานของทุกคนด้วย — เธอเป็นคนคุมคิวทั้งทีม แต่เดิมแท็บนี้เปิดให้คิมคนเดียว
                //    ผลคืองานที่ไม่ได้มอบหมายให้เธอ เธอมองไม่เห็นเลยสักงาน (คิมเจอ 11 ส.ค.)
                ...((isOwner || isAE) ? [["people", "👥 ดูรายคน", active.length, "#2f2a26"]] : [])]
                .map(([k, label, n, tone]) => {
                  const on = cur === k;
                  return <button key={k} onClick={() => { setSub(k); setPerson(null); }}
                    style={{ borderRadius: 999, padding: "9px 16px", fontSize: 14, cursor: "pointer", fontWeight: 700,
                      border: `1.5px solid ${on ? tone : "#ddd2c8"}`, background: on ? tone : "#fff", color: on ? "#fff" : "#2f2a26" }}>
                    {label} ({n})
                  </button>;
                })}
            </div>

            {/* คำอธิบายสี — บอกครั้งเดียวใช้ได้ทั้งหน้า */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, color: "#7c7268", marginBottom: 12 }}>
              <span><Dot c={C.red} /> ด่วน · เลยกำหนดหรือส่งวันนี้</span>
              <span><Dot c={C.orange} /> ลูกค้าส่งจุดแก้มา · ยังไม่ได้ทำ</span>
              <span><Dot c={C.yellow} /> ยังไม่เสร็จ ไม่ด่วน</span>
              <span><Dot c={C.green} /> ส่งไปแล้ว · ไม่ได้อยู่ที่เรา</span>
            </div>

            {/* ── รอฉันตรวจ / งานฉัน ── */}
            {cur !== "people" && (() => {
              const list = cur === "revising" ? revising : cur === "review" ? inReview : myJobs;
              if (!list.length) return <div style={{ ...card, textAlign: "center", color: "#7c7268", fontSize: 14 }}>ไม่มีงานในหมวดนี้ค่ะ</div>;
              return <>
                {cur === "revising" && <p style={{ fontSize: 13, color: "#9a3412", margin: "0 0 10px", fontWeight: 600 }}>
                  ลูกค้าส่งจุดที่อยากแก้มาแล้ว — แก้ให้ครบทุกจุดในรอบเดียว แล้วส่งกลับไปให้ดูใหม่นะคะ
                </p>}
                {cur === "review" && <p style={{ fontSize: 13, color: "#5b7f96", margin: "0 0 10px" }}>
                  กดที่งานเพื่อเปิดดู แล้วเลือก <b>อนุมัติ</b> หรือ <b>ไม่อนุมัติ</b>
                </p>}
                <ExpandBar list={list} setOpen={setOpen} />
                {list.map(Row)}
              </>;
            })()}

            {/* ── ดูรายคน: การ์ดคน → กดเข้าไปเห็นงานของคนนั้น ── */}
            {cur === "people" && !openPerson && <>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))" }}>
                {[...people.map(m => ({ m, list: jobsOf(m.member_id) })),
                  ...(unassigned.length ? [{ m: { member_id: "_none", name: "⚠️ ยังไม่มีคนทำ", position: "รอมอบหมาย" }, list: unassigned }] : [])]
                  .map(({ m, list }) => {
                    const red = list.filter(j => jobColor(j) === "red").length;
                    const yellow = list.filter(j => jobColor(j) === "yellow").length;
                    const green = list.filter(j => jobColor(j) === "green").length;
                    const waiting = list.filter(j => reviewGate(j, me)).length;
                    return (
                      <button key={m.member_id} onClick={() => setPerson(m.member_id)}
                        style={{ textAlign: "left", cursor: "pointer", background: "#fff", borderRadius: 14, padding: "14px 15px",
                          border: red ? `2px solid ${C.red}` : "1px solid #eee4dc", fontFamily: "inherit" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <b style={{ fontSize: 15.5 }}>{m.name}</b>
                          <span style={{ color: "#a89f96", fontSize: 16 }}>›</span>
                        </div>
                        <div style={{ color: "#a89f96", fontSize: 12, marginTop: 2 }}>{m.position || ROLE_TH[m.role] || ""}</div>
                        <div style={{ display: "flex", gap: 10, marginTop: 10, fontSize: 13, fontWeight: 700 }}>
                          <span style={{ color: red ? C.red : "#d8d2cb" }}><Dot c={red ? C.red : "#d8d2cb"} />{red}</span>
                          <span style={{ color: yellow ? C.yellow : "#d8d2cb" }}><Dot c={yellow ? C.yellow : "#d8d2cb"} />{yellow}</span>
                          <span style={{ color: green ? C.green : "#d8d2cb" }}><Dot c={green ? C.green : "#d8d2cb"} />{green}</span>
                        </div>
                        {waiting > 0 && <div style={{ marginTop: 8, background: "#f0f7fb", color: "#0b6ea8", borderRadius: 8, padding: "5px 9px", fontSize: 12, fontWeight: 700 }}>
                          🔔 รอคุณตรวจ {waiting} งาน
                        </div>}
                        {!list.length && <div style={{ marginTop: 8, fontSize: 12, color: "#a89f96" }}>ว่างอยู่ ไม่มีงานค้าง</div>}
                      </button>
                    );
                  })}
              </div>
            </>}

            {/* ── งานของคนที่เลือก ── */}
            {cur === "people" && openPerson && <>
              <button style={{ ...ghost, fontSize: 13, marginBottom: 12 }} onClick={() => setPerson(null)}>← กลับไปดูทุกคน</button>
              <h3 style={{ fontSize: 16, margin: "0 0 10px" }}>งานของ {openPerson.name} ({personJobs.length})</h3>
              {!personJobs.length && <div style={{ ...card, textAlign: "center", color: "#7c7268", fontSize: 14 }}>ไม่มีงานค้างค่ะ</div>}
              {personJobs.length > 0 && <><ExpandBar list={personJobs} setOpen={setOpen} />{personJobs.map(Row)}</>}
            </>}
          </>}

          <button style={{ ...ghost, fontSize: 13, marginTop: 8 }} onClick={() => setShowDone(v => !v)}>
            {showDone ? "ซ่อน" : "ดู"}งานที่จบแล้ว ({jobs.length - active.length})
          </button>
          {/* ✅ งานที่จบแล้ว — กดเปิดดูรายละเอียดได้เหมือนงานปกติ (คิมขอ 12 ส.ค.)
              "เผื่อลูกค้ากลับมาแก้หรือทำไฟล์หาย" — เดิมเป็นบรรทัดตายๆ กดอะไรไม่ได้เลย
              ต้องเห็นลิงก์ไฟล์ · บรีฟ · รอบแก้ทุกรอบ · สายสนทนา ครบเหมือนตอนงานยังไม่จบ */}
          {showDone && (() => {
            const doneJobs = jobs.filter(j => ["done", "canceled"].includes(j.status));
            if (!doneJobs.length) return <div style={{ ...card, marginTop: 10, textAlign: "center", color: "#7c7268", fontSize: 14 }}>ยังไม่มีงานที่จบค่ะ</div>;
            // 🔎 ค้นหางานเก่า — คิมขอ 12 ส.ค. "เผื่อลูกค้าเยอะ"
            //    ค้นได้ทั้งชื่องาน · ลูกค้า · รหัสงาน · คนตัด · เนื้อบรีฟ · โน้ต — พิมพ์อะไรที่จำได้ก็เจอ
            const qq = doneQ.trim().toLowerCase();
            const hay = (j) => {
              const r = j.brief || {};
              return [r.title, r.t, r.hook, r.h, r.script, r.brief, j.note, j.client_name, j.customer,
                      j.order_id, j.assignee_name, j.status_th].filter(Boolean).join(" ").toLowerCase();
            };
            const list = qq ? doneJobs.filter(j => hay(j).includes(qq)) : doneJobs;
            return <>
              <p style={{ fontSize: 12.5, color: "#7c7268", margin: "10px 0 8px", lineHeight: 1.6 }}>
                กดที่งานเพื่อเปิดดูไฟล์และรอบแก้ย้อนหลัง — ลูกค้าทำไฟล์หายหรือกลับมาแก้ ก็เอาให้ได้จากตรงนี้
              </p>
              <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                <input value={doneQ} onChange={e => setDoneQ(e.target.value)}
                  placeholder="🔎 ค้นหา — ชื่องาน / ลูกค้า / คนตัด / รหัสงาน"
                  style={{ ...input, flex: "1 1 220px" }} />
                {qq && <button style={{ ...ghost, fontSize: 13 }} onClick={() => setDoneQ("")}>ล้าง</button>}
              </div>
              <div style={{ fontSize: 12.5, color: "#7c7268", marginBottom: 8 }}>
                {qq ? `เจอ ${list.length} จาก ${doneJobs.length} งาน` : `ทั้งหมด ${doneJobs.length} งาน`}
              </div>
              {list.length === 0
                ? <div style={{ ...card, textAlign: "center", color: "#7c7268", fontSize: 14 }}>ไม่เจองานที่ค้นหาค่ะ ลองพิมพ์คำอื่นดูนะคะ</div>
                : list.map(Row)}
            </>;
          })()}
        </>;
      })()}

      {/* ═══════ 📅 ตารางงาน — ใครว่าง ใครเต็ม + ให้ระบบจัดงานให้ (คิมสั่ง 3 ส.ค.) ═══════
           "ลูกตาลต้องเห็นภาพรวมตารางงานของทุกคน ไม่งั้นจะรู้ได้ไงว่าจะเอางานนี้ไปใส่ให้ใคร
            ... หรือระบบแอสไซน์งานให้แทนเลยได้ป่ะ ... ฟรีแลนซ์ที่เราไม่รู้ว่าเค้าว่างไหม
            ก็ต้องให้เค้าลงเองว่าว่างวันไหน" */}
      {tab === "cal" && (() => {
        const days = Array.from({ length: 14 }, (_, i) => {
          const dt = new Date(); dt.setDate(dt.getDate() + i);
          return { key: dt.toISOString().slice(0, 10), lbl: dt.toLocaleDateString("th-TH", { day: "numeric", month: "short" }),
                   dow: dt.toLocaleDateString("th-TH", { weekday: "narrow" }), weekend: [0, 6].includes(dt.getDay()) };
        });
        // แถวที่ "ลงเอง" เท่านั้น — วันที่ไม่มีแถว = ใช้ค่าอัตโนมัติที่คิมตั้งไว้ (defSlots)
        const filed = Object.fromEntries(myAvail.filter(a => a.member_id === me.member_id).map(a => [a.day, a]));
        // สถานะจริงของแต่ละวัน: ลา / ลงเอง n คลิป / อัตโนมัติ n คลิป / ไม่ว่าง
        const dayState = (key, weekend) => {
          const f = filed[key];
          if (f) return f.slots === 0 ? { kind: "leave", n: 0 } : { kind: "set", n: f.slots };
          if (defSlots > 0 && !weekend) return { kind: "auto", n: defSlots };
          return { kind: "none", n: 0 };
        };
        const setDay = async (day, slots) => { await post("/api/team/availability", { day, slots }, "cal"); loadCal(); };
        const resetDay = async (day) => { await post("/api/team/availability", { day, clear: true }, "cal"); loadCal(); };
        // คิมแจ้ง 7 ส.ค. "ต้องแตะตั้ง 8 รอบ เหนื่อยมาก มีปุ่มให้เลยได้ไหม เพิ่ม ลด ลา"
        // → เลิกแตะวน ใช้ปุ่ม − / + / 🌴 ตรงๆ ในแต่ละวัน
        const plusDay  = (key, st) => setDay(key, Math.min(8, (st.kind === "leave" ? 0 : st.n) + 1));
        const minusDay = (key, st) => {
          if (st.kind === "leave") return resetDay(key);          // ยกเลิกวันลา → กลับเป็นค่าเริ่มต้น
          const next = st.n - 1;
          if (next <= 0) return defSlots > 0 ? setDay(key, 0) : resetDay(key);   // ประจำ: ลดจนสุด = วันลา
          return setDay(key, next);
        };
        const leaveDay = (key, st) => (st.kind === "leave" ? resetDay(key) : setDay(key, 0));
        return <>
          {/* ลงวันว่างของตัวเอง — ทุกคนทำได้ รวมฟรีแลนซ์ */}
          <div style={card}>
            <h3 style={{ fontSize: 16, margin: "0 0 4px" }}>
              {d.me?.role === "graphic" ? "📗 อยากรับงานตัดต่อเสริมวันไหน" : "📗 ลงวันว่างของฉัน"}
            </h3>
            <p style={{ fontSize: 13, color: "#7c7268", margin: "0 0 12px", lineHeight: 1.7 }}>
              {/* 🎨 พนักงานประจำสายกราฟฟิก — ปฏิทินนี้ "ไม่เกี่ยวกับงานประจำ" เลย ต้องบอกให้ชัด (คิมสั่ง 12 ส.ค.) */}
              {d.me?.role === "graphic"
                ? <>งานกราฟฟิก <b>จ-ศ เป็นงานประจำของบริษัท</b> อยู่ในเงินเดือนแล้ว <b>ไม่ต้องลงในปฏิทินนี้</b>ค่ะ<br />
                    ปฏิทินนี้ใช้เฉพาะตอนอยาก<b>รับงานตัดต่อเสริมในวันหยุด</b> — แตะ <b>+</b> ที่วันไหน แปลว่ายินดีรับงานวันนั้น
                    ได้ <b>คลิปละ ฿800</b> (ตัดต่อ + กราฟิกในคลิปนั้น รวมแล้ว)<br />
                    ไม่แตะไว้ = ระบบไม่ส่งงานตัดต่อมาให้เลยค่ะ</>
                : defSlots > 0
                ? <>คิมตั้งให้คุณรับงาน <b>{defSlots} คลิป/วัน (จ-ศ)</b> อยู่แล้ว — <b>ไม่ต้องกดอะไรเลยก็ได้ค่ะ</b><br />
                    วันไหนรับได้มากกว่า/น้อยกว่า หรือวันไหน<b>ลา</b> ค่อยแตะแก้เฉพาะวันนั้นนะคะ</>
                : <>แตะวันที่ว่างเพื่อ<b>เพิ่มจำนวนคลิปที่รับไหววันนั้น</b> — ระบบจะส่งงานมาให้ไม่เกินที่คุณลงไว้ ไม่ลงไว้ = ระบบจะไม่ยัดงานให้ค่ะ</>}
            </p>
            {/* ⚡ พนักงานประจำกดปุ่มเดียวจบ ไม่ต้องแตะทีละวัน (คิมเคาะ: โบ/พี่ก้องฟิกวันละ 4) */}
            <div style={{ display: d.me?.role === "graphic" ? "none" : "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: "#7c7268" }}>เติม จ-ศ ให้อัตโนมัติ:</span>
              {[2, 3, 4, 5].map(n => (
                <button key={n} disabled={busy === "cal"}
                  onClick={async () => { await post("/api/team/availability/fill", { slots: n }, "cal"); loadCal(); }}
                  style={{ ...ghost, fontSize: 13, padding: "6px 13px", ...(defSlots === n ? { borderColor: C.green, color: C.green, fontWeight: 700 } : {}) }}>
                  {n} คลิป/วัน
                </button>
              ))}
              <button disabled={busy === "cal"} style={{ ...ghost, fontSize: 13, padding: "6px 13px", color: "#b42318", borderColor: "#f0c6c0" }}
                onClick={async () => { await post("/api/team/availability/fill", { slots: 0 }, "cal"); loadCal(); }}>
                ล้างที่ตั้งเอง{defSlots > 0 ? " (กลับเป็นอัตโนมัติ)" : ""}</button>
            </div>
            {defSlots > 0 && <p style={{ fontSize: 12.5, color: "#a89f96", margin: "0 0 10px" }}>
              💡 คิมตั้งกำลังรับงานของคุณไว้ที่ <b>{defSlots} คลิป/วัน</b> — วันไหนรับได้มากกว่า/น้อยกว่า แตะแก้รายวันได้เลย
            </p>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(112px,1fr))", gap: 7 }}>
              {days.map(dd => {
                const st = dayState(dd.key, dd.weekend);
                const tone = { leave: { bd: "#f0c6c0", bg: "#fdf2f0", fg: "#b42318" },
                               set:   { bd: C.green,   bg: "#eaf6ee", fg: C.green },
                               auto:  { bd: "#cfe3f5", bg: "#f2f8fd", fg: "#2E86DE" },
                               none:  { bd: "#e5ded6", bg: dd.weekend ? "#faf8f6" : "#fff", fg: "#d8d2cb" } }[st.kind];
                const mini = (extra) => ({ border: "1px solid #e5ded6", background: "#fff", borderRadius: 8,
                  width: 28, height: 28, cursor: "pointer", fontFamily: "inherit", fontSize: 15, lineHeight: 1,
                  display: "grid", placeItems: "center", padding: 0, color: "#5b5147", ...extra });
                return (
                  <div key={dd.key}
                    style={{ borderRadius: 11, padding: "8px 6px 9px", border: `1.5px solid ${tone.bd}`, background: tone.bg, textAlign: "center" }}>
                    <div style={{ fontSize: 10.5, color: "#a89f96" }}>{dd.dow}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{dd.lbl}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: tone.fg, margin: "3px 0 1px" }}>
                      {st.kind === "leave" ? "🌴 ลา" : st.n ? `${st.n} คลิป` : "—"}
                    </div>
                    <div style={{ fontSize: 9.5, color: "#a9bdd0", minHeight: 13 }}>{st.kind === "auto" ? "อัตโนมัติ" : ""}</div>
                    <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 5 }}>
                      <button onClick={() => minusDay(dd.key, st)} disabled={busy === "cal"} title="ลดลง 1 คลิป" aria-label="ลด" style={mini()}>−</button>
                      <button onClick={() => plusDay(dd.key, st)} disabled={busy === "cal"} title="เพิ่ม 1 คลิป" aria-label="เพิ่ม" style={mini()}>+</button>
                      <button onClick={() => leaveDay(dd.key, st)} disabled={busy === "cal"}
                        title={st.kind === "leave" ? "ยกเลิกวันลา" : "กดลาวันนี้"} aria-label="วันลา"
                        style={mini(st.kind === "leave" ? { borderColor: "#e79c92", background: "#fff1ee" } : {})}>🌴</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 12.5, color: "#a89f96", marginTop: 9, lineHeight: 1.85 }}>
              <b>−</b> ลดทีละคลิป · <b>+</b> เพิ่มทีละคลิป · <b>🌴</b> กดลาวันนั้น (กดซ้ำ = ยกเลิกวันลา)<br />
              <b style={{ color: "#2E86DE" }}>ฟ้า = อัตโนมัติ</b> ระบบถือว่าคุณว่างวันละ {defSlots || 0} คลิปโดยไม่ต้องกดอะไร ·
              <b style={{ color: C.green }}> เขียว = คุณตั้งเอง</b> · <b style={{ color: "#b42318" }}>แดง = วันลา</b> ระบบจะย้ายงานวันนั้นให้คนอื่นทันที<br />
              {defSlots > 0 && <>🗓️ <b>เสาร์-อาทิตย์ระบบไม่ส่งงานให้อัตโนมัติ</b> — อยากรับงานเสริมวันหยุด กด <b>+</b> ที่วันนั้นได้เลยค่ะ</>}
            </p>
          </div>

          {/* 📦 งานนอกเว็บ — คิมถาม "ทีม production ก็มีงานที่อยู่ใน production ด้วย
              ลูกตาลจะต้องมาเป็นคนกรอกงานแล้วก็แอสไซน์เองหรอ"
              → ไม่ต้อง คนทำงานเพิ่มของตัวเอง กรอก 3 ช่องจบ แล้วมันไปกินที่ว่างเอง */}
          <div style={card}>
            <h3 style={{ fontSize: 16, margin: "0 0 4px" }}>📦 งานนอกเว็บที่ฉันรับอยู่</h3>
            <p style={{ fontSize: 13, color: "#7c7268", margin: "0 0 12px", lineHeight: 1.7 }}>
              งานโปรดักชั่น/งานที่รับตรง ที่ไม่ได้มาจากเว็บ — <b>ใส่ไว้ด้วยนะคะ</b> ระบบจะได้ไม่ส่งงานมาให้เกินที่รับไหว
            </p>
            {ext.filter(x => x.member_id === me.member_id || ["owner", "ae", "senior"].includes(me.role)).map(x => (
              <div key={x.ext_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                background: "#fbf7f3", borderRadius: 10, padding: "9px 12px", marginBottom: 7, flexWrap: "wrap" }}>
                <div style={{ fontSize: 14 }}>
                  <b>{x.title}</b>
                  <span style={{ color: "#a89f96", fontSize: 12.5 }}>
                    {" · "}{x.clips} คลิป{x.client ? ` · ${x.client}` : ""}{x.due_th ? ` · ส่ง ${x.due_th}` : ""}
                    {x.member_name && x.member_id !== me.member_id ? ` · ${x.member_name}` : ""}
                  </span>
                </div>
                <button style={{ ...ghost, fontSize: 12.5, padding: "5px 12px" }} disabled={busy === "ext"}
                  onClick={async () => { await post("/api/team/external", { action: "done", ext_id: x.ext_id }, "ext"); loadCal(); }}>
                  ✓ เสร็จแล้ว
                </button>
              </div>
            ))}
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 0.7fr 1fr 1fr auto", marginTop: 10, alignItems: "center" }}>
              <input style={input} placeholder="ชื่องาน" value={extF.title} onChange={e => setExtF(v => ({ ...v, title: e.target.value }))} />
              <input style={input} inputMode="numeric" placeholder="คลิป" value={extF.clips}
                onChange={e => setExtF(v => ({ ...v, clips: e.target.value.replace(/[^\d]/g, "").slice(0, 2) }))} />
              <input style={input} placeholder="ลูกค้า" value={extF.client} onChange={e => setExtF(v => ({ ...v, client: e.target.value }))} />
              {/* 💰 ยอดเงิน — คิมสั่ง 7 ส.ค. "หน้ายอดขายต้องมียอด production ด้วย"
                  งานรับตรงคือรายได้ก้อนใหญ่ของโปรดักชั่น ไม่กรอกยอดไว้ หน้ายอดขายจะเห็นแค่ครึ่งเดียว */}
              <input style={input} inputMode="numeric" placeholder="ยอดเงิน (บาท)" value={extF.amount_baht}
                onChange={e => setExtF(v => ({ ...v, amount_baht: e.target.value.replace(/[^\d]/g, "").slice(0, 7) }))} />
              <input style={input} type="date" value={extF.due_at} onChange={e => setExtF(v => ({ ...v, due_at: e.target.value }))} />
              <button style={btn()} disabled={busy === "ext" || !extF.title.trim()}
                onClick={async () => { await post("/api/team/external", { ...extF, clips: Number(extF.clips) || 1, amount_baht: Number(extF.amount_baht) || 0 }, "ext");
                  setExtF({ title: "", clips: 1, client: "", due_at: "", amount_baht: "" }); loadCal(); }}>เพิ่ม</button>
            </div>
          </div>

          {/* ภาพรวมทุกคน — เฉพาะคนที่ดูแลงาน */}
          {wl && <>
            <div style={{ ...card, background: "#fbf7f3" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ fontSize: 16, margin: 0 }}>👥 ตารางงานทุกคน</h3>
                  <p style={{ fontSize: 13, color: "#7c7268", margin: "3px 0 0" }}>
                    งานที่ยังไม่มีคนทำ <b>{wl.unassigned.length}</b> ชิ้น
                  </p>
                </div>
                {(isOwner || isAE) && wl.unassigned.length > 0 &&
                  <button style={btn("#5a3fc0")} disabled={busy === "auto"}
                    onClick={async () => { const r = await post("/api/team/auto-assign", {}, "auto");
                      if (r) { alert(`ระบบจัดให้แล้ว ${r.assigned} งาน${r.skipped ? ` · ยังจัดไม่ได้ ${r.skipped} งาน (ไม่มีใครลงว่างพอ)` : ""}`); loadCal(); } }}>
                    🤖 ให้ระบบจัดงานให้
                  </button>}
              </div>
            </div>

            {wl.people.map(m => {
              const pct = m.load_pct;
              const bar = pct == null ? "#e5ded6" : pct >= 100 ? C.red : pct >= 70 ? C.yellow : C.green;
              return (
                <div key={m.member_id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <div>
                      <b style={{ fontSize: 15 }}>{m.name}</b>
                      <span style={{ color: "#a89f96", fontSize: 12.5, marginLeft: 6 }}>{m.position || ROLE_TH[m.role]}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "#7c7268" }}>
                      ลงว่าง {m.capacity} คลิป · รับไปแล้ว {m.busy_clips}
                      {m.ext_clips > 0 && <span style={{ color: "#a89f96" }}> (เว็บ {m.web_clips} + นอกเว็บ {m.ext_clips})</span>}
                      {" · "}<b style={{ color: bar }}>เหลือ {m.free_slots}</b>
                    </div>
                  </div>
                  <div style={{ height: 8, background: "#f2ece6", borderRadius: 999, marginTop: 9, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, pct ?? 0)}%`, height: "100%", background: bar }} />
                  </div>
                  <div style={{ fontSize: 12, color: "#a89f96", marginTop: 6 }}>
                    {pct == null ? "⚠️ ยังไม่ได้ลงวันว่าง — ระบบจะไม่ส่งงานให้" : `โหลด ${pct}%`}
                    {m.score && m.score.on_time_pct != null && ` · ตรงเวลา ${m.score.on_time_pct}% · ตีกลับเฉลี่ย ${m.score.rejects_per_job} ครั้ง/งาน`}
                  </div>
                </div>
              );
            })}

            {/* คะแนนการทำงานรายเดือน */}
            {wl.people.some(m => m.score) && (
              <div style={card}>
                <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>📊 คะแนนการทำงานเดือนนี้</h3>
                <p style={{ fontSize: 12, color: "#a89f96", margin: "0 0 10px" }}>ส่งตรงเวลาไหม · โดนตีกลับบ่อยไหม</p>
                <table style={{ width: "100%", fontSize: 13.5, borderCollapse: "collapse" }}>
                  <thead><tr style={{ color: "#7c7268", textAlign: "left", fontSize: 12 }}>
                    <th style={{ padding: "6px 4px" }}>คน</th><th>งาน</th><th>ส่งแล้ว</th><th>ตรงเวลา</th><th>ตีกลับ/งาน</th>
                  </tr></thead>
                  <tbody>{wl.people.filter(m => m.score).map(m => (
                    <tr key={m.member_id} style={{ borderTop: "1px solid #f2ece6" }}>
                      <td style={{ padding: "8px 4px" }}>{m.name}</td>
                      <td>{m.score.total}</td><td>{m.score.delivered}</td>
                      <td style={{ fontWeight: 700, color: m.score.on_time_pct == null ? "#a89f96" : m.score.on_time_pct >= 80 ? C.green : C.red }}>
                        {m.score.on_time_pct == null ? "—" : m.score.on_time_pct + "%"}
                      </td>
                      <td style={{ color: m.score.rejects_per_job > 1 ? C.red : "#7c7268" }}>{m.score.rejects_per_job}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            )}
          </>}
        </>;
      })()}

      {/* ═══ 🏢 ลูกตาลรับบรีฟลูกค้านอกเว็บ → ระบบจัดคนให้เอง (คิมสั่ง 4 ส.ค.) ═══ */}
      {/* ═══════ 🎨 งานกราฟฟิก — คิมสั่ง 7 ส.ค. "แฟรี่ยังไม่มีระบบการทำงานที่ชัดเจน" ═══════ */}
      {tab === "graphic" && (() => {
        const isFairy = d.me?.role === "graphic";
        return <>
          <div style={card}>
            <h3 style={{ fontSize: 16, margin: "0 0 4px" }}>🎨 งานกราฟฟิก</h3>
            <p style={{ fontSize: 13, color: "#7c7268", margin: 0, lineHeight: 1.7 }}>
              {isFairy
                ? <>งานที่ทีมส่งมาให้ทำค่ะ — กด <b>เริ่มทำ</b> เพื่อบอกทีมว่ารับแล้ว พอเสร็จแปะลิงก์ไฟล์งานแล้วกด <b>ส่งงาน</b> ระบบจะแจ้งคนที่ขอให้เองค่ะ</>
                : <>งานกราฟฟิกที่คุณขอให้ทีมกราฟฟิกช่วยค่ะ</>}
            </p>
          </div>
          {!gjs.length && <div style={card}><p className="muted" style={{ margin: 0, fontSize: 14 }}>ยังไม่มีงานกราฟฟิกค่ะ</p></div>}
          {gjs.map(g => {
            const done = ["done", "canceled"].includes(g.status);
            const tone = { open: "#B26A00", doing: "#0b6ea8", sent: C.green, done: "#a89f96", canceled: "#a89f96" }[g.status];
            return (
              <div key={g.gj_id} style={{ ...card, opacity: done ? .65 : 1, borderLeft: `4px solid ${tone}` }}>
                <div className="between" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <b style={{ fontSize: 15 }}>{g.title}</b>
                    <div style={{ fontSize: 12.5, color: "#a89f96", marginTop: 2 }}>
                      {d.graphic_statuses?.[g.status] || g.status}
                      {g.requested_by_name ? ` · ขอโดย ${g.requested_by_name}` : ""}
                      {g.due_th ? ` · ส่ง ${g.due_th}` : ""}
                      {!isFairy && g.assignee_name ? ` · ${g.assignee_name}` : ""}
                    </div>
                  </div>
                </div>
                {g.brief && <div style={{ background: "#fbf7f3", borderRadius: 10, padding: 11, marginTop: 9, fontSize: 13.5, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
                  <Linkify text={g.brief} />
                </div>}
                {/* 🎬 คลิปที่ตัดแล้ว — ของสำคัญที่สุดของงานกราฟฟิก ต้องเด่นกว่าลิงก์อื่น
                    คิมทัก 11 ส.ค.: "กราฟฟิคต้องดูจากคลิปที่ตัดคัทชนเสร็จแล้ว" */}
                {g.clip_url && <a href={g.clip_url} target="_blank" rel="noopener noreferrer"
                  style={{ display: "block", marginTop: 9, background: "#EEF4FF", border: "1.5px solid #b9cdf2", borderRadius: 10,
                           padding: "10px 12px", fontSize: 13.5, fontWeight: 700, color: "#0b4da8", textDecoration: "none" }}>
                  🎬 เปิดคลิปที่ตัดคัทชนแล้ว →
                </a>}
                {g.footage_url && <p style={{ margin: "7px 0 0", fontSize: 13 }}>🎞️ ฟุตเทจต้นฉบับ: <Linkify text={g.footage_url} /></p>}
                {/* ไม่มีคลิปให้ดู — กราฟฟิกทำงานไม่ได้ · คนที่ขอต้องแปะให้ได้ตรงนี้ ไม่ต้องสั่งงานใหม่ */}
                {!g.clip_url && !done && (isFairy
                  ? <div style={{ marginTop: 9, background: "#FDF3E4", border: "1px solid #f0d9ae", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#8a5a00" }}>
                      ⏳ ยังไม่มีลิงก์คลิปที่ตัดแล้ว — ทัก{g.requested_by_name ? ` ${g.requested_by_name}` : "คนที่ขอ"}ให้แปะให้ก่อนนะคะ
                    </div>
                  : <div style={{ marginTop: 9, display: "flex", gap: 7, flexWrap: "wrap" }}>
                      <input style={{ ...input, flex: 1, minWidth: 190 }} placeholder="แปะลิงก์คลิปที่ตัดแล้วให้กราฟฟิก"
                        value={gjClipFix[g.gj_id] || ""} onChange={e => setGjClipFix(v => ({ ...v, [g.gj_id]: e.target.value }))} />
                      <button style={btn("#7a4fa3")} disabled={busy === "gj" || !(gjClipFix[g.gj_id] || "").trim()}
                        onClick={() => post("/api/team/graphic/update", { gj_id: g.gj_id, clip_url: (gjClipFix[g.gj_id] || "").trim() }, "gj")}>แนบคลิป</button>
                    </div>)}
                {g.ref_links && <p style={{ margin: "7px 0 0", fontSize: 13.5, whiteSpace: "pre-wrap" }}>🔗 ตัวอย่าง: <Linkify text={g.ref_links} /></p>}
                {g.work_url && <p style={{ margin: "7px 0 0", fontSize: 13.5 }}>🖼️ ไฟล์งาน: <Linkify text={g.work_url} /></p>}
                {isFairy && !done && (
                  <div style={{ display: "flex", gap: 7, marginTop: 11, flexWrap: "wrap", alignItems: "center" }}>
                    {g.status === "open" && <button style={btn()} disabled={busy === "gj"}
                      onClick={() => post("/api/team/graphic/update", { gj_id: g.gj_id, status: "doing" }, "gj")}>เริ่มทำ</button>}
                    <input style={{ ...input, flex: 1, minWidth: 190 }} placeholder="ลิงก์ไฟล์งาน (Drive / Figma)"
                      value={gjUrl[g.gj_id] || ""} onChange={e => setGjUrl(v => ({ ...v, [g.gj_id]: e.target.value }))} />
                    <button style={btn()} disabled={busy === "gj" || !(gjUrl[g.gj_id] || "").trim()}
                      onClick={() => post("/api/team/graphic/update", { gj_id: g.gj_id, status: "sent", work_url: (gjUrl[g.gj_id] || "").trim() }, "gj")}>ส่งงาน</button>
                  </div>)}
                {!isFairy && g.status === "sent" && (
                  <button style={{ ...ghost, marginTop: 10, fontSize: 13 }} disabled={busy === "gj"}
                    onClick={() => post("/api/team/graphic/update", { gj_id: g.gj_id, status: "done" }, "gj")}>✓ รับงานแล้ว</button>)}
              </div>
            );
          })}
        </>;
      })()}

      {/* ═══════ 📝 คอนเทนต์ลูกค้า — ลูกตาล → AI → กัน → ลูกตาล → ลูกค้า (คิมออกแบบ 7 ส.ค.) ═══════ */}
      {tab === "content" && (() => {
        if (!cp) return <div style={card}><p className="muted" style={{ margin: 0 }}>กำลังโหลด...</p></div>;
        const tone = { draft: "#a89f96", generating: "#0b6ea8", review: "#B26A00", ae_check: "#7a4fa3", sent: C.green, error: "#b42318" };
        return <>
          {/* ลูกตาลกรอกบรีฟ */}
          {/* 📝 ฟอร์มรับบรีฟย้ายไปรวมที่แท็บ "📥 รับบรีฟใหม่" แล้ว (คิมสั่ง 13 ส.ค.)
              เดิมมี 3 ประตูรับงานแยกกัน ลูกตาลต้องรู้ก่อนว่างานนี้เป็นประเภทไหนถึงจะกรอกถูกที่
              ตอนนี้กรอกที่เดียว ติ๊กประเภท แล้วระบบส่งให้คนที่ถูกต้องเอง — ตรงนี้เหลือแค่รายการงาน */}
          {cp.is_boss && (cp.projects || []).length === 0 && (
            <div style={{ ...card, textAlign: "center", color: "#7c7268", fontSize: 13.5, lineHeight: 1.8 }}>
              ยังไม่มีงานคอนเทนต์ค่ะ — สั่งงานใหม่ได้ที่แท็บ <b>📥 รับบรีฟใหม่</b> แล้วติ๊ก <b>📝 คอนเทนต์ (เขียน)</b>
            </div>
          )}

          {!cp.projects.length && <div style={card}><p className="muted" style={{ margin: 0, fontSize: 14 }}>ยังไม่มีงานคอนเทนต์ค่ะ</p></div>}

          {cp.projects.map(p => {
            const open = cpOpen === p.cp_id;
            const mineToReview = p.status === "review" && (p.assigned_to === me.member_id || isOwner || isAE);
            return (
              <div key={p.cp_id} style={{ ...card, borderLeft: `4px solid ${tone[p.status]}` }}>
                <div onClick={() => { setCpOpen(open ? "" : p.cp_id); }} style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#a89f96" }}>{open ? "▾" : "▸"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 15 }}>{p.client_name}</b>
                    <div style={{ fontSize: 12.5, color: "#a89f96", marginTop: 2 }}>
                      {cp.statuses[p.status]} · {p.want_count} ชิ้น{p.due_th ? ` · ส่ง ${p.due_th}` : ""}
                      {p.created_by_name ? ` · รับโดย ${p.created_by_name}` : ""}
                    </div>
                  </div>
                  {p.status === "sent" && <span style={{ fontSize: 12, color: C.green }}>✓ ส่งแล้ว</span>}
                </div>

                {p.status === "error" && <div style={{ marginTop: 9, fontSize: 13.5, color: "#b42318" }}>
                  AI ทำไม่สำเร็จ: {p.error}
                  <button style={{ ...ghost, marginLeft: 8, fontSize: 12.5, padding: "5px 12px" }} disabled={busy === "cp"}
                    onClick={async () => { await post("/api/team/content/advance", { cp_id: p.cp_id }, "cp"); setTimeout(() => loadCp(cpOpen), 900); }}>สั่งทำใหม่</button>
                </div>}

                {open && <>
                  {p.brief && <div style={{ background: "#fbf7f3", borderRadius: 10, padding: 11, marginTop: 10, fontSize: 13.5, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
                    <b>บรีฟ:</b> <Linkify text={p.brief} />
                    {p.ref_links && <><br /><br /><b>เรฟ:</b> <Linkify text={p.ref_links} /></>}
                  </div>}

                  {cp.items.filter(x => x.cp_id === p.cp_id).map(it => {
                    const dr = ciD[it.ci_id] || {};
                    const val = (k) => (dr[k] !== undefined ? dr[k] : (it[k] || ""));
                    const set = (k, v) => setCiD(o => ({ ...o, [it.ci_id]: { ...o[it.ci_id], [k]: v } }));
                    const canEdit = mineToReview;
                    return (
                      <div key={it.ci_id} style={{ border: `1px solid ${it.approved ? "#cfe3d6" : "var(--border)"}`,
                        background: it.approved ? "#f7fbf8" : "#fff", borderRadius: 12, padding: 12, marginTop: 10 }}>
                        <div className="between" style={{ gap: 8, flexWrap: "wrap" }}>
                          <b style={{ fontSize: 14.5 }}>{it.seq}. {val("title")}</b>
                          {it.approved && <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>✓ ผ่านแล้ว</span>}
                        </div>
                        {it.angle && <p style={{ fontSize: 13, color: "#7c7268", margin: "4px 0 8px" }}>มุมเล่า: {it.angle}</p>}
                        {canEdit ? <>
                          <L t="ฮุก 3 วิแรก"><input style={input} value={val("hook")} onChange={e => set("hook", e.target.value)} /></L>
                          <L t="สคริปต์ (แก้ให้เป็นภาษาคน)"><textarea style={{ ...input, minHeight: 110, fontFamily: "inherit" }} value={val("script")} onChange={e => set("script", e.target.value)} /></L>
                          <L t="ภาพที่ต้องถ่าย"><textarea style={{ ...input, minHeight: 56, fontFamily: "inherit" }} value={val("visual")} onChange={e => set("visual", e.target.value)} /></L>
                          <L t="ฟอร์แมต / เรฟ (คนคอนเทนต์เป็นคนใส่)"><textarea style={{ ...input, minHeight: 56, fontFamily: "inherit" }} value={val("format_note")} onChange={e => set("format_note", e.target.value)} /></L>
                          <L t="แคปชั่น"><textarea style={{ ...input, minHeight: 56, fontFamily: "inherit" }} value={val("caption")} onChange={e => set("caption", e.target.value)} /></L>
                          <div style={{ display: "flex", gap: 7, marginTop: 9, flexWrap: "wrap" }}>
                            <button style={ghost} disabled={busy === "cp"}
                              onClick={async () => { await post("/api/team/content/item", { ci_id: it.ci_id, ...dr }, "cp"); loadCp(cpOpen); }}>บันทึก</button>
                            <button style={btn()} disabled={busy === "cp"}
                              onClick={async () => { await post("/api/team/content/item", { ci_id: it.ci_id, ...dr, approved: true }, "cp"); loadCp(cpOpen); }}>
                              {it.approved ? "บันทึก + คงสถานะผ่าน" : "✓ ผ่าน"}
                            </button>
                          </div>
                        </> : <div style={{ fontSize: 13.5, lineHeight: 1.8 }}>
                          <p style={{ margin: "0 0 5px" }}><b>ฮุก:</b> {it.hook}</p>
                          <p style={{ margin: "0 0 5px", whiteSpace: "pre-wrap" }}><b>สคริปต์:</b> {it.script}</p>
                          {it.format_note && <p style={{ margin: "0 0 5px", whiteSpace: "pre-wrap" }}><b>ฟอร์แมต:</b> <Linkify text={it.format_note} /></p>}
                          {it.caption && <p style={{ margin: 0, whiteSpace: "pre-wrap" }}><b>แคปชั่น:</b> {it.caption} {it.hashtags}</p>}
                        </div>}
                      </div>
                    );
                  })}

                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    {mineToReview && <button style={btn()} disabled={busy === "cp"}
                      onClick={async () => { await post("/api/team/content/advance", { cp_id: p.cp_id }, "cp"); loadCp(cpOpen); }}>ตรวจครบแล้ว · ส่งให้ AE</button>}
                    {p.status === "ae_check" && (isOwner || isAE) && <button style={btn()} disabled={busy === "cp"}
                      onClick={async () => { await post("/api/team/content/advance", { cp_id: p.cp_id }, "cp"); loadCp(cpOpen); }}>✓ ส่งลูกค้าแล้ว</button>}
                    {["ae_check", "sent", "review"].includes(p.status) &&
                      <a className="btn" href={`/api/team/content/export.csv?code=${encodeURIComponent(code)}&cp_id=${p.cp_id}`}
                         style={{ ...ghost, textDecoration: "none", display: "inline-block" }}>📊 ดาวน์โหลด Excel</a>}
                  </div>
                </>}
              </div>
            );
          })}
        </>;
      })()}

      {/* ═══════ 🌴 วันลา — คิมสั่ง 7 ส.ค. "ยึดตามกฎหมาย กันความมั่วในการกดวันหยุด" ═══════ */}
      {tab === "leave" && (() => {
        if (!lv) return <div style={card}><p className="muted" style={{ margin: 0 }}>กำลังโหลด...</p></div>;
        const kinds = lv.summary?.kinds || [];
        const cur = kinds.find(k => k.kind === lvF.kind);
        const send = async () => {
          const r = await post("/api/team/leave", { ...lvF, days: lvF.day ? [lvF.day] : [] }, "lv");
          if (r) { setLvF({ kind: lvF.kind, day: "", reason: "", proof_url: "" }); loadLeave(); }
        };
        return <>
          {/* โควตาคงเหลือ */}
          <div style={card}>
            <h3 style={{ fontSize: 16, margin: "0 0 10px" }}>🌴 วันลาคงเหลือปี {lv.year}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
              {kinds.map(k => (
                <div key={k.kind} style={{ background: "#fbf7f3", borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{k.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: k.left ? C.green : "#b42318", marginTop: 2 }}>{k.left}</div>
                  <div style={{ fontSize: 12, color: "#a89f96" }}>เหลือ จาก {k.quota} วัน · ใช้ไป {k.used}</div>
                  {k.below_legal && <div style={{ fontSize: 11, color: "#b4700f", marginTop: 5, lineHeight: 1.5 }}>
                    ⚠️ กฎหมายกำหนดขั้นต่ำ {k.legal_min} วัน</div>}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12.5, color: "#a89f96", marginTop: 10, lineHeight: 1.75 }}>
              {kinds.map(k => k.note).filter(Boolean).map((n, i) => <span key={i}>· {n}<br /></span>)}
            </p>
          </div>

          {/* ขอลา */}
          <div style={card}>
            <h3 style={{ fontSize: 15.5, margin: "0 0 10px" }}>ขอลา</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select style={{ ...input, width: "auto" }} value={lvF.kind} onChange={e => setLvF(v => ({ ...v, kind: e.target.value }))}>
                {kinds.map(k => <option key={k.kind} value={k.kind}>{k.label} (เหลือ {k.left})</option>)}
              </select>
              <input style={{ ...input, width: "auto" }} type="date" value={lvF.day} onChange={e => setLvF(v => ({ ...v, day: e.target.value }))} />
              <input style={{ ...input, flex: 1, minWidth: 160 }} placeholder="เหตุผล" value={lvF.reason} onChange={e => setLvF(v => ({ ...v, reason: e.target.value }))} />
            </div>
            {cur?.need_proof && <input style={{ ...input, marginTop: 8 }} placeholder="ลิงก์หลักฐาน เช่น ใบรับรองแพทย์ (จำเป็นสำหรับลาป่วย)"
              value={lvF.proof_url} onChange={e => setLvF(v => ({ ...v, proof_url: e.target.value }))} />}
            <button style={{ ...btn(), marginTop: 10 }} disabled={busy === "lv" || !lvF.day} onClick={send}>ส่งคำขอลา</button>
            <p style={{ fontSize: 12.5, color: "#a89f96", marginTop: 8 }}>ลาหลายวันให้กดทีละวันนะคะ · วันหยุดบริษัทกับเสาร์-อาทิตย์ไม่ต้องลาค่ะ</p>
          </div>

          {/* คำขอของฉัน */}
          {!!(lv.requests || []).length && <div style={card}>
            <h3 style={{ fontSize: 15.5, margin: "0 0 8px" }}>คำขอของฉัน</h3>
            {lv.requests.map(r => {
              const st = { pending: ["รออนุมัติ", "#B26A00"], approved: ["อนุมัติแล้ว", C.green], rejected: ["ไม่อนุมัติ", "#b42318"] }[r.status];
              return <div key={r.leave_id} style={{ display: "flex", gap: 10, justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f0ebe4", fontSize: 14, flexWrap: "wrap" }}>
                <span>{r.day} · {lv.rules?.[r.kind]?.label || r.kind}{r.reason ? ` · ${r.reason}` : ""}</span>
                <b style={{ color: st[1] }}>{st[0]}</b>
              </div>;
            })}
          </div>}

          {/* คิม/AE อนุมัติ */}
          {lv.is_boss && !!(lv.pending || []).length && <div style={card}>
            <h3 style={{ fontSize: 15.5, margin: "0 0 8px" }}>รออนุมัติ ({lv.pending.length})</h3>
            {lv.pending.map(r => (
              <div key={r.leave_id} style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center",
                padding: "9px 0", borderBottom: "1px solid #f0ebe4", fontSize: 14, flexWrap: "wrap" }}>
                <span><b>{r.member_name}</b> · {lv.rules?.[r.kind]?.label || r.kind} · {r.day}
                  {r.reason ? ` · ${r.reason}` : ""}
                  {r.proof_url && <> · <Linkify text={r.proof_url} /></>}</span>
                <span style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...btn(), padding: "6px 14px", fontSize: 13 }} disabled={busy === "lv"}
                    onClick={async () => { await post("/api/team/leave/decide", { leave_id: r.leave_id, pass: true }, "lv"); loadLeave(); }}>อนุมัติ</button>
                  <button style={{ ...ghost, padding: "6px 14px", fontSize: 13, color: "#b42318" }} disabled={busy === "lv"}
                    onClick={async () => { await post("/api/team/leave/decide", { leave_id: r.leave_id, pass: false }, "lv"); loadLeave(); }}>ไม่อนุมัติ</button>
                </span>
              </div>
            ))}
          </div>}

          {/* วันหยุดบริษัท */}
          <div style={card}>
            <h3 style={{ fontSize: 15.5, margin: "0 0 4px" }}>📅 วันหยุดบริษัทปี {lv.year}</h3>
            <p style={{ fontSize: 13, color: "#7c7268", margin: "0 0 10px", lineHeight: 1.7 }}>
              ตั้งไว้ <b>{lv.holidays.length} / {lv.holidays_target} วัน</b>
              {lv.holidays_left > 0 && <> · เลือกได้อีก <b style={{ color: "#B26A00" }}>{lv.holidays_left} วัน</b> จากปฏิทินวันหยุดไทย</>}
              <br />วันพวกนี้หยุดทั้งบริษัท ไม่ต้องกดลา และระบบไม่ส่งงานให้ใครในวันนั้น
            </p>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
              {lv.holidays.map(h => (
                <span key={h.day} style={{ background: h.fixed ? "#eaf1f8" : "#f4f0ea", borderRadius: 999, padding: "5px 12px", fontSize: 12.5 }}>
                  {h.day} · {h.name}
                  {isOwner && !h.fixed && <button style={{ background: "none", border: 0, cursor: "pointer", color: "#b42318", marginLeft: 5, fontSize: 13 }}
                    onClick={async () => { await post("/api/team/holidays", { day: h.day, remove: true }, "lv"); loadLeave(); }}>×</button>}
                </span>
              ))}
            </div>
            {isOwner && lv.holidays_left > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input style={{ ...input, width: "auto" }} type="date" value={holF.day} onChange={e => setHolF(v => ({ ...v, day: e.target.value }))} />
                <input style={{ ...input, flex: 1, minWidth: 140 }} placeholder="ชื่อวันหยุด" value={holF.name} onChange={e => setHolF(v => ({ ...v, name: e.target.value }))} />
                <button style={btn()} disabled={busy === "lv" || !holF.day}
                  onClick={async () => { await post("/api/team/holidays", holF, "lv"); setHolF({ day: "", name: "" }); loadLeave(); }}>เพิ่มวันหยุด</button>
              </div>)}
          </div>
        </>;
      })()}

      {/* ═══ 📥 ประตูรับงานประตูเดียว — ติ๊กประเภท แล้วระบบส่งให้คนที่ถูกต้องเอง (คิมสั่ง 13 ส.ค.) ═══ */}
      {tab === "intake" && (() => {
        const KINDS = [
          { k: "edit",    icon: "🎬", label: "ตัดต่อวิดีโอ", to: "bo / Gong / kan", tone: "#5a3fc0",
            hint: "ระบบเลือกคนตัดให้เอง ตามคิวว่างและลำดับที่คิมตั้งไว้" },
          { k: "content", icon: "📝", label: "คอนเทนต์ (เขียน)", to: "kan", tone: "#0b6ea8",
            hint: "AI ร่างให้ก่อน แล้ว kan ตรวจแก้ ก่อนส่ง AE" },
          { k: "graphic", icon: "🎨", label: "งานกราฟฟิก", to: "fairy", tone: "#7a4fa3",
            hint: "ส่งเข้าคิวกราฟฟิกโดยตรง" },
        ];
        const cur = KINDS.find(x => x.k === kind);
        const needEmail = kind === "edit";
        const okToSend = intake.client_name.trim() && intake.title.trim()
          && (!needEmail || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(intake.client_email.trim()))
          && (kind !== "content" || intake.brief.trim());
        const reset = () => setIntake({ client_name: "", client_email: "", client_contact: "", title: "", brief: "", clips: 1, client_due: "", footage_url: "", ref_links: "" });
        async function send() {
          let r = null;
          if (kind === "edit") {
            r = await post("/api/team/intake", { ...intake, clips: Number(intake.clips) || 1 }, "intake");
            if (r?.ok) setIntakeMsg({ ok: true, t: r.assigned_to ? `รับงานแล้วค่ะ 🎬 ระบบมอบให้ ${r.assigned_to} — ${r.reason}` : `รับงานแล้วค่ะ · ${r.reason}` });
          } else if (kind === "content") {
            r = await post("/api/team/content/create", {
              client_name: intake.client_name, client_contact: intake.client_contact,
              brief: intake.brief, ref_links: intake.ref_links,
              want_count: Math.max(1, Math.min(30, Number(intake.clips) || 5)),
              due_at: intake.client_due }, "intake");
            if (r?.ok) setIntakeMsg({ ok: true, t: "รับบรีฟแล้วค่ะ 📝 AI กำลังร่างให้ · ดูได้ที่แท็บ “คอนเทนต์ลูกค้า”" });
          } else {
            r = await post("/api/team/graphic/request", {
              title: intake.title, brief: intake.brief, client: intake.client_name,
              ref_links: intake.ref_links, clip_url: intake.footage_url, due_at: intake.client_due }, "intake");
            if (r?.ok) setIntakeMsg({ ok: true, t: "ส่งเข้าคิวกราฟฟิกให้ fairy แล้วค่ะ 🎨 ดูได้ที่แท็บ “งานกราฟฟิก”" });
          }
          if (r?.ok) reset();
          else setIntakeMsg({ ok: false, t: r?.message || "บันทึกไม่สำเร็จ ลองใหม่นะคะ" });
        }
        return (
        <div style={card}>
          <h3 style={{ fontSize: 16, margin: "0 0 4px" }}>📥 รับบรีฟจากลูกค้า</h3>
          <p style={{ fontSize: 13, color: "#7c7268", margin: "0 0 14px", lineHeight: 1.7 }}>
            กรอกที่เดียวจบ — <b>ติ๊กว่าเป็นงานประเภทไหน แล้วระบบส่งให้คนที่ถูกต้องเอง</b> ไม่ต้องเลือกคน ไม่ต้องประสาน
          </p>

          {/* ติ๊กประเภทงาน */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {KINDS.map(x => {
              const on = x.k === kind;
              return (
                <button key={x.k} onClick={() => { setKind(x.k); setIntakeMsg(null); }}
                  style={{ flex: "1 1 180px", textAlign: "left", cursor: "pointer", padding: "11px 13px", borderRadius: 12,
                    border: `1.5px solid ${on ? x.tone : "var(--border)"}`, background: on ? "#fff" : "#fafafa",
                    boxShadow: on ? `0 0 0 3px ${x.tone}22` : "none" }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: on ? x.tone : "#2f2a26" }}>{x.icon} {x.label}</div>
                  <div style={{ fontSize: 12, color: "#7c7268", marginTop: 2 }}>→ {x.to}</div>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 12.5, color: cur.tone, background: `${cur.tone}12`, borderRadius: 10, padding: "8px 11px", marginBottom: 12, lineHeight: 1.6 }}>
            {cur.icon} <b>{cur.label}</b> — {cur.hint}
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            <Field label="ชื่อลูกค้า *"><input style={input} value={intake.client_name} onChange={e => setIntake(v => ({ ...v, client_name: e.target.value }))} placeholder="บริษัท / ชื่อร้าน" /></Field>
            {/* 📧 อีเมลลูกค้าบังคับเฉพาะงานตัดต่อ — เพราะลูกค้าต้องเปิดหน้างานเองเพื่อดูงาน/ส่งจุดแก้
                คิมเจอเอง 7 ส.ค.: งานที่ไม่มีอีเมล ระบบสร้างอีเมลปลอมให้ = ลูกค้าเปิดดูไม่ได้เลย
                คอนเทนต์กับกราฟฟิกส่งกลับผ่านลูกตาล ไม่ได้เปิดหน้าเอง เลยไม่บังคับ */}
            {needEmail && <Field label="อีเมลลูกค้า *"><input style={input} type="email" value={intake.client_email}
              onChange={e => setIntake(v => ({ ...v, client_email: e.target.value }))}
              placeholder="ต้องมี — ไม่งั้นลูกค้าเปิดดูงานไม่ได้" /></Field>}
            <Field label="ช่องทางติดต่อ"><input style={input} value={intake.client_contact} onChange={e => setIntake(v => ({ ...v, client_contact: e.target.value }))} placeholder="LINE / เบอร์" /></Field>
            <Field label="ชื่องาน *"><input style={input} value={intake.title} onChange={e => setIntake(v => ({ ...v, title: e.target.value }))} placeholder="เรียกงานนี้ว่าอะไร" /></Field>
            {kind !== "graphic" && <Field label={kind === "edit" ? "กี่คลิป" : "กี่ชิ้น (1–30)"}>
              <input style={input} inputMode="numeric" value={intake.clips}
                onChange={e => setIntake(v => ({ ...v, clips: e.target.value.replace(/[^\d]/g, "").slice(0, 3) }))} /></Field>}
            <Field label="ลูกค้าขอส่งวันไหน"><input style={input} type="date" value={intake.client_due} onChange={e => setIntake(v => ({ ...v, client_due: e.target.value }))} /></Field>
            {kind !== "content" && <Field label={kind === "edit" ? "ลิงก์ฟุตเทจ (ถ้ามีแล้ว)" : "ลิงก์คลิป/ไฟล์ให้กราฟฟิกดู"}>
              <input style={input} value={intake.footage_url} onChange={e => setIntake(v => ({ ...v, footage_url: e.target.value }))} placeholder="ไม่มีก็เว้นว่าง" /></Field>}
          </div>
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <Field label={`บรีฟที่ลูกค้าบอกมา${kind === "content" ? " *" : ""}`}>
              <textarea style={{ ...input, minHeight: 88, resize: "vertical" }} value={intake.brief}
                onChange={e => setIntake(v => ({ ...v, brief: e.target.value }))} placeholder="อยากได้แบบไหน · ห้ามมีอะไร · อ้างอิงคลิปไหน" />
            </Field>
            <Field label="ลิงก์ตัวอย่าง/เรฟที่ลูกค้าส่งมา">
              <input style={input} value={intake.ref_links} onChange={e => setIntake(v => ({ ...v, ref_links: e.target.value }))} placeholder="วางได้หลายลิงก์" />
            </Field>
          </div>
          {intakeMsg && <div style={{ ...card, marginTop: 12, background: intakeMsg.ok ? "#eef7f0" : "#fde8e8", color: intakeMsg.ok ? "#1a7f43" : "#b42318", fontSize: 14 }}>{intakeMsg.t}</div>}
          <button style={{ ...btn(cur.tone), marginTop: 14 }} disabled={busy === "intake" || !okToSend} onClick={send}>
            {busy === "intake" ? "กำลังบันทึก…" : `${cur.icon} รับงาน + ส่งให้ ${cur.to} อัตโนมัติ`}
          </button>
        </div>);
      })()}

      {/* ═══ 🧠 รายงาน AI ประเมินทีมรายสัปดาห์ (คิมคนเดียว) ═══ */}
      {tab === "review" && isOwner && (
        !rev ? <div style={{ ...card, textAlign: "center", color: "#7c7268" }}>กำลังให้ AI อ่านตัวเลข…</div> : <>
          <div style={{ ...card, background: "#fbf7f3" }}>
            <div className="between" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, color: "#a89f96" }}>สัปดาห์ {rev.week}</div>
                <h3 style={{ fontSize: 16.5, margin: "3px 0 0" }}>{rev.review?.headline}</h3>
              </div>
              <button style={{ ...ghost, fontSize: 13 }} onClick={() => { setRev(null);
                api(`/api/team/weekly-review?code=${encodeURIComponent(code)}&refresh=1`).then(setRev).catch(() => {}); }}>
                อัปเดตใหม่
              </button>
            </div>
          </div>
          {(rev.review?.people || []).map((p, i) => {
            const tone = p.status === "ต้องช่วย" ? C.red : p.status === "ดีมาก" ? C.green : C.yellow;
            return (
              <div key={i} style={{ ...card, borderLeft: `4px solid ${tone}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <b style={{ fontSize: 15.5 }}>{p.name}</b>
                  <span style={{ background: tone, color: "#fff", borderRadius: 999, padding: "3px 12px", fontSize: 12, fontWeight: 800 }}>{p.status}</span>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.8, marginTop: 8 }}>
                  <div>✅ {p.good}</div>
                  <div style={{ marginTop: 4 }}>👀 {p.watch}</div>
                  <div style={{ marginTop: 4, color: "#0b6ea8" }}>💡 {p.suggest}</div>
                </div>
              </div>
            );
          })}
          {(rev.review?.team_risks || []).length > 0 && <div style={card}>
            <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>⚠️ ความเสี่ยงของทีมสัปดาห์นี้</h3>
            {rev.review.team_risks.map((x, i) => <div key={i} style={{ fontSize: 14, lineHeight: 1.8 }}>• {x}</div>)}
          </div>}
          {(rev.review?.kim_should_do || []).length > 0 && <div style={{ ...card, background: "#f0f7fb", border: "1px solid #d6e9f4" }}>
            <h3 style={{ fontSize: 15, margin: "0 0 8px", color: "#0b6ea8" }}>🎯 สิ่งที่คิมควรทำสัปดาห์นี้</h3>
            {rev.review.kim_should_do.map((x, i) => <div key={i} style={{ fontSize: 14, lineHeight: 1.8 }}>{i + 1}. {x}</div>)}
          </div>}
        </>
      )}

      {/* ═══ คลาสที่สอน + ค่าคอม 10% ═══ */}
      {tab === "teach" && (<>
        <p style={{ color: "#7c7268", fontSize: 13, marginTop: 0 }}>
          ทุกคนได้ส่วนแบ่ง 10% จากยอดที่เก็บได้จริงของคลาสที่ตัวเองสอนค่ะ
        </p>
        {(d.teach || []).length === 0 && <div style={{ ...card, textAlign: "center", color: "#7c7268" }}>ยังไม่มีคลาสที่ผูกไว้ค่ะ</div>}
        {(d.teach || []).map(t => (
          <div key={t.teach_id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <b style={{ fontSize: 15 }}>{t.workshop_name}</b>
                <div style={{ color: "#7c7268", fontSize: 13, marginTop: 3 }}>
                  {t.starts_th} · จองแล้ว {t.booked}/{t.seats} ที่{t.location ? ` · ${t.location}` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#1a7f43" }}>{t.share_baht.toLocaleString()}฿</div>
                <div style={{ fontSize: 12, color: "#a89f96" }}>ส่วนแบ่ง {t.share_percent}%{t.paid ? " · จ่ายแล้ว ✅" : " · ยังไม่จ่าย"}</div>
              </div>
            </div>
          </div>
        ))}
      </>)}

      {/* ═══ ภาพรวมของคิม (owner เท่านั้น) ═══ */}
      {tab === "money" && isOwner && <Overview ov={ov} />}

      {/* ═══ จัดการสมาชิก (owner เท่านั้น) ═══ */}
      {tab === "people" && isOwner && <People d={d} post={post} busy={busy} />}
    </div>
  );
}

function Stat({ n, label, tone }) {
  return <div><div style={{ fontSize: 24, fontWeight: 700, color: tone || "#2f2a26" }}>{n}</div>
    <div style={{ fontSize: 12, color: "#7c7268" }}>{label}</div></div>;
}

// ── การ์ดงาน 1 ชิ้น ──
function Job({ j, me, d, isOwner, isAE, open, toggle, draftUrl, setDraftUrl, note, setNote, busy, post, spotlight }) {
  const [msg, setMsg] = useState("");
  const [showThread, setShowThread] = useState(false);
  const [showBrief, setShowBrief] = useState(false);   // สคริปต์เต็ม — พับไว้ก่อน กางเมื่ออยากอ่าน
  // 🎬 ลิงก์คลิปที่ตัดแล้ว ก่อนส่งให้กราฟฟิก — เติมจากงานที่เคยส่งให้ลูกค้าดูแล้วให้อัตโนมัติ
  const [gjClip, setGjClip] = useState(j.draft_url || "");
  // 🔗 กล่องแก้ลิงก์งานที่ส่งให้ลูกค้าผิด (ทีมถาม 13 ส.ค. "ถ้าส่งลิงก์ผิดต้องทำไง")
  const [fixUrl, setFixUrl] = useState("");
  const [fixWhy, setFixWhy] = useState("");
  const [fixOpen, setFixOpen] = useState(false);
  const [openRound, setOpenRound] = useState({});   // รอบแก้เก่าที่กางดูอยู่ (แยกตามรอบ)
  // งานที่จบ/ยกเลิกแล้วไม่ต้องมีป้ายกำหนดส่ง — ขึ้น "เหลือ 3 วัน" บนงานที่เสร็จไปแล้วทำให้สับสน
  const chip = ["done", "canceled"].includes(j.status) ? null : dueChip(j.due_at);
  // 🐛 แก้ 7 ส.ค. — บรีฟในระบบมี 2 รูปแบบ แต่การ์ดงานอ่านเป็นแบบเดียว
  //    (ก) งานที่ลูกตาลรับบรีฟลูกค้ามาเอง  → {title, brief}
  //    (ข) งานที่ลูกค้าสั่งจากแผนของตัวเอง → {d, t, h, script, cta}
  //    ผลคือ: งานแบบ (ก) "ข้อความบรีฟไม่เคยขึ้นให้คนตัดเห็นเลย" (เจอตอนคิมทดสอบระบบทีม)
  //           งานแบบ (ข) ชื่องานกับฮุกไม่ขึ้น เห็นแค่ "งานตัดต่อ #abc123"
  //    → แปลงให้เป็นชุดเดียวก่อนใช้ รองรับทั้งของเก่าและของใหม่
  const raw = j.brief || {};
  const b = {
    title: raw.title || raw.t || "",
    hook: raw.hook || raw.h || "",
    script: raw.script || raw.brief || "",   // งานจากลูกตาลเก็บเนื้อบรีฟไว้ในช่อง brief
    cta: raw.cta || "",
    day: raw.d || j.script_day || null,
  };
  const canAssign = isOwner || isAE;
  const isMine = j.assigned_to === me.member_id;
  const canSubmit = isMine || isOwner || (me.role === "senior" && j.status !== "senior_review");
  const iReview = reviewGate(j, me);
  const thread = j.thread || [];
  const rejectNote = (note[j.order_id] || "").trim();

  return (
    <div style={{ ...card, padding: open ? 16 : "11px 14px", marginBottom: open ? 12 : 7,
      borderLeft: `4px solid ${C[jobColor(j)]}` }}>
      {/* หัวการ์ด — กดตรงไหนก็เปิด/ย่อได้ (คิมขอ "มีปุ่มเปิดปิดย่อช่องได้ด้วย") */}
      <div onClick={toggle} style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
        <span style={{ fontSize: 13, color: "#a89f96", width: 14, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 15 }}><Dot c={C[jobColor(j)]} />{b.title || b.hook || `งานตัดต่อ #${j.order_id.slice(-6)}`}</b>
            {chip && <span style={{ background: chip.bg, color: chip.c, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>{chip.t}</span>}
            <span style={{ background: "#f4f0ea", color: "#7c7268", borderRadius: 999, padding: "2px 10px", fontSize: 11.5, fontWeight: 600 }}>{j.status_th}</span>
          </div>
          {/* ตอนย่อโชว์บรรทัดเดียวพอ — มีงาน 10 ชิ้นก็ยังเห็นครบในจอเดียว */}
          <div style={{ color: "#a89f96", fontSize: 12.5, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            ลูกค้า {j.customer} · {j.clips || 1} คลิป{j.assignee_name ? ` · คนตัด ${j.assignee_name}` : " · ⚠️ ยังไม่มีคนทำ"}
            {j.comments ? ` · 💬 ${j.comments}` : ""}
          </div>
        </div>
      </div>

      {open && <div style={{ color: "#a89f96", fontSize: 12, marginTop: 8, paddingLeft: 24 }}>
        {j.script_day ? `วันที่ ${j.script_day} ของแผน · ` : ""}{j.due_th ? `กำหนดส่ง ${j.due_th}` : "ยังไม่มีกำหนดส่ง"}
        {j.senior_by ? ` · หัวหน้าตรวจแล้ว (${j.senior_by})` : ""}{j.ae_by ? ` · AE ผ่านแล้ว (${j.ae_by})` : ""}
      </div>}

      {open && (
        <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.7 }}>
          {/* 🧹 จัดใหม่ 7 ส.ค. — คิมบอก "รายละเอียดข้างในมันเยอะมาก"
              เดิมทุกอย่างกองรวมกันเป็นพรืดเดียว ตัวหนังสือขนาดเท่ากันหมด ไม่รู้ว่าต้องอ่านอะไรก่อน
              → แยกเป็น 3 ก้อนตามลำดับที่คนตัดต้องใช้จริง:
                (1) ลูกค้าขออะไรเป็นพิเศษ — จุดที่โดนตีกลับบ่อยที่สุด ต้องเด่นสุด
                (2) ไฟล์ — ทำเป็นปุ่มเรียงแถว กดง่ายกว่าลิงก์ตัวหนังสือ
                (3) สคริปต์เต็ม — ยาวสุด พับเก็บได้ กางเมื่ออยากอ่าน */}

          {/* (1) สิ่งที่ลูกค้าสั่งพิเศษ */}
          {(j.note || j.internal_note) && (
            <div style={{ background: "#fff8ed", border: "1px solid #f2ddb8", borderRadius: 10, padding: "10px 12px", marginBottom: 9 }}>
              {j.note && <div style={{ whiteSpace: "pre-wrap" }}>
                <b style={{ color: "#B26A00" }}>ลูกค้าขอเป็นพิเศษ</b><br /><Linkify text={j.note} /></div>}
              {j.internal_note && <div style={{ whiteSpace: "pre-wrap", marginTop: j.note ? 8 : 0, paddingTop: j.note ? 8 : 0, borderTop: j.note ? "1px dashed #ecdcc0" : 0 }}>
                <b style={{ color: "#0b6ea8" }}>โน้ตจากทีม</b><br /><Linkify text={j.internal_note} /></div>}
            </div>)}

          {/* (2) ไฟล์ — ปุ่มเรียงแถว */}
          {fixOpen && (
            <div style={{ marginTop: 10, background: "#FFF8EC", border: "1px solid #EFDFC4", borderRadius: 12, padding: "11px 12px" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#8a6d3b", marginBottom: 3 }}>🔗 แก้ลิงก์งานที่ส่งให้ลูกค้า</div>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 8, lineHeight: 1.65 }}>
                {j.status === "draft_sent"
                  ? <>⚠️ งานนี้<b>ส่งถึงลูกค้าไปแล้ว</b> — แก้ปุ๊บลูกค้าเห็นลิงก์ใหม่ทันที และระบบจะเมลแจ้งทีมไว้เป็นหลักฐานค่ะ</>
                  : <>แก้ลิงก์ได้เลย ระบบบันทึกไว้ว่าใครแก้ จากลิงก์ไหนเป็นลิงก์ไหนค่ะ</>}
              </div>
              <input style={{ ...input, marginBottom: 7 }} placeholder="ลิงก์ที่ถูกต้อง (https://...)"
                value={fixUrl} onChange={e => setFixUrl(e.target.value)} />
              <input style={{ ...input, marginBottom: 8 }} placeholder="เกิดอะไรขึ้น (ไม่บังคับ) เช่น แปะลิงก์ผิดงาน"
                value={fixWhy} onChange={e => setFixWhy(e.target.value)} />
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                <button style={{ ...btn("#8a6d3b") }} disabled={busy === "fix" || !/^https?:\/\//.test(fixUrl.trim())}
                  onClick={async () => { await post("/api/team/fix-draft-url", { order_id: j.order_id, draft_url: fixUrl.trim(), note: fixWhy.trim() }, "fix"); setFixOpen(false); setFixWhy(""); }}>
                  บันทึกลิงก์ใหม่
                </button>
                <button style={{ ...btn("#fff"), color: "#7c7268", border: "1px solid var(--border)" }} onClick={() => setFixOpen(false)}>ยกเลิก</button>
              </div>
            </div>
          )}
          {(j.footage_url || j.voice_url || j.draft_url || j.final_url || (j.files || []).length || j.ref_links) && (
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 9 }}>
              {j.footage_url && <a href={j.footage_url} target="_blank" rel="noreferrer" style={fileBtn}>🎥 ฟุตเทจ</a>}
              {j.voice_url && <a href={j.voice_url} target="_blank" rel="noreferrer" style={fileBtn}>🎙 เสียง</a>}
              {(j.files || []).map(f => (
                <a key={f.file_id} href={`/api/team/brief-file/${f.file_id}`} target="_blank" rel="noreferrer" style={fileBtn}
                   title={`${f.name} · ${Math.round((f.size_bytes || 0) / 1024)}KB`}>
                  📎 {f.name.length > 18 ? f.name.slice(0, 16) + "…" : f.name}</a>))}
              {String(j.ref_links || "").split(/\s+/).filter(u => /^https?:\/\//.test(u)).map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer" style={fileBtn}>🔗 ตัวอย่าง {i + 1}</a>))}
              {j.draft_url && <a href={j.draft_url} target="_blank" rel="noreferrer" style={{ ...fileBtn, borderColor: C.green, color: C.green }}>📼 งานที่ตัดแล้ว</a>}
              {j.draft_url && <button style={{ ...fileBtn, borderColor: "#e0d3c2", color: "#8a6d3b", cursor: "pointer" }}
                onClick={() => { setFixOpen(v => !v); setFixUrl(j.draft_url || ""); }}>🔗 แก้ลิงก์</button>}
              {/* ✅ ไฟล์ตัวจบที่ส่งลูกค้าไปแล้ว — คิมขอ 12 ส.ค. "เผื่อลูกค้ากลับมาแก้หรือทำไฟล์หาย"
                  โชว์เฉพาะตอนที่ไม่ใช่ลิงก์เดียวกับดราฟ ไม่งั้นจะมี 2 ปุ่มที่กดแล้วไปที่เดียวกัน */}
              {j.final_url && j.final_url !== j.draft_url &&
                <a href={j.final_url} target="_blank" rel="noreferrer" style={{ ...fileBtn, borderColor: C.green, color: "#fff", background: C.green }}>✅ ไฟล์ตัวจบ</a>}
            </div>)}

          {/* (3) บรีฟ/สคริปต์ — พับเก็บได้ */}
          {(b.hook || b.script || b.cta) && (
            <div style={{ background: "#fbf7f3", borderRadius: 10, padding: "10px 12px" }}>
              {b.hook && <div style={{ marginBottom: b.script || b.cta ? 6 : 0 }}><b>ฮุก:</b> {b.hook}</div>}
              {(b.script || b.cta) && !showBrief && b.script.length > 180 && (
                <button onClick={() => setShowBrief(true)}
                  style={{ background: "none", border: 0, color: "#0b6ea8", fontSize: 13.5, cursor: "pointer", padding: 0, fontFamily: "inherit", textDecoration: "underline" }}>
                  ดูสคริปต์เต็ม ▾
                </button>)}
              {(showBrief || (b.script || "").length <= 180) && <>
                {b.script && <div style={{ whiteSpace: "pre-wrap", marginBottom: 6 }}>
                  {/* งานจากลูกตาลเป็น "บรีฟ" · งานจากแผนลูกค้าเป็น "สคริปต์" — เรียกให้ตรงของ */}
                  <b>{raw.brief && !raw.script ? "บรีฟจากลูกค้า:" : "สคริปต์:"}</b><br /><Linkify text={b.script} /></div>}
                {b.cta && <div><b>ปิดท้าย:</b> {b.cta}</div>}
                {showBrief && b.script.length > 180 && <button onClick={() => setShowBrief(false)}
                  style={{ background: "none", border: 0, color: "#a89f96", fontSize: 13, cursor: "pointer", padding: "6px 0 0", fontFamily: "inherit" }}>ย่อ ▴</button>}
              </>}
            </div>)}

          {/* 🎨 ขอให้กราฟฟิกช่วย — คิมสั่ง 7 ส.ค.
              "หน้าต่างงานของโบ พี่ก้อง กัน สามคนที่เป็นอินเฮ้าส์ต้องมีปุ่มประสานงานกับแฟรี่
               แต่มันไม่ใช่ทุกงาน คนตัดต่อจะต้องเป็นคนกดว่าอยากให้แฟรี่ช่วยงานนี้"
              ฟรีแลนซ์ไม่มีปุ่มนี้ — ต้องทำอาร์ตเวิร์คเองได้ในคนเดียว (เช็คที่หลังบ้านอีกชั้น) */}
          {d.can_ask_graphic && (() => {
            // 🎨 คิมสั่ง 13 ส.ค. (ฟีดแบ็กทีมรอบแรก): "งานกราฟฟิกที่แฟรี่ทำ ต้องมาอยู่ในหน้างานตัดต่อเลย
            //    ตอนนี้เด้งอยู่หน้าแยกดูยาก" → ยกสถานะ+อาร์ตเวิร์คมาไว้ในงานชิ้นนี้เต็มๆ
            // ⚠️ ต้องรวม done/canceled ด้วย — ของเดิมกรองทิ้ง พอแฟรี่ทำเสร็จปุ๊บ
            //    บรรทัดนี้หายเลย แล้วเด้งฟอร์ม "ขอให้กราฟฟิกช่วย" กลับมาแทน
            //    = คนตัดหาลิงก์อาร์ตเวิร์คไม่เจอ แถมเสี่ยงกดขอซ้ำอีกรอบ
            const all = (d.graphic_jobs || []).filter(x => x.from_order_id === j.order_id);
            const g = all.find(x => !["done", "canceled"].includes(x.status)) || all[0];
            if (g) {
              const finished = ["sent", "done"].includes(g.status);
              return (
                <div style={{ marginTop: 10, background: finished ? "#F1F7F2" : "#FAF7FD",
                  border: `1px solid ${finished ? "#cfe3d6" : "#e4d8f2"}`, borderRadius: 12, padding: "11px 12px" }}>
                  <div className="between" style={{ gap: 8, flexWrap: "wrap", marginBottom: g.work_url ? 8 : 0 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: finished ? "#1a7f43" : "#7a4fa3" }}>
                      🎨 งานกราฟฟิก · {d.graphic_statuses?.[g.status] || g.status}
                    </span>
                    {g.assignee_name && <span className="muted" style={{ fontSize: 12.5 }}>{g.assignee_name}</span>}
                  </div>
                  {g.work_url
                    ? <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
                        <b>อาร์ตเวิร์คที่ได้:</b> <Linkify text={g.work_url} />
                      </div>
                    : <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                        {finished ? "ยังไม่ได้แนบลิงก์อาร์ตเวิร์ค" : "กราฟฟิกกำลังทำอยู่ · ลิงก์อาร์ตเวิร์คจะขึ้นตรงนี้เมื่อส่งงาน"}
                      </div>}
                  {g.clip_url && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>คลิปที่ส่งให้ดู: <Linkify text={g.clip_url} /></div>}
                </div>);
            }
            // 🎬 ต้องแปะลิงก์คลิปที่ตัดคัทชนแล้วก่อนถึงจะส่งให้กราฟฟิกได้ (คิมสั่ง 11 ส.ค.)
            const cv = gjClip;
            return (
              <div style={{ marginTop: 10, background: "#FAF7FD", border: "1px solid #e4d8f2", borderRadius: 12, padding: "11px 12px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#7a4fa3", marginBottom: 3 }}>🎨 ขอให้กราฟฟิกช่วยงานนี้</div>
                <div style={{ fontSize: 12.5, color: "#7c7268", marginBottom: 8, lineHeight: 1.65 }}>
                  แปะลิงก์คลิปที่ตัดคัทชนแล้วด้วยนะคะ — กราฟฟิกต้องดูของจริงก่อนถึงจะวางอาร์ตเวิร์คให้ตรงจังหวะได้ค่ะ
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  <input style={{ ...input, flex: 1, minWidth: 190 }} placeholder="ลิงก์คลิปที่ตัดแล้ว (Drive / Frame.io)"
                    value={cv} onChange={e => setGjClip(e.target.value)} />
                  <button style={{ ...btn(), background: "#7a4fa3" }} disabled={busy === "gj" || !cv.trim()}
                    onClick={() => post("/api/team/graphic/request", { order_id: j.order_id, clip_url: cv.trim() }, "gj")}>
                    ส่งให้กราฟฟิก
                  </button>
                </div>
              </div>);
          })()}
        </div>
      )}

      {/* 🔴 โดนตีกลับ — ขึ้นให้เห็นเต็มๆ เลย คนตัดจะได้ไม่ต้องไปกดหาในสายสนทนา */}
      {open && (() => {
        const last = [...thread].reverse().find(c => c.internal && c.text.startsWith("❌"));
        return last && ["editing", "assigned"].includes(j.status) ? (
          <div style={{ marginTop: 10, background: "#fdf0ef", border: "1px solid #f3cdc7", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 12, color: "#b42318", fontWeight: 700, marginBottom: 3 }}>
              ต้องแก้ตามนี้ — จาก {last.author_name}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}><CommentBody text={last.text.replace(/^❌ ไม่อนุมัติ — /, "")} /></div>
          </div>
        ) : null;
      })()}

      {/* 🔁 จุดที่ลูกค้าขอแก้ — กางให้เห็นเต็มๆ เลย ไม่ต้องกดหาในสายสนทนา
          คิมทัก 11 ส.ค. "ทำเป็นแนวตั้งดีกว่า" — คนตัดต้องไล่แก้ทีละจุด ถ้าอ่านตกจุดนึงคืองานตีกลับอีกรอบ
          คิมทัก 12 ส.ค. "อยากให้มีตอนที่แก้ดราฟ 1 ดูควบไปด้วย จะได้เป็นหลักฐาน แล้วก็จะได้ไม่แก้จุดเดิม"
          → โชว์ทุกรอบเรียงกัน · รอบล่าสุด = ที่ต้องทำตอนนี้ (ส้ม) · รอบก่อนหน้า = แก้ไปแล้ว (เขียว พับไว้) */}
      {open && (() => {
        const rounds = thread.filter(c => !c.internal && /^📝\s*รอบแก้/.test(c.text || ""));
        if (!rounds.length) return null;
        const lastIdx = rounds.length - 1;
        return (
          <div style={{ marginTop: 10, display: "grid", gap: 7 }}>
            {rounds.map((c, i) => {
              const [head, ...rest] = String(c.text).split("\n");
              const isNow = i === lastIdx && j.status === "revising";   // รอบที่ยังต้องลงมือ
              const when = c.created_at ? new Date(c.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "";
              return (
                <div key={i} style={{ background: isNow ? "#FFF6EC" : "#F4F8F5", borderRadius: 10, padding: "10px 13px",
                  border: `1.5px solid ${isNow ? "#F0D2A8" : "#d5e6da"}` }}>
                  <div className="between" style={{ gap: 8, flexWrap: "wrap", marginBottom: rounds.length > 1 && !isNow && !openRound[i] ? 0 : 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: isNow ? "#9a3412" : "#1a7f43" }}>
                      {head}{when ? <span style={{ fontWeight: 500, color: "#7c7268" }}> · {when}</span> : null}
                    </span>
                    {isNow
                      ? <span style={{ fontSize: 11.5, fontWeight: 800, color: "#9a3412" }}>ต้องแก้รอบนี้</span>
                      : <button onClick={() => setOpenRound(v => ({ ...v, [i]: !v[i] }))}
                          style={{ background: "none", border: 0, cursor: "pointer", fontFamily: "inherit",
                                   fontSize: 11.5, fontWeight: 700, color: "#1a7f43", padding: 0 }}>
                          ✓ แก้ไปแล้ว {openRound[i] ? "▾ ซ่อน" : "▸ ดูจุดที่แก้"}
                        </button>}
                  </div>
                  {(isNow || openRound[i]) &&
                    <div style={{ fontSize: 14, lineHeight: 1.7, opacity: isNow ? 1 : .8 }}><CommentBody text={rest.join("\n")} /></div>}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* AE กระจายงาน */}
      {open && canAssign && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "#7c7268" }}>มอบหมายให้:</span>
          <select style={{ ...input, width: "auto", padding: "7px 10px", fontSize: 14 }} value={j.assigned_to || ""}
            onChange={e => e.target.value && post("/api/team/assign", { order_id: j.order_id, assigned_to: e.target.value }, j.order_id)}>
            <option value="">— เลือกคน —</option>
            {(d.members || []).filter(m => ["editor", "senior", "ae"].includes(m.role))
              .map(m => <option key={m.member_id} value={m.member_id}>{m.name}{m.position ? ` (${m.position})` : ""}</option>)}
          </select>
          {busy === j.order_id && <span style={{ fontSize: 13, color: "#7c7268" }}>กำลังบันทึก…</span>}
        </div>
      )}

      {/* คนตัดส่งงาน */}
      {open && canSubmit && ["assigned", "editing", "revising"].includes(j.status) && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <input style={{ ...input, flex: 1, minWidth: 200 }} placeholder="วางลิงก์งานที่ตัดเสร็จ (Drive / Frame.io)"
            value={draftUrl[j.order_id] || ""} onChange={e => setDraftUrl(s => ({ ...s, [j.order_id]: e.target.value }))} />
          <button style={btn("#5a3fc0")} disabled={busy === j.order_id}
            onClick={() => post("/api/team/submit-work", { order_id: j.order_id, draft_url: (draftUrl[j.order_id] || "").trim() }, j.order_id)}>
            ส่งงานให้ตรวจ
          </button>
        </div>
      )}

      {/* ══ ตรวจงาน — ปุ่มอนุมัติ / ไม่อนุมัติ + ช่องบอกว่าต้องแก้อะไร ══ */}
      {open && iReview && (
        <div style={{ marginTop: 10, background: "#f0f7fb", borderRadius: 10, padding: 14, border: "1px solid #d6e9f4" }}>
          <div style={{ fontSize: 14, color: "#0b6ea8", marginBottom: 10, fontWeight: 700 }}>
            {j.status === "senior_review"
              ? "👀 ตรวจงานนี้ก่อนส่งต่อให้ AE"
              : "✅ ตรวจด่านสุดท้าย — อนุมัติแล้วจะส่งถึงลูกค้าทันที"}
          </div>
          {j.draft_url
            ? <a href={j.draft_url} target="_blank" rel="noreferrer"
                style={{ display: "inline-block", background: "#fff", border: "1px solid #bcdcee", borderRadius: 999, padding: "8px 16px", fontSize: 14, marginBottom: 12, textDecoration: "none", color: "#0b6ea8", fontWeight: 600 }}>
                📼 เปิดดูงานที่ตัดมา
              </a>
            : <p style={{ fontSize: 13, color: "#b42318", margin: "0 0 12px" }}>⚠️ ยังไม่มีลิงก์งาน</p>}

          <label style={{ fontSize: 13, color: "#5b7f96", fontWeight: 600 }}>ถ้าไม่อนุมัติ เขียนบอกว่าต้องแก้อะไร</label>
          <textarea rows={2} style={{ ...input, marginTop: 5, marginBottom: 10, resize: "vertical" }}
            placeholder="เช่น เพลงดังกลบเสียงพูดช่วง 0:12 · ตัวหนังสือล้นจอตอนท้าย · สีคนละโทนกับคลิปก่อน"
            value={note[j.order_id] || ""} onChange={e => setNote(s => ({ ...s, [j.order_id]: e.target.value }))} />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button style={{ ...btn("#1a7f43"), padding: "11px 24px", fontSize: 15 }} disabled={busy === j.order_id}
              onClick={() => post("/api/team/review", { order_id: j.order_id, pass: true, note: rejectNote }, j.order_id)}>
              ✅ อนุมัติ
            </button>
            <button style={{ ...btn("#b42318"), padding: "11px 24px", fontSize: 15, opacity: rejectNote ? 1 : .45 }}
              disabled={busy === j.order_id || !rejectNote}
              onClick={() => post("/api/team/review", { order_id: j.order_id, pass: false, note: rejectNote }, j.order_id)}>
              ❌ ไม่อนุมัติ ส่งกลับไปแก้
            </button>
            {!rejectNote && <span style={{ fontSize: 12, color: "#8a7f9c" }}>← เขียนเหตุผลก่อนถึงกดไม่อนุมัติได้</span>}
          </div>
        </div>
      )}

      {/* ══ 💬 คุยกันในทีมใต้งานชิ้นนี้ — ⛔ ลูกค้าไม่เห็น ══ */}
      {open && <div style={{ marginTop: 10, borderTop: "1px solid #f2ece6", paddingTop: 10 }}>
        <button style={{ background: "none", border: 0, color: "#7c7268", fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
          onClick={() => setShowThread(v => !v)}>
          💬 คุยกันในทีม ({thread.length}) {showThread ? "▾" : "▸"}
          {!showThread && thread.length > 0 &&
            <span style={{ color: "#a89f96" }}> · ล่าสุด: {thread[thread.length - 1].text.replace(/\s*\n+\s*/g, " · ").slice(0, 40)}…</span>}
        </button>

        {showThread && (<>
          <div style={{ maxHeight: 260, overflowY: "auto", margin: "10px 0" }}>
            {thread.length === 0 && <p style={{ fontSize: 13, color: "#a89f96", margin: 0 }}>ยังไม่มีใครพิมพ์อะไรค่ะ</p>}
            {thread.map((c, i) => (
              <div key={i} style={{ marginBottom: 8, padding: "8px 11px", borderRadius: 10, fontSize: 14, lineHeight: 1.6,
                background: c.internal ? "#f6f3fb" : "#fff7ec", border: `1px solid ${c.internal ? "#e5dcf2" : "#f2e2c9"}` }}>
                <div style={{ fontSize: 11.5, color: c.internal ? "#5a3fc0" : "#B26A00", fontWeight: 700, marginBottom: 2 }}>
                  {c.internal ? `🔒 ${c.author_name || "ทีม"}` : `💬 ลูกค้า`}
                </div>
                <CommentBody text={c.text} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input style={{ ...input, flex: 1, minWidth: 200 }} placeholder="พิมพ์คุยกับทีม (ลูกค้าไม่เห็นข้อความนี้)"
              value={msg} onChange={e => setMsg(e.target.value)}
              onKeyDown={async e => { if (e.key === "Enter" && msg.trim()) { await post("/api/team/comment", { order_id: j.order_id, text: msg.trim() }, j.order_id); setMsg(""); } }} />
            <button style={btn("#5a3fc0")} disabled={busy === j.order_id || !msg.trim()}
              onClick={async () => { await post("/api/team/comment", { order_id: j.order_id, text: msg.trim() }, j.order_id); setMsg(""); }}>
              ส่ง
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: "#a89f96", margin: "6px 0 0" }}>
            🔒 ม่วง = ทีมคุยกันเอง ลูกค้าไม่เห็น · 💬 ส้ม = ลูกค้าพิมพ์มา
          </p>
        </>)}
      </div>}
    </div>
  );
}

// ── หน้าภาพรวมของคิม ──
function Overview({ ov }) {
  if (!ov) return <div style={{ ...card, textAlign: "center", color: "#7c7268" }}>กำลังโหลด…</div>;
  const r = ov.revenue || {};
  return (<>
    <div style={{ ...card, background: "#fbf7f3" }}>
      <h3 style={{ fontSize: 15, margin: "0 0 12px" }}>💰 รายได้ฝั่งโปรดักชั่น</h3>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <Stat n={r.orders || 0} label="งานที่จ่ายแล้ว" />
        <Stat n={`${(r.baht || 0).toLocaleString()}฿`} label="ยอดจากงานเดี่ยว" />
        <Stat n={r.credits_sold || 0} label="เครดิตที่ขายได้" />
        <Stat n={`${(r.credits_baht || 0).toLocaleString()}฿`} label="ยอดจากเครดิต" />
        <Stat n={ov.late_jobs || 0} label="งานเลยกำหนด" tone={ov.late_jobs ? "#b42318" : null} />
      </div>
    </div>

    <div style={card}>
      <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>📊 กำไรต่อคลิปแต่ละแพ็ก</h3>
      <p style={{ fontSize: 12, color: "#a89f96", margin: "0 0 12px" }}>หักต้นทุนตัดต่อ+กราฟฟิก และค่าธรรมเนียมบัตรแล้ว · ⛔ ตัวเลขนี้คิมเห็นคนเดียว</p>
      <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
        <thead><tr style={{ color: "#7c7268", textAlign: "left", fontSize: 12 }}>
          <th style={{ padding: "6px 4px" }}>แพ็ก</th><th>ราคา/คลิป</th><th>ต้นทุน</th><th>ค่าธรรมเนียม</th><th>กำไร/คลิป</th><th>%</th>
        </tr></thead>
        <tbody>{(ov.margins || []).map(m => (
          <tr key={m.clips} style={{ borderTop: "1px solid #f2ece6" }}>
            <td style={{ padding: "8px 4px" }}>{m.clips} คลิป</td>
            <td>{m.price_per_clip.toLocaleString()}฿</td>
            <td style={{ color: "#7c7268" }}>{m.cost.toLocaleString()}฿</td>
            <td style={{ color: "#7c7268" }}>{m.fee}฿</td>
            <td style={{ fontWeight: 700, color: "#1a7f43" }}>{m.net.toLocaleString()}฿</td>
            <td style={{ color: "#1a7f43" }}>{m.pct}%</td>
          </tr>))}</tbody>
      </table>
    </div>

    <div style={card}>
      <h3 style={{ fontSize: 15, margin: "0 0 12px" }}>👥 งานของแต่ละคน</h3>
      {(ov.by_person || []).map(p => (
        <div key={p.name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #f2ece6", fontSize: 14 }}>
          <span>{p.name} <span style={{ color: "#a89f96", fontSize: 12 }}>{p.position || ROLE_TH[p.role]}</span></span>
          <span style={{ color: "#7c7268" }}>กำลังทำ <b style={{ color: "#2f2a26" }}>{p.open_jobs}</b> · เสร็จแล้ว {p.done_jobs}</span>
        </div>))}
    </div>

    {(ov.teach || []).length > 0 && (
      <div style={card}>
        <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>🎓 ค่าคอมคลาสสอน</h3>
        <p style={{ fontSize: 12, color: "#a89f96", margin: "0 0 12px" }}>10% ของยอดที่เก็บได้จริงในรอบนั้น</p>
        {(ov.teach || []).map((t, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #f2ece6", fontSize: 14, gap: 10 }}>
            <span>{t.name} · {t.workshop_name} <span style={{ color: "#a89f96", fontSize: 12 }}>{t.starts_th}</span></span>
            <span>จอง {t.booked} · <b style={{ color: "#1a7f43" }}>{t.share_baht.toLocaleString()}฿</b>{t.paid ? " ✅" : ""}</span>
          </div>))}
      </div>
    )}
  </>);
}

// ── จัดการสมาชิกทีม (คิมคนเดียว) ──
function People({ d, post, busy }) {
  const [edit, setEdit] = useState(null);
  const blank = { name: "", code: "", role: "editor", email: "", position: "", side: "production", active: true };
  return (<>
    <p style={{ color: "#7c7268", fontSize: 13, marginTop: 0 }}>
      เพิ่มฟรีแลนซ์ได้ที่นี่เลยค่ะ — ตั้งรหัสให้เขา เขาก็เข้ามาเห็นเฉพาะงานของตัวเอง
    </p>
    {(d.members || []).map(m => (
      <div key={m.member_id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", opacity: m.active === false ? .5 : 1 }}>
        <div>
          <b>{m.name}</b> <span style={{ color: "#a89f96", fontSize: 13 }}>{ROLE_TH[m.role] || m.role}{m.position ? ` · ${m.position}` : ""}</span>
          <div style={{ color: "#a89f96", fontSize: 12, marginTop: 2 }}>รหัส: {m.code} · {m.email || "ยังไม่มีอีเมลแจ้งเตือน"}</div>
        </div>
        <button style={{ ...ghost, fontSize: 13 }} onClick={() => setEdit({ ...m })}>แก้ไข</button>
      </div>
    ))}
    <button style={{ ...btn(), marginTop: 8 }} onClick={() => setEdit({ ...blank })}>+ เพิ่มคนใหม่</button>

    {edit && (
      <div style={{ ...card, marginTop: 14, background: "#fbf7f3" }}>
        <h3 style={{ fontSize: 15, margin: "0 0 12px" }}>{edit.member_id ? `แก้ไข ${edit.name}` : "เพิ่มสมาชิกใหม่"}</h3>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
          <Field label="ชื่อเล่น"><input style={input} value={edit.name} onChange={e => setEdit(s => ({ ...s, name: e.target.value }))} /></Field>
          <Field label="รหัสเข้าระบบ"><input style={input} value={edit.code} onChange={e => setEdit(s => ({ ...s, code: e.target.value }))} /></Field>
          <Field label="บทบาท">
            <select style={input} value={edit.role} onChange={e => setEdit(s => ({ ...s, role: e.target.value }))}>
              {Object.entries(ROLE_TH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="ตำแหน่ง"><input style={input} placeholder="เช่น ตัดต่อ / กราฟฟิก" value={edit.position || ""} onChange={e => setEdit(s => ({ ...s, position: e.target.value }))} /></Field>
          <Field label="รับงานได้กี่คลิป/วัน">
            <input style={input} inputMode="numeric" placeholder="พนักงานประจำใส่ 4 · ฟรีแลนซ์ใส่ 0"
              value={edit.default_slots ?? 0}
              onChange={e => setEdit(s => ({ ...s, default_slots: e.target.value.replace(/[^\d]/g, "").slice(0, 2) }))} />
          </Field>
          <Field label="อีเมล (ไว้แจ้งงานใหม่)"><input style={input} value={edit.email || ""} onChange={e => setEdit(s => ({ ...s, email: e.target.value }))} /></Field>
          <Field label="ฝั่งงาน">
            <select style={input} value={edit.side || "production"} onChange={e => setEdit(s => ({ ...s, side: e.target.value }))}>
              <option value="production">โปรดักชั่น</option><option value="academy">อะคาเดมี่</option><option value="both">ทั้งสองฝั่ง</option>
            </select>
          </Field>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, marginTop: 12 }}>
          <input type="checkbox" checked={edit.active !== false} onChange={e => setEdit(s => ({ ...s, active: e.target.checked }))} />
          ยังทำงานอยู่ (ติ๊กออกถ้าเลิกทำแล้ว — เขาจะเข้าระบบไม่ได้)
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button style={btn()} disabled={busy === "member"}
            onClick={async () => { await post("/api/team/members/save", edit, "member"); setEdit(null); }}>บันทึก</button>
          <button style={ghost} onClick={() => setEdit(null)}>ยกเลิก</button>
        </div>
      </div>
    )}
  </>);
}

const Field = ({ label, children }) => (
  <label style={{ fontSize: 13, color: "#7c7268" }}>{label}<div style={{ marginTop: 4 }}>{children}</div></label>
);
