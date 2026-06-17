import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api, session } from "../api.js";
import { sampleBlueprint } from "../sample.js";

const G_COLORS = { Awareness: "#2E86DE", Conversion: "#1a7f43", Branding: "#b8860b" };

export default function Dashboard() {
  const [sp] = useSearchParams();
  const demo = sp.get("demo") === "1";
  const userId = sp.get("user_id"), cycle = sp.get("billing_cycle"), bpId = sp.get("blueprint_id");
  const [bp, setBp] = useState(demo ? sampleBlueprint() : null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("strategy");
  const [sel, setSel] = useState(1);
  const [uploaded, setUploaded] = useState(new Set());

  useEffect(() => {
    if (demo) return;
    if (!userId || !cycle) { setErr("ไม่พบข้อมูลเล่ม"); return; }
    api(`/api/blueprints/latest?user_id=${encodeURIComponent(userId)}&billing_cycle=${encodeURIComponent(cycle)}`)
      .then(d => { setBp(d.blueprint); setUploaded(new Set(d.marathon || [])); })
      .catch(() => setErr("โหลดเล่มไม่สำเร็จ — อาจกำลังสร้างอยู่ หรือลิงก์ไม่ถูกต้อง"));
  }, [userId, cycle]);

  async function toggleDay(d) {
    if (demo) return;
    const next = new Set(uploaded);
    const action = next.has(d) ? "remove" : "upload";
    if (next.has(d)) next.delete(d); else next.add(d);
    setUploaded(next);
    try { await api("/api/marathon/progress", { method: "POST", body: { user_id: userId, instagram_account: bp.instagram_account, billing_cycle: cycle, uploaded_days: [...next], day: d, action } }); } catch {}
  }

  if (err) return <div className="wrap narrow page-pad center"><div className="card"><h2>{err}</h2><Link className="btn" to="/account" style={{ marginTop: 16 }}>ไปบัญชีของฉัน</Link></div></div>;
  if (!bp) return <div className="wrap narrow page-pad center"><div className="spinner" /><p className="muted">กำลังโหลดเล่มของคุณ...</p></div>;

  const m = bp.modules || {};
  const script = (bp.scripts || []).find(s => s.d === sel) || (bp.scripts || [])[0];

  return (
    <div>
      {demo && <div className="center" style={{ position: "sticky", top: 0, zIndex: 99, background: "linear-gradient(135deg,var(--blue),var(--blue-d))", color: "#fff", padding: "12px 16px", fontSize: 14 }}>
        🎬 <b>นี่คือตัวอย่าง Blueprint</b> — เล่มจริงวิเคราะห์จากช่องคุณโดยเฉพาะ &nbsp; <Link to="/form" style={{ background: "#fff", color: "var(--blue)", fontWeight: 700, padding: "6px 14px", borderRadius: 10 }}>สร้างเล่มของฉัน · 490฿</Link>
      </div>}
      <div className="wrap narrow page-pad">
        <Link className="link" to={demo ? "/" : "/account"}>← {demo ? "กลับหน้าแรก" : "บัญชีของฉัน"}</Link>
        <div className="brand" style={{ marginTop: 12 }}>BABE HOUSE · CREATOR PLATFORM</div>
        <h1 className="page">AI Creator Blueprint</h1>
        <p className="muted" style={{ marginBottom: 16 }}>✓ {bp.instagram_account} · {bp.market_tier || "Premium"} · {bp.theme}</p>

        <div className="row" style={{ marginBottom: 18, background: "var(--soft)", borderRadius: 14, padding: 6 }}>
          {[["strategy", "📊 กลยุทธ์"], ["calendar", "📅 30 วัน"], ["marathon", "🏃‍♀️ มาราธอน"]].map(([k, l]) =>
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "10px", border: 0, borderRadius: 10, fontWeight: 700, cursor: "pointer", background: tab === k ? "#fff" : "transparent", color: tab === k ? "var(--blue)" : "var(--muted)", boxShadow: tab === k ? "0 2px 8px rgba(0,0,0,.06)" : "none" }}>{l}</button>)}
        </div>

        {tab === "strategy" && <>
          <div className="card" style={{ background: "var(--soft)" }}>{bp.greeting}</div>
          <div className="row" style={{ marginBottom: 16 }}>
            {[["เป้าหมายเดือนนี้", bp.theme], ["ตลาด", bp.market_tier], ["กลุ่มเป้าหมาย", bp.audience_summary]].map(([l, v]) => <div key={l} className="card" style={{ flex: 1, minWidth: 160, margin: 0 }}><div className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>{l}</div><div style={{ marginTop: 4 }}>{v}</div></div>)}
          </div>
          <div className="card"><h3>สิ่งที่ครูพี่คิมเห็น</h3><ul style={{ paddingLeft: 18, marginTop: 8 }}>{(bp.what_we_see || []).map((x, i) => <li key={i} style={{ margin: "4px 0" }}>{x}</li>)}</ul><p style={{ marginTop: 12, fontStyle: "italic", color: "var(--blue-d)" }}>💡 {bp.kim_insight}</p></div>
          <div className="card"><h3>SWOT</h3><div className="row" style={{ marginTop: 8 }}>{[["จุดแข็ง", bp.swot?.strengths], ["จุดอ่อน", bp.swot?.weaknesses], ["โอกาส", bp.swot?.opportunities], ["ความเสี่ยง", bp.swot?.threats]].map(([l, arr]) => <div key={l} style={{ flex: 1, minWidth: 150 }}><b style={{ fontSize: 13 }}>{l}</b><ul style={{ paddingLeft: 16, fontSize: 13 }}>{(arr || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>)}</div></div>
          {m.archetype && <div className="card"><h3>🎯 ตัวตนแบรนด์ (Archetype)</h3><p style={{ marginTop: 6 }}><b>{m.archetype.name}</b> — {m.archetype.body}</p><p className="muted" style={{ fontSize: 13 }}>โทน: {m.archetype.tone} · ลุค: {m.archetype.look}</p></div>}
          {m.avatar && <div className="card"><h3>👤 ลูกค้าในฝัน</h3><p style={{ marginTop: 6 }}><b>{m.avatar.name}</b></p><p className="muted" style={{ fontSize: 14 }}>คิด: {m.avatar.think} · เห็น: {m.avatar.see} · กลัว: {m.avatar.fear}</p>{m.avatar.hookbank && <div style={{ marginTop: 8 }}><b style={{ fontSize: 13 }}>คลังฮุก:</b><ul style={{ paddingLeft: 16, fontSize: 13 }}>{m.avatar.hookbank.map((h, i) => <li key={i}>{h}</li>)}</ul></div>}</div>}
          {m.competitor && <div className="card"><h3>⚔️ คู่แข่ง</h3><p className="muted" style={{ fontSize: 14, marginTop: 6 }}>{m.competitor.intro}</p>{(m.competitor.rows || []).map((r, i) => <p key={i} style={{ fontSize: 14, marginTop: 6 }}><b>{r.name}:</b> {r.they} → <span style={{ color: "var(--up)" }}>{r.gap}</span></p>)}<p style={{ marginTop: 8, color: "var(--blue-d)" }}>🌊 {m.competitor.blueocean}</p></div>}
          {m.funnel && <div className="card"><h3>🫧 Funnel</h3>{["top", "middle", "bottom"].map(k => m.funnel[k] && <div key={k} style={{ margin: "6px 0" }}><div className="between" style={{ fontSize: 13 }}><span>{m.funnel[k].label} · {m.funnel[k].body}</span><span className="muted">{m.funnel[k].pct}%</span></div><div className="bar-track"><div className="bar-fill" style={{ width: `${m.funnel[k].pct}%` }} /></div></div>)}<p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{m.funnel.note}</p></div>}
        </>}

        {tab === "calendar" && <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 18 }}>
            {(bp.calendar || []).map(c => <button key={c.d} onClick={() => setSel(c.d)} style={{ border: sel === c.d ? "2px solid var(--blue)" : "1px solid var(--border)", borderRadius: 10, padding: "8px 4px", background: "#fff", cursor: "pointer", textAlign: "center" }}><div style={{ fontWeight: 700, fontSize: 13 }}>{c.d}</div><div style={{ fontSize: 9, color: G_COLORS[c.g] || "var(--muted)", fontWeight: 700 }}>{c.g}</div></button>)}
          </div>
          {script && <div className="card">
            <div className="between"><span className="tag" style={{ background: "var(--soft)", color: G_COLORS[script.g] }}>วันที่ {script.d} · {script.g}</span></div>
            <h3 style={{ margin: "10px 0" }}>{(bp.calendar.find(c => c.d === script.d) || {}).t}</h3>
            {(script.beats || []).map((b, i) => <div key={i} style={{ borderTop: i ? "1px solid var(--border)" : "none", paddingTop: 10, marginTop: 10 }}><div className="row" style={{ gap: 8 }}><b style={{ color: "var(--blue)", fontSize: 12 }}>{b.s}</b><span className="muted" style={{ fontSize: 12 }}>{b.ts}</span></div><p style={{ margin: "4px 0" }}>{b.say}</p><p className="muted" style={{ fontSize: 12 }}>คำบนจอ: {b.ost} · มุมกล้อง: {b.vis}</p></div>)}
            <div className="msg" style={{ background: "var(--soft)", marginTop: 12 }}><b>แคปชั่น:</b> {script.cap}</div>
            <div className="msg" style={{ background: "#fff7e6", color: "#8a6d1f", marginTop: 8 }}>💡 ทิปครูพี่คิม: {script.tip}</div>
          </div>}
        </>}

        {tab === "marathon" && <>
          <div className="card center"><h3>🏃‍♀️ Babe Content Marathon</h3><p className="muted" style={{ marginTop: 6 }}>ติ๊กวันที่ส่งคลิปแล้ว — ทำต่อเนื่องให้ครบ 30 วัน</p><div style={{ fontSize: 34, fontWeight: 800, color: "var(--blue)", marginTop: 10 }}>{uploaded.size} / 30</div><div className="muted">{uploaded.size >= 15 ? "💎 Diamond" : uploaded.size >= 5 ? "🥇 Gold" : "🥈 Silver"}</div></div>
          <div className="card"><div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8 }}>
            {Array.from({ length: 30 }, (_, i) => i + 1).map(d => <button key={d} onClick={() => toggleDay(d)} disabled={demo} style={{ aspectRatio: "1", border: 0, borderRadius: 10, cursor: demo ? "default" : "pointer", fontWeight: 700, background: uploaded.has(d) ? "var(--blue)" : "var(--soft)", color: uploaded.has(d) ? "#fff" : "var(--muted)" }}>{uploaded.has(d) ? "✓" : d}</button>)}
          </div>{demo && <p className="muted center" style={{ fontSize: 13, marginTop: 12 }}>(โหมดตัวอย่าง — ติ๊กได้เมื่อเป็นเล่มจริง)</p>}</div>
        </>}

        {!demo && <div className="card center" style={{ background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", border: "1px solid #d6e7fa" }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>ทำครบ 30 วันแล้วใช่ไหมคะ? 🩵</div>
          <p className="muted" style={{ margin: "6px 0 14px" }}>ปลดล็อกแผนเดือนใหม่ เพื่อต่อยอดการเติบโต</p>
          <Link className="btn" to={`/form?renew=1&email=${encodeURIComponent(session.email || "")}`}>+ เพิ่มแผนเดือนใหม่ (490฿)</Link>
        </div>}
      </div>
    </div>
  );
}
