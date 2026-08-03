import { useState, useEffect } from "react";
import { api } from "./api.js";

// ═══════ 💳 การ์ดเลือกแพ็ก — ใช้ทั้งหน้าแรกและหน้าจ่ายเงิน ═══════
// คิมสั่ง 3 ส.ค.: "ฉันชอบราคาแบบแนวตั้งมากกว่า ให้เห็นรายละเอียดชัดๆ เหมือนตอนที่ทำคลับ"
// → การ์ดสูง ราคาตัวใหญ่ รายการ ✓ ครบ ปุ่มเต็มความกว้าง (สไตล์เดียวกับหน้า Plans ของ Club)
//
// ⚠️ ทุกแพ็กได้ฟีเจอร์เหมือนกันหมด — ที่ต่างคือ "ราคาต่อเดือน" กับ "ไม่ต้องจ่ายซ้ำ"
//    ห้ามเขียนให้ลูกค้าเข้าใจผิดว่ารายเดือนได้ของน้อยกว่า

const BLUE = "var(--blue)";

const FEATURES = {
  monthly: {
    tag: null, sub: "ลองก่อนได้ ไม่ผูกมัด",
    items: [
      ["✓", "วิเคราะห์ช่องเจาะลึก + 5 โมดูลปั้นแบรนด์"],
      ["✓", "แผนคอนเทนต์ 30 วัน พร้อมสคริปต์ทุกวัน"],
      ["✓", "แคปชัน · วิธีถ่าย · ฮุก 3 วิแรก ครบทุกคลิป"],
      ["✓", "ให้ทีม Babe House ตัดคลิปให้ได้ (สั่งเพิ่มเป็นคลิป)"],
      ["✓", "ยกเลิกเมื่อไหร่ก็ได้"],
    ],
  },
  "6m": {
    tag: "คุ้มขึ้น", sub: "จ่ายครั้งเดียว ดูแลครบ 6 เดือน",
    items: [
      ["✓", "<b>ทุกอย่างในแพ็กรายเดือน</b> ครบทุกข้อ"],
      ["📈", "<b>ครูพี่คิมเรียนรู้จากคลิปที่คุณลงจริง</b> — เดือนถัดไปแม่นขึ้นเรื่อยๆ"],
      ["📊", "รายงานการเติบโตสะสม เห็นกราฟยาว 6 เดือน"],
      ["🔓", "ไม่ต้องจ่ายซ้ำทุกเดือน กดปลดล็อกเดือนใหม่ได้เลย"],
      ["💰", "ถูกกว่ารายเดือน <b>เดือนละ 480฿</b>"],
    ],
  },
  "12m": {
    tag: "คุ้มที่สุด", sub: "จ่ายครั้งเดียว ดูแลครบ 1 ปีเต็ม",
    items: [
      ["✓", "<b>ทุกอย่างในแพ็ก 6 เดือน</b> ครบทุกข้อ"],
      ["🧠", "<b>ครบ 1 ปี = ระบบรู้จักคนดูของคุณลึกที่สุด</b> เดือนที่ 12 จะแม่นกว่าเดือนแรกมาก"],
      ["📊", "เห็นการเติบโตของช่องเต็มปี เอาไปคุยงานสปอนเซอร์ได้"],
      ["🔓", "ไม่ต้องคิดเรื่องจ่ายเงินอีกเลยทั้งปี"],
      ["💰", "ถูกกว่ารายเดือน <b>เดือนละ 795฿ (ครึ่งราคา)</b>"],
    ],
  },
};

