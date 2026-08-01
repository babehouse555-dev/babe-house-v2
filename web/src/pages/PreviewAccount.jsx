import { Link } from "react-router-dom";
import { SectionHead } from "./MyLearning.jsx";

// 👀 หน้าตัวอย่าง "บัญชีของฉัน" ฉบับเต็ม — ให้คิมดูว่าหน้าตาจะเป็นยังไงตอนเปิดคอร์สแล้ว
// ⚠️ ข้อมูลทั้งหมดในหน้านี้เป็นตัวอย่างสมมติ ไม่ได้ต่อฐานข้อมูลจริงเลยสักจุด
//    ไม่แตะหน้า /account ของจริง ไม่แตะสวิตช์ ACADEMY_LIVE — ลูกค้าไม่ได้รับผลกระทบใดๆ
const BLUE = "var(--blue)";

const CHANNELS = [
  { name: "@babehouse_academy", months: ["August 2026", "July 2026", "June 2026"] },
  { name: "@babehouse_work", months: ["June 2026"] },
];
const COURSES = [
  { id: "12", name: "PROCREATE DRAWING", done: 6, lessons: 6 },
  { id: "10", name: "All In Ipad", done: 8, lessons: 17 },
  { id: "49", name: "Canva Craft", done: 0, lessons: 11 },
];
const CERTS = [{ name: "PROCREATE DRAWING", date: "1 สิงหาคม 2569" }];
const WS = [
  { name: "All in your phone (Advance)", when: "15 ส.ค. 2569 11:00 น.", place: "Babe House Studio ทองหล่อ", future: true },
  { name: "Canva Craft (Workshop)", when: "12 ก.ค. 2569", place: "", future: false },
];

export default function PreviewAccount() {
  const bookCount = CHANNELS.reduce((a, c) => a + c.months.length, 0);
  return (
    <div className="wrap narrow page-pad">
      <div style={{ background: "#fff7cf", color: "#7a5b00", textAlign: "center", fontSize: 13, padding: "10px 12px", fontWeight: 700, borderRadius: 12, marginBottom: 18 }}>
        👀 ตัวอย่างเท่านั้น — ข้อมูลทุกอย่างในหน้านี้เป็นของสมมติ<br />
        <span style={{ fontWeight: 400 }}>หน้าบัญชีจริงของลูกค้าไม่ถูกแตะต้อง และคอร์สยังปิดอยู่ตามเดิม</span>
      </div>

      <div className="brand">BABE HOUSE · ACADEMY</div>
      <h1 className="page">บัญชีของฉัน</h1>
      <div className="between" style={{ marginBottom: 14 }}>
        <span className="muted">เล่มของ <b>you@email.com</b></span>
        <span className="link">ออกจากระบบ</span>
      </div>

      {/* แถบสรุป — โผล่เฉพาะคนที่มีของหลายประเภท */}
      <div className="card" style={{ background: "linear-gradient(135deg,#EAF3FD,#F6F0FF)", border: "none", display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-around", padding: "16px 14px" }}>
        {[["📘", bookCount, `เล่ม · ${CHANNELS.length} ช่อง`], ["🎓", COURSES.length, "คอร์ส"], ["🏆", CERTS.length, "ประกาศนียบัตร"], ["🎟️", WS.length, "คลาสสด"]].map(([ic, n, l]) => (
          <div key={l} style={{ textAlign: "center", minWidth: 88 }}>
            <div style={{ fontSize: 19 }}>{ic}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: BLUE, lineHeight: 1.2 }}>{n}</div>
            <div className="muted" style={{ fontSize: 12 }}>{l}</div>
          </div>
        ))}
      </div>

      <SectionHead icon="📘" title="แผนคอนเทนต์ของฉัน" count={`${CHANNELS.length} ช่อง`} />
      {CHANNELS.map(ch => (
        <div key={ch.name} className="card" style={{ marginTop: 0, marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 22 }}>📺</span>
            <div><div style={{ fontWeight: 800, fontSize: 15.5 }}>{ch.name}</div><div className="muted" style={{ fontSize: 12.5 }}>{ch.months.length} เดือน</div></div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ch.months.map((m, i) => (
              <div key={m} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: 12, padding: "12px 14px", background: i === 0 ? "linear-gradient(135deg,#EAF3FD,#F4F9FF)" : "var(--soft)", border: i === 0 ? "1px solid #d6e7fa" : "1px solid var(--border)" }}>
                <span style={{ fontWeight: 700, fontSize: 14.5 }}>{m}{i === 0 ? " · ล่าสุด" : ""}</span>
                <span style={{ color: BLUE, fontSize: 18 }}>›</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <SectionHead icon="🎓" title="คอร์สเรียนของฉัน" count={COURSES.length} right={<span className="link" style={{ fontSize: 13 }}>ดูคอร์สทั้งหมด →</span>} />
      <div className="card" style={{ marginTop: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {COURSES.map(c => {
            const pct = Math.round(c.done / c.lessons * 100), done = pct >= 100;
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
                <span className="btn" style={{ padding: "8px 16px", fontSize: 13.5, whiteSpace: "nowrap", background: done ? "#1a7f43" : undefined }}>
                  {done ? "ทบทวน →" : c.done > 0 ? "เรียนต่อ →" : "เริ่มเรียน →"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <SectionHead icon="🏆" title="ประกาศนียบัตรของฉัน" count={CERTS.length} />
      <div className="card" style={{ marginTop: 0, background: "linear-gradient(135deg,#E4F4F3,#EAF3FD)", border: "1px solid #bfe3df" }}>
        <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>เก็บไว้ให้ตลอด กลับมาเปิดหรือสั่งพิมพ์ใหม่ได้ทุกเมื่อ ไม่ต้องทักแอดมินค่ะ</p>
        {CERTS.map(c => (
          <div key={c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "#fff", borderRadius: 12, padding: "12px 15px" }}>
            <div><div style={{ fontWeight: 700, fontSize: 14.5 }}>{c.name}</div><div className="muted" style={{ fontSize: 12.5 }}>ได้รับเมื่อ {c.date}</div></div>
            <span style={{ color: BLUE, fontSize: 18 }}>›</span>
          </div>
        ))}
      </div>

      <SectionHead icon="🎟️" title="คลาสสดของฉัน" count={WS.length} />
      <div className="card" style={{ marginTop: 0 }}>
        <div className="muted" style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>รอบที่จะถึง</div>
        {WS.filter(w => w.future).map(w => (
          <div key={w.name} style={{ background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", border: "1px solid #d6e7fa", borderRadius: 12, padding: "13px 15px", marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>{w.name}</div>
            <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.7 }}>📅 {w.when}<br />📍 {w.place}</div>
          </div>
        ))}
        <div className="muted" style={{ fontSize: 12.5, fontWeight: 700, margin: "14px 0 8px" }}>เรียนไปแล้ว</div>
        {WS.filter(w => !w.future).map(w => (
          <div key={w.name} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "13px 15px" }}>
            <div className="between" style={{ gap: 8, flexWrap: "wrap" }}>
              <div><div style={{ fontWeight: 700, fontSize: 14.5 }}>{w.name}</div><div className="muted" style={{ fontSize: 12.5 }}>{w.when}</div></div>
              <span className="btn ghost" style={{ padding: "8px 14px", fontSize: 13 }}>📄 ไฟล์สรุปหลังเรียน</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center", marginTop: 28 }}>
        <Link className="btn ghost" to="/account">← ไปหน้าบัญชีจริง</Link>
      </div>
    </div>
  );
}
