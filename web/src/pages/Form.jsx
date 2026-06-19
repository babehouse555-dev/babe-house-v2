import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, filesToBase64, getRef, currentCycle, session, track } from "../api.js";

// ไกด์ + ตัวอย่างการกรอกแต่ละช่อง (ใช้ Babe House Academy เป็นตัวอย่างจริง)
// ยิ่งกรอกละเอียด AI ยิ่งวิเคราะห์ได้ลึก
const GUIDE = {
  instagram_account: {
    title: "ช่องที่จะวิเคราะห์",
    bullets: [
      "ใส่ @ ของช่องหลัก (Instagram หรือ TikTok) ที่อยากให้ครูพี่คิมวิเคราะห์",
      "ถ้ามีหลายช่อง เลือกช่องที่ใช้ขายจริง / มีคนตามเยอะสุด",
    ],
    example: "@babehouse_academy",
  },
  business_type: {
    title: "ประเภทธุรกิจ",
    bullets: [
      "ธุรกิจ/แบรนด์ชื่ออะไร เปิดมากี่ปีแล้ว",
      "ขายอะไร / ให้บริการอะไร (ใส่ชื่อสินค้า + ราคาด้วยยิ่งดี)",
      "กลุ่มลูกค้าคือใคร (เพศ อายุ ความสนใจ)",
      "จุดเด่นที่ต่างจากเจ้าอื่นคืออะไร",
    ],
    example:
      "Babe House Academy — สถาบันสอนตัดต่อวิดีโอและทำคอนเทนต์สำหรับผู้หญิง เปิดมา 3 ปี มี 3 คอร์ส: All in Your Phone (ตัดต่อในมือถือ 3,745฿), ตัดต่อ Advance สายเล่าเรื่อง (5,990฿) และ Workshop ตัวต่อตัว ลูกค้าหลักคือผู้หญิงวัยทำงาน 25-34 ปี ที่อยากพัฒนาสกิลดิจิทัลเพื่อสร้างรายได้ จุดเด่นคือสอนแบบจับมือทำ เข้าใจง่าย เน้นนำไปใช้ได้จริง",
  },
  starting_point: {
    title: "จุดตั้งต้น / ปัญหาหลังบ้านเดือนนี้",
    bullets: [
      "ตอนนี้ยอดเป็นยังไง (ผู้ติดตาม / reach / engagement โดยรวม)",
      "ปัญหาหลักที่อยากแก้คืออะไร",
      "สังเกตอะไรจากสถิติหลังบ้าน (เช่น คนดูเยอะแต่ไม่กดลิงก์)",
      "เคยลองทำอะไรแล้วยังไม่เวิร์ก",
    ],
    example:
      "ผู้ติดตาม ~12,400 คน reach เดือนละ ~140,000 คนเข้าดูโปรไฟล์เยอะ (8,600) แต่กดลิงก์ใน bio น้อยมาก (~540 ครั้ง) = น่าจะมีรอยรั่วที่ bio/CTA ยอดวิวคลิปนิ่งมา 2 เดือน อยากเปลี่ยนคนที่ดูอยู่แล้วให้กลายเป็นยอดสมัครคอร์ส",
  },
  monthly_goal: {
    title: "เป้าหมายประจำเดือน",
    bullets: [
      "เดือนนี้อยากได้อะไรเป็นรูปธรรม (ใส่ตัวเลขเป้าหมายถ้ามี)",
      "อยากให้คนดูคลิปแล้วทำอะไรต่อ (สมัคร / ทัก / กดลิงก์)",
      "โฟกัสคอนเทนต์สายไหน (สร้างการรับรู้ / ปิดการขาย / สร้างแบรนด์)",
    ],
    example:
      "เพิ่มยอดสมัครคอร์ส All in Your Phone ให้ได้ 30 คนในเดือนนี้ + อุดรอยรั่ว Link-in-bio ให้คนกดลิงก์มากขึ้น เน้นคอนเทนต์สาย Conversion ที่พาคนจากผู้ชมมาเป็นนักเรียน",
  },
  competitor_1: {
    title: "คู่แข่ง / ช่องที่ชื่นชม",
    bullets: [
      "ชื่อช่อง/แบรนด์ (ใส่ @ ได้)",
      "เขาทำคอนเทนต์แนวไหน จุดที่เขาทำได้ดี",
      "จุดที่เรายังทำได้ดีกว่า / ต่างจากเขา",
    ],
    example:
      "@xxx_studio — สอนตัดต่อเหมือนกัน เน้นเทคนิคโปรแกรมคอม จุดแข็ง: คลิปสวย โปรดักชันดี / จุดที่เราต่าง: เราสอนในมือถือ เข้าถึงง่ายกว่า เหมาะมือใหม่และผู้หญิงวัยทำงาน",
  },
  competitor_2: {
    title: "คู่แข่งช่องที่ 2",
    bullets: [
      "อีกช่องที่เป็นคู่แข่ง/แรงบันดาลใจ (เว้นว่างได้)",
      "เขียนแบบเดียวกับช่องที่ 1",
    ],
    example:
      "@yyy_create — สาย vlog ไลฟ์สไตล์ คนตามเยอะ จุดแข็ง: เล่าเรื่องสนุก / จุดที่เราต่าง: เรามีหลักสูตรชัดเจน สอนเป็นสเต็ป จบแล้วทำเป็นจริง",
  },
  images: {
    title: "ภาพสถิติหลังบ้าน (Insight)",
    bullets: [
      "แคปหน้า Insight/Analytics: ภาพรวม Reach, ผู้เข้าชมโปรไฟล์, การกดลิงก์",
      "Audience: อายุ / เพศ / เมืองของผู้ติดตาม",
      "คลิปที่ดีที่สุด + แย่ที่สุด (เทียบให้ AI เห็น)",
      "ยิ่งแนบครบ AI ยิ่งอ่านตัวเลขจริงของคุณได้แม่น",
    ],
    example:
      "เปิดแอป IG/TikTok → โปรไฟล์ → เมนู Insights/Analytics → แคปหน้าจอ: ภาพรวม 30 วัน, ผู้ชมที่เข้าถึง, การโต้ตอบ, ข้อมูลผู้ติดตาม แล้วแนบเข้ามาได้สูงสุด 8 รูป",
  },
};

