import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, session } from "../api.js";
import { ACADEMY_LIVE } from "../config.js";

// กล่อง "คอร์ส · ประกาศนียบัตร · workshop ของฉัน" ในหน้าบัญชี
// ⚠️ ปิดสนิทจนกว่าจะเปิดตัวเฟส 4 — ลูกค้าเก่าที่เคยซื้อคอร์สในเว็บเดิม (1,466 คน) ใช้อีเมลเดียวกัน
//    ถ้าไม่ปิดไว้ เขาจะเห็นคอร์สโผล่มาเองก่อนที่เราจะประกาศ แล้วงงว่านี่คืออะไร
// ⚠️ และถึงเปิดแล้ว ถ้าลูกค้าคนนั้นไม่มีอะไรเลย ก็จะไม่แสดงอะไรทั้งสิ้น
const BLUE = "var(--blue)";
const thDate = (iso) => iso ? new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) : "";
const thDay = (iso) => iso ? new Date(iso).toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }) : "";

export default function MyLearning() {
  const [courses, setCourses] = useState([]);
  const [certs, setCerts] = useState([]);
  const [ws, setWs] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ACADEMY_LIVE || !session.token) return;
    const t = session.token;
    Promise.allSettled([
      api("/api/academy/my-courses", { token: t }),
      api("/api/academy/my-certificates", { token: t }),
      api("/api/workshops/my", { token: t }),
    ]).then(([a, b, c]) => {
      if (a.status === "fulfilled") setCourses(a.value.courses || []);
      if (b.status === "fulfilled") setCerts(b.value.certificates || []);
      if (c.status === "fulfilled") setWs(c.value.bookings || []);
      setLoaded(true);
    });
  }, []);

  if (!loaded || (!courses.length && !certs.length && !ws.length)) return null;

  const now = new Date();
  const upcoming = ws.filter(b => new Date(b.starts_at) >= now);
  const past = ws.filter(b => new Date(b.starts_at) < now);

  return (
    <>
      {courses.length > 0 && (
        <div className="card">
          <h3 style={{ margin: "0 0 12px", fontSize: 16.5 }}>🎓 คอร์สของฉัน ({courses.length})</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {courses.map(c => {
              const pct = c.lessons ? Math.round(c.done / c.lessons * 100) : 0;
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 170 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{c.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                      <div style={{ flex: 1, height: 7, background: "var(--soft)", borderRadius: 5, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#1a7f43" : BLUE }} />
                      </div>
                      <span className="muted" style={{ fontSize: 12 }}>{c.done}/{c.lessons} บท</span>
                    </div>
                  </div>
                  <Link className="btn" to={`/academy/learn?course=${c.id}`} style={{ padding: "8px 16px", fontSize: 13.5 }}>
                    {pct === 100 ? "ทบทวน →" : c.done > 0 ? "เรียนต่อ →" : "เริ่มเรียน →"}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {certs.length > 0 && (
        <div className="card" style={{ background: "linear-gradient(135deg,#E4F4F3,#EAF3FD)", border: "1px solid #bfe3df" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 16.5 }}>🎓 ประกาศนียบัตรของฉัน ({certs.length})</h3>
          <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>เก็บไว้ให้ตลอด กลับมาเปิดหรือสั่งพิมพ์ใหม่ได้ทุกเมื่อ ไม่ต้องทักแอดมินค่ะ</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {certs.map(c => (
              <Link key={c.cert_id} to={`/academy/certificate/${c.cert_id}`}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit", background: "#fff", borderRadius: 12, padding: "12px 15px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{c.course_name}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>ได้รับเมื่อ {thDay(c.issued_at)}</div>
                </div>
                <span style={{ color: BLUE, fontSize: 18, flexShrink: 0 }}>›</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {ws.length > 0 && (
        <div className="card">
          <h3 style={{ margin: "0 0 12px", fontSize: 16.5 }}>🎟️ Workshop ของฉัน</h3>
          {upcoming.length > 0 && <>
            <div className="muted" style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>รอบที่จะถึง</div>
            {upcoming.map(b => (
              <div key={b.booking_id} style={{ background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", border: "1px solid #d6e7fa", borderRadius: 12, padding: "13px 15px", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{b.workshop_name}</div>
                <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.7 }}>
                  📅 {thDate(b.starts_at)}<br />
                  📍 {b.location || "จะแจ้งสถานที่อีกครั้งก่อนวันเรียนค่ะ"}
                  {b.qty > 1 && <><br />👥 {b.qty} ที่นั่ง</>}
                </div>
              </div>
            ))}
          </>}
          {past.length > 0 && <>
            <div className="muted" style={{ fontSize: 12.5, fontWeight: 700, margin: "14px 0 8px" }}>เรียนไปแล้ว</div>
            {past.map(b => (
              <div key={b.booking_id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "13px 15px", marginBottom: 8 }}>
                <div className="between" style={{ gap: 8, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{b.workshop_name}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{thDay(b.starts_at)}</div>
                  </div>
                  {b.summary_url
                    ? <a className="btn ghost" href={b.summary_url} target="_blank" rel="noreferrer" style={{ padding: "8px 14px", fontSize: 13 }}>📄 ไฟล์สรุปหลังเรียน</a>
                    : <span className="muted" style={{ fontSize: 12.5 }}>ไฟล์สรุปกำลังจัดทำค่ะ</span>}
                </div>
                {b.summary_note && <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{b.summary_note}</div>}
              </div>
            ))}
          </>}
        </div>
      )}
    </>
  );
}
