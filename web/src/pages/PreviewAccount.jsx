import { useState } from "react";
import { Link } from "react-router-dom";

// 👀 หน้าตัวอย่าง "บัญชีของฉัน" ฉบับเต็ม — ให้คิมดูหน้าตาตอนเปิดคอร์สแล้ว
// ⚠️ ข้อมูลทั้งหมดเป็นตัวอย่างสมมติ ไม่ต่อฐานข้อมูลจริง · ไม่แตะ /account จริง · ไม่แตะสวิตช์ ACADEMY_LIVE
//
// ฟีดแบ็กคิมรอบ 1: "ต้องเลื่อนยาวมากกว่าจะเจอทุกอย่าง แล้วเหมือนกันไปหมดลายตา"
// → แก้เป็นแท็บ (ไม่ต้องเลื่อน) + ให้แต่ละหมวดมีสีของตัวเอง (แยกออกด้วยตาทันที)
const TABS = [
  { key: "plan", icon: "📘", label: "แผนคอนเทนต์", color: "#2E86DE", n: 4 },
  { key: "course", icon: "🎓", label: "คอร์สเรียน", color: "#7C5CE6", n: 3 },
  { key: "cert", icon: "🏆", label: "ประกาศนียบัตร", color: "#1a7f43", n: 1 },
  { key: "ws", icon: "🎟️", label: "คลาสสด", color: "#C77700", n: 2 },
];
const CHANNELS = [
  { name: "@babehouse_academy", months: ["August 2026", "July 2026", "June 2026"] },
  { name: "@babehouse_work", months: ["June 2026"] },
];
const COURSES = [
  { name: "PROCREATE DRAWING", done: 6, lessons: 6 },
  { name: "All In Ipad", done: 8, lessons: 17 },
  { name: "Canva Craft", done: 0, lessons: 11 },
];