function GuideContent({ k, onFill }) {
  const g = GUIDE[k];
  if (!g) return null;
  return (
    <div style={{ background: "#F4F8FD", border: "1px solid #d6e7fa", borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontWeight: 800, color: "var(--blue-d)", marginBottom: 10, fontSize: 14.5 }}>💡 {g.title} — กรอกแบบนี้</div>
      <ul style={{ paddingLeft: 18, fontSize: 13.5, lineHeight: 1.75, margin: "0 0 12px" }}>
        {g.bullets.map((b, i) => <li key={i} style={{ marginBottom: 3 }}>{b}</li>)}
      </ul>
      <div style={{ fontWeight: 700, fontSize: 12, color: "var(--muted)", marginBottom: 5 }}>📝 ตัวอย่าง (อิงจาก Babe House Academy):</div>
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: "11px 13px", fontSize: 13.5, lineHeight: 1.65, color: "var(--ink)" }}>{g.example}</div>
      {onFill && k !== "images" && (
        <button type="button" onClick={() => onFill(k)} className="link" style={{ marginTop: 10, fontSize: 13, background: "none", border: 0, cursor: "pointer", padding: 0 }}>
          ✍️ กรอกตัวอย่างนี้ให้เลย (แล้วแก้เป็นของคุณ)
        </button>
      )}
    </div>
  );
}

