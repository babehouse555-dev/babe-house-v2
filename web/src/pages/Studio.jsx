import { useState, useEffect } from "react";
import { api } from "../api.js";

// 🎬 หน้าเฉพาะทีมตัดต่อ (/studio) — คิมสั่ง 2 ส.ค.
// "ทำหน้าแยกมาเลยเป็นหน้าสำหรับทีม production เขาจะได้ไม่ต้องมายุ่งกับสินค้าอื่น"
//
// ⛔ ทีมเห็นเฉพาะงานที่ต้องตัด — ไม่มียอดขาย ไม่มีลูกค้า Blueprint ไม่มีสถิติ ไม่มีคอร์ส
//    ฝั่งเซิร์ฟเวอร์ก็ไม่ส่งตัวเลขเงินออกมาเลย (ตัดตั้งแต่ SQL) ไม่ใช่แค่ซ่อนในหน้าเว็บ
// เข้าด้วย "รหัสทีม" (TEAM_KEY) คนละตัวกับรหัสแอดมินของคิม

const STYLE_LABEL = { amabella: "สายบิวตี้ จังหวะไว", panpuri: "พรีเมียม คุมโทน", irvin: "ร้านอาหาร น่ากิน",
  spicy: "สินค้า สนุกดึงดูด", may: "รีวิวไลฟ์สไตล์", kim: "สอน/ให้ความรู้" };

// กลุ่มงานเรียงตามลำดับที่ทีมต้องลงมือจริง
const GROUPS = [
  { k: "editing", label: "🎬 กำลังตัด", tone: "#5a3fc0", hint: "งานที่ต้องลงมือตอนนี้" },
  { k: "revising", label: "✏️ แก้ตามคอมเมนต์", tone: "#B26A00", hint: "ลูกค้าตอบกลับมาแล้ว" },
  { k: "awaiting_files", label: "⏳ รอลูกค้าส่งไฟล์", tone: "#8a7f9c", hint: "ยังทำอะไรไม่ได้" },
  { k: "draft_sent", label: "👀 ส่งให้ลูกค้าดูแล้ว", tone: "#1a7f43", hint: "รอเขาตอบ" },
];
const DAY = 86400000;

