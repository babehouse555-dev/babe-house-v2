import { useState, useEffect, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api, session } from "../api.js";
import { sampleBlueprint } from "../sample.js";

const G_COLORS = { Awareness: "#2E86DE", Conversion: "#1a7f43", Branding: "#b8860b" };
const Num = ({ n }) => <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--blue)", color: "#fff", fontWeight: 800, fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", marginRight: 8, flexShrink: 0 }}>{n}</span>;
const modH = { display: "flex", alignItems: "center", margin: 0 };
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
// 🔧 LINE Official Account (2 บริการ) — แนะนำใส่ลิงก์ทางการ "https://lin.ee/xxxx"
//    จาก LINE OA Manager (โฮม → เพิ่มเพื่อน → คัดลอกลิงก์) จะสแกน/กดได้ชัวร์ที่สุด
const LINE_ACADEMY = { id: "@babehouse_academy", url: "https://line.me/R/ti/p/%40babehouse_academy" };
const LINE_WORK = { id: "@babehouse_work", url: "https://line.me/ti/p/0yBlh9zXFl" };
const qrImg = (data) => `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(data)}`;
const ACADEMY_COURSES = ["📱 All in Your Phone — ตัดต่อในมือถือ (3,745฿)", "🎬 ตัดต่อ Advance — สายเล่าเรื่อง (5,990฿)", "👑 Workshop ตัวต่อตัว"];

