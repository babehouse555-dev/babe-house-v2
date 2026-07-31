import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";

// ประกาศนียบัตร (สาธารณะด้วย cert_id — พิมพ์/แชร์ได้) ออกอัตโนมัติเมื่อเรียนจบ 100%
export default function AcademyCertificate() {
  const { id } = useParams();
  const [cert, setCert] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => { api(`/api/academy/certificate/${id}`).then(d => setCert(d.cert)).catch(() => setErr(true)); }, [id]);

  if (err) return <div className="wrap narrow page-pad center"><p className="muted">ไม่พบประกาศนียบัตรนี้ค่ะ</p></div>;
  if (!cert) return <div className="wrap narrow page-pad center"><p className="muted">กำลังโหลด...</p></div>;

  const d = new Date(cert.issued_at);
  const dateTxt = d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div style={{ minHeight: "100vh", padding: "30px 14px", background: "var(--soft)" }}>
      <div id="cert" style={{ maxWidth: 820, margin: "0 auto", background: "#fff", border: "3px double var(--blue)", borderRadius: 8, padding: "clamp(28px,6vw,64px)", textAlign: "center", boxShadow: "0 18px 50px rgba(46,134,222,.14)" }}>
        <div style={{ fontWeight: 800, letterSpacing: 3, fontSize: 14, color: "var(--blue)" }}>BABE HOUSE ACADEMY</div>
        <div className="serif" style={{ fontSize: "clamp(22px,4vw,34px)", fontWeight: 800, margin: "18px 0 6px" }}>Certificate of Completion</div>
        <div className="muted" style={{ fontSize: 14 }}>ประกาศนียบัตรฉบับนี้มอบให้เพื่อรับรองว่า</div>
        <div className="serif" style={{ fontSize: "clamp(26px,5vw,40px)", fontWeight: 800, margin: "22px 0", color: "var(--blue)" }}>{cert.student_name}</div>
        <div style={{ fontSize: 15, lineHeight: 1.7 }}>ได้เรียนจบหลักสูตร</div>
        <div style={{ fontWeight: 800, fontSize: "clamp(17px,2.6vw,22px)", margin: "8px 0 22px" }}>{cert.course_name}</div>
        <div className="muted" style={{ fontSize: 13.5 }}>ออกให้เมื่อวันที่ {dateTxt}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 44, gap: 12 }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "left" }}>Certificate ID<br />{cert.cert_id}</div>
          <div style={{ textAlign: "center" }}>
            <div className="serif" style={{ fontSize: 22, fontWeight: 800 }}>Babe House</div>
            <div style={{ borderTop: "1.5px solid var(--ink)", marginTop: 4, paddingTop: 5, fontSize: 12.5 }}>Babe House Academy</div>
          </div>
        </div>
      </div>
      <div className="center no-print" style={{ marginTop: 20 }}>
        <button className="btn" onClick={() => window.print()}>🖨️ พิมพ์ / บันทึกเป็น PDF</button>
      </div>
      <style>{`@media print { body * { visibility: hidden; } #cert, #cert * { visibility: visible; } #cert { position: absolute; inset: 0; margin: 0; box-shadow: none; } .no-print { display: none; } }`}</style>
    </div>
  );
}