export default function Studio() {
  const [key, setKey] = useState(localStorage.getItem("babe_team_key") || "");
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [who, setWho] = useState(localStorage.getItem("babe_team_who") || "");
  const [draft, setDraft] = useState({});
  const [showDone, setShowDone] = useState(false);
  const [saving, setSaving] = useState("");

  const load = (k) => {
    const use = k ?? key; if (!use) return;
    api(`/api/team/jobs?team_key=${encodeURIComponent(use)}`)
      .then(r => { setD(r); setErr(""); localStorage.setItem("babe_team_key", use); })
      .catch(() => { setErr("รหัสไม่ถูกต้องค่ะ ลองใหม่นะคะ"); setD(null); });
  };
  useEffect(() => { if (key) load(key); }, []);   // eslint-disable-line
  useEffect(() => { if (!d) return; const t = setInterval(() => load(), 60000); return () => clearInterval(t); }, [d, key]);   // eslint-disable-line

  const upd = async (id, body) => {
    setSaving(id);
    try { await api(`/api/team/job/update?team_key=${encodeURIComponent(key)}`, { method: "POST", body: { order_id: id, ...body } }); load(); }
    catch (e) { alert(e.message || "บันทึกไม่สำเร็จ"); }
    finally { setSaving(""); }
  };

  if (!d) return (
    <div className="wrap narrow page-pad">
      <div className="brand">BABE HOUSE · STUDIO</div>
      <h1 className="page" style={{ marginBottom: 4 }}>🎬 คิวงานตัดต่อ</h1>
      <p className="sub" style={{ marginBottom: 18 }}>สำหรับทีมตัดต่อเท่านั้นค่ะ</p>
      <div className="card">
        <div className="field"><label>รหัสทีม</label>
          <input type="password" value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => e.key === "Enter" && load()} placeholder="ใส่รหัสที่ได้รับ" />
        </div>
        <button className="btn full" onClick={() => load()}>เข้าดูคิวงาน</button>
        {err && <div className="msg err" style={{ marginTop: 10 }}>{err}</div>}
      </div>
    </div>
  );

  const now = Date.now();
  const dueInfo = (o) => {
    if (!o.due_at || o.status === "done" || o.status === "canceled") return null;
    const left = Math.ceil((new Date(o.due_at).getTime() - now) / DAY);
    if (left < 0) return { txt: `เลยกำหนด ${-left} วัน`, bg: "#FDE8E8", fg: "#b3261e", late: true };
    if (left === 0) return { txt: "ครบกำหนดวันนี้", bg: "#FFF3E0", fg: "#B26A00" };
    if (left <= 1) return { txt: "ครบกำหนดพรุ่งนี้", bg: "#FFF8E6", fg: "#8a6d1f" };
    return { txt: `อีก ${left} วัน`, bg: "var(--soft)", fg: "var(--muted)" };
  };
  const people = [...new Set((d.orders || []).map(o => o.assignee).filter(Boolean))];
  const visible = who ? d.orders.filter(o => o.assignee === who) : d.orders;
  const late = visible.filter(o => dueInfo(o)?.late).length;
  const openCount = visible.filter(o => o.status !== "done" && o.status !== "canceled").length;
  const pick = (p) => { setWho(p); localStorage.setItem("babe_team_who", p); };

  return (
    <div className="wrap narrow page-pad">
      <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="brand">BABE HOUSE · STUDIO</div>
        <button onClick={() => { localStorage.removeItem("babe_team_key"); setD(null); setKey(""); }}
          className="link" style={{ background: "none", border: 0, fontSize: 13, cursor: "pointer" }}>ออกจากระบบ</button>
      </div>
      <h1 className="page" style={{ marginBottom: 4 }}>🎬 คิวงานตัดต่อ</h1>
      <p className="sub" style={{ marginBottom: 16 }}>
        ค้างอยู่ {openCount} งาน · เวลาทำงาน {d.hours}{d.working_now ? "" : " · ตอนนี้นอกเวลาทำการ"}
      </p>

      {/* มองปุ๊บรู้ว่าต้องรีบอะไร */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {late > 0 && <span style={{ background: "#FDE8E8", color: "#b3261e", fontWeight: 800, fontSize: 13, borderRadius: 20, padding: "6px 14px" }}>🔴 เลยกำหนด {late} งาน</span>}
        {GROUPS.map(g => {
          const n = visible.filter(o => o.status === g.k).length;
          return n ? <span key={g.k} style={{ background: "#fff", border: "1px solid var(--border)", color: g.tone, fontWeight: 700, fontSize: 13, borderRadius: 20, padding: "6px 14px" }}>{g.label} {n}</span> : null;
        })}
      </div>

      {people.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 13 }}>ดูงานของ:</span>
          {["", ...people].map(p => (
            <button key={p || "all"} onClick={() => pick(p)}
              style={{ fontSize: 13, fontWeight: 700, padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit",
                border: who === p ? "1.5px solid #5a3fc0" : "1px solid var(--border)",
                background: who === p ? "#F0EBFA" : "#fff", color: who === p ? "#5a3fc0" : "var(--muted)" }}>
              {p || "ทุกคน"}
            </button>
          ))}
        </div>
      )}

      {GROUPS.map(g => {
        const rows = visible.filter(o => o.status === g.k)
          .sort((a, b) => (a.due_at ? new Date(a.due_at).getTime() : Infinity) - (b.due_at ? new Date(b.due_at).getTime() : Infinity));
        if (!rows.length) return null;
        return (
          <div key={g.k} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 15.5, color: g.tone }}>{g.label} ({rows.length})</span>
              <span className="muted" style={{ fontSize: 12.5 }}>{g.hint}</span>
            </div>
            {rows.map(o => <Job key={o.order_id} o={o} d={d} upd={upd} draft={draft} setDraft={setDraft} due={dueInfo(o)} saving={saving === o.order_id} />)}
          </div>
        );
      })}

      {(() => {
        const closed = visible.filter(o => o.status === "done" || o.status === "canceled");
        if (!closed.length) return null;
        return (
          <div>
            <button onClick={() => setShowDone(s => !s)} style={{ background: "none", border: 0, color: "var(--muted)", fontSize: 13.5, fontWeight: 700, cursor: "pointer", padding: "8px 0", fontFamily: "inherit" }}>
              {showDone ? "▾" : "▸"} งานที่จบแล้ว ({closed.length})
            </button>
            {showDone && closed.slice(0, 40).map(o => <Job key={o.order_id} o={o} d={d} upd={upd} draft={draft} setDraft={setDraft} due={null} saving={saving === o.order_id} />)}
          </div>
        );
      })()}

      {!visible.length && <div className="card center muted">ยังไม่มีงานในคิวค่ะ</div>}
    </div>
  );
}

