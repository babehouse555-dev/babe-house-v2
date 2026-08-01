import { useState } from "react";
import { Link } from "react-router-dom";

// 👀 หน้าตัวอย่าง "บัญชีของฉัน" — ข้อมูลสมมติล้วน ไม่ต่อฐานข้อมูล ไม่แตะ /account จริง
//
// ฟีดแบ็กคิม รอบ 1: "เลื่อนยาวมาก เหมือนกันไปหมดลายตา"  → แยกเป็นแท็บ
// ฟีดแบ็กคิม รอบ 2: "ทำเป็นโฟลเดอร์เหมือนเล่นคอม Mac · ไม่ชอบสีจี้ดๆ พาสเทลได้ ·
//                    หน้าแผนคอนเทนต์เอาเหมือนปัจจุบันที่เปิดปิดได้ + ช่องค้นหา"
const FOLDERS = [
  { key: "plan",   icon: "📘", label: "แผนคอนเทนต์",   pastel: "#C7DEF0", deep: "#A9CCE6", n: 4 },
  { key: "course", icon: "🎓", label: "คอร์สเรียน",     pastel: "#DDCCEE", deep: "#C9B4E3", n: 3 },
  { key: "cert",   icon: "🏆", label: "ประกาศนียบัตร", pastel: "#C6DBCB", deep: "#AECBB6", n: 1 },
  { key: "ws",     icon: "🎟️", label: "คลาสสด",        pastel: "#F3D6B6", deep: "#E9C398", n: 2 },
];
const CHANNELS = [
  { name: "@babehouse_academy", months: ["August 2026", "July 2026", "June 2026"], fresh: true },
  { name: "@babehouse_work", months: ["July 2026", "June 2026"] },
  { name: "@kimkanchaya", months: ["July 2026"] },
  { name: "@babehouse_bloom", months: ["June 2026"] },
];
const COURSES = [
  { name: "PROCREATE DRAWING", done: 6, lessons: 6 },
  { name: "All In Ipad", done: 8, lessons: 17 },
  { name: "Canva Craft", done: 0, lessons: 11 },
];

