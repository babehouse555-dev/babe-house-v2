import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";

// ประกาศนียบัตร — ทำตามดีไซน์จริงที่คิมใช้อยู่ (Canva: แถบฟ้าซ้าย + ชื่อในกรอบมนขวา + ลายเซ็นครูพี่คิม)
// สาธารณะด้วย cert_id (เดาไม่ได้) เพื่อให้ลูกค้าแชร์/พิมพ์ได้ · ไม่มีข้อมูลอ่อนไหวนอกจากชื่อ+คอร์ส
const BLUE = "#2E86DE";

export default function AcademyCertificate() {
  const { id } = useParams();
  const [cert, setCert] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => { api(`/api/academy/certificate/${id}`).then(d => setCert(d.cert)).catch(() => setErr(true)); }, [id]);

  if (err) return <div className="wrap narrow page-pad center"><p className="muted">ไม่พบประกาศนียบัตรนี้ค่ะ</p></div>;
  if (!cert) return <div className="wrap narrow page-pad center"><p className="muted">กำลังโหลด...</p></div>;

  const d = new Date(cert.issued_at);
  const monthEn = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const dateTh = d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div style={{ minHeight: "100vh", padding: "26px 14px 40px", background: "var(--soft)" }}>
      <div id="cert" style={{ maxWidth: 900, margin: "0 auto", background: "#fff", borderRadius: 14, overflow: "hidden",
        display: "grid", gridTemplateColumns: "38% 62%", boxShadow: "0 18px 50px rgba(46,134,222,.16)" }} className="cert-grid">

        {/* ── แถบฟ้าด้านซ้าย ── */}
        <div style={{ background: BLUE, color: "#fff", padding: "clamp(22px,3.4vw,38px)", position: "relative", overflow: "hidden" }}>
          {/* ลายกราฟิกจางๆ ด้านหลัง ให้ไม่โล่งเกินไป */}
          <div aria-hidden style={{ position: "absolute", right: -70, top: -70, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,.07)" }} />
          <div aria-hidden style={{ position: "absolute", right: -30, bottom: -90, width: 190, height: 190, borderRadius: 40, background: "rgba(255,255,255,.05)", transform: "rotate(20deg)" }} />

          <div style={{ position: "relative" }}>
            {/* โลโก้บ้าน */}
            <svg width="46" height="46" viewBox="0 0 48 48" fill="none" aria-hidden>
              <path d="M24 6 L42 20 V42 H30 V30 H18 V42 H6 V20 Z" fill="#fff" />
              <circle cx="24" cy="21" r="4.6" fill={BLUE} />
            </svg>
            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 1.4, marginTop: 6, opacity: .95 }}>babe house</div>

            <div className="serif" style={{ fontSize: "clamp(24px,3.6vw,38px)", fontWeight: 800, lineHeight: 1.15, margin: "clamp(20px,3vw,34px) 0 clamp(16px,2.4vw,26px)" }}>
              Certificate of<br />Participation
            </div>

            {/* แคปซูลขาว = ชื่อคอร์ส */}
            <div style={{ background: "#fff", borderRadius: 999, padding: "10px 18px", textAlign: "center", color: "var(--ink)" }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.2, color: BLUE }}>BABE HOUSE</div>
              <div style={{ fontSize: "clamp(12px,1.5vw,14.5px)", fontWeight: 800, lineHeight: 1.3, marginTop: 1 }}>{cert.course_name}</div>
            </div>

            <div style={{ marginTop: "clamp(22px,3.4vw,40px)", fontSize: 12.5, fontWeight: 800, letterSpacing: .6 }}>BABE HOUSE ACADEMY</div>
            <div style={{ fontSize: 12.5, marginTop: 5, opacity: .95 }}>{monthEn}</div>
          </div>
        </div>

        {/* ── ฝั่งขวา สีขาว ── */}
        <div style={{ padding: "clamp(24px,3.6vw,44px)", display: "flex", flexDirection: "column" }}>
          <div className="muted" style={{ fontSize: 13, textAlign: "center" }}>This certificate is dedicated to:</div>

          <div style={{ border: `2px solid ${BLUE}`, borderRadius: 999, padding: "clamp(11px,1.6vw,15px) 20px", margin: "clamp(12px,1.8vw,18px) 0 clamp(16px,2.4vw,26px)", textAlign: "center" }}>
            <span className="serif" style={{ fontSize: "clamp(19px,2.9vw,28px)", fontWeight: 800, color: BLUE, lineHeight: 1.25, wordBreak: "break-word" }}>{cert.student_name}</span>
          </div>

          <p style={{ fontSize: "clamp(12.5px,1.35vw,14px)", lineHeight: 1.85, margin: 0, color: "var(--ink)" }}>
            We give this certificate as a sign that you have attended <b>{cert.course_name}</b> Organized on {monthEn}.
            Hopefully, the knowledge from this course can be useful.
          </p>
          <p style={{ fontSize: "clamp(12.5px,1.35vw,14px)", lineHeight: 1.85, margin: "12px 0 0" }}>wish you success your life</p>

          <div style={{ marginTop: "auto", paddingTop: "clamp(20px,3vw,34px)" }}>
            <div style={{ fontFamily: "'Snell Roundhand','Apple Chancery',cursive", fontSize: "clamp(21px,2.8vw,27px)", color: "#1a1a1a", lineHeight: 1 }}>กัญจน์ชญา</div>
            <div style={{ borderBottom: "1px solid #d8b24a", width: "min(230px,80%)", margin: "7px 0 6px" }} />
            <div style={{ fontSize: "clamp(12px,1.3vw,13.5px)", fontWeight: 700 }}>Kanchaya Arthan</div>
            <div className="muted" style={{ fontSize: "clamp(11px,1.2vw,12.5px)" }}>Founder Of Babe House Academy</div>
          </div>
        </div>
      </div>

      <div className="center no-print" style={{ marginTop: 22 }}>
        <button className="btn" onClick={() => window.print()}>🖨️ พิมพ์ / บันทึกเป็น PDF</button>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          ออกให้เมื่อ {dateTh} · รหัส {cert.cert_id}
        </div>
      </div>

      <style>{`
        @media (max-width: 640px){ .cert-grid{ grid-template-columns: 1fr !important; } }
        @media print {
          body * { visibility: hidden; }
          #cert, #cert * { visibility: visible; }
          #cert { position: absolute; inset: 0; margin: 0; box-shadow: none; border-radius: 0; grid-template-columns: 38% 62% !important; }
          .no-print { display: none; }
          @page { size: landscape; margin: 0; }
        }
      `}</style>
    </div>
  );
}