export function PlanCards({ selected, onPick, ctaLabel, busy, compact }) {
  const [plans, setPlans] = useState([]);
  useEffect(() => { api("/api/plans").then(d => setPlans(d.plans || [])).catch(() => {}); }, []);
  if (!plans.length) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit,minmax(280px,1fr))",
                  gap: 18, maxWidth: compact ? 560 : 1040, margin: "0 auto", alignItems: "start" }}>
      {plans.map(p => {
        const F = FEATURES[p.plan] || FEATURES.monthly;
        const on = selected === p.plan;
        const best = p.plan === "12m";
        return (
          <div key={p.plan} className="card"
            onClick={() => onPick && onPick(p.plan)}
            style={{ margin: 0, borderRadius: 22, padding: "28px 24px", position: "relative",
              cursor: onPick ? "pointer" : "default",
              border: on ? `2px solid ${BLUE}` : best ? "2px solid #d6e7fa" : "1px solid var(--border)",
              background: on ? "#F7FBFF" : "#fff",
              boxShadow: on || best ? "0 14px 40px rgba(46,134,222,.13)" : "none" }}>

            {F.tag && <div style={{ position: "absolute", top: -13, left: 22,
              background: best ? "#1a7f43" : "#B26A00", color: "#fff", fontSize: 12, fontWeight: 800,
              padding: "5px 14px", borderRadius: 20, whiteSpace: "nowrap" }}>{F.tag}</div>}

            <div style={{ fontWeight: 800, fontSize: 18 }}>
              {p.plan === "monthly" ? "รายเดือน" : p.plan === "6m" ? "6 เดือน" : "12 เดือน"}
            </div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>{F.sub}</div>

            {/* ราคาต่อเดือนตัวใหญ่ = เลขที่ลูกค้าเอาไปเทียบกันจริงๆ */}
            <div style={{ margin: "18px 0 2px", fontSize: 42, fontWeight: 800, lineHeight: 1, color: on || best ? BLUE : "var(--ink)" }}>
              {p.per_month.toLocaleString()}฿
              <span style={{ fontSize: 16, fontWeight: 600, color: "var(--muted)" }}> /เดือน</span>
            </div>
            {p.months > 1
              ? <div style={{ fontSize: 13.5, marginTop: 8 }}>
                  จ่ายครั้งเดียว <b>{p.baht.toLocaleString()}฿</b>
                  <span className="muted" style={{ textDecoration: "line-through", marginLeft: 6 }}>{(p.full_satang / 100).toLocaleString()}฿</span>
                  <span style={{ color: "#1a7f43", fontWeight: 800, marginLeft: 6 }}>−{p.off}%</span>
                </div>
              : <div className="muted" style={{ fontSize: 13.5, marginTop: 8 }}>จ่ายทุกเดือน</div>}
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>ราคารวม VAT 7% แล้ว</div>

            <ul style={{ listStyle: "none", margin: "18px 0 22px", padding: "12px 0 0", borderTop: "1px solid var(--border)" }}>
              {F.items.map(([ic, txt], i) => (
                <li key={i} style={{ padding: "9px 0 9px 30px", position: "relative", fontSize: 14.5, lineHeight: 1.6 }}>
                  <span style={{ position: "absolute", left: 0, top: 9, color: ic === "✓" ? BLUE : "inherit", fontWeight: 800 }}>{ic}</span>
                  <span dangerouslySetInnerHTML={{ __html: txt }} />
                </li>
              ))}
            </ul>

            {onPick && <button type="button" className="btn full" disabled={busy}
              style={{ background: on ? BLUE : "#fff", color: on ? "#fff" : BLUE, border: `1.5px solid ${BLUE}`, opacity: busy ? .6 : 1 }}>
              {on ? "✓ เลือกแพ็กนี้แล้ว" : "เลือกแพ็กนี้"}
            </button>}
            {!onPick && ctaLabel && <a className="btn full" href={`/form?plan=${p.plan}`}
              style={{ background: best ? BLUE : "#fff", color: best ? "#fff" : BLUE, border: `1.5px solid ${BLUE}`, textDecoration: "none", display: "block", textAlign: "center" }}>
              {ctaLabel}
            </a>}
          </div>
        );
      })}
    </div>
  );
}
