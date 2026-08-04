import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, session } from "../api.js";
import { EDIT_LIVE } from "../config.js";
import { ACADEMY_LIVE } from "../config.js";
import { workshopForCourse, shouldSuggestWorkshop } from "../workshopMap.js";

// 🏠 "ของทั้งหมดที่ฉันซื้อ" — คอร์ส · ประกาศนียบัตร · workshop
// หลักคิด (คิมสั่ง 2026-08-01): ลูกค้าเข้ามาต้องเจอ "ทุกอย่างที่เขาซื้อ" ในที่เดียว ดูง่าย
// ⚠️ ปิดสนิทจนกว่าจะเปิดตัวเฟส 4 — ลูกค้าเก่าที่เคยซื้อคอร์สในเว็บเดิม (1,466 คน) ใช้อีเมลเดียวกัน
//    ถ้าไม่ปิด เขาจะเห็นคอร์สโผล่มาเองก่อนที่เราจะประกาศ
// ⚠️ หมวดไหนไม่มีของ = ไม่แสดงเลย (ลูกค้า Blueprint อย่างเดียวเห็นหน้าเดิมเป๊ะ)
const BLUE = "var(--blue)";
const thDate = (iso) => iso ? new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) : "";
const thDay = (iso) => iso ? new Date(iso).toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }) : "";

// หัวข้อหมวด — ใช้หน้าตาเดียวกันทุกหมวด เพื่อให้อ่านเป็น "ระบบเดียว" ไม่ใช่ของแปะเพิ่ม
export function SectionHead({ icon, title, count, right }) {
  return (
    <div className="between" style={{ margin: "26px 0 10px", flexWrap: "wrap", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 19 }}>{icon}</span>
        <h2 style={{ fontSize: 16.5, fontWeight: 800, margin: 0 }}>{title}</h2>
        {count != null && <span style={{ background: "var(--soft)", color: "var(--muted)", borderRadius: 20, padding: "2px 9px", fontSize: 12.5, fontWeight: 700 }}>{count}</span>}
      </div>
      {right}
    </div>
  );
}

