import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, session } from "../api.js";

// หน้าแคตตาล็อกคอร์ส Academy (เฟส 2 — พรีวิวภายใน ยังไม่ลิงก์จากเมนูไหน ลูกค้าไม่เจอ)
// ข้อมูลจริงจาก academy_* (นำเข้าจากเว็บเก่า) · ไม่มีลิงก์วิดีโอหลุดออกมา
const BLUE = "var(--blue)";

export default function Academy() {
  const [data, setData] = useState(null);
  const [cat, setCat] = useState("ทั้งหมด");
  const [open, setOpen] = useState(null);   // course id ที่กางรายละเอียด
  const [detail, setDetail] = useState({}); // id -> {course, lessons}
  const [mine, setMine] = useState(null);   // คอร์สที่ล็อกอินแล้วเป็นเจ้าของ

  useEffect(() => {
    api("/api/academy/catalog").then(setData).catch(() => setData({ ok: false }));
    if (session.token) api("/api/academy/my-courses", { token: session.token }).then(d => setMine(d.courses || [])).catch(() => {});
  }, []);

  const ownedIds = new Set((mine || []).map(m => m.id));
  async function toggle(id) {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (!detail[id]) {
      try { const d = await api(`/api/academy/course/${id}`); setDetail(p => ({ ...p, [id]: d })); } catch {}
    }
  }

  if (!data) return <div className="wrap narrow page-pad center"><p className="muted">กำลังโหลด...</p></div>;
  if (!data.ok) return <div className="wrap narrow page-pad center"><p className="muted">โหลดไม่สำเร็จ ลองรีเฟรชอีกครั้งค่ะ</p></div>;

  const cats = ["ทั้งหมด", ...[...new Set(data.courses.map(c => c.category))]];
  const list = cat === "ทั้งหมด" ? data.courses : data.courses.filter(c => c.category === cat);

  return (
    <div style={{ minHeight: "100vh" }}>
      <div style={{ background: "#fff7cf", color: "#7a5b00", textAlign: "center", fontSize: 13, padding: "8px 12px", fontWeight: 700 }}>
        🚧 พรีวิวภายใน (เฟส 2) — หน้านี้ยังไม่เปิดให้ลูกค้าเห็น · ข้อมูลจริงจากเว็บเก่า {data.count} คอร์ส
      </div>

      <div className="wrap" style={{ padding: "30px 0 60px" }}>
        <h1 className="serif" style={{ fontSize: "clamp(24px,4vw,32px)", fontWeight: 800, textAlign: "center", margin: "6px 0 4px" }}>คอร์สเรียน Babe House Academy</h1>
        <p className="muted" style={{ textAlign: "center", fontSize: 15, marginBottom: 22 }}>เรียนได้ทันทีหลังชำระเงิน · ติดตามความคืบหน้า · ประกาศนียบัตรอัตโนมัติ (เร็วๆ นี้)</p>

        {mine && mine.length > 0 && (
          <div className="card" style={{ borderRadius: 16, marginBottom: 24, border: `1.5px solid ${BLUE}` }}>
            <h3 style={{ fontSize: 16.5, margin: "0 0 12px" }}>📚 คอร์สของฉัน</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {mine.map(m => {
                const pct = m.lessons ? Math.round(m.done / m.lessons * 100) : 0;
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{m.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <div style={{ flex: 1, height: 7, background: "var(--soft)", borderRadius: 5, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: BLUE }} /></div>
                        <span className="muted" style={{ fontSize: 12 }}>{m.done}/{m.lessons} บท</span>
                      </div>
                    </div>
                    <Link className="btn" to={`/academy/learn?course=${m.id}`} style={{ padding: "8px 16px", fontSize: 13.5 }}>{m.done > 0 ? "เรียนต่อ →" : "เริ่มเรียน →"}</Link>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 24 }}>
          {cats.map(c => (
            <button key={c} onClick={() => setCat(c)} style={{ border: `1.5px solid ${c === cat ? BLUE : "var(--border)"}`, background: c === cat ? BLUE : "#fff", color: c === cat ? "#fff" : "var(--ink)", borderRadius: 20, padding: "7px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>{c}</button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 16 }}>
          {list.map(c => (
            <div key={c.id} className="card" style={{ margin: 0, padding: 0, overflow: "hidden", borderRadius: 16, display: "flex", flexDirection: "column" }}>
              {/* ปกคอร์สเป็นโปสเตอร์จัตุรัส/แนวตั้ง และ "มีชื่อคอร์สอยู่ในรูป" — ถ้าครอบแบบ cover ชื่อจะโดนตัดหาย
                  ใช้ contain บนพื้นอ่อนแทน เห็นปกเต็มใบทุกคอร์ส แม้สัดส่วนรูปจะไม่เท่ากัน */}
              <div style={{ aspectRatio: "4/3", background: "var(--soft)", overflow: "hidden" }}>
                {c.image && <img src={c.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={e => { e.target.style.display = "none"; }} />}
              </div>
              <div style={{ padding: "13px 15px 15px", display: "flex", flexDirection: "column", flex: 1 }}>
                <div style={{ fontSize: 12, color: BLUE, fontWeight: 700, marginBottom: 3 }}>{c.category}</div>
                <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.4, marginBottom: 4 }}>{c.name}</div>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>{c.instructor}{c.lessons ? ` · ${c.lessons} บทเรียน` : ""}</div>
                <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 800, fontSize: 17 }}>
                    {c.flag_sale && c.price_sale > 0
                      ? <><span style={{ color: BLUE }}>฿{c.price_sale.toLocaleString()}</span> <span className="muted" style={{ fontSize: 12.5, textDecoration: "line-through", fontWeight: 400 }}>฿{c.price.toLocaleString()}</span></>
                      : <>฿{c.price.toLocaleString()}</>}
                  </div>
                  <button onClick={() => toggle(c.id)} className="link" style={{ background: "none", border: 0, cursor: "pointer", fontSize: 13.5, fontWeight: 700 }}>{open === c.id ? "ปิด ▲" : "ดูบทเรียน ▼"}</button>
                </div>
                <div style={{ marginTop: 10 }}>
                  {ownedIds.has(c.id)
                    ? <Link className="btn full" to={`/academy/learn?course=${c.id}`} style={{ textAlign: "center" }}>เข้าเรียน →</Link>
                    : <Link className="btn ghost full" to={`/academy/course/${c.id}`} style={{ textAlign: "center" }}>ดูรายละเอียดคอร์ส →</Link>}
                </div>
                {open === c.id && (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    {!detail[c.id] ? <div className="muted" style={{ fontSize: 13 }}>กำลังโหลด...</div> : (
                      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.9, color: "var(--ink)" }}>
                        {(detail[c.id].lessons || []).map((l, i) => <li key={i}>{l.name}{l.time ? <span className="muted"> · {l.time}</span> : null}</li>)}
                        {!(detail[c.id].lessons || []).length && <div className="muted">ยังไม่มีรายการบทเรียน</div>}
                      </ol>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="muted" style={{ textAlign: "center", fontSize: 12.5, marginTop: 26 }}>
          เฟสถัดไป: ปุ่มซื้อผ่าน Stripe · ระบบเรียน + แถบความคืบหน้า · ประกาศนียบัตรอัตโนมัติ
        </p>
      </div>
    </div>
  );
}