export default function PreviewAccount() {
  const [tab, setTab] = useState("plan");
  const cur = TABS.find(t => t.key === tab);

  return (
    <div className="wrap narrow page-pad">
      <div style={{ background: "#fff7cf", color: "#7a5b00", textAlign: "center", fontSize: 13, padding: "10px 12px", fontWeight: 700, borderRadius: 12, marginBottom: 18 }}>
        👀 ตัวอย่างเท่านั้น — ข้อมูลทุกอย่างเป็นของสมมติ<br />
        <span style={{ fontWeight: 400 }}>หน้าบัญชีจริงของลูกค้าไม่ถูกแตะต้อง</span>
      </div>

      <div className="brand">BABE HOUSE · ACADEMY</div>
      <h1 className="page" style={{ marginBottom: 4 }}>บัญชีของฉัน</h1>
      <div className="between" style={{ marginBottom: 16 }}>
        <span className="muted" style={{ fontSize: 14 }}>you@email.com</span>
        <span className="link" style={{ fontSize: 13.5 }}>ออกจากระบบ</span>
      </div>

      {/* แท็บ — เห็นครบทุกอย่างที่ซื้อในบรรทัดเดียว ไม่ต้องเลื่อนหา */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 18 }}>
        {TABS.map(t => {
          const on = t.key === tab;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontFamily: "inherit",
                border: `1.5px solid ${on ? t.color : "var(--border)"}`, background: on ? t.color : "#fff",
                color: on ? "#fff" : "var(--ink)", borderRadius: 999, padding: "9px 15px", fontSize: 13.5, fontWeight: 700 }}>
              <span style={{ fontSize: 15 }}>{t.icon}</span>{t.label}
              <span style={{ background: on ? "rgba(255,255,255,.28)" : "var(--soft)", color: on ? "#fff" : "var(--muted)",
                borderRadius: 20, padding: "1px 8px", fontSize: 12, fontWeight: 800 }}>{t.n}</span>
            </button>
          );
        })}
      </div>

      {/* แถบสีบางๆ บอกว่าอยู่หมวดไหน */}
      <div style={{ height: 4, background: cur.color, borderRadius: 4, opacity: .85, marginBottom: 14 }} />

      {tab === "plan" && <>
        {CHANNELS.map(ch => (
          <div key={ch.name} className="card" style={{ marginTop: 0, marginBottom: 12, borderLeft: `4px solid ${cur.color}` }}>
            <div style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 22 }}>📺</span>
              <div><div style={{ fontWeight: 800, fontSize: 15.5 }}>{ch.name}</div><div className="muted" style={{ fontSize: 12.5 }}>{ch.months.length} เดือน</div></div>
            </div>
            {ch.months.map((m, i) => (
              <div key={m} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: 12, padding: "12px 14px", marginBottom: 7,
                background: i === 0 ? "#EAF3FD" : "var(--soft)", border: `1px solid ${i === 0 ? "#d6e7fa" : "var(--border)"}` }}>
                <span style={{ fontWeight: 700, fontSize: 14.5 }}>{m}{i === 0 ? " · ล่าสุด" : ""}</span>
                <span style={{ color: cur.color, fontSize: 18 }}>›</span>
              </div>
            ))}
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <span className="btn" style={{ flex: 1, fontSize: 13, padding: 10, textAlign: "center" }}>+ ต่อแผนเดือนนี้</span>
              <span className="btn ghost" style={{ flex: 1, fontSize: 13, padding: 10, textAlign: "center" }}>📈 ดูการโต</span>
            </div>
          </div>
        ))}
        <div className="card center" style={{ color: cur.color, fontWeight: 700, border: `1.5px dashed ${cur.color}`, background: "#F4F8FD" }}>+ เพิ่มช่องใหม่</div>
      </>}

      {tab === "course" && (
        <div className="card" style={{ marginTop: 0, borderLeft: `4px solid ${cur.color}` }}>
          <div className="between" style={{ marginBottom: 14 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>กำลังเรียนอยู่</span>
            <span className="link" style={{ fontSize: 13 }}>ดูคอร์สทั้งหมด →</span>
          </div>
          {COURSES.map(c => {
            const pct = Math.round(c.done / c.lessons * 100), done = pct >= 100;
            return (
              <div key={c.name} style={{ padding: "13px 0", borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{done && "✅ "}{c.name}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{c.done}/{c.lessons} บท · {pct}%</div>
                  </div>
                  <span className="btn" style={{ padding: "8px 16px", fontSize: 13.5, whiteSpace: "nowrap", background: done ? "#1a7f43" : cur.color }}>
                    {done ? "ทบทวน →" : c.done > 0 ? "เรียนต่อ →" : "เริ่มเรียน →"}
                  </span>
                </div>
                {/* ลู่วิ่ง */}
                <div style={{ position: "relative", height: 30, marginTop: 4 }}>
                  <div style={{ position: "absolute", left: 0, right: 0, top: 18, height: 7, background: "var(--soft)", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 6, background: done ? "#1a7f43" : cur.color }} />
                  </div>
                  <div style={{ position: "absolute", right: -2, top: 11, fontSize: 14 }}>{done ? "🏆" : "🏁"}</div>
                  <div style={{ position: "absolute", left: `calc(${Math.min(pct, 94)}% - 9px)`, top: 0, fontSize: 18 }}>{done ? "🎉" : "🏃‍♀️"}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "cert" && (
        <div className="card" style={{ marginTop: 0, borderLeft: `4px solid ${cur.color}`, background: "linear-gradient(135deg,#E4F4F3,#EAF3FD)" }}>
          <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>เก็บไว้ให้ตลอด กลับมาเปิดหรือสั่งพิมพ์ใหม่ได้ทุกเมื่อ ไม่ต้องทักแอดมินค่ะ</p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "#fff", borderRadius: 12, padding: "14px 15px" }}>
            <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
              <span style={{ fontSize: 26 }}>🏆</span>
              <div><div style={{ fontWeight: 700, fontSize: 14.5 }}>PROCREATE DRAWING</div><div className="muted" style={{ fontSize: 12.5 }}>ได้รับเมื่อ 1 สิงหาคม 2569</div></div>
            </div>
            <span style={{ color: cur.color, fontSize: 18 }}>›</span>
          </div>
        </div>
      )}

      {tab === "ws" && (
        <div className="card" style={{ marginTop: 0, borderLeft: `4px solid ${cur.color}` }}>
          <div className="muted" style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>รอบที่จะถึง</div>
          <div style={{ background: "#FFF8EC", border: "1px solid #F0DCB0", borderRadius: 12, padding: "13px 15px", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>All in your phone (Advance)</div>
            <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.7 }}>📅 15 ส.ค. 2569 11:00 น.<br />📍 Babe House Studio ทองหล่อ</div>
          </div>
          <div className="muted" style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>เรียนไปแล้ว</div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "13px 15px" }}>
            <div className="between" style={{ gap: 8, flexWrap: "wrap" }}>
              <div><div style={{ fontWeight: 700, fontSize: 14.5 }}>Canva Craft (Workshop)</div><div className="muted" style={{ fontSize: 12.5 }}>12 ก.ค. 2569</div></div>
              <span className="btn ghost" style={{ padding: "8px 14px", fontSize: 13 }}>📄 ไฟล์สรุปหลังเรียน</span>
            </div>
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 28 }}>
        <Link className="btn ghost" to="/account">← ไปหน้าบัญชีจริง</Link>
      </div>
    </div>
  );
}
