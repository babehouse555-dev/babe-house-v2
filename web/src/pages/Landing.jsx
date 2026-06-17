import { Link } from "react-router-dom";

// ===== ราคาเดียวกันทั้งหน้า: เต็ม 1,590฿ (ขีดฆ่า) · โปรเปิดตัว 490฿ (เด่น) =====
const FULL = "1,590฿";
const PROMO = "490฿";
function PriceTag({ big = 52, gap = 12 }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap, flexWrap: "wrap" }}>
      <span style={{ textDecoration: "line-through", color: "var(--muted)", fontSize: Math.round(big * 0.42), fontWeight: 700 }}>{FULL}</span>
      <span style={{ fontSize: big, fontWeight: 800, color: "var(--blue)", lineHeight: 1 }}>{PROMO}</span>
    </div>
  );
}
const PriceReminder = ({ style }) => (
  <p className="center muted" style={{ fontSize: 13, marginTop: 10, ...style }}>
    ราคาเต็ม <span style={{ textDecoration: "line-through" }}>{FULL}</span> · โปรเปิดตัว <b style={{ color: "var(--blue)" }}>{PROMO}</b>
  </p>
);

const probs = [
  ["😮‍💨", "ลงคลิปทุกวันแต่ยอดวิวนิ่ง", "ทำมานานแต่ยอดไม่ขึ้น ไม่รู้อันไหนเวิร์ก"],
  ["📉", "คนติดตามไม่เพิ่ม reach ตก", "คนใหม่ไม่เข้ามา ช่องโตช้า"],
  ["🤔", "คิดคอนเทนต์ไม่ออก", "นั่งคิดทุกวันว่าวันนี้ลงอะไรดี เสียเวลา"],
  ["💸", "มีคนดูแต่ไม่ซื้อ", "ยอดวิวดีแต่เปลี่ยนเป็นรายได้ไม่ได้"],
];
const steps3 = [
  ["📝", "1. กรอกข้อมูลช่องของคุณ", "บอกเราว่าคุณเป็นใคร ทำธุรกิจอะไร ตอนนี้ติดปัญหาอะไร และเดือนนี้อยากโตตรงไหน"],
  ["📊", "2. แนบรูป Insight หลังบ้าน", "แนบได้หลายภาพ เช่น Reach, Profile Visits, Link Taps, Audience, Top Content หรือสถิติที่คุณมี"],
  ["📘", "3. รับ Blueprint 30 วัน", "ระบบจะวิเคราะห์และสร้างแผนคอนเทนต์ พร้อม Hook, Format, Script, Caption และระบบ Marathon ให้คุณเริ่มทำจริง"],
];
const offerIncludes = [
  "วิเคราะห์จุดแข็งและจุดอ่อนของช่อง",
  "วิเคราะห์กลุ่มเป้าหมายและสิ่งที่เขาต้องการ",
  "วิเคราะห์ช่องว่างระหว่างคนดู โปรไฟล์ และยอดกดลิงก์",
  "วาง Theme คอนเทนต์ประจำเดือน",
  "ได้แผนคอนเทนต์ 30 วัน",
  "ได้ Hook และ Format ของแต่ละคลิป",
  "ได้สคริปต์พร้อมถ่ายสำหรับคลิปสำคัญ",
  "ได้แคปชันพร้อมโพสต์",
  "ได้ระบบ 30-Day Marathon ช่วยติดตามความต่อเนื่อง",
  "กลับมาสร้าง Blueprint ใหม่ได้ทุกเดือน เพื่อเทียบการเติบโตและปรับแผนให้แม่นขึ้น",
];
const cardIncludes = [
  "วิเคราะห์ช่องจากข้อมูลจริงของคุณ",
  "แนบ Insight หลังบ้านได้หลายรูป",
  "แผนคอนเทนต์ 30 วัน",
  "Script & Caption พร้อมต่อยอด",
  "Creator Marathon Dashboard",
];
const exampleCards = [
  ["📊", "Executive Snapshot", "สรุปปัญหา โอกาส และสิ่งที่ควรทำทันที แบบอ่านจบใน 30 วินาที"],
  ["📅", "30-Day Content Calendar", "แผนคอนเทนต์ทั้งเดือน แบ่ง Awareness, Branding และ Conversion"],
  ["🎬", "Scripts & Captions", "สคริปต์พร้อมถ่ายและแคปชันที่เอาไปปรับใช้ได้ทันที"],
  ["🏃‍♀️", "Creator Marathon", "ระบบติดตามการลงงาน สะสมดาว และช่วยให้คุณไม่หายไปกลางเดือน"],
];
const aiSelf = ["ต้องคิด prompt เอง", "ต้องวาง funnel เอง", "ต้องเลือกไอเดียเอง", "ต้องจัด calendar เอง", "ต้องเขียน script/caption ต่อเอง"];
const aiBlueprint = ["กรอกข้อมูลครั้งเดียว", "วิเคราะห์จาก Insight จริง", "ได้ Theme รายเดือน", "ได้ Calendar 30 วัน", "ได้ Script/Caption พร้อมต่อยอด"];
const proofPoints = ["คอนเทนต์ไหนดึงคนใหม่", "คอนเทนต์ไหนสร้างความเชื่อใจ", "คอนเทนต์ไหนพาคนเข้าโปรไฟล์", "ตรงไหนคือ Conversion Leak ที่ควรอุด"];
const proofMetrics = ["Reach", "Profile Visits", "Link Taps", "Followers", "Top Content"];
const monthlyCards = [
  ["🌱", "เดือนแรก", "เริ่มรู้จักช่องของคุณ — วางแผนจากข้อมูลจริง ไม่ต้องเดา"],
  ["📈", "เดือนต่อไป", "เห็น pattern การเติบโต ว่าคอนเทนต์ไหนเวิร์ก"],
  ["🎯", "ใช้ต่อเนื่อง", "วางแผนแม่นขึ้นทุกเดือน ระบบยิ่งเข้าใจช่องคุณ"],
];
const faqs = [
  ["ต้องมีผู้ติดตามเยอะไหมถึงใช้ได้?", "ไม่จำเป็นค่ะ ใช้ได้ทั้งคนเริ่มต้นและคนที่ทำคอนเทนต์มาสักพักแล้ว ถ้ามี Insight หลังบ้าน ระบบจะวิเคราะห์ได้ละเอียดขึ้น"],
  ["ถ้าไม่รู้ว่าคู่แข่งคือใครทำยังไง?", "เว้นว่างได้ค่ะ ระบบจะช่วยวิเคราะห์คู่แข่งเชิงตลาดจากประเภทธุรกิจและเป้าหมายของคุณ"],
  ["แนบรูปอะไรได้บ้าง?", "แนบได้หลายภาพ เช่น Reach, Profile Visits, Link Taps, Audience, Top Content, Follower Growth หรือสถิติที่คุณมี"],
  ["หลังจ่ายเงินจะได้อะไร?", "คุณจะได้ Dashboard ส่วนตัวที่มีการวิเคราะห์ช่อง แผนคอนเทนต์ 30 วัน สคริปต์ แคปชัน และระบบติดตาม Marathon"],
  ["ใช้เวลาประมวลผลนานไหม?", "โดยทั่วไปใช้เวลาไม่นาน แต่ขึ้นอยู่กับจำนวนรูปและข้อมูลที่ส่งมา ระหว่างรอระบบจะพาไปหน้า Processing"],
  ["ทำไมควรสร้าง Blueprint ใหม่ทุกเดือน?", "เพราะทุกเดือนช่องของคุณมีข้อมูลใหม่ ระบบจะช่วยอ่านการเปลี่ยนแปลงและปรับแผนให้เหมาะกับการเติบโตเดือนถัดไป"],
  ["ราคา 490฿ เป็นราคาปกติไหม?", "490฿ เป็นโปรเปิดตัวจากราคาเต็ม 1,590฿ สำหรับช่วงเปิดตัวเท่านั้น"],
];

