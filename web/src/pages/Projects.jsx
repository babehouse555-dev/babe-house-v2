import { useEffect, useState } from "react";
import { api } from "../api.js";

// 🗂️ ห้องทำงานของคิม — ทุกโปรเจคอยู่ที่เดียว กดเข้าโฟลเดอร์เห็นรายละเอียด
// โจทย์จากคิม: "ไอเดียมันไม่ได้เรียง แล้วแต่ว่าไอเดียไหนจะมาตอนไหน" → ต้องโยนไอเดียลงถูกโปรเจคได้ทุกเมื่อ
const KINDS = [
  { k: "next",    label: "ทำต่อ",     icon: "▶️", tone: "#2E86DE" },
  { k: "blocked", label: "รอคิมเคาะ", icon: "⏸️", tone: "#C77700" },
  { k: "idea",    label: "ไอเดีย",    icon: "💡", tone: "#7C5CE6" },
  { k: "done",    label: "เสร็จแล้ว",  icon: "✅", tone: "#1a7f43" },
];
const OWNERS = [{ v: "", l: "ยังไม่ระบุ" }, { v: "kim", l: "คิม" }, { v: "claude", l: "ระบบ/Claude" }, { v: "team", l: "ทีม" }];
const ownerLabel = (o) => (OWNERS.find(x => x.v === (o || ""))?.l) || o;