// กดเลือกเป็นหลัก (ไม่ต้องพิมพ์) แต่ให้ context ลึกกับ AI
const WORK_STYLES = ["นักเรียน / นักศึกษา", "พนักงานประจำ", "ฟรีแลนซ์ / ทำคนเดียว", "เจ้าของร้าน / มีหน้าร้าน", "ขายของออนไลน์", "มีทีมงาน / แบรนด์", "แม่บ้าน / ดูแลครอบครัว", "กำลังหางาน / ยังไม่ได้ทำงาน", "รับราชการ / หน่วยงาน"];
const AUDIENCES = ["ผู้หญิงวัยทำงาน", "นักเรียน/นักศึกษา", "เจ้าของธุรกิจ/แม่ค้า", "คุณแม่", "วัยรุ่น", "ผู้ชาย", "สายสุขภาพ/ความงาม"];
const EXPERIENCES = ["เพิ่งเริ่มทำ", "ไม่ถึง 1 ปี", "1–3 ปี", "มากกว่า 3 ปี"];
const GOALS = ["ยอดขาย / ลูกค้าเพิ่ม", "คนติดตามเพิ่ม", "คนรู้จักมากขึ้น", "สร้างความน่าเชื่อถือ/ตัวตน"];
const GENDERS = ["หญิง", "ชาย", "LGBTQ+", "ไม่ระบุ"];
const AGES = ["ต่ำกว่า 18", "18–24", "25–34", "35–44", "45 ขึ้นไป"];

function ChipGroup({ options, value, onChange, multi }) {
  const sel = multi ? (Array.isArray(value) ? value : []) : value;
  const on = (o) => multi ? sel.includes(o) : sel === o;
  const toggle = (o) => multi ? onChange(sel.includes(o) ? sel.filter(x => x !== o) : [...sel, o]) : onChange(sel === o ? "" : o);
  return <div className="row" style={{ gap: 8 }}>
    {options.map(o => <button type="button" key={o} onClick={() => toggle(o)} style={{ border: on(o) ? "1.5px solid var(--blue)" : "1px solid var(--border)", background: on(o) ? "#EAF3FD" : "#fff", color: on(o) ? "var(--blue-d)" : "var(--ink)", fontWeight: on(o) ? 700 : 500, fontSize: 14, padding: "8px 14px", borderRadius: 20, cursor: "pointer" }}>{on(o) ? "✓ " : ""}{o}</button>)}
  </div>;
}

