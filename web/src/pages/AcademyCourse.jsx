import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { api, session } from "../api.js";

// หน้ารายละเอียดคอร์ส — อ่านก่อน ตัดสินใจก่อน แล้วค่อยซื้อ (ตาม feedback คิม: ไม่เอาปุ่มซื้อโดดใส่หน้าแรก)
const BLUE = "var(--blue)";

export default function AcademyCourse() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const [mine, setMine] = useState(null);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    api(`/api/academy/course/${id}`).then(setD).catch(() => setErr(true));
    if (session.token) api("/api/academy/my-courses", { token: session.token }).then(r => setMine(r.courses || [])).catch(() => {});
  }, [id]);

  async function buy() {
    if (!session.token) { window.location.href = "/account"; return; }
    setBuying(true);
    try { const r = await api("/api/academy/buy", { method: "POST", token: session.token, body: { course_id: id } }); window.location.href = r.checkout_url; }
    catch (e) { alert(e.message || "ลองใหม่อีกครั้งนะคะ"); setBuying(false); }
  }

  if (err) return <div className="wrap narrow page-pad center"><p className="muted">ไม่พบคอร์สนี้ค่ะ</p><Link className="btn ghost" to="/academy">← คอร์สทั้งหมด</Link></div>;
  if (!d) return <div className="wrap narrow page-pad center"><p className="muted">กำลังโหลด...</p></div>;

  const c = d.course;
  const owned = (mine || []).some(m => m.id === c.id);
  const sale = c.flag_sale && c.price_sale > 0;
  const finalPrice = sale ? c.price_sale : c.price;

  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="wrap" style={{ padding: "22px 0 60px" }}>
        <Link to="/academy" className="muted" style={{ fontSize: 13.5 }}>← คอร์สทั้งหมด</Link>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 24, alignItems: "start", marginTop: 12 }} className="course-grid">
          <div>
            <div style={{ fontSize: 13, color: BLUE, fontWeight: 700, marginBottom: 6 }}>{c.category}</div>
            <h1 className="serif" style={{ fontSize: "clamp(22px,3.4vw,30px)", fontWeight: 800, lineHeight: 1.3, margin: "0 0 12px" }}>{c.name}</h1>
            {c.image && <div style={{ borderRadius: 16, overflow: "hidden", marginBottom: 18 }}><img src={c.image} alt="" style={{ width: "100%", display: "block" }} onError={e => { e.target.parentNode.style.display = "none"; }} /></div>}

            {c.detail && <div className="card" style={{ borderRadius: 16 }}>
              <h3 style={{ fontSize: 16, margin: "0 0 8px" }}>คอร์สนี้เรียนอะไร</h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.85, margin: 0, whiteSpace: "pre-wrap" }}>{c.detail}</p>
            </div>}

            <div className="card" style={{ borderRadius: 16 }}>
              <h3 style={{ fontSize: 16, margin: "0 0 10px" }}>บทเรียนในคอร์ส ({d.lessons.length})</h3>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 2.1 }}>
                {d.lessons.map((l, i) => <li key={i}>{l.name}{l.time ? <span className="muted"> · {l.time}</span> : null}</li>)}
              </ol>
            </div>

            {c.instructor && <div className="card" style={{ borderRadius: 16, display: "flex", gap: 14, alignItems: "center" }}>
              {c.instructor_image && <img src={c.instructor_image} alt="" style={{ width: 54, height: 54, borderRadius: "50%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />}
              <div>
                <div className="muted" style={{ fontSize: 12.5 }}>ผู้สอน</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{c.instructor}</div>
                {c.instructor_detail && <div className="muted" style={{ fontSize: 13 }}>{c.instructor_detail}</div>}
              </div>
            </div>}
          </div>

          <div className="card" style={{ borderRadius: 18, position: "sticky", top: 76, margin: 0 }}>
            <div style={{ fontSize: 30, fontWeight: 800 }}>
              {sale ? <><span style={{ color: BLUE }}>฿{c.price_sale.toLocaleString()}</span> <span className="muted" style={{ fontSize: 15, textDecoration: "line-through", fontWeight: 400 }}>฿{c.price.toLocaleString()}</span></> : <>฿{c.price.toLocaleString()}</>}
            </div>
            <div className="muted" style={{ fontSize: 13, margin: "4px 0 14px" }}>จ่ายครั้งเดียว · เรียนซ้ำได้ไม่จำกัด</div>
            {owned
              ? <Link className="btn full" to={`/academy/learn?course=${c.id}`} style={{ textAlign: "center" }}>เข้าเรียน →</Link>
              : <button className="btn full" disabled={buying} onClick={buy}>{buying ? "กำลังไปหน้าชำระเงิน..." : session.token ? "สมัครเรียนคอร์สนี้" : "เข้าสู่ระบบเพื่อสมัครเรียน"}</button>}
            <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, fontSize: 13.5, lineHeight: 2 }}>
              <li>✓ เรียนได้ทันทีหลังชำระเงิน</li>
              <li>✓ {d.lessons.length} บทเรียน · ดูซ้ำได้ตลอด</li>
              <li>✓ ติดตามความคืบหน้าการเรียน</li>
              <li>✓ ประกาศนียบัตรเมื่อเรียนจบ</li>
              <li>✓ ชำระผ่านบัตร / พร้อมเพย์</li>
            </ul>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 900px){ .course-grid{ grid-template-columns: 1fr !important; } .course-grid > .card{ position: static !important; } }`}</style>
    </div>
  );
}