export default function MyLearning({ channelCount = 0, bookCount = 0, only = null, onCounts = null }) {
  const [courses, setCourses] = useState([]);
  const [certs, setCerts] = useState([]);
  const [edits, setEdits] = useState([]);   // 🎬 งานที่สั่งให้ทีมตัด
  const [ws, setWs] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!session.token) return;
    const t = session.token;
    Promise.allSettled([
      ACADEMY_LIVE ? api("/api/academy/my-courses", { token: t }) : Promise.reject(),
      ACADEMY_LIVE ? api("/api/academy/my-certificates", { token: t }) : Promise.reject(),
      ACADEMY_LIVE ? api("/api/workshops/my", { token: t }) : Promise.reject(),
      api("/api/edit/my", { token: t }),           // 🎬 งานตัดต่อ — เปิดให้ทุกคนที่มีเล่ม ไม่ผูกกับสวิตช์ Academy
    ]).then(([a, b, c, e]) => {
      if (a.status === "fulfilled") setCourses(a.value.courses || []);
      if (b.status === "fulfilled") setCerts(b.value.certificates || []);
      if (c.status === "fulfilled") setWs(c.value.bookings || []);
      if (e.status === "fulfilled") setEdits(e.value.orders || []);
      setLoaded(true);
    });
  }, []);

  // บอกหน้าบัญชีว่ามีของกี่ชิ้นในแต่ละหมวด เพื่อไปทำเลขบนโฟลเดอร์
  useEffect(() => { if (loaded && onCounts) onCounts({ courses: courses.length, certs: certs.length, ws: ws.length, edits: edits.length }); }, [loaded, courses.length, certs.length, ws.length, edits.length]);   // eslint-disable-line
  if (!loaded || (!courses.length && !certs.length && !ws.length && !edits.length)) return null;
  const show = (k) => !only || only === k;

  const now = new Date();
  const upcoming = ws.filter(b => new Date(b.starts_at) >= now);
  const past = ws.filter(b => new Date(b.starts_at) < now);

  return (
    <>
      {/* แถบสรุป — โผล่เฉพาะคนที่มีของมากกว่า 1 ประเภท จะได้เห็นภาพรวมทันทีว่ามีอะไรบ้าง */}
      {!only && <Summary items={[
        channelCount ? { icon: "📘", n: bookCount, label: `เล่ม · ${channelCount} ช่อง` } : null,
        courses.length ? { icon: "🎓", n: courses.length, label: "คอร์ส" } : null,
        certs.length ? { icon: "🏆", n: certs.length, label: "ประกาศนียบัตร" } : null,
        ws.length ? { icon: "🎟️", n: ws.length, label: "คลาสสด" } : null,
      ].filter(Boolean)} />}

      {show("course") && courses.length > 0 && <>
        <SectionHead icon="🎓" title="คอร์สเรียนของฉัน" count={courses.length}
          right={<Link className="link" to="/academy" style={{ fontSize: 13 }}>ดูคอร์สทั้งหมด →</Link>} />
        <div className="card" style={{ marginTop: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {courses.map(c => {
              const pct = c.lessons ? Math.round(c.done / c.lessons * 100) : 0;
              const done = pct >= 100;
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 170 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{done && "✅ "}{c.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                      <div style={{ flex: 1, height: 7, background: "var(--soft)", borderRadius: 5, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: done ? "#1a7f43" : BLUE }} />
                      </div>
                      <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{c.done}/{c.lessons} บท</span>
                    </div>
                  </div>
                  <Link className="btn" to={`/academy/learn?course=${c.id}`} style={{ padding: "8px 16px", fontSize: 13.5, whiteSpace: "nowrap", background: done ? "#1a7f43" : undefined }}>
                    {done ? "ทบทวน →" : c.done > 0 ? "เรียนต่อ →" : "เริ่มเรียน →"}
                  </Link>
                  {/* 🎟️ ซื้อคอร์สแล้วแต่ยังเรียนไม่จบ → ชวนมาลงมือทำในคลาสสดเรื่องเดียวกัน
                      (คิมยืนยัน 2 ส.ค.: คนที่ขี้เกียจเรียนออนไลน์แล้วมาเข้าคลาสสด "ได้ผลจริง")
                      ⛔ ไม่ขึ้นกับคนที่เรียนจบแล้ว — เขาทำเองได้แล้ว ไม่ต้องยัดขาย */}
                  {ACADEMY_LIVE && shouldSuggestWorkshop(c.id, pct) && (() => {
                    const w = workshopForCourse(c.id);
                    return (
                      <div style={{ width: "100%", background: "#F2F7F3", border: "1px solid #cfe3d6", borderRadius: 12, padding: "11px 14px", marginTop: 2 }}>
                        <div style={{ fontSize: 13.5, lineHeight: 1.65 }}>
                          🎟️ <b>เรียนแล้วยังไม่ได้ลงมือทำใช่ไหมคะ</b> — มาทำจริงกับครูพี่คิมในคลาสสดได้นะคะ
                          <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{w.why}</div>
                        </div>
                        <Link className="link" to={`/workshop/${w.id}`} style={{ fontSize: 13, fontWeight: 700, display: "inline-block", marginTop: 7 }}>
                          ดูรอบเรียน →
                        </Link>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      </>}

      {show("cert") && certs.length > 0 && <>
        <SectionHead icon="🏆" title="ประกาศนียบัตรของฉัน" count={certs.length} />
        <div className="card" style={{ marginTop: 0, background: "linear-gradient(135deg,#E4F4F3,#EAF3FD)", border: "1px solid #bfe3df" }}>
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
      </>}

      {/* 🎬 งานที่สั่งให้ทีมตัด — คิมขอ 2 ส.ค. ให้อยู่ในบัญชีเดียวกัน ไม่แยกหน้า */}
      {EDIT_LIVE && show("edit") && edits.length > 0 && <>
        <SectionHead icon="🎬" title="งานที่ทีมกำลังทำให้" count={edits.length}
          right={<Link className="link" to="/edit" style={{ fontSize: 13 }}>สั่งงานเพิ่ม →</Link>} />
        <div className="card" style={{ marginTop: 0 }}>
          {edits.map(o => (
            <Link key={o.order_id} to={`/edit/${o.order_id}`}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap",
                padding: "12px 0", borderTop: "1px solid var(--border)", textDecoration: "none", color: "inherit" }}>
              <span>
                <span style={{ fontWeight: 700, fontSize: 14.5, display: "block" }}>{o.clips} คลิป · ฿{Number((o.amount_satang || 0) / 100).toLocaleString()}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>สั่งเมื่อ {new Date(o.created_at).toLocaleDateString("th-TH", { dateStyle: "medium" })}</span>
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 800, borderRadius: 20, padding: "5px 12px",
                background: o.status === "done" ? "#E8F5EE" : o.status === "awaiting_files" ? "#FDF3E4" : "#F3EFFC",
                color: o.status === "done" ? "#1a7f43" : o.status === "awaiting_files" ? "#C77700" : "#7C5CE6" }}>{o.status_th}</span>
            </Link>
          ))}
        </div>
      </>}

      {show("ws") && ws.length > 0 && <>
        <SectionHead icon="🎟️" title="คลาสสดของฉัน" count={ws.length} />
        <div className="card" style={{ marginTop: 0 }}>
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
            <div className="muted" style={{ fontSize: 12.5, fontWeight: 700, margin: `${upcoming.length ? 14 : 0}px 0 8px` }}>เรียนไปแล้ว</div>
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
      </>}
    </>
  );
}

function Summary({ items }) {
  if (items.length < 2) return null;   // มีของอย่างเดียวไม่ต้องสรุป รกเปล่าๆ
  return (
    <div className="card" style={{ background: "linear-gradient(135deg,#EAF3FD,#F6F0FF)", border: "none", display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-around", padding: "16px 14px" }}>
      {items.map(it => (
        <div key={it.label} style={{ textAlign: "center", minWidth: 88 }}>
          <div style={{ fontSize: 19 }}>{it.icon}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: BLUE, lineHeight: 1.2 }}>{it.n}</div>
          <div className="muted" style={{ fontSize: 12 }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}
