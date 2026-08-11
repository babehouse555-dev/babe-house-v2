import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, session } from "../api.js";

// 🧾 สำเนาใบกำกับภาษี — ลูกค้าเปิดเองจากหน้าบัญชี แล้วสั่งพิมพ์/บันทึกเป็น PDF ได้
//
// ทำไมต้องมี (คิมสั่ง 4 ส.ค.): "เวลาฉันไปขอใบกำกับที่เป็นเมล เขาส่งมาแล้วฉันชอบลืม"
// ตอนที่ต้องใช้จริงคือปิดบัญชีสิ้นปี ห่างจากวันซื้อเป็นเดือน — กล่องเมลหาไม่เจอแล้ว
//
// ⚠️ ขึ้นคำว่า "สำเนา" เสมอ — ต้นฉบับคือใบที่ออกจากระบบบัญชีและส่งทางอีเมล
//    ตามหลักบัญชีไทย ใบกำกับภาษีต้นฉบับออกได้ใบเดียว ที่พิมพ์ซ้ำต้องระบุว่าเป็นสำเนา

const money = (satang) => "฿" + (Number(satang || 0) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thDate = (d) => d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }) : "-";

export default function Invoice() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!session.token) { setErr("เข้าสู่ระบบก่อนนะคะ"); return; }
    api("/api/me/tax-invoices", { token: session.token })
      .then(d => {
        const inv = (d.invoices || []).find(x => x.invoice_id === id);
        if (!inv) { setErr("ไม่พบใบกำกับใบนี้ในบัญชีของคุณค่ะ"); return; }
        setData({ inv, seller: d.seller || {} });
      })
      .catch(e => setErr(e.message || "โหลดไม่สำเร็จ"));
  }, [id]);

  if (err) return <div className="wrap narrow page-pad"><div className="card center">
    <p style={{ marginBottom: 16 }}>{err}</p><Link className="btn" to="/account">กลับหน้าบัญชีของฉัน</Link>
  </div></div>;
  if (!data) return <div className="wrap narrow page-pad center"><div className="spinner" /></div>;

  const { inv, seller } = data;
  const line = (k, v) => <div className="between" style={{ padding: "7px 0", fontSize: 14 }}>
    <span className="muted">{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
  </div>;

  return (
    <div className="wrap narrow page-pad">
      {/* ปุ่มพวกนี้ไม่ต้องติดไปกับกระดาษตอนพิมพ์ */}
      <div className="row no-print" style={{ gap: 10, marginBottom: 16 }}>
        <Link className="btn ghost" to="/account">← บัญชีของฉัน</Link>
        <button className="btn" onClick={() => window.print()}>🖨️ พิมพ์ / บันทึกเป็น PDF</button>
      </div>

      {!seller.ready && <div className="msg no-print" style={{ background: "#FFF4E5", color: "#8a5a00", marginBottom: 14, lineHeight: 1.7 }}>
        ⚠️ ยังตั้งค่าข้อมูลบริษัทผู้ออกใบไม่ครบ — สำเนานี้ยังใช้ยื่นภาษีไม่ได้ค่ะ
        ใบกำกับตัวจริงส่งให้ทางอีเมลแล้ว ถ้าหาไม่เจอทักทีมงานได้เลยนะคะ
      </div>}

      <div className="card" style={{ padding: 28 }}>
        <div className="between" style={{ alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div className="brand" style={{ marginBottom: 6 }}>BABE HOUSE</div>
            <div style={{ fontWeight: 800, fontSize: 19 }}>ใบกำกับภาษี / ใบเสร็จรับเงิน</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>(สำเนา)</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 13 }}>
            <div className="muted">เลขที่</div>
            <div style={{ fontWeight: 700 }}>{inv.doc_number || "รอออกเลขที่"}</div>
            <div className="muted" style={{ marginTop: 6 }}>วันที่</div>
            <div style={{ fontWeight: 700 }}>{thDate(inv.doc_date || inv.issued_at || inv.created_at)}</div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 18, gridTemplateColumns: "1fr 1fr", marginBottom: 20 }}>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>ผู้ขาย</div>
            <div style={{ fontSize: 14, lineHeight: 1.7 }}>
              <b>{seller.name || "— ยังไม่ได้ตั้งค่า —"}</b><br />
              {seller.tax_id && <>เลขประจำตัวผู้เสียภาษี {seller.tax_id}<br /></>}
              {seller.branch && <>{seller.branch}<br /></>}
              {/* ที่อยู่ตั้งใน Railway เป็นบรรทัดเดียว คั่นแต่ละบรรทัดด้วย | เพื่อให้หน้าตาตรงกับใบตัวจริง */}
              {String(seller.address || "").split("|").map((ln, i) => <span key={i}>{ln.trim()}<br /></span>)}
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>ผู้ซื้อ</div>
            <div style={{ fontSize: 14, lineHeight: 1.7 }}>
              <b>{inv.customer_name}</b><br />
              {inv.is_company && inv.tax_id && <>เลขประจำตัวผู้เสียภาษี {inv.tax_id}<br /></>}
              {inv.is_company && inv.branch && <>{inv.branch}<br /></>}
              {inv.address}
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "12px 0", marginBottom: 12 }}>
          <div className="between" style={{ fontSize: 14, fontWeight: 600 }}>
            <span>{inv.description || "สินค้า/บริการ"}</span><span>{money(inv.net_satang)}</span>
          </div>
        </div>

        {line("มูลค่าก่อนภาษี", money(inv.net_satang))}
        {line("ภาษีมูลค่าเพิ่ม 7%", money(inv.vat_satang))}
        <div className="between" style={{ padding: "12px 0 0", borderTop: "2px solid var(--ink)", marginTop: 6 }}>
          <span style={{ fontWeight: 800 }}>รวมทั้งสิ้น</span>
          <span style={{ fontWeight: 800, fontSize: 20, color: "var(--blue-d)" }}>{money(inv.amount_satang)}</span>
        </div>

        <p className="muted" style={{ fontSize: 11.5, marginTop: 22, lineHeight: 1.7 }}>
          เอกสารนี้เป็นสำเนาที่พิมพ์จากระบบ — ต้นฉบับออกจากระบบบัญชีและส่งให้ทางอีเมลแล้ว
          {inv.receipt_number && <> · เลขที่ใบเสร็จ {inv.receipt_number}</>}
        </p>
      </div>
    </div>
  );
}
