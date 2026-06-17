import { Link } from "react-router-dom";
export default function Privacy() {
  return (
    <div className="wrap narrow page-pad">
      <div className="brand">BABE HOUSE · ACADEMY</div>
      <h1 className="page">นโยบายความเป็นส่วนตัว</h1>
      <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>สอดคล้องกับ พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)</p>
      <div className="card" style={{ background: "var(--soft)" }}>โดยสรุป: เราเก็บข้อมูลที่คุณกรอกและรูปสถิติ เพื่อให้ AI วิเคราะห์และสร้างแผนคอนเทนต์เฉพาะตัวให้คุณเท่านั้น ไม่ขายข้อมูลให้บุคคลที่สาม</div>
      <h3 style={{ margin: "18px 0 6px" }}>1. ข้อมูลที่เราเก็บ</h3>
      <p className="muted">อีเมล, บัญชี Instagram/TikTok, ข้อมูลธุรกิจ/เป้าหมาย/ปัญหา, รูปสถิติหลังบ้าน, ข้อมูลการชำระเงิน (ผ่าน Stripe — เราไม่เก็บเลขบัตร)</p>
      <h3 style={{ margin: "18px 0 6px" }}>2. การใช้ข้อมูล</h3>
      <p className="muted">วิเคราะห์สร้างแผนเฉพาะตัว, ติดตามการเติบโต, ส่งลิงก์/แจ้งเตือนทางอีเมล, ปรับปรุงบริการ</p>
      <h3 style={{ margin: "18px 0 6px" }}>3. การประมวลผลด้วย AI</h3>
      <p className="muted">ข้อมูลและรูปถูกส่งไปประมวลผลกับผู้ให้บริการ AI (Google Gemini) เท่าที่จำเป็นต่อการวิเคราะห์</p>
      <h3 style={{ margin: "18px 0 6px" }}>4. สิทธิของคุณ (PDPA)</h3>
      <p className="muted">ขอเข้าถึง แก้ไข ลบ คัดค้าน หรือถอนความยินยอมได้ทุกเมื่อ ติดต่อ babehouse555@gmail.com</p>
      <p style={{ marginTop: 28 }}><Link className="link" to="/">← กลับหน้าแรก</Link></p>
    </div>
  );
}
