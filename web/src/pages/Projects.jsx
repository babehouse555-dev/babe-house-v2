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

// แถบยืนยันท้ายจอ — บอกว่าเพิ่งเกิดอะไรขึ้น + ย้อนกลับได้ใน 7 วินาที
function Toast({ t, onClose }) {
  useEffect(() => { const id = setTimeout(onClose, 7000); return () => clearTimeout(id); }, [t, onClose]);
  return (
    <div className="toast">
      <span style={{ fontSize: 14.5, fontWeight: 700 }}>✅ {t.msg}</span>
      {t.undo && <button onClick={() => { t.undo(); onClose(); }} className="toast-undo">↩︎ ย้อนกลับ</button>}
      <button onClick={onClose} className="toast-x" title="ปิด">✕</button>
    </div>
  );
}

export default function Projects() {
  const [key, setKey] = useState(localStorage.getItem("babe_admin_key") || "");
  const [authed, setAuthed] = useState(false);
  const [err, setErr] = useState("");
  const [ps, setPs] = useState([]);
  const [open, setOpen] = useState(null);        // project id ที่เปิดอยู่
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ project_id: "", kind: "idea", text: "", owner: "" });
  const [showDone, setShowDone] = useState(false);   // ของที่เสร็จแล้วพับไว้ก่อน
  const [detail, setDetail] = useState(null);        // id ของงานที่เปิดดูรายละเอียดอยู่
  const [cmt, setCmt] = useState("");
  const [toast, setToast] = useState(null);          // แถบยืนยัน + ปุ่มย้อนกลับ

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
  // ทุกการกดต้องมีเสียงตอบกลับ + ย้อนกลับได้ ไม่งั้นคิมไม่รู้ว่ากดติดหรือกดพลาด
  const move = async (it, kind, msg) => {
    const before = it.kind;
    await save({ ...it, kind });
    if (msg) setToast({ msg, undo: () => save({ ...it, kind: before }) });
  };
  const addComment = async (it) => {
    const t = cmt.trim(); if (!t) return;
    setBusy(true);
    try { await api("/api/admin/projects/comment", { method: "POST", body: { item_id: it.id, text: t }, adminKey: key }); await load(); setCmt(""); }
    finally { setBusy(false); }
  };
  const delComment = async (id) => {
    if (!confirm("ลบคอมเมนต์นี้?")) return;
    await api("/api/admin/projects/comment/delete", { method: "POST", body: { id }, adminKey: key }); await load();
  };
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

  // รวมงานข้ามโปรเจคมาเรียงใหม่ — โปรเจคสำคัญกว่ามาก่อน แล้วค่อยดูความสำคัญของตัวงาน
  const flat = (kind, who) => ps.flatMap(p => (p.items || [])
    .filter(i => i.kind === kind && (who === undefined || (i.owner || "") === who))
    .map(i => ({ ...i, pid: p.id, emoji: p.emoji, color: p.color, pprio: p.priority })))
    .sort((a, b) => (a.pprio - b.pprio) || (a.priority - b.priority));
  const decide = flat("blocked");                       // ติดที่คิมคนเดียว = ปลดล็อกได้เยอะสุด
  const mine = flat("next", "kim");                     // งานที่คิมต้องลงมือเอง
  const byClaude = flat("next", "claude");              // งานที่ฉันทำแทนได้
  // งานที่เปิดดูรายละเอียดอยู่ — หาข้ามทุกโปรเจค เพราะกดมาจากแถบ "ทำอะไรต่อ" ก็ได้
  const dItem = detail ? ps.flatMap(p => (p.items || []).map(i => ({ ...i, proj: p }))).find(i => i.id === detail) : null;

  return (
    <div className="wrap page-pad" style={{ maxWidth: 940 }}>
      <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
        <div>
          <div className="brand">BABE HOUSE · ห้องทำงาน</div>
          <h1 className="page" style={{ marginBottom: 2 }}>{cur ? `${cur.emoji} ${cur.name}` : "โปรเจคทั้งหมด"}</h1>
        </div>
        {cur ? <button className="btn ghost" onClick={() => setOpen(null)}>← โปรเจคทั้งหมด</button>
             : <span className="row" style={{ gap: 7 }}>
                 <a className="btn ghost" href="/map">🗺️ แผนผังเว็บ</a>
                 <a className="btn ghost" href="/admin">หลังบ้าน →</a>
               </span>}
      </div>

      {!cur && <>
        <p className="muted" style={{ fontSize: 14, margin: "6px 0 16px" }}>
          ตอนนี้มี <b>{ps.filter(p => p.status !== "done").length} โปรเจค</b> · งานที่ทำต่อได้เลย <b style={{ color: "#2E86DE" }}>{totalNext}</b> · รอคิมเคาะ <b style={{ color: "#C77700" }}>{totalBlocked}</b>
        </p>

        {/* 🎯 เปิดมาต้องตอบได้ทันทีว่า "แล้วยังไงต่อ" — ไม่ต้องไล่เปิดทีละโฟลเดอร์ */}
        {(mine.length > 0 || decide.length > 0) && (
          <div className="card" style={{ marginTop: 0, marginBottom: 20, background: "linear-gradient(135deg,#FBF7EE,#FDFBF7)", border: "1px solid #EADFCB" }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 3 }}>🎯 ถ้าคิมมีเวลา 1 ชั่วโมงตอนนี้</div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>ทำจากบนลงล่าง — เรียงตามว่าอะไรปลดล็อกงานอื่นได้มากที่สุด</div>

            {decide.length > 0 && <>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#C77700", marginBottom: 6 }}>⏸️ ตัดสินใจก่อน — {decide.length} เรื่องนี้บล็อกงานที่เหลืออยู่</div>
              {decide.slice(0, 5).map(x => (
                <button key={x.id} onClick={() => setOpen(x.pid)} className="up-row">
                  <span className="up-chip" style={{ background: x.color }}>{x.emoji}</span>
                  <span className="up-text">{x.text}</span>
                </button>
              ))}
            </>}

            {mine.length > 0 && <>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#2E86DE", margin: `${decide.length ? 14 : 0}px 0 6px` }}>▶️ ลงมือได้เลย</div>
              {mine.slice(0, 5).map(x => (
                <button key={x.id} onClick={() => setOpen(x.pid)} className="up-row">
                  <span className="up-chip" style={{ background: x.color }}>{x.emoji}</span>
                  <span className="up-text">{x.text}</span>
                </button>
              ))}
            </>}

            {byClaude.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed #E3D8C4", fontSize: 12.5, color: "#6b6577" }}>
                🤖 อีก <b>{byClaude.length} อย่าง</b>ฉันทำเองได้ ไม่ต้องรอคิม — บอกให้เริ่มได้ทุกเมื่อ
              </div>
            )}
          </div>
        )}

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
          const collapsed = k === "done" && !showDone;    // ของที่เสร็จแล้วพับไว้ ไม่ให้บังงานที่ยังไม่ทำ
          return (
            <div key={k} className="card" style={{ marginTop: 0, marginBottom: 14, borderLeft: `4px solid ${tone}` }}>
              <button onClick={() => k === "done" && setShowDone(v => !v)}
                      style={{ width: "100%", textAlign: "left", background: "none", border: 0, padding: 0, cursor: k === "done" ? "pointer" : "default",
                               fontWeight: 800, fontSize: 14.5, marginBottom: collapsed ? 0 : 10, color: tone, fontFamily: "inherit" }}>
                {icon} {label} · {list.length}{k === "done" && <span style={{ fontWeight: 600, fontSize: 12.5, marginLeft: 8 }}>{collapsed ? "▸ กดดู" : "▾ ซ่อน"}</span>}
              </button>
              {/* ข้อความอ่านเต็มบรรทัดเสมอ · ปุ่มจัดการอยู่บรรทัดล่าง ไม่มาแย่งที่ */}
              {!collapsed && list.map(it => (
                <div key={it.id} className="pi">
                  {/* ปุ่มติ๊ก — ต้องดูออกทันทีว่ากดแล้วจะเกิดอะไร (คิมบอก "กดเข้าไปไม่รู้ ยืนหรือยกเลิก") */}
                  <button className={`pi-tick${k === "done" ? " on" : ""}`} disabled={busy}
                          title={k === "done" ? "กดเพื่อเอากลับมาทำต่อ" : "กดเมื่อทำเสร็จแล้ว"}
                          onClick={() => move(it, k === "done" ? "next" : "done", k === "done" ? "เอากลับมาทำต่อแล้ว" : "ทำเสร็จแล้ว! 🎉")}>
                    <span className="pi-tick-mark">✓</span>
                  </button>
                  <div className="pi-main">
                    <button className="pi-text" onClick={() => setDetail(it.id)} title="กดดูรายละเอียด + คอมเมนต์"
                            style={{ textDecoration: k === "done" ? "line-through" : "none", opacity: k === "done" ? .55 : 1 }}>{it.text}</button>

                    {(it.comments?.length > 0 || it.note) &&
                      <div className="pi-cnt">💬 {it.comments?.length ? `${it.comments.length} คอมเมนต์` : "มีโน้ต"}</div>}

                    <div className="pi-meta">
                      {it.owner && <span className="pi-who">👤 {ownerLabel(it.owner)}</span>}
                      <span className="pi-actions">
                        <button className="pi-move" onClick={() => setDetail(it.id)} style={{ color: "#7a7486" }}>💬 รายละเอียด</button>
                        {KINDS.filter(x => x.k !== k && x.k !== "done").map(x => (
                          <button key={x.k} className="pi-move" disabled={busy} onClick={() => move(it, x.k, `ย้ายไป "${x.label}" แล้ว`)} title={`ย้ายไป ${x.label}`}
                                  style={{ color: x.tone }}>{x.icon} {x.label}</button>
                        ))}
                        <button className="pi-move" onClick={() => del(it.id)} title="ลบ" style={{ color: "#b7b7bf" }}>🗑️</button>
                      </span>
                    </div>
                  </div>
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

      {/* 📄 รายละเอียดงาน + คอมเมนต์ */}
      {dItem && (
        <div className="dt-bg" onClick={e => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="dt">
            <div className="between" style={{ gap: 10, alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
                <span className="up-chip" style={{ background: dItem.proj.color }}>{dItem.proj.emoji}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#6b6577" }}>{dItem.proj.name}</span>
                <span className="dt-badge" style={{ color: KINDS.find(x => x.k === dItem.kind)?.tone }}>
                  {KINDS.find(x => x.k === dItem.kind)?.icon} {KINDS.find(x => x.k === dItem.kind)?.label}
                </span>
              </div>
              <button onClick={() => setDetail(null)} className="dt-x" title="ปิด">✕</button>
            </div>

            <h2 style={{ fontSize: 19, lineHeight: 1.5, margin: "14px 0 10px", fontWeight: 800 }}>{dItem.text}</h2>

            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 6 }}>
              <select value={dItem.kind} onChange={e => move(dItem, e.target.value, `ย้ายไป "${KINDS.find(k => k.k === e.target.value)?.label}" แล้ว`)} disabled={busy}
                      style={{ fontSize: 13, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "#fff" }}>
                {KINDS.map(x => <option key={x.k} value={x.k}>{x.icon} {x.label}</option>)}
              </select>
              <select value={dItem.owner || ""} onChange={e => save({ ...dItem, owner: e.target.value || null })} disabled={busy}
                      style={{ fontSize: 13, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "#fff" }}>
                {OWNERS.map(o => <option key={o.v} value={o.v}>👤 {o.l}</option>)}
              </select>
            </div>

            <div style={{ fontWeight: 800, fontSize: 14, margin: "18px 0 8px" }}>
              💬 คอมเมนต์{dItem.comments?.length ? ` · ${dItem.comments.length}` : ""}
            </div>
            {!dItem.comments?.length && <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>ยังไม่มีคอมเมนต์ — จดรายละเอียด ลิงก์ หรือสั่งงานทีมไว้ตรงนี้ได้เลยค่ะ</div>}
            {(dItem.comments || []).map(c => (
              <div key={c.id} className="dt-cmt">
                <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.65 }}>{c.text}</div>
                <div className="between" style={{ marginTop: 5 }}>
                  <span className="muted" style={{ fontSize: 11.5 }}>{new Date(c.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</span>
                  <button onClick={() => delComment(c.id)} style={{ border: 0, background: "none", cursor: "pointer", color: "#c4c4cc", fontSize: 13 }}>🗑️</button>
                </div>
              </div>
            ))}
            <textarea value={cmt} onChange={e => setCmt(e.target.value)} rows={3}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addComment(dItem); }}
              placeholder="เขียนคอมเมนต์… (Cmd+Enter ส่ง)"
              style={{ width: "100%", boxSizing: "border-box", fontSize: 14, lineHeight: 1.6, padding: "10px 12px", borderRadius: 11, border: "1px solid var(--border)", fontFamily: "inherit", resize: "vertical", marginTop: 8 }} />
            <div style={{ display: "flex", gap: 7, marginTop: 8, flexWrap: "wrap" }}>
              <button className="btn" disabled={busy || !cmt.trim()} onClick={() => addComment(dItem)} style={{ padding: "9px 20px", fontSize: 14 }}>
                {busy ? "กำลังบันทึก…" : "เพิ่มคอมเมนต์"}
              </button>
              <button className="btn ghost" onClick={() => { del(dItem.id); setDetail(null); }} style={{ padding: "9px 16px", fontSize: 13.5, marginLeft: "auto" }}>ลบงานนี้</button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ แถบยืนยันท้ายจอ — กดอะไรไปแล้วต้องเห็นผลทันที และย้อนกลับได้ */}
      {toast && <Toast t={toast} onClose={() => setToast(null)} />}

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

        /* รายการในโปรเจค — ข้อความต้องอ่านเต็มบรรทัด ห้ามโดนปุ่มบีบ */
        .pi { display: flex; gap: 11px; align-items: flex-start; padding: 11px 0; border-top: 1px solid var(--border); }
        /* ปุ่มติ๊ก: ว่าง = ยังไม่เสร็จ · ชี้เมาส์แล้วเห็น ✓ จางๆ บอกว่ากดแล้วจะเป็นอะไร */
        .pi-tick { flex: 0 0 auto; width: 23px; height: 23px; margin-top: 1px; border-radius: 7px;
          border: 1.5px solid var(--border); background: #fff; cursor: pointer; padding: 0;
          display: inline-flex; align-items: center; justify-content: center; transition: all .15s; }
        .pi-tick-mark { font-size: 13px; font-weight: 900; color: #fff; opacity: 0; transition: opacity .15s; }
        .pi-tick:hover { border-color: #1a7f43; background: #E6F4EC; }
        .pi-tick:hover .pi-tick-mark { opacity: .55; color: #1a7f43; }
        .pi-tick.on { border-color: #1a7f43; background: #1a7f43; }
        .pi-tick.on .pi-tick-mark { opacity: 1; color: #fff; }
        .pi-main { flex: 1 1 auto; min-width: 0; }            /* min-width:0 คือกุญแจ ไม่งั้นข้อความยาวถูกบีบเป็นเส้น */
        .pi-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 5px; }
        .pi-who { font-size: 12px; color: var(--muted); }
        .pi-actions { display: flex; flex-wrap: wrap; gap: 4px; opacity: 0; transition: opacity .15s; }
        .pi:hover .pi-actions, .pi:focus-within .pi-actions { opacity: 1; }
        .pi-move { border: 0; background: none; cursor: pointer; font-family: inherit; font-size: 11.5px; font-weight: 700; padding: 3px 7px; border-radius: 7px; }
        .pi-move:hover { background: #f2f1f6; }
        /* มือถือ/จอสัมผัส ไม่มี hover → โชว์ปุ่มไว้เลย */
        @media (hover: none) { .pi-actions { opacity: 1; } }

        /* แถว "ทำอะไรต่อ" — กดแล้วกระโดดเข้าโปรเจคนั้น */
        .up-row { display: flex; align-items: flex-start; gap: 9px; width: 100%; text-align: left;
          background: #fff; border: 1px solid #EFE7D9; border-radius: 11px; padding: 10px 12px; margin-bottom: 6px;
          cursor: pointer; font-family: inherit; transition: transform .12s, box-shadow .12s; }
        .up-row:hover { transform: translateX(2px); box-shadow: 0 3px 8px rgba(120,100,70,.10); }
        .up-chip { flex: 0 0 auto; width: 26px; height: 26px; border-radius: 8px; display: inline-flex;
          align-items: center; justify-content: center; font-size: 14px; }
        .up-text { flex: 1 1 auto; min-width: 0; font-size: 14px; line-height: 1.55; color: #2c2a35; word-break: break-word; }

        /* โน้ตของคิม */
        .pi-note { display: block; width: 100%; text-align: left; margin-top: 7px; cursor: pointer; font-family: inherit;
          background: #FBF8EE; border: 1px solid #EEE3CC; border-radius: 10px; padding: 8px 11px;
          font-size: 13px; line-height: 1.6; color: #5c5340; white-space: pre-wrap; }
        .pi-note:hover { background: #F7F2E4; }

        /* ข้อความงาน = ปุ่มเปิดรายละเอียด */
        .pi-text { display: block; width: 100%; text-align: left; background: none; border: 0; padding: 0;
          font-family: inherit; cursor: pointer; font-size: 14.5px; line-height: 1.6; color: #2c2a35; word-break: break-word; }
        .pi-text:hover { color: #2E86DE; }
        .pi-cnt { font-size: 12px; color: #8a8496; margin-top: 5px; }

        /* แผงรายละเอียดงาน */
        .dt-bg { position: fixed; inset: 0; z-index: 80; background: rgba(30,26,40,.42); backdrop-filter: blur(2px);
          display: flex; align-items: flex-start; justify-content: center; padding: 24px 14px; overflow-y: auto; }
        .dt { background: #fff; border-radius: 18px; padding: 20px; width: 100%; max-width: 620px;
          box-shadow: 0 20px 50px rgba(0,0,0,.22); animation: dtIn .18s ease-out; }
        @keyframes dtIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .dt-badge { font-size: 12px; font-weight: 800; }
        .dt-x { background: #f2f1f6; border: 0; border-radius: 50%; width: 30px; height: 30px; cursor: pointer; color: #6b6577; font-size: 14px; flex-shrink: 0; }
        .dt-cmt { background: #F8F7FB; border: 1px solid var(--border); border-radius: 12px; padding: 11px 13px; margin-bottom: 8px; }

        /* แถบยืนยัน */
        .toast { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); z-index: 90;
          display: flex; align-items: center; gap: 12px; background: #2c2a35; color: #fff;
          padding: 12px 14px 12px 18px; border-radius: 14px; box-shadow: 0 10px 28px rgba(0,0,0,.26);
          max-width: calc(100vw - 28px); animation: toastUp .22s ease-out; }
        @keyframes toastUp { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .toast-undo { background: #fff; color: #2c2a35; border: 0; border-radius: 20px; padding: 6px 14px;
          font-size: 13px; font-weight: 800; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .toast-x { background: none; border: 0; color: #9c98a8; cursor: pointer; font-size: 14px; padding: 2px 4px; }
      `}</style>
    </div>
  );
}
