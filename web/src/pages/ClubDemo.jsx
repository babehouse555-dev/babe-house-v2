import { Link } from "react-router-dom";
import { suggestCourse } from "../courseMap.js";

// หน้า "รายงาน Club ประจำเดือน" (ร่าง/ตัวอย่าง) — ให้คิมเห็นว่าสมาชิก Club 199 เปิดมาเจออะไรจริงๆ
// ⚠️ DRAFT: ข้อมูลทั้งหมดเป็นตัวอย่าง (ครีเอเตอร์สมมติ) · ยังไม่ต่อข้อมูลจริง
const BLUE = "var(--blue)";
const GROWTH = [
  { m: "เม.ย.", v: 6800 }, { m: "พ.ค.", v: 7150 }, { m: "มิ.ย.", v: 7480 }, { m: "ก.ค.", v: 7720 }, { m: "ส.ค.", v: 8240 },
];
const SCRIPTS = [
  ["GRWM สายออฟฟิศ 5 นาที", "เทรนด์ 'แต่งหน้าเร่งรีบ'"],
  ["รีวิวก่อน–หลัง ใส่เสียงไวรัล", "ทรานซิชันปัดหน้า"],
  ["'ของมันต้องมี' ต่ำกว่า 200฿", "สายประหยัด"],
  ["ตอบคอมเมนต์ปัญหาผิว", "เก็บ engagement"],
  ["แต่งหน้าธีมหน้าฝน ติดทน", "ตามฤดูกาล"],
  ["3 ปัดที่เปลี่ยนหน้า", "before-after"],
  ["แกะกล่องของใหม่", "unboxing มาแรง"],
  ["เมคอัพ 1 ชิ้น ใช้ได้ 3 แบบ", "multi-use"],
  ["ผิวโกลว์ใน 60 วิ", "คลิปสั้นจบไว"],
  ["รีวิวของถูกที่คนไม่พูดถึง", "hidden gem"],
  ["เทรนด์สีลิปเดือนนี้", "ตามกระแส"],
  ["Q&A สกินแคร์ที่คนถามบ่อย", "เนื้อหาช่วยขาย"],
];

function Metric({ label, value, delta, up = true }) {
  return (
    <div style={{ background: "var(--soft)", borderRadius: 14, padding: "16px 18px", flex: 1, minWidth: 150 }}>
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, margin: "3px 0" }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: up ? "var(--up)" : "#d64545" }}>{up ? "▲" : "▼"} {delta} <span className="muted" style={{ fontWeight: 400 }}>vs เดือนก่อน</span></div>
    </div>
  );
}

