import { useState, useEffect } from "react";
import { api } from "./api.js";

// ═══════ 💳 การ์ดเลือกแพ็ก — ใช้ทั้งหน้าแรกและหน้าจ่ายเงิน ═══════
// คิมสั่ง 3 ส.ค.: "ฉันชอบราคาแบบแนวตั้งมากกว่า ให้เห็นรายละเอียดชัดๆ เหมือนตอนที่ทำคลับ"
// → การ์ดสูง ราคาตัวใหญ่ รายการ ✓ ครบ ปุ่มเต็มความกว้าง (สไตล์เดียวกับหน้า Plans ของ Club)
//
// ⚠️ อัปเดต 6 ส.ค. — เดิมทุกแพ็กได้ฟีเจอร์เท่ากันหมด ตอนนี้ "ได้ไม่เท่ากันจริงๆ" แล้ว
//    (คิมเคาะหลังลูกค้า 2 คนขอแพ็กรวมทุกฟังก์ชั่นแบบ ChatGPT)
// 📌 ตัวเลขสิทธิ์ทุกตัวดึงจาก p.perks ที่เซิร์ฟเวอร์ส่งมา ห้ามพิมพ์เลขซ้ำในไฟล์นี้
//    ไม่งั้นวันไหนคิมเปลี่ยนเพดาน หน้าเว็บจะโฆษณาเลขที่ระบบไม่ได้ให้จริง

const BLUE = "var(--blue)";

const featuresFor = (plan, k) => ({
  monthly: {
    tag: null, sub: "ลองก่อนได้ ไม่ผูกมัด",
    items: [
      ["✓", "วิเคราะห์ช่องเจาะลึก + 5 โมดูลปั้นแบรนด์"],
      ["✓", "แผนคอนเทนต์ 30 วัน พร้อมสคริปต์ทุกวัน"],
      ["✓", "แคปชัน · วิธีถ่าย · ฮุก 3 วิแรก ครบทุกคลิป"],
      ["✓", `สคริปต์เพิ่มนอกแผน <b>${k.scripts} คลิป/เดือน</b>`],
      ["✓", `แก้เล่มใหม่ <b>${k.improve} ครั้ง</b>`],
      ["✓", "ยกเลิกเมื่อไหร่ก็ได้"],
    ],
  },
  "6m": {
    tag: "คุ้มขึ้น", sub: "จ่ายครั้งเดียว ดูแลครบ 6 เดือน",
    items: [
      ["✓", "<b>ทุกอย่างในแพ็กรายเดือน</b> ครบทุกข้อ"],
      ["✍️", `สคริปต์เพิ่มนอกแผน <b>${k.scripts} คลิป/เดือน</b> (จาก 10)`],
      ["🔁", `แก้เล่มใหม่ <b>${k.improve} ครั้ง/เดือน</b> · เจนสคริปต์ใหม่ได้ทุกคลิป คลิปละ ${k.regen} ครั้ง`],
      ["📚", `ให้ครูพี่คิมตรวจคลิปที่ลงจริง <b>${k.homework} ครั้ง/เดือน</b>`],
      ["📈", "<b>ครูพี่คิมเรียนรู้จากคลิปที่คุณลงจริง</b> — เดือนถัดไปแม่นขึ้นเรื่อยๆ"],
      ["🔒", "<b>ล็อกราคาไว้</b> ขึ้นราคาทีหลังไม่กระทบคุณ"],
    ],
  },
  "12m": {
    tag: "คุ้มที่สุด", sub: "จ่ายครั้งเดียว ดูแลครบ 1 ปีเต็ม",
    items: [
      ["✓", "<b>ทุกอย่างในแพ็ก 6 เดือน</b> ครบทุกข้อ"],
      ["🎓", "<b>คอร์สออนไลน์ของครูพี่คิม 1 คอร์ส ฟรี</b> — เลือกเองได้ มูลค่าถึง 5,990฿"],
      ["🎬", `<b>ลดค่าตัดต่อ ${k.edit_off}%</b> ตลอดอายุสมาชิก`],
      ["⚡", "คิวงานตัดต่อของคุณได้ก่อน"],
      ["🧠", "<b>ครบ 1 ปี = ระบบรู้จักคนดูของคุณลึกที่สุด</b>"],
      ["🔒", "ล็อกราคาไว้ทั้งปี ไม่ต้องคิดเรื่องจ่ายเงินอีกเลย"],
    ],
  },
}[plan] || null);

// 🗓️ ก่อน 1 ก.ย. 2569 = ช่วงโปรเปิดตัว 490 → การ์ดแพ็กจะไม่ขึ้นเลย (เซิร์ฟเวอร์ส่ง live:false)
export function PlanCards({ selected, onPick, ctaLabel, busy, compact }) {
  const [plans, setPlans] = useState([]);
  useEffect(() => { api("/api/plans").then(d => setPlans(d.live ? (d.plans || []) : [])).catch(() => {}); }, []);
  if (!plans.length) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit,minmax(280px,1fr))",
                  gap: 18, maxWidth: compact ? 560 : 1040, margin: "0 auto", alignItems: "start" }}>
      {plans.map(p => {
        // สิทธิ์จริงจากเซิร์ฟเวอร์ — ถ้าเซิร์ฟเวอร์เวอร์ชันเก่ายังไม่ส่ง perks มา ใช้ค่ารายเดือนกันหน้าพัง
        const k = p.perks || { scripts: 10, improve: 1, regen: 1, homework: 10, edit_off: 0 };
        const F = featuresFor(p.plan, k) || featuresFor("monthly", k);
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
