import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { api, session } from "../api.js";

// รายละเอียดคลาสสด + เลือกรอบ + จองและจ่ายเอง (ที่นั่งเช็กสดตอนกดจอง กันจองเกิน)
const BLUE = "var(--blue)";
const thFull = (iso) => new Date(iso).toLocaleString("th-TH", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Bangkok" });
const money = (n) => "฿" + Number(n || 0).toLocaleString();

export default function WorkshopDetail() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const [pick, setPick] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", qty: 1, code: "", food_note: "", needs_parking: false, customer_note: "" });
  const [promo, setPromo] = useState(null);
  const [codeMsg, setCodeMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api(`/api/workshops/${id}`).then(d2 => { setD(d2); setPick(d2.sessions?.[0]?.session_id || null); }).catch(() => setErr(true)); }, [id]);

  const sess = (d?.sessions || []).find(s => s.session_id === pick);
  const unit = sess?.price || d?.workshop?.price || 0;
  const totalSatang = unit * 100 * (Number(form.qty) || 1);

  async function checkCode() {
    const c = form.code.trim();
    if (!c) { setPromo(null); setCodeMsg(""); return; }
    setCodeMsg("กำลังตรวจ...");
    try { const r = await api("/api/promo/preview", { method: "POST", body: { code: c, amount_satang: totalSatang } }); setPromo(r); setCodeMsg(r.percent >= 100 ? "🎉 โค้ดนี้เรียนฟรีเลยค่ะ!" : `✅ ใช้ได้ ลด ${r.percent}%`); }
    catch (e) { setPromo(null); setCodeMsg(e.message || "โค้ดไม่ถูกต้องค่ะ"); }
  }

  async function book() {
    if (!session.token) { window.location.href = "/account"; return; }
    if (!pick) return alert("เลือกรอบที่จะเรียนก่อนนะคะ");
    if (!form.name.trim() || !form.phone.trim()) return alert("กรอกชื่อและเบอร์โทรด้วยนะคะ");
    setBusy(true);
    try {
      const r = await api("/api/workshops/book", { method: "POST", token: session.token, body: { session_id: pick, qty: Number(form.qty) || 1, name: form.name.trim(), phone: form.phone.trim(), code: form.code.trim() || undefined, food_note: form.food_note.trim(), needs_parking: form.needs_parking, customer_note: form.customer_note.trim() } });
      window.location.href = r.free ? r.redirect_url : r.checkout_url;
    } catch (e) {
      alert(e.message || "จองไม่สำเร็จ ลองใหม่อีกครั้งนะคะ");
      // ที่นั่งอาจเพิ่งเต็มระหว่างกรอกฟอร์ม → โหลดที่นั่งใหม่ให้เห็นของจริง
      api(`/api/workshops/${id}`).then(setD).catch(() => {});
      setBusy(false);
    }
  }

  if (err) return <div className="wrap narrow page-pad center"><p className="muted">ไม่พบคลาสนี้ค่ะ</p><Link className="btn ghost" to="/workshop">← คลาสทั้งหมด</Link></div>;
  if (!d) return <div className="wrap narrow page-pad center"><p className="muted">กำลังโหลด...</p></div>;
  const w = d.workshop;
  const soldOut = sess && sess.left <= 0;

  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="wrap" style={{ padding: "22px 0 60px" }}>
        <Link to="/workshop" className="muted" style={{ fontSize: 13.5 }}>← คลาสทั้งหมด</Link>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 24, alignItems: "start", marginTop: 12 }} className="ws-grid">
          <div>
            <h1 className="serif" style={{ fontSize: "clamp(22px,3.4vw,30px)", fontWeight: 800, lineHeight: 1.3, margin: "0 0 8px" }}>{w.name}</h1>
            {w.tagline && <p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--muted)", margin: "0 0 16px" }}>{w.tagline}</p>}
            {w.image_url && <div style={{ borderRadius: 16, overflow: "hidden", marginBottom: 18 }}><img src={w.image_url} alt="" style={{ width: "100%", display: "block" }} onError={e => { e.target.parentNode.style.display = "none"; }} /></div>}

            {w.detail && <div className="card" style={{ borderRadius: 16 }}>
              <h3 style={{ fontSize: 16, margin: "0 0 8px" }}>เรียนอะไรในคลาสนี้</h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.9, margin: 0, whiteSpace: "pre-wrap" }}>{w.detail}</p>
            </div>}
            {w.who_for && <div className="card" style={{ borderRadius: 16 }}>
              <h3 style={{ fontSize: 16, margin: "0 0 8px" }}>เหมาะกับใคร</h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.9, margin: 0, whiteSpace: "pre-wrap" }}>{w.who_for}</p>
            </div>}
            {w.what_you_get && <div className="card" style={{ borderRadius: 16 }}>
              <h3 style={{ fontSize: 16, margin: "0 0 8px" }}>สิ่งที่จะได้รับ</h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.9, margin: 0, whiteSpace: "pre-wrap" }}>{w.what_you_get}</p>
            </div>}

            {d.showcase?.length > 0 && <div className="card" style={{ borderRadius: 16 }}>
              <h3 style={{ fontSize: 16, margin: "0 0 4px" }}>รีวิวจากคนที่เรียนจริง</h3>
              <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>{d.showcase.length} คลิป</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 8 }}>
                {d.showcase.map((s, i) => (
                  <a key={i} className="link" href={s.url} target="_blank" rel="noreferrer"
                     style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", textDecoration: "none", fontSize: 13.5, fontWeight: 700 }}>
                    ▶️ {s.caption || `รีวิวที่ ${i + 1}`}
                  </a>
                ))}
              </div>
            </div>}
          </div>

          {/* กล่องจอง */}
          <div className="card" style={{ borderRadius: 18, position: "sticky", top: 76, margin: 0 }}>
            <div style={{ fontSize: 30, fontWeight: 800 }}>{money(unit)}</div>
            <div className="muted" style={{ fontSize: 13, margin: "4px 0 14px" }}>{w.duration} · {w.instructor}</div>

            {!d.sessions.length ? (
              <div className="msg" style={{ background: "#f7f7f8" }}>ยังไม่มีรอบที่เปิดรับสมัครค่ะ<br /><span className="muted" style={{ fontSize: 12.5 }}>รอบใหม่จะประกาศที่หน้านี้ก่อนใครนะคะ</span></div>
            ) : <>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>เลือกรอบที่จะเรียน</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
                {d.sessions.map(s => {
                  const full = s.left <= 0;
                  const on = pick === s.session_id;
                  return (
                    <button key={s.session_id} disabled={full} onClick={() => setPick(s.session_id)}
                            style={{ textAlign: "left", border: `1.5px solid ${on ? BLUE : "var(--border)"}`, background: on ? "#F4F8FD" : "#fff", borderRadius: 12, padding: "10px 13px", cursor: full ? "not-allowed" : "pointer", opacity: full ? .55 : 1, fontFamily: "inherit" }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{thFull(s.starts_at)}</div>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                        {s.location || "แจ้งสถานที่ก่อนวันเรียน"} · <span style={{ color: full ? "#b3261e" : s.left <= 3 ? "#c77700" : "#1a7f43", fontWeight: 700 }}>{full ? "เต็มแล้ว" : `เหลือ ${s.left} จาก ${s.seats} ที่`}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="ชื่อผู้เรียน"
                       style={{ flex: 1, minWidth: 0, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13.5, fontFamily: "inherit" }} />
                <input value={form.qty} onChange={e => { setForm({ ...form, qty: e.target.value }); setPromo(null); setCodeMsg(""); }} type="number" min={1} max={sess?.left || 10}
                       style={{ width: 62, padding: "10px 8px", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13.5, fontFamily: "inherit" }} />
              </div>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="เบอร์โทรติดต่อ" inputMode="tel"
                     style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13.5, fontFamily: "inherit", marginBottom: 8 }} />
              {/* ข้อมูลหน้างาน — เก็บตอนจองเลย แอดมินจะได้ไม่ต้องไล่ถามในไลน์ทีละคน */}
              <input value={form.food_note} onChange={e => setForm({ ...form, food_note: e.target.value })} placeholder="แพ้อาหาร / ทานมังสวิรัติ? (ไม่มีก็เว้นว่างได้)"
                     style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13.5, fontFamily: "inherit", marginBottom: 8 }} />
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, marginBottom: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={form.needs_parking} onChange={e => setForm({ ...form, needs_parking: e.target.checked })} style={{ width: "auto" }} />
                ต้องการที่จอดรถ
              </label>
              <textarea value={form.customer_note} onChange={e => setForm({ ...form, customer_note: e.target.value })} placeholder="อยากบอกอะไรเพิ่มเติมไหมคะ (ไม่มีก็เว้นว่างได้)"
                        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13.5, fontFamily: "inherit", marginBottom: 8, minHeight: 52 }} />
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <input value={form.code} onChange={e => { setForm({ ...form, code: e.target.value.toUpperCase() }); setPromo(null); setCodeMsg(""); }} placeholder="มีโค้ดส่วนลด?"
                       style={{ flex: 1, minWidth: 0, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13.5, fontFamily: "inherit", textTransform: "uppercase" }} />
                <button className="btn ghost" onClick={checkCode} style={{ padding: "10px 14px", fontSize: 13.5, whiteSpace: "nowrap" }}>ใช้โค้ด</button>
              </div>
              {codeMsg && <div style={{ fontSize: 12.5, marginBottom: 8, color: promo ? "#1a7f43" : "#b3261e" }}>{codeMsg}</div>}

              <div className="between" style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 10 }}>
                <span>ยอดรวม</span>
                <span>{promo ? (promo.final <= 0 ? "ฟรี!" : money(promo.final / 100)) : money(totalSatang / 100)}</span>
              </div>
              <button className="btn full" disabled={busy || soldOut} onClick={book}>
                {busy ? "กำลังไปหน้าชำระเงิน..." : soldOut ? "รอบนี้เต็มแล้ว" : session.token ? "จองและชำระเงิน" : "เข้าสู่ระบบเพื่อจอง"}
              </button>
              <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, fontSize: 13, lineHeight: 2 }}>
                <li>✓ ยืนยันที่นั่งทันทีหลังชำระเงิน</li>
                <li>✓ ไฟล์สรุปหลังเรียนโหลดได้ในบัญชีของคุณ</li>
                <li>✓ ชำระผ่านบัตร / พร้อมเพย์</li>
              </ul>
            </>}
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 900px){ .ws-grid{ grid-template-columns: 1fr !important; } .ws-grid > .card{ position: static !important; } }`}</style>
    </div>
  );
}