export default function ClubDemo() {
  const max = Math.max(...GROWTH.map(g => g.v));
  return (
    <div style={{ minHeight: "100vh" }}>
      <div style={{ background: "#fff7cf", color: "#7a5b00", textAlign: "center", fontSize: 13, padding: "8px 12px", fontWeight: 700 }}>
        🚧 ตัวอย่าง (ร่าง) — ข้อมูลทั้งหมดเป็นตัวอย่างสมมติ นี่คือ "หน้าที่สมาชิก Club เปิดมาเจอทุกเดือน"
      </div>

      <div className="wrap narrow" style={{ padding: "30px 0 60px" }}>

        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <div style={{ display: "inline-block", background: BLUE, color: "#fff", fontSize: 12.5, fontWeight: 700, padding: "4px 14px", borderRadius: 20 }}>💛 Babe House Club</div>
        </div>
        <h1 className="serif" style={{ fontSize: "clamp(23px,4vw,30px)", fontWeight: 800, textAlign: "center", margin: "10px 0 2px" }}>รายงานประจำเดือน · สิงหาคม 2026</h1>
        <p className="muted" style={{ textAlign: "center", fontSize: 15, marginBottom: 26 }}>ช่อง @mint.beauty · อยู่กับครูพี่คิมมา 4 เดือนแล้ว 🎉</p>

        <div className="card" style={{ borderRadius: 18 }}>
          <h3 style={{ fontSize: 17, margin: "0 0 14px" }}>📈 เดือนนี้ช่องคุณโตขึ้น</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
            <Metric label="ผู้ติดตาม" value="8,240" delta="+520 (6.7%)" />
            <Metric label="การเข้าถึง (reach)" value="142k" delta="+38%" />
            <Metric label="อัตราการมีส่วนร่วม" value="4.2%" delta="+0.6" />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120, padding: "0 4px", borderBottom: "1px solid var(--border)" }}>
            {GROWTH.map((g, i) => (
              <div key={g.m} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: i === GROWTH.length - 1 ? BLUE : "var(--muted)" }}>{(g.v / 1000).toFixed(1)}k</div>
                <div style={{ width: "70%", maxWidth: 46, height: `${(g.v / max) * 92}px`, background: i === GROWTH.length - 1 ? BLUE : "#cfe0f5", borderRadius: "6px 6px 0 0" }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-around", marginTop: 6 }}>
            {GROWTH.map(g => <div key={g.m} style={{ flex: 1, textAlign: "center", fontSize: 12, color: "var(--muted)" }}>{g.m}</div>)}
          </div>
          <div style={{ background: "var(--soft)", borderRadius: 12, padding: "12px 14px", marginTop: 16, fontSize: 14.5 }}>
            ✨ <b>เดือนนี้โตเร็วสุดตั้งแต่เริ่มเลยค่ะ!</b> ผู้ติดตามเพิ่ม 520 คน (เดือนก่อน +240) — คอนเทนต์กำลังเข้าที่แล้ว
          </div>
        </div>

        <div className="card" style={{ borderRadius: 18 }}>
          <h3 style={{ fontSize: 17, margin: "0 0 4px" }}>🔥 สคริปต์สดตามเทรนด์เดือนนี้ · 12 อัน</h3>
          <p className="muted" style={{ fontSize: 13.5, margin: "0 0 14px" }}>สคริปต์พร้อมถ่ายจริง อิงเทรนด์บิวตี้ที่กำลังปัง — หยิบไปอัดได้เลย (คลิกดูสคริปต์เต็มได้ทุกอัน)</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 9 }}>
            {SCRIPTS.map(([h, tag], i) => {
              const c = suggestCourse(h, tag);   // 🔗 สคริปต์นี้ต้องใช้เทคนิคอะไร → ชี้ไปคอร์สที่สอนเรื่องนั้น
              return (
              <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "11px 13px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: BLUE, background: "var(--soft)", borderRadius: 7, padding: "2px 7px", flexShrink: 0 }}>{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.35 }}>{h}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>🔥 {tag}</div>
                  {c && <Link to={`/academy/course/${c.id}`} style={{ display: "inline-block", marginTop: 6, fontSize: 11.5, fontWeight: 700, color: BLUE, textDecoration: "none", background: "var(--soft)", borderRadius: 20, padding: "3px 9px" }}>🎓 เรียน{c.label} →</Link>}
                </div>
              </div>
              );
            })}
          </div>

          <div style={{ marginTop: 16, border: `1.5px solid ${BLUE}`, borderRadius: 14, padding: "15px 16px", background: "var(--soft)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: BLUE, marginBottom: 8 }}>👀 ตัวอย่างสคริปต์เต็ม (สคริปต์ #1)</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>GRWM สายออฟฟิศ 5 นาที</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 13.5, lineHeight: 1.55 }}>
              <div><span style={{ fontWeight: 700, color: BLUE }}>ฮุก (0-3 วิ):</span> "แต่งหน้าไปทำงานให้ทันใน 5 นาที เริ่มจับเวลาเลย!" <span className="muted">📺 ขึ้นจอ: 5 นาทีพร้อมออกจากบ้าน</span></div>
              <div><span style={{ fontWeight: 700, color: BLUE }}>เนื้อหา:</span> "เริ่มจากครีมกันแดดคุมมัน ตบรองพื้นบางๆ ด้วยนิ้ว เขียนคิ้วลากเดียว ปัดแก้มโทนพีช แล้วจบด้วยลิปสีนู้ด — เท่านี้ก็สวยพร้อมประชุมแล้วค่ะ"</div>
              <div><span style={{ fontWeight: 700, color: BLUE }}>ปิดท้าย:</span> "ใครแต่งเร็วกว่านี้คอมเมนต์บอกหน่อย 💬"</div>
              <div><span style={{ fontWeight: 700, color: BLUE }}>🎬 วิธีถ่าย:</span> ตั้งกล้องนิ่งมุมโต๊ะเครื่องแป้ง แสงหน้าต่าง อัดต่อเนื่องแล้วเร่งสปีด ใส่นาฬิกาจับเวลามุมจอ</div>
            </div>
            {/* ตรงนี้แหละที่คนติด — อ่านวิธีถ่ายแล้วไม่รู้ว่าทำยังไง กดเรียนได้เลยไม่ต้องไปหาเอง */}
            <div style={{ marginTop: 12, paddingTop: 11, borderTop: "1px dashed var(--border)", fontSize: 13.5 }}>
              ทำไม่เป็นตรงไหนไหมคะ? <Link to="/academy/course/39" style={{ fontWeight: 700, color: BLUE }}>🎓 ดูวิธีเร่งสปีด + ใส่ตัวเลขบนจอ ในคอร์สตัดต่อมือถือ →</Link>
            </div>
          </div>
        </div>

        {/* 🔗 จุดที่ Club กับคอร์สกลายเป็นระบบเดียวกัน:
            แผนบอกว่าโพสต์อะไร → คอร์สสอนว่าทำยังไง → การบ้านให้ครูพี่คิมตรวจว่าทำถูกไหม */}
        <div className="card" style={{ borderRadius: 18, border: `1.5px solid ${BLUE}33` }}>
          <h3 style={{ fontSize: 17, margin: "0 0 4px" }}>🎓 ทักษะที่จะทำให้เดือนนี้ง่ายขึ้น</h3>
          <p className="muted" style={{ fontSize: 13.5, margin: "0 0 14px" }}>ดูจากสคริปต์เดือนนี้แล้ว 3 เรื่องนี้จะช่วยได้มากที่สุด — ถ้าเคยซื้อคอร์สไว้แล้ว กดเข้าเรียนได้เลยค่ะ</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {[...new Map(SCRIPTS.map(([h, t]) => suggestCourse(h, t)).filter(Boolean).map(c => [c.id, c])).values()].slice(0, 3).map(c => (
              <Link key={c.id} to={`/academy/course/${c.id}`}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
                <span style={{ fontWeight: 700, fontSize: 14.5 }}>{c.label}</span>
                <span style={{ color: BLUE, fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap" }}>ดูคอร์ส ›</span>
              </Link>
            ))}
          </div>
          <div style={{ background: "var(--soft)", borderRadius: 12, padding: "12px 14px", marginTop: 14, fontSize: 13.5, lineHeight: 1.7 }}>
            💡 สมาชิก Club <b>ลดค่าคอร์สทุกคอร์ส</b> และส่งงานให้ครูพี่คิมตรวจได้ — แผนบอกว่าโพสต์อะไร คอร์สสอนว่าทำยังไง แล้วเราดูให้ว่าทำถูกไหม
          </div>
        </div>

        <div className="card" style={{ borderRadius: 18 }}>
          <h3 style={{ fontSize: 17, margin: "0 0 14px" }}>🎯 เดือนหน้าควรลุยอะไรต่อ</h3>
          <div style={{ display: "flex", gap: 11, alignItems: "flex-start", marginBottom: 13 }}>
            <span style={{ color: "var(--up)", fontWeight: 800, fontSize: 18 }}>✓</span>
            <div style={{ fontSize: 14.5, lineHeight: 1.6 }}><b>ทำ GRWM ต่อ เพิ่มเป็นสัปดาห์ละ 2 คลิป</b> — คลิปแต่งหน้าเร่งด่วนของคุณ engagement สูงสุด (2 เท่าของค่าเฉลี่ยช่อง) คนชอบมาก</div>
          </div>
          <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
            <span style={{ color: "#e0a020", fontWeight: 800, fontSize: 18 }}>!</span>
            <div style={{ fontSize: 14.5, lineHeight: 1.6 }}><b>คลิปรีวิวยาวเกิน 60 วิ คนดูไม่จบ</b> — ลองตัดให้เหลือ 30-40 วิ เข้าเรื่องเร็วขึ้น จะเก็บคนได้มากกว่า</div>
          </div>
        </div>

        <div className="card" style={{ borderRadius: 18, background: "linear-gradient(135deg,#eaf3fd,#fdf0f5)", border: "none" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: BLUE, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>ค</div>
            <div><div style={{ fontWeight: 700, fontSize: 15 }}>โน้ตจากครูพี่คิม 💛</div><div className="muted" style={{ fontSize: 12.5 }}>ถึงคุณมิ้นท์</div></div>
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.75, margin: 0 }}>
            เดือนนี้ครูพี่คิมภูมิใจมากเลยค่ะ 🥹 จากคนที่เคยไม่กล้าพูดหน้ากล้อง ตอนนี้คลิป GRWM ของคุณมิ้นท์มีคนรอดูทุกสัปดาห์แล้ว — สิ่งที่คุณทำได้ดีคือ "ความจริงใจ" ที่คนสัมผัสได้ค่ะ เดือนหน้าลองเปิดใจเล่าเรื่องตัวเองมากขึ้นอีกนิด คนจะยิ่งผูกพันกับคุณ เป็นกำลังใจให้นะคะ ไปต่อกัน! 🩵
          </p>
        </div>

        <div style={{ textAlign: "center", marginTop: 26 }}>
          <Link className="btn ghost" to="/plans">← ดูหน้าแพลน</Link>
        </div>
      </div>
    </div>
  );
}
