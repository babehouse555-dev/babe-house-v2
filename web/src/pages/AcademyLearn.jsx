import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, session } from "../api.js";

// หน้าเรียนคอร์ส (เฟส 2) — วิดีโอ + ติ๊กจบบท + แถบความคืบหน้า
// สิทธิ์: ลูกค้าที่ซื้อคอร์สนี้ (ออเดอร์ Close) ผ่าน session OTP · แอดมินพรีวิวได้ทุกคอร์ส
const BLUE = "var(--blue)";

// แปลงลิงก์ YouTube ทุกทรง → embed URL (watch?v= / youtu.be / shorts / playlist)
function toEmbed(url) {
  const u = String(url || "").trim();
  if (!u) return null;
  let m = u.match(/[?&]v=([A-Za-z0-9_-]{6,})/); if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = u.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/); if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = u.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/); if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = u.match(/[?&]list=([A-Za-z0-9_-]+)/); if (m) return `https://www.youtube.com/embed/videoseries?list=${m[1]}`;
  if (u.includes("/embed/")) return u;
  return u; // ไม่รู้จักทรง — ลองใส่ iframe ตรงๆ
}

export default function AcademyLearn() {
  const [sp] = useSearchParams();
  const courseId = sp.get("course") || "";
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [cur, setCur] = useState(0);
  const [busy, setBusy] = useState(false);
  const adminKey = localStorage.getItem("babe_admin_key") || "";

  useEffect(() => {
    if (!courseId) { setErr({ code: "NO_COURSE" }); return; }
    api(`/api/academy/learn/${courseId}`, { token: session.token || undefined, adminKey: adminKey || undefined })
      .then(d => { setData(d); const first = (d.lessons || []).findIndex(l => !l.done); setCur(first >= 0 ? first : 0); })
      .catch(e => setErr(e));
  }, [courseId]);

  async function mark(lesson, done) {
    if (adminKey && !session.token) return; // โหมดพรีวิวแอดมิน ไม่บันทึก progress
    setBusy(true);
    try {
      await api("/api/academy/progress", { method: "POST", token: session.token, body: { course_id: courseId, lesson_id: lesson.id, done } });
      setData(p => ({ ...p, lessons: p.lessons.map(l => l.id === lesson.id ? { ...l, done } : l) }));
    } catch {}
    setBusy(false);
  }

  if (err) return (
    <div className="wrap narrow page-pad center" style={{ minHeight: "60vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontSize: 44 }}>🔒</div>
      <h2 style={{ fontSize: 20, margin: "10px 0 6px" }}>{err.code === "NOT_OWNED" ? "คุณยังไม่ได้ซื้อคอร์สนี้ค่ะ" : err.code === "NO_COURSE" ? "ไม่พบคอร์สที่เลือก" : "กรุณาเข้าสู่ระบบก่อนนะคะ"}</h2>
      <p className="muted" style={{ marginBottom: 18 }}>{err.code === "LOGIN_REQUIRED" || err.status === 401 ? "เข้าสู่ระบบด้วยอีเมลที่ใช้ซื้อคอร์ส แล้วกลับมาเรียนได้เลยค่ะ" : ""}</p>
      <div><Link className="btn" to="/account">ไปหน้าเข้าสู่ระบบ</Link> <Link className="btn ghost" to="/academy" style={{ marginLeft: 6 }}>ดูคอร์สทั้งหมด</Link></div>
    </div>
  );
  if (!data) return <div className="wrap narrow page-pad center"><p className="muted">กำลังโหลด...</p></div>;

  const lessons = data.lessons || [];
  const doneN = lessons.filter(l => l.done).length;
  const pct = lessons.length ? Math.round(doneN / lessons.length * 100) : 0;
  const lesson = lessons[cur];
  const embed = lesson ? toEmbed(lesson.url) : null;

  return (
    <div style={{ minHeight: "100vh" }}>
      {adminKey && !session.token && <div style={{ background: "#fff7cf", color: "#7a5b00", textAlign: "center", fontSize: 13, padding: "7px 12px", fontWeight: 700 }}>🚧 โหมดพรีวิวแอดมิน — ดูได้ทุกคอร์ส · ไม่บันทึกความคืบหน้า</div>}

      <div className="wrap" style={{ padding: "22px 0 50px" }}>
        <Link to="/academy" className="muted" style={{ fontSize: 13.5 }}>← คอร์สทั้งหมด</Link>
        <h1 className="serif" style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, margin: "8px 0 10px" }}>{data.course.name}</h1>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{ flex: 1, height: 10, background: "var(--soft)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: BLUE, borderRadius: 6, transition: "width .3s" }} />
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: BLUE, whiteSpace: "nowrap" }}>{doneN}/{lessons.length} บท · {pct}%</div>
        </div>
        {pct === 100 && lessons.length > 0 && (
          <div className="card" style={{ background: "#e8f7ee", border: "1px solid #9ed3b0", borderRadius: 14, textAlign: "center", fontWeight: 700, color: "#1a7f43" }}>
            🎉 ยินดีด้วยค่ะ! คุณเรียนจบคอร์สนี้แล้ว — ประกาศนียบัตรอัตโนมัติกำลังมาในเฟสถัดไป
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 18, alignItems: "start" }} className="learn-grid">
          <div>
            <div style={{ aspectRatio: "16/9", background: "#000", borderRadius: 14, overflow: "hidden" }}>
              {embed
                ? <iframe key={lesson.id} src={embed} title={lesson.name} style={{ width: "100%", height: "100%", border: 0 }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                : <div style={{ color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 14 }}>บทนี้ยังไม่มีวิดีโอ</div>}
            </div>
            {lesson && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, fontSize: 15.5 }}>{cur + 1}. {lesson.name} {lesson.time && <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· {lesson.time}</span>}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {!lesson.done
                    ? <button className="btn" disabled={busy} onClick={() => { mark(lesson, true); if (cur < lessons.length - 1) setCur(cur + 1); }} style={{ padding: "9px 16px" }}>✓ เรียนจบบทนี้{cur < lessons.length - 1 ? " · ไปบทต่อไป" : ""}</button>
                    : <button className="btn ghost" disabled={busy} onClick={() => mark(lesson, false)} style={{ padding: "9px 16px" }}>↺ ยกเลิกติ๊กจบ</button>}
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ margin: 0, borderRadius: 14, padding: "14px 14px", maxHeight: "70vh", overflowY: "auto" }}>
            <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 10 }}>บทเรียน ({lessons.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {lessons.map((l, i) => (
                <button key={l.id} onClick={() => setCur(i)} style={{ display: "flex", gap: 9, alignItems: "flex-start", textAlign: "left", background: i === cur ? "var(--soft)" : "none", border: 0, borderRadius: 9, padding: "8px 9px", cursor: "pointer", fontSize: 13.5, lineHeight: 1.45 }}>
                  <span style={{ color: l.done ? "#1a7f43" : "#c7c7cf", fontWeight: 800, flexShrink: 0 }}>{l.done ? "✓" : "○"}</span>
                  <span style={{ fontWeight: i === cur ? 700 : 400 }}>{i + 1}. {l.name}{l.time ? <span className="muted"> · {l.time}</span> : null}</span>
                </button>
              ))}
              {!lessons.length && <div className="muted" style={{ fontSize: 13 }}>คอร์สนี้ยังไม่มีบทเรียนในระบบ</div>}
            </div>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 860px){ .learn-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