const labelStyle = { color: "var(--blue)", fontWeight: 700, fontSize: 13, letterSpacing: 1, marginBottom: 10 };
const h2Style = { fontSize: "clamp(23px,4vw,33px)", marginBottom: 12, lineHeight: 1.25 };

export default function Landing() {
  return (
    <div>
      <nav style={{ position: "sticky", top: 0, background: "rgba(255,255,255,.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)", zIndex: 50 }}>
        <div className="wrap between" style={{ height: 60 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>BABE <span style={{ color: "var(--blue)" }}>HOUSE</span></div>
          <div className="row" style={{ gap: 16 }}><a href="#offer" className="muted" style={{ fontWeight: 600, fontSize: 14 }}>โปรเปิดตัว</a><Link to="/account" className="link" style={{ fontSize: 14 }}>เข้าสู่ระบบ</Link></div>
        </div>
      </nav>

      {/* 1. HERO */}
      <header className="center" style={{ background: "linear-gradient(180deg,var(--soft),#fff)", padding: "52px 0 46px" }}>
        <div className="wrap narrow">
          <span style={{ display: "inline-block", background: "#fff", border: "1px solid var(--border)", color: "var(--blue)", fontWeight: 700, fontSize: 13, padding: "7px 16px", borderRadius: 30, marginBottom: 20 }}>🩵 โปรเปิดตัว — กลุ่มแรกเท่านั้น</span>
          <h1 className="serif" style={{ fontSize: "clamp(28px,5.4vw,46px)", lineHeight: 1.2, fontWeight: 800 }}>ทำคอนเทนต์มานาน<br />แต่ <span style={{ color: "var(--blue)" }}>ช่องไม่โตสักที?</span></h1>
          <p className="muted" style={{ fontSize: "clamp(15px,2.2vw,18px)", maxWidth: 600, margin: "16px auto 22px" }}>ให้ครูพี่คิมอ่าน <b>Insight หลังบ้าน</b> ของคุณ แล้ววาง <b>แผนคอนเทนต์ 30 วัน + สคริปต์และแคปชันพร้อมใช้</b> — เปลี่ยนคนดูให้กลายเป็นยอดติดตามและยอดขาย</p>
          <PriceTag big={52} />
          <p className="muted" style={{ fontSize: 13, margin: "8px 0 24px" }}>สำหรับช่วงเปิดตัวเท่านั้น</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link className="btn" to="/form">จ่าย {PROMO} เพื่อสร้าง Blueprint ของฉัน</Link>
            <Link className="btn ghost" to="/dashboard?demo=1">ดูตัวอย่างผลลัพธ์ก่อน</Link>
          </div>
          <p style={{ marginTop: 14, fontSize: 13 }}><Link to="/account" className="link">นักเรียนเก่า? เข้าสู่ระบบที่นี่ →</Link></p>
        </div>
      </header>

      {/* 2. PAIN POINT */}
      <section style={{ background: "var(--cream)", padding: "50px 0" }}><div className="wrap">
        <h2 className="center serif" style={{ ...h2Style, marginBottom: 26 }}>คุณกำลังเจอแบบนี้อยู่ไหม?</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
          {probs.map(([ic, h, p]) => <div key={h} className="card" style={{ margin: 0 }}><div style={{ fontSize: 26 }}>{ic}</div><h3 style={{ fontSize: 16.5, margin: "8px 0 4px" }}>{h}</h3><p className="muted" style={{ fontSize: 14 }}>{p}</p></div>)}
        </div>
      </div></section>

      {/* 3. HOW IT WORKS */}
      <section style={{ padding: "52px 0" }}><div className="wrap">
        <p className="center" style={labelStyle}>ใช้งานยังไง?</p>
        <h2 className="center serif" style={{ ...h2Style, marginBottom: 30 }}>3 ขั้นตอน ง่ายๆ</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 18 }}>
          {steps3.map(([ic, h, p]) => <div key={h} className="card" style={{ margin: 0 }}><div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 12 }}>{ic}</div><h3 style={{ fontSize: 17.5, marginBottom: 6 }}>{h}</h3><p className="muted" style={{ fontSize: 14.5 }}>{p}</p></div>)}
        </div>
        <p className="center muted" style={{ fontSize: 14, marginTop: 22 }}>ยิ่งกรอกละเอียด ยิ่งได้ Blueprint ที่แม่นขึ้น แต่ถ้าไม่รู้บางข้อ เว้นว่างได้ค่ะ</p>
      </div></section>

      {/* 4. โปรเปิดตัว 490 ได้อะไรบ้าง */}
      <section style={{ background: "var(--soft)", padding: "52px 0" }}><div className="wrap narrow">
        <h2 className="center serif" style={h2Style}>โปรเปิดตัว {PROMO} ได้อะไรบ้าง?</h2>
        <p className="center muted" style={{ maxWidth: 600, margin: "0 auto 28px", fontSize: 15 }}>จากราคาเต็ม <span style={{ textDecoration: "line-through" }}>{FULL}</span> ช่วงเปิดตัวนี้คุณจะได้ Blueprint วิเคราะห์ช่องและวางแผนคอนเทนต์ทั้งเดือนในราคา <b style={{ color: "var(--blue)" }}>{PROMO}</b></p>
        <div className="card" style={{ maxWidth: 600, margin: "0 auto" }}>
          <ul style={{ listStyle: "none", margin: 0 }}>
            {offerIncludes.map((x, i) => <li key={i} style={{ padding: "10px 0 10px 30px", position: "relative", fontSize: 15, borderBottom: i < offerIncludes.length - 1 ? "1px solid var(--border)" : "none" }}><span style={{ position: "absolute", left: 0, color: "var(--blue)", fontWeight: 800 }}>✓</span>{x}</li>)}
          </ul>
        </div>
        <p className="center" style={{ fontWeight: 700, fontSize: 15.5, margin: "24px auto 18px", maxWidth: 560 }}>ถ้าคุณเสียเวลาคิดคอนเทนต์ทั้งเดือนมากกว่า 1 ชั่วโมง โปรเปิดตัว {PROMO} นี้คุ้มมากค่ะ</p>
        <div className="center"><Link className="btn" to="/form">รับโปรเปิดตัว {PROMO}</Link></div>
      </div></section>

      {/* 5. LAUNCH OFFER PRICE CARD */}
      <section id="offer" style={{ padding: "52px 0" }}><div className="wrap">
        <p className="center" style={labelStyle}>LAUNCH OFFER</p>
        <h2 className="center serif" style={{ ...h2Style, marginBottom: 26 }}>โปรเปิดตัว สำหรับกลุ่มแรก</h2>
        <div className="card" style={{ maxWidth: 430, margin: "0 auto", border: "2px solid var(--blue)", borderRadius: 26, textAlign: "center", padding: "32px 28px", boxShadow: "0 14px 40px rgba(46,134,222,.18)" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Babe House AI Creator Blueprint</div>
          <div style={{ margin: "16px 0 6px" }}><PriceTag big={56} /></div>
          <div style={{ display: "inline-block", background: "#E8F5EE", color: "var(--up)", fontWeight: 700, fontSize: 13.5, padding: "5px 14px", borderRadius: 20, marginBottom: 18 }}>ประหยัด 1,100฿ ในช่วงเปิดตัว</div>
          <ul style={{ listStyle: "none", textAlign: "left", margin: "6px 0 22px" }}>
            {cardIncludes.map((x) => <li key={x} style={{ padding: "9px 0 9px 28px", position: "relative", fontSize: 15, borderBottom: "1px solid var(--border)" }}><span style={{ position: "absolute", left: 0, color: "var(--blue)", fontWeight: 800 }}>✓</span>{x}</li>)}
          </ul>
          <Link className="btn full" to="/form">จ่าย {PROMO} เพื่อปลดล็อก Blueprint</Link>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>โปรเปิดตัวสำหรับผู้ใช้กลุ่มแรกเท่านั้น</p>
        </div>
      </div></section>

      {/* 6. ตัวอย่าง Blueprint */}
      <section style={{ background: "var(--cream)", padding: "52px 0" }}><div className="wrap">
        <p className="center" style={labelStyle}>ตัวอย่างผลลัพธ์</p>
        <h2 className="center serif" style={{ ...h2Style, marginBottom: 28 }}>ตัวอย่าง Blueprint ที่คุณจะได้รับ</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 16 }}>
          {exampleCards.map(([ic, h, p]) => <div key={h} className="card" style={{ margin: 0 }}><div style={{ width: 46, height: 46, borderRadius: 13, background: "var(--soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 11 }}>{ic}</div><h3 style={{ fontSize: 16.5, marginBottom: 5 }}>{h}</h3><p className="muted" style={{ fontSize: 14 }}>{p}</p></div>)}
        </div>
        <div className="center" style={{ marginTop: 28 }}>
          <Link className="btn ghost" to="/dashboard?demo=1">ดูตัวอย่าง Dashboard</Link>
          <Link className="btn" to="/form" style={{ marginLeft: 6 }}>ลองสร้างแผนของช่องฉันในราคาโปร {PROMO}</Link>
        </div>
      </div></section>

      {/* 7. ต่างจากใช้ AI เองยังไง */}
      <section style={{ padding: "52px 0" }}><div className="wrap narrow">
        <h2 className="center serif" style={{ ...h2Style, marginBottom: 18 }}>ต่างจากการใช้ AI เองยังไง?</h2>
        <p className="muted center" style={{ fontSize: 15, marginBottom: 8 }}>ใช้ AI เองได้ค่ะ แต่หลายคนยังเหนื่อย เพราะยังต้องคิด prompt เอง วางกลุ่มเป้าหมายเอง เลือกหัวข้อเอง และจัด calendar เอง</p>
        <p className="center" style={{ fontSize: 15, marginBottom: 26 }}>Blueprint ต่างออกไป เพราะเราใส่ <b>workflow การทำคอนเทนต์ของ Babe House</b> ไว้ในระบบแล้ว — คุณไม่ต้องเริ่มจากหน้าว่างๆ แค่กรอกข้อมูลครั้งเดียว ระบบจะช่วยจัดออกมาเป็นแผนที่พร้อมใช้</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
          <div className="card" style={{ margin: 0, background: "var(--soft)" }}>
            <div style={{ fontWeight: 800, marginBottom: 12, fontSize: 15 }}>😓 ใช้ AI เอง</div>
            {aiSelf.map((x) => <div key={x} style={{ fontSize: 14.5, padding: "6px 0", color: "var(--muted)" }}>✗ {x}</div>)}
          </div>
          <div className="card" style={{ margin: 0, border: "2px solid var(--blue)" }}>
            <div style={{ fontWeight: 800, marginBottom: 12, fontSize: 15, color: "var(--blue-d)" }}>🩵 ใช้ Blueprint</div>
            {aiBlueprint.map((x) => <div key={x} style={{ fontSize: 14.5, padding: "6px 0" }}><span style={{ color: "var(--blue)", fontWeight: 800 }}>✓</span> {x}</div>)}
          </div>
        </div>
        <p className="center" style={{ fontSize: 14.5, marginTop: 22, fontStyle: "italic", color: "var(--blue-d)" }}>นี่ไม่ใช่ AI เปล่าๆ แต่เป็น AI ที่ออกแบบมาเพื่อคนทำคอนเทนต์โดยเฉพาะ</p>
      </div></section>

      {/* 8. PROOF */}
      <section style={{ background: "var(--soft)", padding: "52px 0" }}><div className="wrap narrow">
        <h2 className="center serif" style={{ ...h2Style, marginBottom: 16 }}>ทดลองกับช่องจริงก่อนเปิดขาย</h2>
        <p className="muted center" style={{ fontSize: 15, marginBottom: 8 }}>ก่อนเปิดให้ทุกคนใช้ Babe House ทดลอง framework นี้กับช่องของเราเองก่อน เราเห็นชัดว่าเมื่อหยุดเดา แล้วเริ่มวางคอนเทนต์จากข้อมูลจริง เราจะรู้มากขึ้นว่า:</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, margin: "20px 0" }}>
          {proofPoints.map((x) => <div key={x} className="card" style={{ margin: 0, padding: "14px 16px", fontSize: 14.5 }}><span style={{ color: "var(--blue)", fontWeight: 800 }}>✓</span> {x}</div>)}
        </div>
        <p className="center" style={{ fontSize: 14.5, marginBottom: 18 }}>Blueprint คือการเอาวิธีคิดนี้มาช่วยวิเคราะห์ช่องของคุณ ในแบบที่เข้าใจง่ายและลงมือทำต่อได้จริง</p>
        <div className="row" style={{ justifyContent: "center", gap: 8 }}>
          {proofMetrics.map((m) => <span key={m} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 20, padding: "7px 14px", fontSize: 13, fontWeight: 600 }}>{m}</span>)}
        </div>
      </div></section>

      {/* 9. ทำไมควรสร้าง Blueprint ใหม่ทุกเดือน */}
      <section style={{ padding: "52px 0" }}><div className="wrap">
        <h2 className="center serif" style={{ ...h2Style, marginBottom: 16 }}>ทำไมควรสร้าง Blueprint ใหม่ทุกเดือน?</h2>
        <p className="muted center" style={{ fontSize: 15, maxWidth: 640, margin: "0 auto 10px" }}>คอนเทนต์ไม่ใช่งานที่วางแผนครั้งเดียวแล้วจบค่ะ — เดือนนี้คนอาจชอบ topic หนึ่ง เดือนหน้า trend อาจเปลี่ยน บางเดือน reach ดีแต่กดลิงก์น้อย บางเดือนคนดูเยอะแต่ยังไม่เชื่อใจพอจะซื้อ</p>
        <p className="center" style={{ fontSize: 15, maxWidth: 640, margin: "0 auto 28px" }}>ยิ่งคุณกลับมาสร้าง Blueprint ใหม่ทุกเดือน ระบบยิ่งเข้าใจช่องของคุณมากขึ้น</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
          {monthlyCards.map(([ic, h, p]) => <div key={h} className="card" style={{ margin: 0 }}><div style={{ fontSize: 26 }}>{ic}</div><h3 style={{ fontSize: 16.5, margin: "8px 0 4px" }}>{h}</h3><p className="muted" style={{ fontSize: 14 }}>{p}</p></div>)}
        </div>
        <div className="center" style={{ marginTop: 28 }}><Link className="btn" to="/form">เริ่มเดือนแรกในราคาโปร {PROMO}</Link></div>
      </div></section>

      {/* 10. FAQ */}
      <section style={{ background: "var(--cream)", padding: "52px 0" }}><div className="wrap narrow">
        <h2 className="center serif" style={{ ...h2Style, marginBottom: 24 }}>คำถามที่พบบ่อย</h2>
        {faqs.map(([q, a]) => <details key={q} className="card" style={{ margin: "0 0 10px", padding: "4px 18px" }}><summary style={{ fontWeight: 700, padding: "14px 0", cursor: "pointer" }}>{q}</summary><p className="muted" style={{ padding: "0 0 16px", fontSize: 14.5 }}>{a}</p></details>)}
      </div></section>

      {/* 11. FINAL CTA */}
      <section style={{ padding: "52px 0" }}><div className="wrap"><div className="center" style={{ background: "linear-gradient(135deg,var(--blue),var(--blue-d))", color: "#fff", borderRadius: 28, padding: "48px 26px" }}>
        <h2 className="serif" style={{ fontSize: "clamp(23px,4vw,32px)", color: "#fff" }}>พร้อมวางแผนคอนเทนต์ทั้งเดือนแล้วหรือยัง?</h2>
        <p style={{ opacity: .92, maxWidth: 520, margin: "12px auto 8px", fontSize: 16 }}>กรอกข้อมูลครั้งเดียว รับแผน 30 วัน พร้อมสคริปต์และแคปชัน</p>
        <div style={{ margin: "8px 0 18px" }}>
          <span style={{ textDecoration: "line-through", opacity: .75, fontSize: 18, fontWeight: 700, marginRight: 10 }}>{FULL}</span>
          <span style={{ fontSize: 40, fontWeight: 800 }}>{PROMO}</span>
        </div>
        <Link className="btn" to="/form" style={{ background: "#fff", color: "var(--blue)" }}>จ่าย {PROMO} เพื่อสร้าง Blueprint ของฉัน</Link>
        <p style={{ opacity: .88, fontSize: 12.5, marginTop: 16, maxWidth: 460, marginInline: "auto", lineHeight: 1.6 }}>ข้อมูลของคุณใช้เพื่อสร้าง Blueprint ส่วนตัวเท่านั้น · หากระบบประมวลผลไม่สำเร็จ ทีม Babe House จะช่วยตรวจสอบและออก Blueprint ให้ใหม่ค่ะ</p>
      </div></div></section>

      <footer className="center muted" style={{ padding: "34px 0", fontSize: 13, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>BABE <span style={{ color: "var(--blue)" }}>HOUSE</span> · Academy</div>
        <Link to="/form" className="muted">สร้าง Blueprint</Link> · <Link to="/account" className="muted">เข้าสู่ระบบ</Link> · <Link to="/privacy" className="muted">นโยบายความเป็นส่วนตัว</Link>
        <p style={{ marginTop: 12 }}>© 2026 Babe House Academy</p>
      </footer>
    </div>
  );
}
