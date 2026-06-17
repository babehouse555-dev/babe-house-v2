import { Link } from "react-router-dom";
export default function NotFound() {
  return (
    <div className="wrap page-pad center" style={{ minHeight: "70vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div className="serif" style={{ fontSize: 88, fontWeight: 700, color: "var(--blue)" }}>404</div>
      <h1 style={{ fontSize: 22, margin: "8px 0 6px" }}>ไม่พบหน้านี้ค่ะ 🩵</h1>
      <p className="muted" style={{ marginBottom: 22 }}>หน้าที่คุณกำลังหาอาจถูกย้ายหรือไม่มีอยู่แล้ว</p>
      <div><Link className="btn" to="/">กลับหน้าแรก</Link></div>
    </div>
  );
}
