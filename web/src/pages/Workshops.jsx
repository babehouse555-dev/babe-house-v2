import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

// ตารางคลาสสด (workshop) — เห็นรอบและที่นั่งที่เหลือแบบเรียลไทม์ จองเองได้เลย ไม่ต้องทักไลน์
const BLUE = "var(--blue)";
const thDate = (iso) => new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });
const thTime = (iso) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
const money = (n) => "฿" + Number(n || 0).toLocaleString();

export default function Workshops() {
  const [d, setD] = useState(null);
  useEffect(() => { api("/api/workshops").then(setD).catch(() => setD({ workshops: [] })); }, []);

  if (!d) return <div className="wrap narrow page-pad center"><p className="muted">กำลังโหลด...</p></div>;
  const all = d.workshops || [];
  // เรียงให้คลาสที่มีรอบเปิดรับขึ้นก่อน — คนเข้ามาเพื่อดูว่า "เรียนได้เมื่อไหร่"
  const list = [...all].sort((a, b) => (b.sessions?.length ? 1 : 0) - (a.sessions?.length ? 1 : 0));
  const openCount = all.reduce((n, w) => n + (w.sessions?.length || 0), 0);

  return (
    <div style={{ minHeight: "100vh" }}>
      <div style={{ background: "#fff7cf", color: "#7a5b00", textAlign: "center", fontSize: 13, padding: "8px 12px", fontWeight: 700 }}>
        🚧 พรีวิวภายใน — หน้านี้ยังไม่เปิดให้ลูกค้าเห็น
      </div>
      <div className="wrap" style={{ paddingTop: 30, paddingBottom: 60 }}>
        <h1 className="serif" style={{ fontSize: "clamp(24px,4vw,32px)", fontWeight: 800, textAlign: "center", margin: "6px 0 6px" }}>คลาสสด (Workshop)</h1>
        <p className="muted" style={{ textAlign: "center", fontSize: 15, marginBottom: 26 }}>
          เรียนสดกับครูพี่คิม ลงมือทำจริงในห้องเรียน · {openCount > 0 ? `ตอนนี้เปิดรับ ${openCount} รอบ` : "รอประกาศรอบถัดไปเร็วๆ นี้"}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 16 }}>
          {list.map(w => {
            const next = w.sessions?.[0];
            const soon = (w.sessions || []).slice(0, 3);
            return (
              <div key={w.workshop_id} className="card" style={{ margin: 0, borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", padding: 0, borderTop: next ? `4px solid ${BLUE}` : "1px solid var(--border)" }}>
                {/* รูปคลาส — คิมบอก 2 ส.ค. "เวิร์กช็อปเปิดมามีแต่ตัวหนังสือ" ต้องเห็นภาพถึงจะตัดสินใจง่าย */}
                <div style={{ position: "relative", aspectRatio: "16/10", background: "var(--soft)", overflow: "hidden" }}>
                  {w.image_url
                    ? <img src={w.image_url} alt={w.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    : <div className="center muted" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>🎟️</div>}
                  {next && <span style={{ position: "absolute", left: 10, top: 10, background: "rgba(255,255,255,.94)", color: BLUE, fontWeight: 800, fontSize: 11.5, borderRadius: 20, padding: "4px 10px" }}>เปิดรับสมัคร</span>}
                  {w.reviews?.length > 0 && <span style={{ position: "absolute", right: 10, top: 10, background: "rgba(20,16,30,.72)", color: "#fff", fontWeight: 700, fontSize: 11.5, borderRadius: 20, padding: "4px 10px" }}>▶ รีวิว {w.reviews.length}</span>}
                </div>
                <div style={{ padding: 16, display: "flex", flexDirection: "column", flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.4 }}>{w.name}</div>
                {w.tagline && <div className="muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.6 }}>{w.tagline}</div>}
                <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{w.instructor} · {w.duration}</div>

                <div style={{ marginTop: 12, marginBottom: 12 }}>
                  {soon.length > 0 ? soon.map(s => (
                    <div key={s.session_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13, padding: "6px 0", borderBottom: "1px dashed var(--border)" }}>
                      <span><b>{thDate(s.starts_at)}</b> <span className="muted">{thTime(s.starts_at)} น.</span></span>
                      <span style={{ color: s.left <= 0 ? "#b3261e" : s.left <= 3 ? "#c77700" : "#1a7f43", fontWeight: 700, whiteSpace: "nowrap" }}>
                        {s.left <= 0 ? "เต็มแล้ว" : `เหลือ ${s.left} ที่`}
                      </span>
                    </div>
                  )) : <div className="muted" style={{ fontSize: 13 }}>ยังไม่มีรอบที่เปิดรับ — กดดูรายละเอียดไว้ก่อนได้ค่ะ</div>}
                </div>

                <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{money(w.price)}</div>
                  <Link className={next ? "btn" : "btn ghost"} to={`/workshop/${w.workshop_id}`} style={{ padding: "9px 16px", fontSize: 13.5 }}>
                    {next ? "ดูรอบและจอง →" : "ดูรายละเอียด →"}
                  </Link>
                </div>
                </div>
              </div>
            );
          })}
        </div>
        {!list.length && <div className="card center muted">ยังไม่มีคลาสในระบบ</div>}
      </div>
    </div>
  );
}
