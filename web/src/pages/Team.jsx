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

const card = { background: "#fff", border: "1px solid #eee4dc", borderRadius: 14, padding: 16, marginBottom: 12 };
const btn = (bg = "#2f2a26") => ({ background: bg, color: "#fff", border: 0, borderRadius: 999, padding: "9px 18px", fontSize: 14, cursor: "pointer", fontWeight: 600 });
const ghost = { background: "#fff", color: "#2f2a26", border: "1px solid #ddd2c8", borderRadius: 999, padding: "8px 16px", fontSize: 14, cursor: "pointer" };
const input = { width: "100%", padding: "10px 12px", border: "1px solid #ddd2c8", borderRadius: 10, fontSize: 15, fontFamily: "inherit", boxSizing: "border-box" };

export default function Team() {
  const [code, setCode] = useState(localStorage.getItem("babe_my_code") || "");
  const [typed, setTyped] = useState("");
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("jobs");
  const [busy, setBusy] = useState("");
  const [draftUrl, setDraftUrl] = useState({});
  const [note, setNote] = useState({});
  const [open, setOpen] = useState({});
  const [showDone, setShowDone] = useState(false);
  const [ov, setOv] = useState(null);

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

  const TABS = [["jobs", "🎬 งานตัดต่อ", active.length], ["teach", "🎓 คลาสที่สอน", (d.teach || []).length]]
    .concat(isOwner ? [["money", "👑 ภาพรวม + รายได้", null], ["people", "👥 สมาชิกทีม", (d.members || []).length]] : []);

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

      {/* ═══ งานตัดต่อ ═══ */}
      {tab === "jobs" && (<>
        {active.length === 0 && <div style={{ ...card, textAlign: "center", color: "#7c7268" }}>
          ยังไม่มีงานที่ต้องทำตอนนี้ค่ะ พักได้เลย 🌿</div>}

        {/* 🔔 กล่องนี้ปักไว้บนสุดเสมอ — งานที่รอ "เรา" ตรวจ จะได้ไม่ต้องเลื่อนหา */}
        {canReview && toReview > 0 && (
          <div style={{ ...card, background: "#f0f7fb", border: "2px solid #bcdcee", padding: 14 }}>
            <h3 style={{ fontSize: 15, color: "#0b6ea8", margin: "0 0 4px" }}>🔔 รอคุณตรวจ {toReview} งาน</h3>
            <p style={{ fontSize: 13, color: "#5b7f96", margin: "0 0 10px" }}>
              กดดูงาน แล้วเลือก <b>อนุมัติ</b> หรือ <b>ไม่อนุมัติ</b> (ถ้าไม่อนุมัติต้องเขียนบอกด้วยว่าแก้อะไร)
            </p>
            {active.filter(j => reviewGate(j, me)).map(j =>
              <Job key={"r" + j.order_id} j={j} me={me} d={d} isOwner={isOwner} isAE={isAE} spotlight
                open={!!open["r" + j.order_id]} toggle={() => setOpen(o => ({ ...o, ["r" + j.order_id]: !o["r" + j.order_id] }))}
                draftUrl={draftUrl} setDraftUrl={setDraftUrl} note={note} setNote={setNote} busy={busy} post={post} />)}
          </div>
        )}

        {GROUPS.map(g => {
          const list = active.filter(j => j.status === g.k);
          if (!list.length) return null;
          return (
            <div key={g.k} style={{ marginBottom: 22 }}>
              <h3 style={{ fontSize: 15, color: g.tone, margin: "0 0 8px" }}>{g.label} ({list.length})</h3>
              {list.map(j => <Job key={j.order_id} j={j} me={me} d={d} isOwner={isOwner} isAE={isAE}
                open={!!open[j.order_id]} toggle={() => setOpen(o => ({ ...o, [j.order_id]: !o[j.order_id] }))}
                draftUrl={draftUrl} setDraftUrl={setDraftUrl} note={note} setNote={setNote} busy={busy} post={post} />)}
            </div>
          );
        })}
        <button style={{ ...ghost, fontSize: 13 }} onClick={() => setShowDone(v => !v)}>
          {showDone ? "ซ่อน" : "ดู"}งานที่จบแล้ว ({jobs.length - active.length})
        </button>
        {showDone && jobs.filter(j => ["done", "canceled"].includes(j.status)).map(j =>
          <div key={j.order_id} style={{ ...card, marginTop: 10, opacity: .7, fontSize: 14 }}>
            <b>#{j.order_id.slice(-6)}</b> · {j.status_th} · {j.assignee_name || "ยังไม่ระบุคนทำ"}
          </div>)}
      </>)}

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
  const [showThread, setShowThread] = useState(!!spotlight);   // งานที่รอเราตรวจ กางสายสนทนาให้เลย
  const chip = dueChip(j.due_at);
  const b = j.brief || {};
  const canAssign = isOwner || isAE;
  const isMine = j.assigned_to === me.member_id;
  const canSubmit = isMine || isOwner || (me.role === "senior" && j.status !== "senior_review");
  const iReview = reviewGate(j, me);
  const thread = j.thread || [];
  const rejectNote = (note[j.order_id] || "").trim();

  return (
    <div style={{ ...card, borderLeft: chip?.c === "#b42318" ? "3px solid #b42318" : "1px solid #eee4dc" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 15 }}>{b.title || b.hook || `งานตัดต่อ #${j.order_id.slice(-6)}`}</b>
            {chip && <span style={{ background: chip.bg, color: chip.c, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>{chip.t}</span>}
          </div>
          <div style={{ color: "#7c7268", fontSize: 13, marginTop: 4 }}>
            ลูกค้า {j.customer} · {j.clips || 1} คลิป{j.script_day ? ` · วันที่ ${j.script_day} ของแผน` : ""}
            {j.due_th ? ` · ส่ง ${j.due_th}` : ""}
          </div>
          <div style={{ color: "#a89f96", fontSize: 12, marginTop: 3 }}>
            {j.assignee_name ? `คนตัด: ${j.assignee_name}` : "⚠️ ยังไม่มีคนทำ"}
            {j.senior_by ? ` · หัวหน้าตรวจแล้ว (${j.senior_by})` : ""}{j.ae_by ? ` · AE ผ่านแล้ว (${j.ae_by})` : ""}
          </div>
        </div>
        <button style={{ ...ghost, fontSize: 13 }} onClick={toggle}>{open ? "ย่อ" : "ดูบรีฟ"}</button>
      </div>

      {open && (
        <div style={{ background: "#fbf7f3", borderRadius: 10, padding: 12, marginTop: 10, fontSize: 14, lineHeight: 1.7 }}>
          {b.hook && <p style={{ margin: "0 0 6px" }}><b>ฮุก:</b> {b.hook}</p>}
          {b.script && <p style={{ margin: "0 0 6px", whiteSpace: "pre-wrap" }}><b>สคริปต์:</b> {b.script}</p>}
          {b.cta && <p style={{ margin: "0 0 6px" }}><b>ปิดท้าย:</b> {b.cta}</p>}
          {j.note && <p style={{ margin: "6px 0 0", color: "#B26A00" }}><b>ลูกค้าสั่งเพิ่ม:</b> {j.note}</p>}
          {j.internal_note && <p style={{ margin: "6px 0 0", color: "#0b6ea8" }}><b>โน้ตภายในทีม:</b> {j.internal_note}</p>}
          {j.footage_url && <p style={{ margin: "6px 0 0" }}>🎥 <a href={j.footage_url} target="_blank" rel="noreferrer">ไฟล์วิดีโอจากลูกค้า</a></p>}
          {j.voice_url && <p style={{ margin: "4px 0 0" }}>🎙 <a href={j.voice_url} target="_blank" rel="noreferrer">ไฟล์เสียง</a></p>}
          {j.ref_links && <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>🔗 ตัวอย่างที่ลูกค้าชอบ: {j.ref_links}</p>}
          {j.draft_url && <p style={{ margin: "6px 0 0" }}>📼 <a href={j.draft_url} target="_blank" rel="noreferrer">งานที่ตัดแล้ว</a></p>}
        </div>
      )}

      {/* 🔴 โดนตีกลับ — ขึ้นให้เห็นเต็มๆ เลย คนตัดจะได้ไม่ต้องไปกดหาในสายสนทนา */}
      {(() => {
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
      {canAssign && (
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
      {canSubmit && ["assigned", "editing", "revising"].includes(j.status) && (
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
      {iReview && (
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
      <div style={{ marginTop: 10, borderTop: "1px solid #f2ece6", paddingTop: 10 }}>
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
      </div>
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
