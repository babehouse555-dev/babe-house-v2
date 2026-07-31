import { Link } from "react-router-dom";

// หน้า Plans (ร่าง — โมเดล 2 ชั้น: Blueprint 490 ครั้งเดียว + Babe House Club 199/เดือน)
// ⚠️ DRAFT: ยังไม่ผูกระบบจ่ายเงิน ปุ่ม Club เป็น placeholder — ไว้ให้คิมรีวิวหน้าตา/คำพูดบน staging
const BLUE = "var(--blue)";

function Feature({ children, on }) {
  return (
    <li style={{ padding: "10px 0 10px 28px", position: "relative", fontSize: 15, lineHeight: 1.5 }}>
      <span style={{ position: "absolute", left: 0, top: 10, color: on ? BLUE : "#c7c7cf", fontWeight: 800 }}>✓</span>
      {children}
    </li>
  );
}

export default function Plans() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <div style={{ background: "#fff7cf", color: "#7a5b00", textAlign: "center", fontSize: 13, padding: "8px 12px", fontWeight: 700 }}>
        🚧 ตัวอย่าง (ร่าง) — ยังไม่เปิดใช้จริง · ปุ่ม Club ยังกดจ่ายไม่ได้
      </div>

      <section className="wrap narrow" style={{ padding: "34px 0 8px", textAlign: "center" }}>
        <h1 className="serif" style={{ fontSize: "clamp(24px,4vw,34px)", fontWeight: 800, marginBottom: 10 }}>เลือกทางที่ใช่สำหรับคุณ</h1>
        <p className="muted" style={{ fontSize: 15.5, maxWidth: 560, margin: "0 auto" }}>เริ่มด้วยแผน 30 วันของคุณ แล้วอยู่ต่อกับครูพี่คิมให้ช่องโตขึ้นทุกเดือน</p>
      </section>

      <section className="wrap" style={{ padding: "24px 0 40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 20, maxWidth: 760, margin: "0 auto", alignItems: "start" }}>

          <div className="card" style={{ margin: 0, borderRadius: 22, padding: "28px 26px" }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Blueprint</div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>จุดเริ่มต้น · ซื้อครั้งเดียว</div>
            <div style={{ margin: "16px 0 4px", fontSize: 40, fontWeight: 800 }}>฿490</div>
            <div className="muted" style={{ fontSize: 13.5, marginBottom: 16 }}>จ่ายครั้งเดียว เก็บไว้ตลอด</div>
            <ul style={{ listStyle: "none", margin: "0 0 22px", padding: 0, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              <Feature on>วิเคราะห์ช่องเจาะลึก</Feature>
              <Feature on>แผนคอนเทนต์ 30 วัน</Feature>
              <Feature on>สคริปต์ + แคปชัน + วิธีถ่าย ครบทุกวัน</Feature>
              <Feature on>เก็บในบัญชีคุณตลอดไป</Feature>
            </ul>
            <Link className="btn full" to="/form">เริ่มเลย</Link>
          </div>

          <div className="card" style={{ margin: 0, borderRadius: 22, padding: "28px 26px", border: `2px solid ${BLUE}`, position: "relative", boxShadow: "0 14px 40px rgba(46,134,222,.15)" }}>
            <div style={{ position: "absolute", top: -13, left: 24, background: BLUE, color: "#fff", fontSize: 12.5, fontWeight: 700, padding: "4px 13px", borderRadius: 20 }}>อยู่ต่อ · โตต่อ</div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Babe House Club</div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>ระบบเติบโตที่มีชีวิต</div>
            <div style={{ margin: "16px 0 4px", fontSize: 40, fontWeight: 800, color: BLUE }}>฿199<span style={{ fontSize: 16, fontWeight: 600, color: "var(--muted)" }}> /เดือน</span></div>
            <div className="muted" style={{ fontSize: 13.5, marginBottom: 16 }}>ยกเลิกได้ทุกเมื่อ</div>
            <ul style={{ listStyle: "none", margin: "0 0 22px", padding: 0, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              <Feature on>🔥 <b>10-15 สคริปต์สดตามเทรนด์เดือนนี้</b> (พร้อมถ่าย)</Feature>
              <Feature on>📈 รายงานการโต สะสมทุกเดือน (ผู้ติดตาม/reach)</Feature>
              <Feature on>🎯 บอกว่าควรลุยอะไรต่อ จากที่เวิร์ก</Feature>
              <Feature on>💛 โน้ตส่วนตัวจากครูพี่คิม</Feature>
              <Feature on>🎓 <b>ลดค่าคอร์สเรียนทุกคอร์ส</b></Feature>
              <Feature on>📝 <b>ส่งงานให้ครูพี่คิมตรวจได้</b></Feature>
              <Feature on>เครดิตสคริปต์เสริม ราคาสมาชิก</Feature>
            </ul>
            <button className="btn full" disabled style={{ opacity: .55, cursor: "not-allowed" }}>เร็วๆ นี้</button>
            <Link to="/club" style={{ display: "block", textAlign: "center", marginTop: 12, fontSize: 14, fontWeight: 700, color: BLUE }}>👀 ดูตัวอย่างผลลัพธ์ข้างใน →</Link>
          </div>

        </div>

        {/* ทำให้เห็นว่าทุกสินค้าเป็นระบบเดียวกัน ไม่ใช่ของแยกชิ้นที่บังเอิญขายที่เดียวกัน */}
        <div className="card" style={{ maxWidth: 760, margin: "26px auto 0", borderRadius: 18 }}>
          <h3 style={{ fontSize: 16.5, margin: "0 0 4px", textAlign: "center" }}>ทุกอย่างต่อกันเป็นเส้นเดียว</h3>
          <p className="muted" style={{ fontSize: 13.5, textAlign: "center", margin: "0 0 18px" }}>ไม่ใช่ของแยกชิ้น แต่คือขั้นตอนของการทำช่องให้โต</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
            {[
              ["🗺️", "รู้ว่าโพสต์อะไร", "แผน 30 วัน + สคริปต์สดทุกเดือน", "Blueprint · Club"],
              ["🎬", "ทำเป็นจริงๆ", "คอร์สสอนเทคนิคที่สคริปต์ต้องใช้", "คอร์สเรียน"],
              ["✅", "รู้ว่าทำถูกไหม", "ส่งงานให้ตรวจ ได้ฟีดแบ็กกลับ", "การบ้าน + ใบประกาศ"],
              ["🤝", "เจอตัวจริง", "เรียนสดกับครูพี่คิม ถามได้ทันที", "Workshop"],
            ].map(([ic, t, d, tag]) => (
              <div key={t} style={{ background: "var(--soft)", borderRadius: 14, padding: "14px 15px" }}>
                <div style={{ fontSize: 22 }}>{ic}</div>
                <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 5 }}>{t}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.55 }}>{d}</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: BLUE, marginTop: 7 }}>{tag}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ maxWidth: 620, margin: "18px auto 0", background: "var(--soft)", borderRadius: 18, fontSize: 14, lineHeight: 1.75 }}>
          <b>อยากได้คอนเทนต์เพิ่ม?</b> ไม่ต้องจ่าย 490 ใหม่ทั้งก้อน — เติม <b>เครดิต</b> ทีละชิ้นได้เลย (สมาชิก Club ได้ราคาพิเศษ) เหมือนฟิตเนส: Club = ค่าสมาชิก · เครดิต = จ้างเพิ่มเป็นครั้งๆ · 490 = คอร์สใหญ่ตอนอยากรีเซ็ตใหม่
        </div>
      </section>
    </div>
  );
}
