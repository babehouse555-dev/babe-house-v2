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
const C = { red: "#d1382c", yellow: "#d99100", green: "#1a7f43" };
function jobColor(j) {
  if (["done", "draft_sent"].includes(j.status)) return "green";      // ส่งลูกค้าแล้ว = จบฝั่งเรา
  if (j.due_at) {
    const left = Math.ceil((new Date(j.due_at) - Date.now()) / DAY);
    if (left <= 0) return "red";                                       // เลยกำหนดหรือส่งวันนี้
  }
  return "yellow";
}
const Dot = ({ c }) => <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: c, marginRight: 5, verticalAlign: "middle" }} />;
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

export default function Team() {
  const [code, setCode] = useState(localStorage.getItem("babe_my_code") || "");
  const [typed, setTyped] = useState("");
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("jobs");
  const [gjUrl, setGjUrl] = useState({});      // ลิงก์ไฟล์งานที่แฟรี่กำลังพิมพ์ (แยกตามงาน)
  const [busy, setBusy] = useState("");
  const [draftUrl, setDraftUrl] = useState({});
  const [note, setNote] = useState({});
  const [open, setOpen] = useState({});
  const [showDone, setShowDone] = useState(false);
  const [sub, setSub] = useState("review");   // แท็บย่อย: รอตรวจ / งานฉัน / ดูรายคน
  const [person, setPerson] = useState(null); // ดูงานของใครอยู่ (มุมมองรายคน)
  const [ov, setOv] = useState(null);
  const [wl, setWl] = useState(null);      // 📅 ตารางงานทุกคน (AE/คิม)
  const [myAvail, setMyAvail] = useState([]);
  const [defSlots, setDefSlots] = useState(0);   // กำลังรับงานต่อวันของฉัน (คิมตั้งให้)
  const [ext, setExt] = useState([]);                 // 📦 งานนอกเว็บ
  const [intake, setIntake] = useState({ client_name: "", client_contact: "", title: "", brief: "", clips: 1, client_due: "", footage_url: "", ref_links: "" });
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
    .concat((isOwner || isAE) ? [["intake", "🏢 รับบรีฟลูกค้า", null]] : [])
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
              {[["review", "🔍 รอฉันตรวจ", inReview.length, "#0b6ea8"],
                ["mine", "✂️ งานที่ฉันต้องตัด", myJobs.length, "#5a3fc0"],
                ...(isOwner ? [["people", "👥 ดูรายคน", active.length, "#2f2a26"]] : [])]
                .map(([k, label, n, tone]) => {
                  const on = sub === k;
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
              <span><Dot c={C.yellow} /> ยังไม่เสร็จ ไม่ด่วน</span>
              <span><Dot c={C.green} /> เสร็จแล้ว</span>
            </div>

            {/* ── รอฉันตรวจ / งานฉัน ── */}
            {sub !== "people" && (() => {
              const list = sub === "review" ? inReview : myJobs;
              if (!list.length) return <div style={{ ...card, textAlign: "center", color: "#7c7268", fontSize: 14 }}>ไม่มีงานในหมวดนี้ค่ะ</div>;
              return <>
                {sub === "review" && <p style={{ fontSize: 13, color: "#5b7f96", margin: "0 0 10px" }}>
                  กดที่งานเพื่อเปิดดู แล้วเลือก <b>อนุมัติ</b> หรือ <b>ไม่อนุมัติ</b>
                </p>}
                <ExpandBar list={list} setOpen={setOpen} />
                {list.map(Row)}
              </>;
            })()}

            {/* ── ดูรายคน: การ์ดคน → กดเข้าไปเห็นงานของคนนั้น ── */}
            {sub === "people" && !openPerson && <>
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
            {sub === "people" && openPerson && <>
              <button style={{ ...ghost, fontSize: 13, marginBottom: 12 }} onClick={() => setPerson(null)}>← กลับไปดูทุกคน</button>
              <h3 style={{ fontSize: 16, margin: "0 0 10px" }}>งานของ {openPerson.name} ({personJobs.length})</h3>
              {!personJobs.length && <div style={{ ...card, textAlign: "center", color: "#7c7268", fontSize: 14 }}>ไม่มีงานค้างค่ะ</div>}
              {personJobs.length > 0 && <><ExpandBar list={personJobs} setOpen={setOpen} />{personJobs.map(Row)}</>}
            </>}
          </>}

          <button style={{ ...ghost, fontSize: 13, marginTop: 8 }} onClick={() => setShowDone(v => !v)}>
            {showDone ? "ซ่อน" : "ดู"}งานที่จบแล้ว ({jobs.length - active.length})
          </button>
          {showDone && jobs.filter(j => ["done", "canceled"].includes(j.status)).map(j =>
            <div key={j.order_id} style={{ ...card, marginTop: 10, opacity: .7, fontSize: 14 }}>
              <b>#{j.order_id.slice(-6)}</b> · {j.status_th} · {j.assignee_name || "ยังไม่ระบุคนทำ"}
            </div>)}
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
            <h3 style={{ fontSize: 16, margin: "0 0 4px" }}>📗 ลงวันว่างของฉัน</h3>
            <p style={{ fontSize: 13, color: "#7c7268", margin: "0 0 12px", lineHeight: 1.7 }}>
              {defSlots > 0
                ? <>คิมตั้งให้คุณรับงาน <b>{defSlots} คลิป/วัน (จ-ศ)</b> อยู่แล้ว — <b>ไม่ต้องกดอะไรเลยก็ได้ค่ะ</b><br />
                    วันไหนรับได้มากกว่า/น้อยกว่า หรือวันไหน<b>ลา</b> ค่อยแตะแก้เฉพาะวันนั้นนะคะ</>
                : <>แตะวันที่ว่างเพื่อ<b>เพิ่มจำนวนคลิปที่รับไหววันนั้น</b> — ระบบจะส่งงานมาให้ไม่เกินที่คุณลงไว้ ไม่ลงไว้ = ระบบจะไม่ยัดงานให้ค่ะ</>}
            </p>
            {/* ⚡ พนักงานประจำกดปุ่มเดียวจบ ไม่ต้องแตะทีละวัน (คิมเคาะ: โบ/พี่ก้องฟิกวันละ 4) */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
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

      {tab === "intake" && (
        <div style={card}>
          <h3 style={{ fontSize: 16, margin: "0 0 4px" }}>🏢 รับบรีฟลูกค้า</h3>
          <p style={{ fontSize: 13, color: "#7c7268", margin: "0 0 14px", lineHeight: 1.7 }}>
            กรอกบรีฟที่ลูกค้าให้มา แล้ว<b>ระบบจะเลือกคนตัดให้เอง</b> — ไม่ต้องเลือกคน ไม่ต้องประสาน
          </p>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            <Field label="ชื่อลูกค้า *"><input style={input} value={intake.client_name} onChange={e => setIntake(v => ({ ...v, client_name: e.target.value }))} placeholder="บริษัท / ชื่อร้าน" /></Field>
            <Field label="ช่องทางติดต่อ"><input style={input} value={intake.client_contact} onChange={e => setIntake(v => ({ ...v, client_contact: e.target.value }))} placeholder="LINE / เบอร์ — ไว้ให้ระบบตามงาน" /></Field>
            <Field label="ชื่องาน *"><input style={input} value={intake.title} onChange={e => setIntake(v => ({ ...v, title: e.target.value }))} /></Field>
            <Field label="กี่คลิป"><input style={input} inputMode="numeric" value={intake.clips} onChange={e => setIntake(v => ({ ...v, clips: e.target.value.replace(/[^\d]/g, "").slice(0, 3) }))} /></Field>
            <Field label="ลูกค้าขอส่งวันไหน"><input style={input} type="date" value={intake.client_due} onChange={e => setIntake(v => ({ ...v, client_due: e.target.value }))} /></Field>
            <Field label="ลิงก์ฟุตเทจ (ถ้ามีแล้ว)"><input style={input} value={intake.footage_url} onChange={e => setIntake(v => ({ ...v, footage_url: e.target.value }))} placeholder="ไม่มีก็เว้นว่าง" /></Field>
          </div>
          <div style={{ marginTop: 10 }}>
            <Field label="บรีฟที่ลูกค้าบอกมา">
              <textarea style={{ ...input, minHeight: 88, resize: "vertical" }} value={intake.brief}
                onChange={e => setIntake(v => ({ ...v, brief: e.target.value }))} placeholder="อยากได้แบบไหน · ห้ามมีอะไร · อ้างอิงคลิปไหน" />
            </Field>
          </div>
          {intakeMsg && <div style={{ ...card, marginTop: 12, background: intakeMsg.ok ? "#eef7f0" : "#fde8e8", color: intakeMsg.ok ? "#1a7f43" : "#b42318", fontSize: 14 }}>{intakeMsg.t}</div>}
          <button style={{ ...btn(), marginTop: 14 }} disabled={busy === "intake" || !intake.client_name.trim() || !intake.title.trim()}
            onClick={async () => {
              const r = await post("/api/team/intake", { ...intake, clips: Number(intake.clips) || 1 }, "intake");
              if (r?.ok) { setIntakeMsg({ ok: true, t: r.assigned_to ? `รับงานแล้วค่ะ 🎬 ระบบมอบให้ ${r.assigned_to} — ${r.reason}` : `รับงานแล้วค่ะ · ${r.reason}` });
                setIntake({ client_name: "", client_contact: "", title: "", brief: "", clips: 1, client_due: "", footage_url: "", ref_links: "" }); }
              else setIntakeMsg({ ok: false, t: "บันทึกไม่สำเร็จ ลองใหม่นะคะ" });
            }}>
            {busy === "intake" ? "กำลังบันทึก…" : "รับงาน + ให้ระบบจัดคนให้"}
          </button>
        </div>
      )}

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
  const chip = dueChip(j.due_at);
  const b = j.brief || {};
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
        <div style={{ background: "#fbf7f3", borderRadius: 10, padding: 12, marginTop: 10, fontSize: 14, lineHeight: 1.7 }}>
          {b.hook && <p style={{ margin: "0 0 6px" }}><b>ฮุก:</b> {b.hook}</p>}
          {b.script && <p style={{ margin: "0 0 6px", whiteSpace: "pre-wrap" }}><b>สคริปต์:</b> <Linkify text={b.script} /></p>}
          {b.cta && <p style={{ margin: "0 0 6px" }}><b>ปิดท้าย:</b> {b.cta}</p>}
          {j.note && <p style={{ margin: "6px 0 0", color: "#B26A00", whiteSpace: "pre-wrap" }}><b>ลูกค้าสั่งเพิ่ม:</b> <Linkify text={j.note} /></p>}
          {j.internal_note && <p style={{ margin: "6px 0 0", color: "#0b6ea8", whiteSpace: "pre-wrap" }}><b>โน้ตภายในทีม:</b> <Linkify text={j.internal_note} /></p>}
          {j.footage_url && <p style={{ margin: "6px 0 0" }}>🎥 <a href={j.footage_url} target="_blank" rel="noreferrer">ไฟล์วิดีโอจากลูกค้า</a></p>}
          {j.voice_url && <p style={{ margin: "4px 0 0" }}>🎙 <a href={j.voice_url} target="_blank" rel="noreferrer">ไฟล์เสียง</a></p>}
          {j.ref_links && <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>🔗 ตัวอย่างที่ลูกค้าชอบ: <Linkify text={j.ref_links} /></p>}
          {j.draft_url && <p style={{ margin: "6px 0 0" }}>📼 <a href={j.draft_url} target="_blank" rel="noreferrer">งานที่ตัดแล้ว</a></p>}

          {/* 🎨 ขอให้กราฟฟิกช่วย — คิมสั่ง 7 ส.ค.
              "หน้าต่างงานของโบ พี่ก้อง กัน สามคนที่เป็นอินเฮ้าส์ต้องมีปุ่มประสานงานกับแฟรี่
               แต่มันไม่ใช่ทุกงาน คนตัดต่อจะต้องเป็นคนกดว่าอยากให้แฟรี่ช่วยงานนี้"
              ฟรีแลนซ์ไม่มีปุ่มนี้ — ต้องทำอาร์ตเวิร์คเองได้ในคนเดียว (เช็คที่หลังบ้านอีกชั้น) */}
          {d.can_ask_graphic && (() => {
            const g = (d.graphic_jobs || []).find(x => x.from_order_id === j.order_id && !["done", "canceled"].includes(x.status));
            if (g) return (
              <p style={{ margin: "9px 0 0", fontSize: 13.5, color: "#7a4fa3" }}>
                🎨 ขอกราฟฟิกไว้แล้ว · <b>{d.graphic_statuses?.[g.status] || g.status}</b>
                {g.work_url && <> · <Linkify text={g.work_url} /></>}
              </p>);
            return (
              <button style={{ ...ghost, marginTop: 10, fontSize: 13, borderColor: "#d9c7ea", color: "#7a4fa3" }}
                disabled={busy === "gj"}
                onClick={() => post("/api/team/graphic/request", { order_id: j.order_id }, "gj")}>
                🎨 ขอให้กราฟฟิกช่วยงานนี้
              </button>);
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
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>{last.text.replace(/^❌ ไม่อนุมัติ — /, "")}</div>
          </div>
        ) : null;
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
            <span style={{ color: "#a89f96" }}> · ล่าสุด: {thread[thread.length - 1].text.slice(0, 40)}…</span>}
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
                {c.text}
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
