import { Link } from "react-router-dom";

const feats = [
  ["🔍", "วิเคราะห์ SWOT ช่องคุณ", "อ่านสถิติหลังบ้าน บอกจุดแข็ง จุดรั่ว และโอกาส"],
  ["📅", "ปฏิทินคอนเทนต์ 30 วัน", "วางครบทุกวัน แนว Awareness / Conversion / Branding"],
  ["🎬", "สคริปต์เต็มทุกวัน 30 วัน", "บทพูด Hook–Body–CTA + แคปชั่น + มุมกล้อง พร้อมอัด"],
  ["🎯", "5 โมดูลปั้นแบรนด์", "Archetype, Avatar, Competitor, Core Values, Funnel"],
  ["🏃‍♀️", "เกม Content Marathon", "ติ๊กส่งคลิปแต่ละวัน สู้กับ Time Ghost"],
  ["📈", "ติดตามการเติบโตทุกเดือน", "เห็นกราฟโต % + บทวิเคราะห์ว่าควรโฟกัสอะไรต่อ"],
];
const probs = [
  ["😮‍💨", "ลงคลิปทุกวันแต่ยอดวิวนิ่ง", "ทำมานานแต่ยอดไม่ขึ้น ไม่รู้อันไหนเวิร์ก"],
  ["📉", "คนติดตามไม่เพิ่ม reach ตก", "อัลกอริทึมไม่ดัน คนใหม่ไม่เข้ามา"],
  ["🤔", "คิดคอนเทนต์ไม่ออก", "นั่งคิดทุกวันว่าวันนี้ลงอะไรดี เสียเวลา"],
  ["💸", "มีคนดูแต่ไม่ซื้อ/ไม่มีงานเข้า", "ยอดวิวดีแต่เปลี่ยนเป็นรายได้ไม่ได้"],
];
const faqs = [
  ["ต้องมีผู้ติดตามเยอะไหม?", "ไม่จำเป็นค่ะ ครูพี่คิมวิเคราะห์จากจุดที่คุณอยู่ตอนนี้ ปรับแผนให้เหมาะกับคุณ"],
  ["แผนเหมือนกันทุกคนหรือเปล่า?", "ไม่เหมือนค่ะ AI วิเคราะห์จากธุรกิจ เป้าหมาย และสถิติจริงของช่องคุณโดยเฉพาะ"],
  ["จ่ายเงินยังไง ปลอดภัยไหม?", "PromptPay และบัตรเครดิตผ่านระบบที่ปลอดภัย จ่ายรายเดือน ยกเลิกได้"],
  ["ใช้เวลานานไหม?", "หลังชำระเงิน ครูพี่คิมส่งลิงก์เปิด Dashboard ทางอีเมลภายในไม่เกิน 30 นาที"],
];