export default function PreviewAccount() {
  const [tab, setTab] = useState("plan");
  const [open, setOpen] = useState({});   // เปิด-ปิดรายช่อง เหมือนหน้าจริง
  const [q, setQ] = useState("");
  const kw = q.trim().toLowerCase();
  const chs = kw ? CHANNELS.filter(c => c.name.toLowerCase().includes(kw)) : CHANNELS;
  // เหมือนของจริง: ช่องแรกกางไว้ให้ · ตอนค้นหากางหมด · ที่ลูกค้ากดเองชนะเสมอ
  const isOpen = (ch, i) => (ch.name in open) ? open[ch.name] : (kw ? true : i === 0);

  return (
    <div className="wrap narrow page-pad">
      <div style={{ background: "#FBF3D9", color: "#7a5b00", textAlign: "center", fontSize: 13, padding: "10px 12px", fontWeight: 700, borderRadius: 12, marginBottom: 18 }}>
        👀 ตัวอย่างเท่านั้น — ข้อมูลทุกอย่างเป็นของสมมติ<br />
        <span style={{ fontWeight: 400 }}>หน้าบัญชีจริงของลูกค้าไม่ถูกแตะต้อง</span>
      </div>

      <div className="brand">BABE HOUSE · ACADEMY</div>
      <h1 className="page" style={{ marginBottom: 4 }}>บัญชีของฉัน</h1>
      <div className="between" style={{ marginBottom: 18 }}>
        <span className="muted" style={{ fontSize: 14 }}>you@email.com</span>
        <span className="link" style={{ fontSize: 13.5 }}>ออกจากระบบ</span>
      </div>

      {/* 🗂️ โฟลเดอร์ — เหมือนเปิดโฟลเดอร์บนเครื่อง Mac · โทนพาสเทล ไม่จี้ดตา */}
      <div className="fld-row">
        {FOLDERS.map(f => {
          const on = f.key === tab;
          return (
            <button key={f.key} className={`fld${on ? " on" : ""}`} onClick={() => setTab(f.key)} aria-pressed={on}>
              <span className="fld-body" style={{ "--c": f.pastel, "--d": f.deep }}>
                <span className="fld-icon">{f.icon}</span>
                <span className="fld-n">{f.n}</span>
              </span>
              <span className="fld-label">{f.label}</span>
            </button>
          );
        })}
      </div>

      {tab === "plan" && <>
        {/* ค้นหาช่อง — โผล่เมื่อเกิน 3 ช่อง เหมือนหน้าจริง */}
        {CHANNELS.length > 3 && (
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ค้นหาช่อง"
                 style={{ width: "100%", boxSizing: "border-box", fontSize: 14, padding: "11px 14px", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 12 }} />
        )}
        {chs.length === 0 && <div className="card center muted" style={{ fontSize: 14, marginTop: 0 }}>ไม่พบช่อง “{q}”</div>}
        {chs.map((ch, ci) => {
          const on = isOpen(ch, ci);
          return (
            <div key={ch.name} className="card" style={{ marginTop: 0, marginBottom: 12, ...(ch.fresh ? { borderTop: "4px solid #2C8E8C" } : null) }}>
              {/* หัวช่อง กดพับ-กางได้ เหมือนของเดิม */}
              <button onClick={() => setOpen(p => ({ ...p, [ch.name]: !on }))}
                      style={{ width: "100%", background: "none", border: 0, padding: 0, cursor: "pointer", display: "flex", gap: 11, alignItems: "center", textAlign: "left", marginBottom: on ? 12 : 0 }}>
                <span style={{ fontSize: 22 }}>📺</span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: 800, fontSize: 15.5, display: "block" }}>{ch.name}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{ch.months.length} เดือน{!on ? ` · ${ch.months[0]}` : ""}</span>
                </span>
                {!on && ch.fresh && <span style={{ fontSize: 10.5, fontWeight: 800, background: "#2C8E8C", color: "#fff", borderRadius: 20, padding: "2px 8px" }}>ใหม่</span>}
                <span style={{ color: "var(--muted)", fontSize: 17, transform: on ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>›</span>
              </button>
              {on && <>
                {ch.months.map((m, i) => {
                  const fresh = ch.fresh && i === 0;
                  return (
                    <div key={m} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: 12, padding: "12px 14px", marginBottom: 7,
                      background: fresh ? "linear-gradient(135deg,#EAF3FD,#F4F9FF)" : "var(--soft)", border: `1px solid ${fresh ? "#d6e7fa" : "var(--border)"}` }}>
                      <span style={{ fontWeight: 700, fontSize: 14.5 }}>{m}{i === 0 ? " · ล่าสุด" : ""}
                        {fresh && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, background: "#2C8E8C", color: "#fff", borderRadius: 20, padding: "2px 8px" }}>ใหม่</span>}
                      </span>
                      <span style={{ color: "var(--blue)", fontSize: 18 }}>›</span>
                    </div>
                  );
                })}
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <span className="btn" style={{ flex: 1, fontSize: 13, padding: 10, textAlign: "center" }}>+ ต่อแผนเดือนนี้</span>
                  <span className="btn ghost" style={{ flex: 1, fontSize: 13, padding: 10, textAlign: "center" }}>📈 ดูการโต</span>
                </div>
              </>}
            </div>
          );
        })}
        <div className="card center" style={{ color: "var(--blue)", fontWeight: 700, border: "1.5px dashed var(--blue)", background: "#F6FAFE" }}>+ เพิ่มช่องใหม่</div>
      </>}

      {tab === "course" && (
        <div className="card" style={{ marginTop: 0 }}>
          <div className="between" style={{ marginBottom: 6 }}>
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
                  <span className="btn" style={{ padding: "8px 16px", fontSize: 13.5, whiteSpace: "nowrap", background: done ? "#7FA98C" : "#A99BD0" }}>
                    {done ? "ทบทวน →" : c.done > 0 ? "เรียนต่อ →" : "เริ่มเรียน →"}
                  </span>
                </div>
                <div style={{ position: "relative", height: 30, marginTop: 4 }}>
                  <div style={{ position: "absolute", left: 0, right: 0, top: 18, height: 7, background: "var(--soft)", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 6, background: done ? "#7FA98C" : "#A99BD0" }} />
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
        <div className="card" style={{ marginTop: 0, background: "#F2F7F3" }}>
          <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>เก็บไว้ให้ตลอด กลับมาเปิดหรือสั่งพิมพ์ใหม่ได้ทุกเมื่อ ไม่ต้องทักแอดมินค่ะ</p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "#fff", borderRadius: 12, padding: "14px 15px" }}>
            <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
              <span style={{ fontSize: 26 }}>🏆</span>
              <div><div style={{ fontWeight: 700, fontSize: 14.5 }}>PROCREATE DRAWING</div><div className="muted" style={{ fontSize: 12.5 }}>ได้รับเมื่อ 1 สิงหาคม 2569</div></div>
            </div>
            <span style={{ color: "#7FA98C", fontSize: 18 }}>›</span>
          </div>
        </div>
      )}

      {tab === "ws" && (
        <div className="card" style={{ marginTop: 0 }}>
          <div className="muted" style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>รอบที่จะถึง</div>
          <div style={{ background: "#FDF4EA", border: "1px solid #F0DCC4", borderRadius: 12, padding: "13px 15px", marginBottom: 14 }}>
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

      <style>{`
        .fld-row { display: flex; gap: 14px; overflow-x: auto; padding: 4px 2px 16px; margin-bottom: 8px; }
        .fld { flex-shrink: 0; width: 92px; background: none; border: 0; padding: 0; cursor: pointer; font-family: inherit; text-align: center; }
        .fld-body {
          position: relative; display: flex; align-items: center; justify-content: center; gap: 5px;
          height: 58px; border-radius: 4px 12px 12px 12px; background: var(--c);
          box-shadow: 0 2px 5px rgba(90,80,110,.10); transition: transform .18s, box-shadow .18s, background .18s;
        }
        /* แถบเล็กมุมบนซ้าย = หูโฟลเดอร์ */
        .fld-body::before {
          content: ""; position: absolute; top: -7px; left: 0; width: 42%; height: 9px;
          background: var(--c); border-radius: 7px 7px 0 0; transition: background .18s;
        }
        /* ไอคอนโผล่พ้นขอบบน — เหมือนของยื่นออกมาจากโฟลเดอร์ */
        .fld-icon {
          position: absolute; top: -15px; left: 50%; font-size: 22px; line-height: 1; z-index: 2;
          transform: translateX(-46%) rotate(-7deg); transition: transform .18s;
          filter: drop-shadow(0 2px 3px rgba(90,80,110,.18));
        }
        .fld-n { font-size: 12.5px; font-weight: 800; color: #4a4458; background: rgba(255,255,255,.78); border-radius: 20px; padding: 2px 9px; margin-top: 4px; }
        .fld-label { display: block; margin-top: 8px; font-size: 12.5px; font-weight: 600; color: var(--muted); transition: color .18s; }
        .fld:hover .fld-body { transform: translateY(-2px); }
        .fld:hover .fld-icon, .fld.on .fld-icon { transform: translateX(-46%) rotate(-7deg) translateY(-3px) scale(1.06); }
        .fld-row { padding-top: 20px; }   /* เผื่อที่ให้ไอคอนที่โผล่พ้นขอบ */
        .fld.on .fld-body, .fld.on .fld-body::before { background: var(--d); }
        .fld.on .fld-body { transform: translateY(-4px); box-shadow: 0 8px 16px rgba(90,80,110,.20); }
        .fld.on .fld-label { color: var(--ink); font-weight: 800; }
        @media (prefers-reduced-motion: reduce){ .fld-body { transition: none; } }
      `}</style>
    </div>
  );
}