export default function Form() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const renew = sp.get("renew") === "1";
  const [f, setF] = useState({ email: "", display_name: "", instagram_account: "", business_type: "", gender: "", age_range: "", work_style: "", work_style_other: "", audience: [], audience_other: "", experience: "", goal_primary: [], q_origin: "", q_diff: "", q_vision: "", monthly_goal: "", competitor_1: "", competitor_2: "" });
  const [files, setFiles] = useState([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [focus, setFocus] = useState(null);
  const [showWSOther, setShowWSOther] = useState(false);
  const [showAudOther, setShowAudOther] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const imgRef = useRef(null);
  const linkBtn = { background: "none", border: 0, color: "var(--blue)", fontWeight: 700, fontSize: 13.5, cursor: "pointer", padding: "8px 0 0", display: "inline-block" };

  useEffect(() => {
    track("form_view");
    const email = sp.get("email") || session.email || "";
    const ig = sp.get("ig") || "";
    setF(v => ({ ...v, email: email || v.email, instagram_account: ig || v.instagram_account }));
  }, []);

  const upd = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }));
  const setVal = (k, val) => setF(v => ({ ...v, [k]: val }));
  const fillExample = (k) => { setF(v => ({ ...v, [k]: GUIDE[k].example })); };
  // props ช่วยใส่ onFocus + render guide ใต้ช่อง (มือถือ)
  const fieldProps = (k) => ({ onFocus: () => setFocus(k) });

  async function submit(e) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) { setErr("ช่วยกรอกอีเมลให้ถูกต้องด้วยนะคะ — ใช้ส่งเล่มให้ + เข้าดูย้อนหลังทุกเดือน"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (!f.instagram_account.trim()) { setErr("ช่วยกรอกชื่อช่อง/แฮนเดิล (⭐) ให้หน่อยนะคะ — ที่เหลือไม่บังคับค่ะ"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (![...files].length && !window.confirm("ยังไม่ได้แนบรูปสถิติหลังบ้านเลยค่ะ 📊\n\nรูป Insight คือตัวช่วยที่ทำให้ครูพี่คิมวิเคราะห์ตัวเลขจริงของคุณได้ — แนบก่อนเล่มจะแม่นขึ้นเยอะเลยค่ะ\n\nกด \"ตกลง\" = ไปต่อโดยไม่แนบรูป\nกด \"ยกเลิก\" = กลับไปแนบรูปก่อน")) { setErr(""); imgRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (!consent) { setErr("กรุณายอมรับนโยบายความเป็นส่วนตัวก่อนค่ะ"); return; }
    setBusy(true); setErr("");
    try {
      const images = await filesToBase64([...files], 8);
      const userId = `babe_user_${Date.now()}`;
      const payload = {
        user_id: userId, email: f.email.trim().toLowerCase(), referred_by: getRef(),
        meta_purchase: { tier: "Premium_490", billing_cycle: currentCycle() },
        instagram_account: f.instagram_account,
        form_responses: {
          business_type: f.business_type, gender: f.gender, age_range: f.age_range,
          work_style: [f.work_style, f.work_style_other.trim()].filter(Boolean).join(" / "),
          audience: [...(f.audience || []), f.audience_other.trim()].filter(Boolean).join(", "),
          experience: f.experience, goal_primary: (f.goal_primary || []).join(", "),
          monthly_goal: `${(f.goal_primary || []).join(" + ") || "(ไม่ได้ระบุ — ให้ครูพี่คิมวิเคราะห์เป้าหมายที่เหมาะสมจากช่อง/รูป Insight)"}${f.q_vision ? " — " + f.q_vision : ""}`.trim(),
          starting_point: [f.q_origin && `จุดเริ่มต้น/ทำไมถึงทำ: ${f.q_origin}`, f.q_diff && `จุดที่ต่างจากคนอื่น: ${f.q_diff}`, f.q_vision && `อยากโต/เป้าหมายระยะยาว: ${f.q_vision}`].filter(Boolean).join("\n"),
          competitor_1: f.competitor_1, competitor_2: f.competitor_2, display_name: f.display_name
        },
        insight_images: images, insight_screenshot_base64: images[0] || null
      };
      const r = await api("/api/checkout", { method: "POST", body: { tier: "Premium_490", payload } });
      track("form_submit");
      if (r.existing) alert(r.message || "อีเมลนี้มีเล่มของเดือนนี้แล้วค่ะ — เปิดเล่มเดิมให้นะคะ (1 อีเมล สร้างได้ 1 เล่ม/เดือน)");
      nav(r.checkout_url || `/checkout?order_id=${r.order_id}`);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  // guide ใต้ช่อง (โชว์เฉพาะมือถือ เมื่อช่องนั้นถูกโฟกัส)
  const inlineGuide = (k) => focus === k && GUIDE[k] ? (
    <div className="guide-inline"><GuideContent k={k} onFill={fillExample} /></div>
  ) : null;

  return (
    <div className="wrap page-pad">
      <div className="form-layout">
        <div className="form-col">
          <div className="brand">BABE HOUSE · AI CREATOR BLUEPRINT</div>
          <h1 className="page">{renew ? `เพิ่มแผนเดือนใหม่ (${currentCycle().replace("_", " ")})` : "สร้างเล่มแผนคอนเทนต์ส่วนตัว"}</h1>
          <p className="sub">{renew ? "ต่อแผนเดือนนี้เพื่อปลดล็อกตารางคอนเทนต์ 30 วันใหม่ และเทียบความคืบหน้า 🩵" : "กรอกข้อมูล + แนบ Insight หลังบ้าน → ชำระเงิน → AI วิเคราะห์เป็น Dashboard ส่วนตัว"}</p>
          <div className="msg" style={{ background: "#eef7f0", color: "#1a7f43", border: "1px dashed #9ed3b0", marginBottom: 16 }}>
            ⚡ <b>กรอกแค่ 3 ช่อง + แนบรูป Insight ก็เริ่มได้เลย!</b> (ใช้เวลาแป๊บเดียว) — ส่วนที่เหลือ <b>ไม่บังคับสักข้อ</b> อยากให้แม่นขึ้นค่อยเล่าเพิ่ม 🩵
          </div>
          <Link className="btn full" to="/account" style={{ marginBottom: 18 }}>นักเรียนเก่า Log in →</Link>
          <form onSubmit={submit}>
            <div className="card">
              <div className="field"><label>อีเมล (ใช้เข้าดูเล่มย้อนหลังทุกเดือน)</label><input type="email" required value={f.email} onChange={upd("email")} onFocus={() => setFocus(null)} placeholder="you@email.com" /><div className="hint">ใช้อีเมลเดิมทุกเดือนเพื่อเก็บประวัติและติดตามการเติบโต</div></div>

              <div className="field"><label>ชื่อที่อยากให้ครูพี่คิมเรียก <span className="muted">(ไม่บังคับ)</span></label><input value={f.display_name} onChange={upd("display_name")} onFocus={() => setFocus(null)} placeholder="เช่น พี่มะปราง / Namo" /><div className="hint">ครูพี่คิมจะทักด้วยชื่อนี้ในเล่ม — เว้นว่างได้ จะเรียก "คุณ" แทน</div></div>

              <div className="field"><label>Instagram / TikTok Account <span style={{ color: "var(--blue)" }}>⭐</span></label><input required value={f.instagram_account} onChange={upd("instagram_account")} {...fieldProps("instagram_account")} placeholder="เช่น @babehouse_academy" />{inlineGuide("instagram_account")}</div>

              <div className="field"><label>ช่องของคุณเกี่ยวกับอะไร? <span className="muted">(ทำคอนเทนต์แนวไหน)</span></label><input value={f.business_type} onChange={upd("business_type")} {...fieldProps("business_type")} placeholder="เช่น รีวิวชีวิตนักศึกษา · สอนแต่งหน้า · ขายเสื้อผ้าวินเทจ · สายกิน-คาเฟ่" /><div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>💡 ถ้ายังไม่มีช่อง หรือยังไม่รู้ว่าจะทำแนวไหน — เว้นว่างไว้ก่อนได้เลยค่ะ เดี๋ยวครูพี่คิมช่วยดูจากรูป Insight + ข้อมูลที่เหลือให้</div>{inlineGuide("business_type")}</div>

              <div className="field" ref={imgRef} onClick={() => setFocus("images")}><label>📊 แนบภาพสถิติหลังบ้าน <span className="muted">(สูงสุด 8 รูป)</span></label>
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple onFocus={() => setFocus("images")} onChange={(e) => setFiles(e.target.files)} />
                <div className="hint">💡 <b>นี่คือตัวช่วยวิเคราะห์ที่สำคัญที่สุด</b> — AI อ่านตัวเลขจริงจากรูป (Reach, Profile Visits, Link Taps, Audience) ยิ่งครบยิ่งแม่น</div>
                {files.length > 0 && <div className="hint">เลือกแล้ว {Math.min(files.length, 8)} รูป</div>}
                {inlineGuide("images")}
              </div>
            </div>

            <div className="card" style={{ background: "#F4F8FD", border: "1px dashed #c5dcf3" }}>
              <button type="button" onClick={() => setShowExtra(s => !s)} style={{ width: "100%", background: "none", border: 0, cursor: "pointer", textAlign: "left", padding: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span>
                  <span style={{ display: "inline-block", background: "#e8f5ee", color: "#1a7f43", fontWeight: 800, fontSize: 11.5, padding: "3px 10px", borderRadius: 20, marginBottom: 7 }}>ไม่บังคับ · ข้ามได้</span>
                  <div style={{ fontWeight: 800, fontSize: 16.5, color: "var(--blue-d)" }}>✨ อยากให้เล่มแม่นขึ้น? เล่าเพิ่มอีกนิด</div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>กดเปิดเพื่อเล่าเรื่องตัวเอง (ส่วนใหญ่แค่กดปุ่ม) — ไม่อยากเล่าก็กดจ่ายได้เลยค่ะ</div>
                </span>
                <span style={{ fontSize: 16, color: "var(--blue)", fontWeight: 800, flexShrink: 0 }}>{showExtra ? "▲ ปิด" : "▼ เปิด"}</span>
              </button>
              {showExtra && <div style={{ marginTop: 18 }}>

              <div className="field"><label>เพศ</label><ChipGroup options={GENDERS} value={f.gender} onChange={v => setVal("gender", v)} /></div>

              <div className="field"><label>อายุ</label><ChipGroup options={AGES} value={f.age_range} onChange={v => setVal("age_range", v)} /></div>

              <div className="field"><label>ตอนนี้คุณเป็น...?</label><ChipGroup options={WORK_STYLES} value={f.work_style} onChange={v => setVal("work_style", v)} />
                {(showWSOther || f.work_style_other) ? <input value={f.work_style_other} onChange={upd("work_style_other")} onFocus={() => setFocus(null)} autoFocus placeholder="พิมพ์เอง เช่น พนักงานบริษัท + ขายของออนไลน์ข้างๆ" style={{ marginTop: 10 }} /> : <button type="button" style={linkBtn} onClick={() => setShowWSOther(true)}>+ ไม่มีที่ตรง? พิมพ์เอง</button>}
              </div>

              <div className="field"><label>คนดู/ผู้ติดตามหลักเป็นใคร? <span className="muted">(เลือกได้หลายข้อ)</span></label><ChipGroup options={AUDIENCES} value={f.audience} onChange={v => setVal("audience", v)} multi />
                {(showAudOther || f.audience_other) ? <input value={f.audience_other} onChange={upd("audience_other")} onFocus={() => setFocus(null)} autoFocus placeholder="พิมพ์เอง เช่น สายมูเตลู / คนเลี้ยงแมว / เด็กมหาลัยปี 1" style={{ marginTop: 10 }} /> : <button type="button" style={linkBtn} onClick={() => setShowAudOther(true)}>+ ไม่มีที่ตรง? พิมพ์เอง</button>}
              </div>

              <div className="field"><label>ทำมานานแค่ไหน?</label><ChipGroup options={EXPERIENCES} value={f.experience} onChange={v => setVal("experience", v)} /></div>

              <div className="field"><label>เดือนนี้อยากได้อะไร? <span className="muted">(เลือกได้หลายข้อ — อยากได้หลายเป้าหมายก็ติ๊กได้เลย)</span></label><ChipGroup options={GOALS} value={f.goal_primary} onChange={v => setVal("goal_primary", v)} multi /></div>

              <div className="msg" style={{ background: "#fff7e6", color: "#8a6d1f", border: "1px dashed #e0b85b", margin: "4px 0 14px" }}>
                💛 <b>3 ข้อนี้คือหัวใจที่ทำให้เล่ม "เป็นคุณคนเดียว"</b> (ไม่บังคับ) — ปุ่มข้างบนบอกว่าคุณ "ทำอะไร" ส่วน 3 ข้อนี้บอกว่าคุณ "เป็นใคร" เล่าสั้นๆ เหมือนคุยกับเพื่อนก็พอค่ะ
              </div>

              <div className="field"><label>1. อะไรทำให้คุณเริ่มทำสิ่งนี้? <span className="muted">(จุดเริ่มต้น/แรงบันดาลใจ)</span></label><textarea value={f.q_origin} onChange={upd("q_origin")} onFocus={() => setFocus(null)} style={{ minHeight: 70 }} placeholder="เช่น เริ่มจากชอบแต่งหน้าให้เพื่อน เลยลองรับงานจริง / เคยเป็นคนไม่มั่นใจ อยากช่วยให้คนอื่นกล้าเป็นตัวเอง" /></div>

              <div className="field"><label>2. อะไรที่ทำให้คุณต่างจากคนอื่นในสายเดียวกัน? <span className="muted">(จุดเด่น/ของดี)</span></label><textarea value={f.q_diff} onChange={upd("q_diff")} onFocus={() => setFocus(null)} style={{ minHeight: 70 }} placeholder="เช่น สอนแบบจับมือทำจริงไม่ทิ้งกลางทาง / ใช้ของออร์แกนิกล้วน / ราคาเข้าถึงง่ายกว่าเจ้าอื่น" /></div>

              <div className="field"><label>3. อยากให้ช่อง/ธุรกิจโตไปถึงไหน? <span className="muted">(ความฝัน/เป้าหมายระยะยาว)</span></label><textarea value={f.q_vision} onChange={upd("q_vision")} onFocus={() => setFocus(null)} style={{ minHeight: 70 }} placeholder="เช่น อยากมีคอร์สเป็นของตัวเอง / เปิดร้านสาขา 2 / เป็นที่รู้จักทั่วประเทศ" /></div>

              <div className="field"><label>คู่แข่งช่องที่ 1 <span className="muted">(Optional)</span></label><input value={f.competitor_1} onChange={upd("competitor_1")} {...fieldProps("competitor_1")} placeholder="เว้นว่างได้ เดี๋ยว AI วิเคราะห์ให้" />{inlineGuide("competitor_1")}</div>

              <div className="field"><label>คู่แข่งช่องที่ 2 <span className="muted">(Optional)</span></label><input value={f.competitor_2} onChange={upd("competitor_2")} {...fieldProps("competitor_2")} placeholder="เว้นว่างได้ค่ะ" />{inlineGuide("competitor_2")}</div>

              </div>}
            </div>
            <label className="row" style={{ alignItems: "flex-start", fontSize: 13, color: "var(--muted)", margin: "4px 2px 14px" }}>
              <input type="checkbox" style={{ width: 18, height: 18, marginTop: 3 }} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>ฉันยินยอมให้ Babe House เก็บและใช้ข้อมูลที่กรอก (รวมถึงรูปสถิติ) เพื่อวิเคราะห์และสร้างแผนคอนเทนต์เฉพาะตัว ตาม <Link to="/privacy" target="_blank" className="link">นโยบายความเป็นส่วนตัว</Link></span>
            </label>
            {err && <div className="msg err">{err}</div>}
            <button className="btn full" type="submit" disabled={busy}>{busy ? "กำลังไปหน้าสรุป..." : "ดูสรุป & ดำเนินการต่อ →"}</button>
            <p className="center muted" style={{ fontSize: 13, marginTop: 10 }}>ราคาเต็ม <span style={{ textDecoration: "line-through" }}>1,590฿</span> · โปรเปิดตัว <b style={{ color: "var(--blue)" }}>490฿</b> · มีหน้าสรุป/ใส่โค้ดก่อนจ่าย กดแล้วยังไม่ตัดเงิน</p>
          </form>
        </div>

        <aside className="guide-aside">
          {focus && GUIDE[focus]
            ? <GuideContent k={focus} onFill={fillExample} />
            : <div style={{ background: "#F4F8FD", border: "1px dashed #c5dcf3", borderRadius: 14, padding: "20px 18px", color: "var(--muted)", fontSize: 14, lineHeight: 1.7 }}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>👉</div>
                <b style={{ color: "var(--blue-d)" }}>คลิกที่ช่องไหน</b> เดี๋ยวตัวอย่าง + ไกด์การกรอกจะเด้งขึ้นตรงนี้ค่ะ<br /><br />
                ยิ่งกรอกละเอียดเท่าไหร่ ครูพี่คิม (AI) ยิ่งวิเคราะห์ได้ลึกและตรงกับคุณมากเท่านั้น 🩵
              </div>}
        </aside>
      </div>
    </div>
  );
}