function Job({ o, d, upd, draft, setDraft, due, saving }) {
  const dk = o.order_id, ak = "a" + o.order_id;
  return (
    <div className="card" style={{ marginTop: 0, marginBottom: 10, border: due?.late ? "1.5px solid #f0b4b4" : "1px solid var(--border)" }}>
      <div className="between" style={{ flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <b style={{ fontSize: 14.5 }}>{o.clips} คลิป · วันที่ {o.script_day ?? "-"} ของแผน{o.customer ? ` · ${o.customer}` : ""}</b>
        <span style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
          {due && <span style={{ background: due.bg, color: due.fg, fontWeight: 800, fontSize: 12, borderRadius: 20, padding: "3px 11px" }}>{due.txt}</span>}
          {o.assignee && <span style={{ background: "#F0EBFA", color: "#5a3fc0", fontWeight: 700, fontSize: 12, borderRadius: 20, padding: "3px 11px" }}>👤 {o.assignee}</span>}
        </span>
      </div>

      {/* บรีฟ = สคริปต์วันนั้นของลูกค้า ทีมไม่ต้องถามอะไรเพิ่ม */}
      {o.brief && <div style={{ fontSize: 13.5, marginBottom: 8, background: "#F4F8FD", borderRadius: 10, padding: "9px 12px", lineHeight: 1.7 }}>
        📋 <b>{o.brief.t || ""}</b>
        {o.brief.h && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>ฮุก: {o.brief.h}</div>}
      </div>}

      <div style={{ fontSize: 13.5, lineHeight: 2, marginBottom: 8 }}>
        {o.footage_url
          ? <>🎞️ <a className="link" href={o.footage_url} target="_blank" rel="noreferrer">ฟุตเทจ</a> </>
          : <span style={{ color: "#C77700", fontWeight: 700 }}>⏳ ลูกค้ายังไม่ส่งไฟล์ </span>}
        {o.voice_url && <>· 🎙️ <a className="link" href={o.voice_url} target="_blank" rel="noreferrer">เสียง</a> </>}
        {o.comments > 0 && <>· 💬 {o.comments} ข้อความ </>}
        {o.revisions_used > 0 && <>· ✏️ แก้ไปแล้ว {o.revisions_used} ครั้ง</>}
      </div>

      {(o.ref_picks || []).length > 0 && <div style={{ fontSize: 13, marginBottom: 6 }}>
        🎨 อยากได้แนว: <b>{o.ref_picks.map(k => STYLE_LABEL[k] || k).join(" · ")}</b></div>}
      {o.ref_links && <div style={{ fontSize: 13, marginBottom: 6, lineHeight: 1.8 }}>
        🔗 ตัวอย่างที่ลูกค้าส่งมา:<br />{String(o.ref_links).split(/\n+/).filter(Boolean).map((u, i) =>
          <a key={i} className="link" href={u} target="_blank" rel="noreferrer" style={{ display: "block" }}>{u}</a>)}</div>}
      {o.note && <div className="muted" style={{ fontSize: 13, marginBottom: 8, lineHeight: 1.7 }}>📝 {o.note}</div>}
      {o.draft_url && <div style={{ fontSize: 13, marginBottom: 8 }}>
        🎬 <a className="link" href={o.draft_url} target="_blank" rel="noreferrer">งานที่ส่งให้ลูกค้าแล้ว</a></div>}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <select value={o.status} onChange={e => upd(o.order_id, { status: e.target.value })}
          style={{ fontSize: 13, padding: "7px 10px", borderRadius: 9, border: "1px solid var(--border)", fontFamily: "inherit" }}>
          {Object.entries(d.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input placeholder="ลิงก์งานที่ตัดเสร็จ" defaultValue={o.draft_url || ""}
          onChange={e => setDraft(p => ({ ...p, [dk]: e.target.value }))}
          style={{ flex: "1 1 200px", fontSize: 13, padding: "7px 11px", borderRadius: 9, border: "1px solid var(--border)", fontFamily: "inherit" }} />
        <input placeholder="คนรับงาน" defaultValue={o.assignee || ""}
          onChange={e => setDraft(p => ({ ...p, [ak]: e.target.value }))}
          style={{ width: 120, fontSize: 13, padding: "7px 11px", borderRadius: 9, border: "1px solid var(--border)", fontFamily: "inherit" }} />
        <button disabled={saving}
          onClick={() => upd(o.order_id, { draft_url: draft[dk], assignee: draft[ak], status: draft[dk] ? "draft_sent" : undefined })}
          style={{ background: "#5a3fc0", color: "#fff", border: 0, borderRadius: 9, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? .6 : 1 }}>
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
    </div>
  );
}