export default function Dashboard() {
  const [sp] = useSearchParams();
  const demo = sp.get("demo") === "1";
  const userId = sp.get("user_id"), cycle = sp.get("billing_cycle"), bpId = sp.get("blueprint_id");
  const [bp, setBp] = useState(demo ? sampleBlueprint() : null);
  const [err, setErr] = useState("");
  const scriptRef = useRef(null), calRef = useRef(null);
  // กดวันในปฏิทิน → เลือกวัน + เลื่อนไปที่สคริปต์ทันที (ไม่ต้องเลื่อนยาวเอง)
  const selectDay = (d) => { setSel(d); setTimeout(() => scriptRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); };
  const scrollToCal = () => calRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const [tab, setTab] = useState("strategy");
  const [view, setView] = useState("info");
  const [sel, setSel] = useState(1);
  const [uploaded, setUploaded] = useState(new Set());
  const [startedAt, setStartedAt] = useState(null);
  const [improveCount, setImproveCount] = useState(0);
  const [improveOpen, setImproveOpen] = useState(false);
  const [improving, setImproving] = useState(false);
  const [improveErr, setImproveErr] = useState("");
  const [ix, setIx] = useState({ products: "", pain_points: "", content_likes: "", brand_info: "", more: "" });

  async function submitImprove() {
    setImproving(true); setImproveErr("");
    try {
      const d = await api("/api/improve-blueprint", { method: "POST", body: { user_id: userId, billing_cycle: cycle, extra: ix } });
      setBp(d.blueprint); setImproveCount(d.improve_count || 1); setImproveOpen(false); setView("info");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { setImproveErr(e.message || "เจนใหม่ไม่สำเร็จ ลองอีกครั้งนะคะ"); }
    setImproving(false);
  }

  useEffect(() => {
    if (demo) return;
    if (!userId || !cycle) { setErr("ไม่พบข้อมูลเล่ม"); return; }
    api(`/api/blueprints/latest?user_id=${encodeURIComponent(userId)}&billing_cycle=${encodeURIComponent(cycle)}`)
      .then(d => { setBp(d.blueprint); setUploaded(new Set(d.marathon || [])); setStartedAt(d.started_at || null); setImproveCount(d.improve_count || 0); })
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
          <div className="card" style={{ background: "var(--soft)", lineHeight: 1.7 }}>{bp.greeting}</div>
          {bp.snapshot?.length > 0 && <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 12px" }}>🎴 ช่องของคุณใน 3 วินาที</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {bp.snapshot.map((s, i) => {
                const c = [["#EAF3FD", "#1B6FC4"], ["#e8f5ee", "#1a7f43"], ["#fff7e6", "#8a6d1f"], ["#fdeaea", "#b3261e"], ["#f3edfb", "#6b3fa0"], ["#e6f7f7", "#0a7d77"]][i % 6];
                return <div key={i} style={{ background: c[0], borderRadius: 16, padding: "16px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 34, lineHeight: 1 }}>{s.emoji}</div>
                  <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, margin: "8px 0 4px", letterSpacing: .2 }}>{s.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: c[1], lineHeight: 1.3 }}>{s.value}</div>
                </div>;
              })}
            </div>
          </div>}
          {demo && <div className="card" style={{ border: "1px dashed var(--blue)", background: "#F4F8FD" }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>🔍 เล่มจริงของคุณจะละเอียดและตรงกว่านี้อีก เพราะ...</div>
            <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.8, margin: 0 }}>
              <li>ครูพี่คิม (AI) <b>อ่านรูปสถิติหลังบ้านจริง</b>ของช่องคุณ — ทุกตัวเลขคือของคุณเอง</li>
              <li>วิเคราะห์จาก <b>ธุรกิจ เป้าหมาย และปัญหาจริง</b>ที่คุณกรอก ไม่ใช่เทมเพลตกลางๆ</li>
              <li><b>30 สคริปต์เขียนใหม่ทั้งหมด</b>ให้ตรงกับสินค้า/บริการของคุณ พร้อมอัดได้ทันที</li>
              <li>ได้ <b>บทวิเคราะห์การเติบโตรายเดือน</b> + แผนอัปเลเวลต่อเนื่อง</li>
            </ul>
            <Link className="btn full" to="/form" style={{ marginTop: 12 }}>สร้างเล่มจริงของฉัน · 490฿</Link>
          </div>}
          {bp.story?.length > 0 && <div className="row" style={{ gap: 8, marginBottom: 16, background: "var(--soft)", padding: 6, borderRadius: 12, maxWidth: 380 }}>
            {[["info", "📊 ดูแบบสรุป"], ["story", "📖 อ่านแบบเล่าเรื่อง"]].map(([k, l]) =>
              <button key={k} onClick={() => setView(k)} style={{ flex: 1, padding: "9px", border: 0, borderRadius: 9, fontWeight: 700, fontSize: 13.5, cursor: "pointer", background: view === k ? "#fff" : "transparent", color: view === k ? "var(--blue)" : "var(--muted)", boxShadow: view === k ? "0 2px 8px rgba(0,0,0,.06)" : "none" }}>{l}</button>)}
          </div>}
          {bp.story?.length > 0 && view === "story" && <div style={{ marginBottom: 8 }}>
            <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>นั่งจิบกาแฟอ่านสบายๆ นะคะ — ครูพี่คิมเล่าให้ฟังว่าช่องคุณอยู่ตรงไหน แล้วเราจะไปต่อยังไง 🩵</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {bp.story.map((c, i) => <div key={i} className="card" style={{ margin: 0, borderLeft: "4px solid var(--blue)" }}>
                <div className="row" style={{ gap: 10, marginBottom: 8 }}><span style={{ fontSize: 26 }}>{c.emoji}</span><h3 style={{ margin: 0, fontSize: 17 }}>{c.title}</h3></div>
                <p style={{ fontSize: 15.5, lineHeight: 1.85, margin: 0 }}>{c.body}</p>
              </div>)}
            </div>
          </div>}
          {view === "info" && <>
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
              {[["จุดแข็ง", bp.swot?.strengths, "💪", "#e8f5ee", "#1a7f43"], ["จุดอ่อน", bp.swot?.weaknesses, "⚠️", "#fdeaea", "#b3261e"], ["โอกาส", bp.swot?.opportunities, "🚀", "#eaf3fd", "#1B6FC4"], ["ความเสี่ยง", bp.swot?.threats, "🛡️", "#fff7e6", "#8a6d1f"]].map(([l, arr, ic, bg, fg]) =>
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

          </>}

          <div className="card center" style={{ background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", border: "1px solid #d6e7fa", marginTop: 10 }}>
            <div style={{ fontSize: 30 }}>📅</div>
            <h3 style={{ margin: "6px 0 6px" }}>นี่เพิ่งแค่ "กลยุทธ์" นะคะ — ของจริงอยู่ที่แผน 30 วัน!</h3>
            <p className="muted" style={{ fontSize: 14.5, marginBottom: 16, maxWidth: 540, marginInline: "auto" }}>ครูพี่คิมเขียน <b>สคริปต์พร้อมอัดครบทั้ง 30 วัน</b> (Hook–เล่าเรื่อง–CTA) + แคปชันพร้อมโพสต์ + เกม Marathon ให้แล้วค่ะ มาเริ่มลงมือทำกันเลย!</p>
            <button className="btn" onClick={() => { setTab("calendar"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>📅 มาเริ่มทำคอนเทนต์กันเลย →</button>
          </div>

          {!demo && (improveCount >= 1
            ? <div className="card" style={{ background: "#eef7f0", border: "1px solid #bfe3cc" }}><div style={{ fontWeight: 700, color: "#1a7f43" }}>✓ เพิ่มข้อมูลแล้ว — ครูพี่คิมอัปเดตเล่มให้ใหม่เรียบร้อยค่ะ 🩵</div></div>
            : <div className="card" style={{ border: "1px dashed var(--blue)", background: "#F4F8FD" }}>
                {!improveOpen ? <>
                  <div style={{ fontWeight: 800, fontSize: 17, color: "var(--blue-d)" }}>💎 อยากให้ครูพี่คิมเข้าใจคุณมากขึ้น?</div>
                  <p className="muted" style={{ fontSize: 14, margin: "6px 0 12px" }}>เล่าเรื่องตัวเอง สินค้า หรือสิ่งที่อยากขายเพิ่ม แล้วครูพี่คิมจะ<b>เจนเล่มใหม่ให้แม่นและเป็นคุณมากขึ้น</b> — <b style={{ color: "var(--up)" }}>ฟรี 1 ครั้ง</b> 🎁</p>
                  <button className="btn" onClick={() => setImproveOpen(true)}>เพิ่มข้อมูลให้แม่นขึ้น (ฟรี) →</button>
                </> : <>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "var(--blue-d)", marginBottom: 4 }}>💎 เล่าเพิ่มให้ครูพี่คิมฟัง</div>
                  <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>กรอกเท่าที่อยากเล่า (ไม่ต้องครบทุกช่อง) แล้วกดเจนใหม่ — ใช้สิทธิ์ฟรีนี้ได้ครั้งเดียว</p>
                  {[["products", "สินค้า/บริการที่อยากขายเดือนนี้", "เช่น คอร์สออนไลน์ 1,990฿ / รับงานแต่งหน้าเจ้าสาว"], ["pain_points", "ปัญหา/อุปสรรคตอนนี้", "เช่น คนทักเยอะแต่ปิดการขายไม่ได้"], ["content_likes", "คอนเทนต์แนวที่ชอบ/อยากได้", "เช่น สายเล่าเรื่องจริงจากชีวิต ไม่เอาสายตลก"], ["brand_info", "เล่าเรื่องแบรนด์/ตัวตนเพิ่ม", "เช่น เริ่มจากศูนย์เมื่อ 2 ปีก่อน อยากเป็นแรงบันดาลใจให้แม่ๆ"], ["more", "อื่นๆ ที่อยากบอก", "พิมพ์อะไรก็ได้ที่อยากให้ครูพี่คิมรู้"]].map(([k, label, ph]) =>
                    <div key={k} className="field"><label style={{ fontSize: 13.5 }}>{label}</label><textarea value={ix[k]} onChange={e => setIx(v => ({ ...v, [k]: e.target.value }))} style={{ minHeight: 64 }} placeholder={ph} /></div>)}
                  {improveErr && <div className="msg err">{improveErr}</div>}
                  <div className="row" style={{ gap: 10 }}>
                    <button className="btn" disabled={improving} onClick={submitImprove}>{improving ? "ครูพี่คิมกำลังเจนใหม่... (~1 นาที)" : "เจนเล่มใหม่ให้แม่นขึ้น 🩵"}</button>
                    {!improving && <button className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => setImproveOpen(false)}>ยกเลิก</button>}
                  </div>
                </>}
              </div>)}

          {!demo && <Link to="/video-audit" className="card" style={{ display: "block", textDecoration: "none", color: "inherit", border: "1px dashed #d6a0e0", background: "#faf3fc" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#6b3fa0" }}>🎬 ลงคลิปแล้วคนไม่ดู? ให้ครูพี่คิมตรวจคลิปให้</div>
            <p className="muted" style={{ fontSize: 14, margin: "6px 0 0" }}>อัปคลิป → AI ดูทุกวินาที บอกตรงๆ ว่า Hook/ภาพ/เสียง/ตัดต่อ ต้องแก้อะไร · 199฿/คลิป →</p>
          </Link>}
        </>}

        {tab === "calendar" && <>
          <div ref={calRef} style={{ scrollMarginTop: 70, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginBottom: 18 }}>
            {(bp.calendar || []).map(c => { const done = uploaded.has(c.d); return <button key={c.d} onClick={() => selectDay(c.d)} style={{ border: sel === c.d ? "2px solid var(--blue)" : done ? "1.5px solid #4caf7d" : "1px solid var(--border)", borderRadius: 12, padding: 12, background: done ? "#e8f5ee" : sel === c.d ? "#EAF3FD" : "#fff", cursor: "pointer", textAlign: "left" }}>
              <div className="between"><span style={{ fontWeight: 800, fontSize: 14, color: done ? "#1a7f43" : "inherit" }}>{done ? "✓ " : ""}วันที่ {c.d}</span><span style={{ width: 9, height: 9, borderRadius: "50%", background: G_COLORS[c.g] || "var(--muted)", display: "inline-block" }} /></div>
              <div style={{ fontSize: 10, color: G_COLORS[c.g] || "var(--muted)", fontWeight: 700, margin: "2px 0 5px" }}>{c.g}</div>
              <div style={{ fontSize: 12, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", color: done ? "#1a7f43" : "inherit" }}>{c.t}</div>
            </button>; })}
          </div>
          {script && (() => {
            const BEAT = { HOOK: "#2E86DE", BODY: "#1a7f43", CTA: "#b8860b" };
            const copy = (t) => navigator.clipboard?.writeText(t);
            const title = (bp.calendar.find(c => c.d === script.d) || {}).t;
            return <div ref={scriptRef} className="card" style={{ scrollMarginTop: 70 }}>
              <div className="between" style={{ marginBottom: 8 }}><span className="tag" style={{ background: "var(--soft)", color: G_COLORS[script.g] }}>วันที่ {script.d} · {script.g}</span><button className="link" onClick={scrollToCal} style={{ background: "none", border: 0, fontSize: 13, cursor: "pointer" }}>↑ เลือกวันอื่น</button></div>
              <h3 style={{ margin: "10px 0 4px" }}>{title}</h3>
              <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>🎬 บทพูดอัดคลิป — กดคัดลอกแล้วใช้ได้เลย</p>
              {(script.beats || []).map((b, i) => <div key={i} style={{ borderLeft: `4px solid ${BEAT[b.s] || "var(--blue)"}`, background: "var(--soft)", borderRadius: "0 12px 12px 0", padding: "12px 14px", marginBottom: 10 }}>
                <div className="row" style={{ gap: 8, marginBottom: 6 }}><span style={{ background: BEAT[b.s] || "var(--blue)", color: "#fff", fontWeight: 700, fontSize: 11, padding: "2px 10px", borderRadius: 20 }}>{b.s}</span><span className="muted" style={{ fontSize: 12 }}>{b.ts}</span></div>
                <p style={{ margin: "0 0 6px", fontSize: 15 }}>{b.say}</p>
                <div className="row" style={{ gap: 6 }}>{b.ost && <span style={{ fontSize: 11, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "3px 8px" }}>📺 {b.ost}</span>}{b.vis && <span style={{ fontSize: 11, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "3px 8px" }}>🎥 {b.vis}</span>}</div>
              </div>)}
              <div style={{ background: "var(--soft)", borderRadius: 12, padding: "12px 14px", marginTop: 4 }}><div className="between"><b style={{ fontSize: 13 }}>แคปชั่น & แฮชแท็ก</b><button className="link" onClick={() => copy(script.cap)} style={{ background: "none", border: 0, fontSize: 13 }}>คัดลอก 📋</button></div><p style={{ fontSize: 14, marginTop: 6 }}>{script.cap}</p></div>
              <div className="msg" style={{ background: "#fff7e6", color: "#8a6d1f", marginTop: 8 }}>💡 ทิปครูพี่คิม: {script.tip}</div>
              {!demo && <button type="button" onClick={() => toggleDay(script.d)} style={{ width: "100%", marginTop: 14, padding: "14px", borderRadius: 12, border: 0, cursor: "pointer", fontWeight: 800, fontSize: 15, color: "#fff", background: uploaded.has(script.d) ? "#1a7f43" : "var(--blue)", boxShadow: uploaded.has(script.d) ? "0 6px 18px rgba(26,127,67,.28)" : "0 6px 18px rgba(46,134,222,.28)" }}>
                {uploaded.has(script.d) ? "✓ ทำคลิปวันนี้แล้ว! เก่งมากค่ะ 🎉 (กดเพื่อยกเลิก)" : "☐ ทำคลิปนี้เสร็จแล้ว — กดติ๊กเลย!"}
              </button>}
            </div>;
          })()}

          {!demo && <div className="card" style={{ marginTop: 8, background: "#F4F8FD", border: "1px dashed #c5dcf3" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "var(--blue-d)" }}>✨ ทำเองเริ่มล้า? ให้ Babe House ช่วยได้</div>
            <p className="muted" style={{ fontSize: 13.5, margin: "6px 0 14px" }}>มีสคริปต์แล้วแต่ไม่อยากถ่าย/ตัดเอง — เลือกตัวช่วยได้เลยค่ะ</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
              <Link to="/video-audit" style={{ display: "block", textDecoration: "none", color: "inherit", background: "#faf3fc", border: "1px solid #e3cdec", borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontWeight: 800, color: "#6b3fa0" }}>🎬 ให้ AI ตรวจคลิป · 199฿</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>อัปคลิป → บอกจุดต้องแก้ Hook/ภาพ/เสียง/ตัดต่อ →</div>
              </Link>
              <a href={LINE_WORK.url} target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none", color: "inherit", background: "#eafaf0", border: "1px solid #b6e6c8", borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontWeight: 800, color: "#1a7f43" }}>💬 จ้างทีมตัดต่อ/ทำคลิป</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>ทักไลน์ Babe House Production {LINE_WORK.id} →</div>
              </a>
            </div>
          </div>}
        </>}

        {tab === "marathon" && (() => {
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
            <h2 className="serif" style={{ fontSize: 20, margin: "26px 0 4px" }}>🎁 บริการของ Babe House</h2>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>เลือกเส้นทางที่ใช่สำหรับคุณ — อยากเก่งขึ้นเอง หรืออยากให้เราทำให้</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
              <div className="card" style={{ margin: 0, borderTop: "4px solid var(--blue)" }}>
                <div style={{ fontSize: 30 }}>🎓</div>
                <h3 style={{ margin: "6px 0 4px" }}>เรียนตัดต่อเอง</h3>
                <p className="muted" style={{ fontSize: 13 }}>มีคอนเทนต์อยู่แล้ว แต่ยังตัดต่อไม่เป็น? มาเรียนกับครูพี่คิม — ทำเองได้ทุกคลิป</p>
                <ul style={{ paddingLeft: 18, fontSize: 13, margin: "10px 0" }}>{ACADEMY_COURSES.map((c, i) => <li key={i} style={{ marginBottom: 3 }}>{c}</li>)}</ul>
                <div className="center" style={{ margin: "12px 0" }}><img src={qrImg(LINE_ACADEMY.url)} alt="LINE Academy QR" width={150} height={150} style={{ borderRadius: 10, border: "1px solid var(--border)" }} /><div className="muted" style={{ fontSize: 13, marginTop: 6, fontWeight: 700 }}>{LINE_ACADEMY.id}</div></div>
                <a href={LINE_ACADEMY.url} target="_blank" rel="noreferrer" className="btn full">เพิ่มเพื่อน · เรียนคอร์ส</a>
              </div>
              <div className="card" style={{ margin: 0, borderTop: "4px solid #06C755" }}>
                <div style={{ fontSize: 30 }}>🎬</div>
                <h3 style={{ margin: "6px 0 4px" }}>ให้เราทำให้ (Production)</h3>
                <p className="muted" style={{ fontSize: 13 }}>ไม่มีเวลาทำเอง? ให้ทีม Babe House Production ตัดต่อ/ทำคอนเทนต์ให้ครบวงจร</p>
                <ul style={{ paddingLeft: 18, fontSize: 13, margin: "10px 0" }}><li style={{ marginBottom: 3 }}>🎞️ รับตัดต่อคลิป Reels/TikTok</li><li style={{ marginBottom: 3 }}>📸 ผลิตคอนเทนต์ครบวงจร</li><li>🧠 วางแผน + โปรดิวซ์โดยทีมมือโปร</li></ul>
                <div className="center" style={{ margin: "12px 0" }}><img src={qrImg(LINE_WORK.url)} alt="LINE Work QR" width={150} height={150} style={{ borderRadius: 10, border: "1px solid var(--border)" }} /><div className="muted" style={{ fontSize: 13, marginTop: 6, fontWeight: 700 }}>{LINE_WORK.id}</div></div>
                <a href={LINE_WORK.url} target="_blank" rel="noreferrer" className="btn full" style={{ background: "#06C755", boxShadow: "0 8px 22px rgba(6,199,85,.28)" }}>เพิ่มเพื่อน · จ้างทำให้</a>
              </div>
            </div>
          </>;
        })()}

        {!demo && <div className="card center" style={{ background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", border: "1px solid #d6e7fa" }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>ทำครบ 30 วันแล้วใช่ไหมคะ? 🩵</div>
          <p className="muted" style={{ margin: "6px 0 14px" }}>ปลดล็อกแผนเดือนใหม่ เพื่อต่อยอดการเติบโต</p>
          <Link className="btn" to={`/form?renew=1&email=${encodeURIComponent(session.email || "")}`}>+ เพิ่มแผนเดือนใหม่ (490฿)</Link>
        </div>}
      </div>
    </div>
  );
}