export default function Landing() {
  return (
    <div>
      <nav style={{ position: "sticky", top: 0, background: "rgba(255,255,255,.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)", zIndex: 50 }}>
        <div className="wrap between" style={{ height: 62 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>BABE <span style={{ color: "var(--blue)" }}>HOUSE</span></div>
          <div className="row"><a href="#price" className="muted" style={{ fontWeight: 600, fontSize: 14 }}>ราคา</a><Link to="/account" className="link" style={{ fontSize: 14 }}>เข้าสู่ระบบ</Link></div>
        </div>
      </nav>

      <header className="center" style={{ background: "linear-gradient(180deg,var(--soft),#fff)", padding: "64px 0 50px" }}>
        <div className="wrap">
          <span style={{ display: "inline-block", background: "#fff", border: "1px solid var(--border)", color: "var(--blue)", fontWeight: 700, fontSize: 13, padding: "7px 16px", borderRadius: 30, marginBottom: 22 }}>🩵 ขับเคลื่อนด้วย AI "ครูพี่คิม"</span>
          <h1 className="serif" style={{ fontSize: "clamp(30px,5.5vw,52px)", lineHeight: 1.18, fontWeight: 800 }}>ทำคอนเทนต์มานาน<br />แต่ <span style={{ color: "var(--blue)" }}>ช่องไม่โตสักที?</span></h1>
          <p className="muted" style={{ fontSize: "clamp(16px,2.4vw,20px)", maxWidth: 640, margin: "18px auto 30px" }}>ยอดวิวนิ่ง · คนตามไม่เพิ่ม · หรือมีคนดูแต่ไม่ซื้อ? ให้ครูพี่คิม (AI) วิเคราะห์ช่องและสถิติหลังบ้านของคุณ แล้ววาง <b>แผนคอนเทนต์ 30 วัน + สคริปต์เต็มทุกวัน</b> ที่ทำให้ช่องโตและเปลี่ยนคนดูเป็นรายได้จริง</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link className="btn" to="/form">สร้างแผนของฉัน · 490฿</Link>
            <Link className="btn ghost" to="/dashboard?demo=1">🎬 ดูตัวอย่างเล่มฟรี</Link>
          </div>
          <p style={{ marginTop: 12, fontSize: 13 }}><Link to="/account" className="link">นักเรียนเก่า? เข้าสู่ระบบที่นี่ →</Link></p>
        </div>
      </header>

      <section style={{ background: "var(--cream)", padding: "56px 0" }}><div className="wrap">
        <p className="center" style={{ color: "var(--blue)", fontWeight: 700, fontSize: 13, letterSpacing: 1, marginBottom: 10 }}>ปัญหาที่ครีเอเตอร์เจอ</p>
        <h2 className="center serif" style={{ fontSize: "clamp(24px,4vw,34px)", marginBottom: 30 }}>คุณกำลังเจอแบบนี้อยู่ไหม?</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
          {probs.map(([ic, h, p]) => <div key={h} className="card" style={{ margin: 0 }}><div style={{ fontSize: 26 }}>{ic}</div><h3 style={{ fontSize: 17, margin: "8px 0 4px" }}>{h}</h3><p className="muted" style={{ fontSize: 14 }}>{p}</p></div>)}
        </div>
      </div></section>

      <section style={{ padding: "56px 0" }}><div className="wrap">
        <p className="center" style={{ color: "var(--blue)", fontWeight: 700, fontSize: 13, letterSpacing: 1, marginBottom: 10 }}>สิ่งที่คุณจะได้รับ</p>
        <h2 className="center serif" style={{ fontSize: "clamp(24px,4vw,34px)", marginBottom: 8 }}>เล่ม Blueprint ส่วนตัวของคุณ</h2>
        <p className="center muted" style={{ maxWidth: 620, margin: "0 auto 36px" }}>ไม่ใช่เทมเพลตสำเร็จรูป — วิเคราะห์จากช่องคุณโดยเฉพาะ</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 18 }}>
          {feats.map(([ic, h, p]) => <div key={h} className="card" style={{ margin: 0 }}><div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 12 }}>{ic}</div><h3 style={{ fontSize: 18, marginBottom: 6 }}>{h}</h3><p className="muted" style={{ fontSize: 14.5 }}>{p}</p></div>)}
        </div>
      </div></section>

      <section style={{ background: "var(--soft)", padding: "56px 0" }}><div className="wrap">
        <h2 className="center serif" style={{ fontSize: "clamp(24px,4vw,34px)", marginBottom: 30 }}>เริ่มได้ใน 3 ขั้น</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 20 }}>
          {[["กรอกข้อมูล + แนบสถิติ", "ตอบ 5 ข้อ + แนบภาพ Insight หลังบ้าน"], ["ครูพี่คิม AI วิเคราะห์", "สร้างแผน 30 วันเฉพาะตัว ส่งทางอีเมล"], ["ลงมือทำ + เห็นผลโต", "ทำตามแผน เดือนถัดไปดูการเติบโต"]].map(([h, p], i) =>
            <div key={h} className="card" style={{ margin: 0 }}><div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--blue)", color: "#fff", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>{i + 1}</div><h3 style={{ fontSize: 18, marginBottom: 6 }}>{h}</h3><p className="muted" style={{ fontSize: 14.5 }}>{p}</p></div>)}
        </div>
      </div></section>

      <section id="price" style={{ padding: "56px 0" }}><div className="wrap">
        <h2 className="center serif" style={{ fontSize: "clamp(24px,4vw,34px)", marginBottom: 30 }}>ลงทุนกับการเติบโตของคุณ</h2>
        <div className="card" style={{ maxWidth: 440, margin: "0 auto", border: "2px solid var(--blue)", borderRadius: 26, textAlign: "center", padding: 34 }}>
          <div style={{ fontSize: 54, fontWeight: 800, color: "var(--blue)", lineHeight: 1 }}>490฿</div>
          <div className="muted" style={{ marginBottom: 18 }}>ต่อเดือน · ยกเลิกเมื่อไหร่ก็ได้</div>
          <ul style={{ listStyle: "none", textAlign: "left", margin: "20px 0 24px" }}>
            {["แผนคอนเทนต์ 30 วัน วิเคราะห์เฉพาะช่องคุณ", "สคริปต์เต็มครบทั้ง 30 วัน", "5 โมดูลปั้นแบรนด์ + SWOT", "เกม Content Marathon", "ติดตามการเติบโต + บทวิเคราะห์รายเดือน", "ดูเล่มย้อนหลังได้ทุกเดือน"].map(x =>
              <li key={x} style={{ padding: "9px 0 9px 28px", position: "relative", fontSize: 15, borderBottom: "1px solid var(--border)" }}><span style={{ position: "absolute", left: 0, color: "var(--blue)", fontWeight: 800 }}>✓</span>{x}</li>)}
          </ul>
          <Link className="btn full" to="/form">เริ่มเลย · 490฿</Link>
        </div>
      </div></section>

      <section style={{ background: "var(--cream)", padding: "56px 0" }}><div className="wrap">
        <h2 className="center serif" style={{ fontSize: "clamp(24px,4vw,34px)", marginBottom: 30 }}>เสียงจากนักเรียน</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
          {[["จากที่คิดคอนเทนต์ไม่ออกทุกวัน ตอนนี้มีแผนชัดเจน ยอดกดลิงก์เพิ่มจริง", "คุณเอ · แบรนด์สกินแคร์"], ["สคริปต์พร้อมอัดเลย ประหยัดเวลาคิดไปเยอะ คุ้มกว่า 490 หลายเท่า", "คุณบี · คาเฟ่"], ["ชอบที่เห็นกราฟการเติบโตทุกเดือน รู้สึกว่ามาถูกทาง", "คุณซี · สอนคอร์สออนไลน์"]].map(([t, w]) =>
            <div key={w} className="card" style={{ margin: 0 }}><div style={{ color: "#f5b301", marginBottom: 8 }}>★★★★★</div><p style={{ fontSize: 14.5 }}>"{t}"</p><div style={{ marginTop: 12, fontWeight: 700, fontSize: 14 }}>{w}</div></div>)}
        </div>
      </div></section>

      <section style={{ padding: "56px 0" }}><div className="wrap narrow">
        <h2 className="center serif" style={{ fontSize: "clamp(24px,4vw,34px)", marginBottom: 26 }}>คำถามที่พบบ่อย</h2>
        {faqs.map(([q, a]) => <details key={q} className="card" style={{ margin: "0 0 10px", padding: "4px 18px" }}><summary style={{ fontWeight: 700, padding: "14px 0", cursor: "pointer" }}>{q}</summary><p className="muted" style={{ padding: "0 0 16px", fontSize: 14.5 }}>{a}</p></details>)}
      </div></section>

      <div className="wrap"><div className="center" style={{ background: "linear-gradient(135deg,var(--blue),var(--blue-d))", color: "#fff", borderRadius: 28, padding: "54px 26px" }}>
        <h2 className="serif" style={{ fontSize: "clamp(24px,4vw,34px)", color: "#fff" }}>พร้อมทำให้ช่องโตอย่างมีระบบแล้วหรือยัง?</h2>
        <p style={{ opacity: .92, maxWidth: 520, margin: "14px auto 26px", fontSize: 17 }}>ให้ครูพี่คิมช่วยวางแผน 30 วันแรก — ดันยอดวิว เพิ่มคนตาม เปลี่ยนคนดูเป็นรายได้</p>
        <Link className="btn" to="/form" style={{ background: "#fff", color: "var(--blue)" }}>สร้างแผนของฉัน · 490฿</Link>
      </div></div>

      <footer className="center muted" style={{ padding: "34px 0", fontSize: 13, borderTop: "1px solid var(--border)", marginTop: 54 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>BABE <span style={{ color: "var(--blue)" }}>HOUSE</span> · Academy</div>
        <Link to="/form" className="muted">สร้างแผน</Link> · <Link to="/account" className="muted">เข้าสู่ระบบ</Link> · <Link to="/privacy" className="muted">นโยบายความเป็นส่วนตัว</Link>
        <p style={{ marginTop: 12 }}>© 2026 Babe House Academy</p>
      </footer>
    </div>
  );
}