export default function Projects() {
  const [key, setKey] = useState(localStorage.getItem("babe_admin_key") || "");
  const [authed, setAuthed] = useState(false);
  const [err, setErr] = useState("");
  const [ps, setPs] = useState([]);
  const [open, setOpen] = useState(null);        // project id ที่เปิดอยู่
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ project_id: "", kind: "idea", text: "", owner: "" });

  const load = async (k = key) => { const r = await api("/api/admin/projects", { adminKey: k }); setPs(r.projects || []); };
  const login = async (k) => {
    try { await load(k); localStorage.setItem("babe_admin_key", k); setAuthed(true); setErr(""); }
    catch { setErr("ADMIN_KEY ไม่ถูกต้องค่ะ"); }
  };
  useEffect(() => { if (key) login(key); }, []);   // eslint-disable-line

  const save = async (body) => {
    setBusy(true);
    try { await api("/api/admin/projects/item", { method: "POST", body, adminKey: key }); await load(); }
    finally { setBusy(false); }
  };
  const addIdea = async () => {
    const t = draft.text.trim(); if (!t || !draft.project_id) return;
    await save({ project_id: draft.project_id, kind: draft.kind, text: t, owner: draft.owner || null });
    setDraft(d => ({ ...d, text: "" }));
  };
  const move = (it, kind) => save({ ...it, kind });
  const del = async (id) => { if (!confirm("ลบรายการนี้?")) return; await api("/api/admin/projects/item/delete", { method: "POST", body: { id }, adminKey: key }); await load(); };

  if (!authed) return (
    <div className="wrap narrow page-pad" style={{ maxWidth: 420 }}>
      <h1 className="page">ห้องทำงาน</h1>
      <input value={key} onChange={e => setKey(e.target.value)} placeholder="ADMIN_KEY" style={{ width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 12, border: "1px solid var(--border)" }} />
      {err && <div style={{ color: "#c00", fontSize: 13, marginTop: 8 }}>{err}</div>}
      <button className="btn full" style={{ marginTop: 10 }} onClick={() => login(key)}>เข้าสู่ระบบ</button>
    </div>
  );

  const cur = ps.find(p => p.id === open);
  const activeCount = (p, k) => (p.items || []).filter(i => i.kind === k).length;
  const totalNext = ps.reduce((a, p) => a + activeCount(p, "next"), 0);
  const totalBlocked = ps.reduce((a, p) => a + activeCount(p, "blocked"), 0);

  return (
    <div className="wrap page-pad" style={{ maxWidth: 940 }}>
      <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
        <div>
          <div className="brand">BABE HOUSE · ห้องทำงาน</div>
          <h1 className="page" style={{ marginBottom: 2 }}>{cur ? `${cur.emoji} ${cur.name}` : "โปรเจคทั้งหมด"}</h1>
        </div>
        {cur ? <button className="btn ghost" onClick={() => setOpen(null)}>← โปรเจคทั้งหมด</button>
             : <a className="btn ghost" href="/admin">ไปหลังบ้านหลัก →</a>}
      </div>

      {!cur && <>
        <p className="muted" style={{ fontSize: 14, margin: "6px 0 20px" }}>
          ตอนนี้มี <b>{ps.filter(p => p.status !== "done").length} โปรเจค</b> · งานที่ทำต่อได้เลย <b style={{ color: "#2E86DE" }}>{totalNext}</b> · รอคิมเคาะ <b style={{ color: "#C77700" }}>{totalBlocked}</b>
        </p>

        {/* 🗂️ โฟลเดอร์ — โทนพาสเทลแบบเดียวกับหน้าบัญชี */}
        <div className="prj-grid">
          {ps.map(p => {
            const n = activeCount(p, "next"), b = activeCount(p, "blocked"), i = activeCount(p, "idea");
            return (
              <button key={p.id} className="prj" onClick={() => setOpen(p.id)} style={{ "--c": p.color }}>
                <span className="prj-emoji">{p.emoji}</span>
                <span className="prj-body">
                  <span className="prj-name">{p.name}</span>
                  <span className="prj-goal">{p.goal}</span>
                  <span className="prj-tags">
                    {n > 0 && <span style={{ color: "#2E86DE" }}>▶️ ทำต่อ {n}</span>}
                    {b > 0 && <span style={{ color: "#C77700" }}>⏸️ รอเคาะ {b}</span>}
                    {i > 0 && <span style={{ color: "#7C5CE6" }}>💡 {i}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </>}

      {cur && <>
        <p className="muted" style={{ fontSize: 14, margin: "4px 0 18px" }}>{cur.goal}</p>
        {KINDS.map(({ k, label, icon, tone }) => {
          const list = (cur.items || []).filter(i => i.kind === k);
          if (!list.length) return null;
          return (
            <div key={k} className="card" style={{ marginTop: 0, marginBottom: 14, borderLeft: `4px solid ${tone}` }}>
              <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 10, color: tone }}>{icon} {label} · {list.length}</div>
              {list.map(it => (
                <div key={it.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "9px 0", borderTop: "1px solid var(--border)" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14.5, lineHeight: 1.55, textDecoration: k === "done" ? "line-through" : "none", opacity: k === "done" ? .6 : 1 }}>{it.text}</div>
                    {it.owner && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>👤 {ownerLabel(it.owner)}</div>}
                  </div>
                  <select value={it.kind} onChange={e => move(it, e.target.value)} disabled={busy}
                          style={{ fontSize: 12, padding: "4px 6px", borderRadius: 8, border: "1px solid var(--border)", background: "#fff" }}>
                    {KINDS.map(x => <option key={x.k} value={x.k}>{x.icon} {x.label}</option>)}
                  </select>
                  <button onClick={() => del(it.id)} title="ลบ" style={{ border: 0, background: "none", cursor: "pointer", color: "#c4c4cc", fontSize: 15 }}>🗑️</button>
                </div>
              ))}
            </div>
          );
        })}
      </>}

      {/* ✍️ กล่องโยนไอเดีย — อยู่ล่างสุดตลอด กดใส่โปรเจคไหนก็ได้ทันทีที่คิดออก */}
      <div className="card" style={{ background: "#F7F5FC", border: "1.5px dashed #C9BEE8" }}>
        <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 4 }}>✍️ นึกอะไรออก พิมพ์ทิ้งไว้เลย</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>ไม่ต้องเรียง ไม่ต้องคิดให้จบ — เดี๋ยวมันไปรออยู่ในโปรเจคที่ถูกให้เอง</div>
        <textarea value={draft.text} onChange={e => setDraft(d => ({ ...d, text: e.target.value }))}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addIdea(); }}
          placeholder="เช่น อยากให้ Club มีคลาสสดเดือนละครั้ง" rows={2}
          style={{ width: "100%", boxSizing: "border-box", fontSize: 14.5, padding: "11px 13px", borderRadius: 12, border: "1px solid var(--border)", fontFamily: "inherit", resize: "vertical" }} />
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 9 }}>
          <select value={draft.project_id || (cur ? cur.id : "")} onChange={e => setDraft(d => ({ ...d, project_id: e.target.value }))}
                  style={{ flex: "1 1 190px", fontSize: 13.5, padding: "9px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "#fff" }}>
            <option value="">— เลือกโปรเจค —</option>
            {ps.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
          </select>
          <select value={draft.kind} onChange={e => setDraft(d => ({ ...d, kind: e.target.value }))}
                  style={{ fontSize: 13.5, padding: "9px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "#fff" }}>
            {KINDS.map(x => <option key={x.k} value={x.k}>{x.icon} {x.label}</option>)}
          </select>
          <select value={draft.owner} onChange={e => setDraft(d => ({ ...d, owner: e.target.value }))}
                  style={{ fontSize: 13.5, padding: "9px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "#fff" }}>
            {OWNERS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <button className="btn" disabled={busy || !draft.text.trim() || !(draft.project_id || cur)}
                  onClick={() => { if (!draft.project_id && cur) draft.project_id = cur.id; addIdea(); }}
                  style={{ padding: "9px 20px", fontSize: 14 }}>{busy ? "กำลังบันทึก…" : "เก็บไว้"}</button>
        </div>
      </div>

      <style>{`
        .prj-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 14px; margin-bottom: 22px; }
        .prj {
          position: relative; text-align: left; cursor: pointer; font-family: inherit;
          border: 0; padding: 16px 16px 14px; border-radius: 6px 16px 16px 16px; background: var(--c);
          display: flex; gap: 12px; align-items: flex-start;
          box-shadow: 0 2px 6px rgba(90,80,110,.10); transition: transform .18s, box-shadow .18s;
        }
        .prj::before { content: ""; position: absolute; top: -8px; left: 0; width: 36%; height: 10px; background: var(--c); border-radius: 8px 8px 0 0; }
        .prj:hover { transform: translateY(-3px); box-shadow: 0 10px 20px rgba(90,80,110,.18); }
        .prj-emoji { font-size: 25px; line-height: 1.1; }
        .prj-body { display: block; flex: 1; min-width: 0; }
        .prj-name { display: block; font-weight: 800; font-size: 15.5px; color: #2c2a35; line-height: 1.35; }
        .prj-goal { display: block; font-size: 12.5px; color: #5d5a68; line-height: 1.55; margin-top: 5px; }
        .prj-tags { display: flex; flex-wrap: wrap; gap: 9px; font-size: 12px; font-weight: 700; margin-top: 9px; }
        @media (max-width: 520px) { .prj-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
