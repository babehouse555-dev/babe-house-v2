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
const TONES = ["อบอุ่น เป็นกันเอง", "สนุก มีพลัง", "จริงจัง น่าเชื่อถือ", "ตรงไปตรงมา"];
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

// คู่มือหารูป Insight (เลือก platform) — ภาพจำลอง+ลูกศร ไม่ใช้รูปจริงของลูกค้า
function InsightGuide() {
  const [open, setOpen] = useState(false);
  const [plat, setPlat] = useState("ig");
  const hl = { border: "2px solid var(--blue)", background: "#EAF3FD", borderRadius: 8, padding: "8px 10px", color: "var(--blue-d)", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 };
  const num = { flexShrink: 0, width: 24, height: 24, borderRadius: "50%", background: "var(--blue)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 };
  const Step = ({ n, children }) => <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 }}><div style={num}>{n}</div><div style={{ flex: 1 }}>{children}</div></div>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} style={{ marginTop: 8, background: "none", border: 0, color: "var(--blue)", fontWeight: 700, fontSize: 13.5, cursor: "pointer", padding: 0 }}>📊 ไม่รู้จะหารูป Insight ตรงไหน? ดูวิธีหา →</button>;
  return <div style={{ marginTop: 12, background: "#F7FAFE", border: "1px solid #d6e7fa", borderRadius: 14, padding: "14px 16px" }}>
    <div className="between" style={{ marginBottom: 12 }}><b style={{ fontSize: 14.5 }}>📊 วิธีหารูป Insight</b><button type="button" onClick={() => setOpen(false)} style={{ background: "none", border: 0, color: "var(--muted)", cursor: "pointer", fontSize: 13 }}>ปิด</button></div>
    <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
      <button type="button" onClick={() => setPlat("ig")} style={{ border: `1px solid ${plat === "ig" ? "var(--blue)" : "var(--border)"}`, background: plat === "ig" ? "#EAF3FD" : "#fff", color: plat === "ig" ? "var(--blue-d)" : "var(--ink)", borderRadius: 20, padding: "6px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>📸 Instagram</button>
      <button type="button" onClick={() => setPlat("tt")} style={{ border: `1px solid ${plat === "tt" ? "var(--blue)" : "var(--border)"}`, background: plat === "tt" ? "#EAF3FD" : "#fff", color: plat === "tt" ? "var(--blue-d)" : "var(--muted)", borderRadius: 20, padding: "6px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>🎵 TikTok</button>
    </div>
    {plat === "ig" ? <>
      <Step n={1}>เข้าหน้าโปรไฟล์ตัวเอง → กดปุ่ม <b style={{ color: "var(--blue-d)" }}>"แดชบอร์ดมืออาชีพ"</b> (อยู่ใต้ไบโอ)
        <div style={{ ...hl, marginTop: 6 }}><span>แดชบอร์ดมืออาชีพ</span><span>👆 กดตรงนี้</span></div></Step>
      <Step n={2}>กดเข้า <b style={{ color: "var(--blue-d)" }}>"ยอดดู"</b> → แล้วเลือกช่วงเวลา <b style={{ color: "var(--blue-d)" }}>"30 วัน"</b> ที่มุมซ้ายบน
        <div style={{ ...hl, marginTop: 6 }}><span>📅 30 วันที่ผ่านมา</span><span>เลือกก่อน</span></div></Step>
      <Step n={3}><b>เลื่อนลงเรื่อยๆ แล้วแคป 2-3 รูป</b> ให้เห็น 4 อย่างนี้:
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
          <div style={hl}><span>บัญชีที่เข้าถึง</span><span>(Reach)</span></div>
          <div style={hl}><span>การเข้าชมโปรไฟล์</span><span>(Profile visits)</span></div>
          <div style={hl}><span>การแตะลิงก์ภายนอก</span><span>(Link taps)</span></div>
          <div style={hl}><span>กลุ่มเป้าหมาย</span><span>(อายุ/เพศ/เมือง)</span></div>
        </div></Step>
      <div className="hint" style={{ background: "#EAF3FD", color: "var(--blue-d)", borderRadius: 8, padding: "9px 11px", marginTop: 2 }}>💡 แคปกี่รูปก็ได้ (สูงสุด 8) ถ่ายให้เห็นตัวเลขชัดๆ ไม่ต้องสวย — ยิ่งครบ ครูพี่คิมยิ่งวิเคราะห์แม่น</div>
    </> : <>
      <Step n={1}>เข้าหน้าโปรไฟล์ตัวเอง → กดปุ่ม <b style={{ color: "var(--blue-d)" }}>"TikTok Studio"</b> (อยู่ใต้ไบโอ)
        <div style={{ ...hl, marginTop: 6 }}><span>TikTok Studio</span><span>👆 กดตรงนี้</span></div></Step>
      <Step n={2}>กดที่การ์ด <b style={{ color: "var(--blue-d)" }}>"การวิเคราะห์"</b> → แล้วเลือกช่วงเวลา <b style={{ color: "var(--blue-d)" }}>"28 วัน"</b>
        <div style={{ ...hl, marginTop: 6 }}><span>📊 การวิเคราะห์ · 28 วัน</span><span>เลือกก่อน</span></div></Step>
      <Step n={3}><b>แคป 2-3 รูป</b> จากแท็บด้านบนเหล่านี้ ให้เห็น:
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
          <div style={hl}><span>ยอดดูโพสต์</span><span>(แท็บภาพรวม)</span></div>
          <div style={hl}><span>ผู้ติดตามทั้งหมด</span><span>(แท็บผู้ติดตาม)</span></div>
          <div style={hl}><span>ผู้ชม / การเข้าถึง</span><span>(แท็บผู้ชม)</span></div>
          <div style={hl}><span>กลุ่มเป้าหมาย</span><span>(เพศ/อายุ/ที่ตั้ง)</span></div>
        </div></Step>
      <div className="hint" style={{ background: "#EAF3FD", color: "var(--blue-d)", borderRadius: 8, padding: "9px 11px", marginTop: 2 }}>💡 แคปกี่รูปก็ได้ (สูงสุด 8) ถ่ายให้เห็นตัวเลขชัดๆ ไม่ต้องสวย — ยิ่งครบ ครูพี่คิมยิ่งวิเคราะห์แม่น</div>
    </>}
  </div>;
}

export default function Form() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const renew = sp.get("renew") === "1";
  const [f, setF] = useState({ email: "", display_name: "", instagram_account: "", business_type: "", gender: "", age_range: "", work_style: "", work_style_other: "", audience: [], audience_other: "", experience: "", goal_primary: [], self_term: "", audience_term: "", catchphrases: "", tone: "", q_origin: "", q_diff: "", q_vision: "", monthly_goal: "", competitor_1: "", competitor_2: "" });
  const [files, setFiles] = useState([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [focus, setFocus] = useState(null);
  const [showWSOther, setShowWSOther] = useState(false);
  const [showAudOther, setShowAudOther] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [step, setStep] = useState(0);          // 0=แยกทาง 1=ติดต่อ/ช่อง 2=เกี่ยวกับช่อง 3=รูป/ลูกค้า 4=story+ส่ง
  const [hasChannel, setHasChannel] = useState(null); // true=มีช่อง false=มือใหม่
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

  // ===== ฟอร์มถามทีละขั้น (wizard) =====
  const toTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const chooseBranch = (has) => { setHasChannel(has); setStep(1); toTop(); };
  const goBack = () => { setErr(""); setStep(s => Math.max(0, s - 1)); toTop(); };
  const goNext = () => {
    setErr("");
    if (step === 1) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) { setErr("ช่วยกรอกอีเมลให้ถูกต้องด้วยนะคะ — ใช้ส่งเล่ม + เข้าดูย้อนหลัง"); return; }
      if (!f.instagram_account.trim()) { setErr("ช่วยกรอกชื่อช่อง/แฮนเดิลด้วยนะคะ"); return; }
    }
    if (step === 3 && hasChannel && ![...files].length &&
      !window.confirm("ยังไม่ได้แนบรูปสถิติเลยค่ะ 📊\n\nรูป Insight ช่วยให้วิเคราะห์ตัวเลขจริงได้แม่นขึ้นเยอะ\n\nกด \"ตกลง\" = ไปต่อโดยไม่แนบ\nกด \"ยกเลิก\" = กลับไปแนบรูป")) return;
    setStep(s => s + 1); toTop();
  };

  async function submit(e) {
    e.preventDefault();
    if (step !== 4) { goNext(); return; } // กด Enter ก่อนถึงขั้นสุดท้าย = ไปขั้นถัดไป ไม่ใช่ส่งฟอร์ม
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) { setErr("ช่วยกรอกอีเมลให้ถูกต้องด้วยนะคะ — ใช้ส่งเล่มให้ + เข้าดูย้อนหลังทุกเดือน"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (!f.instagram_account.trim()) { setErr("ช่วยกรอกชื่อช่อง/แฮนเดิล (⭐) ให้หน่อยนะคะ — ที่เหลือไม่บังคับค่ะ"); setStep(1); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
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
          competitor_1: f.competitor_1, competitor_2: f.competitor_2, display_name: f.display_name,
          self_term: f.self_term.trim(), audience_term: f.audience_term.trim(), catchphrases: f.catchphrases.trim(), tone: f.tone
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

  const TOTAL = 4; // ขั้น 1-4 (ขั้น 0 = แยกทาง)
  const stepTitle = ["", "ติดต่อ & ช่องของคุณ", "ช่องคุณเกี่ยวกับอะไร", hasChannel ? "แนบรูปสถิติ" : "อยากให้ใครดู", "เล่าเรื่องของคุณ"][step];

  return (
    <div className="wrap narrow page-pad">
      <div className="brand">BABE HOUSE · AI CREATOR BLUEPRINT</div>
      <h1 className="page" style={{ marginBottom: 4 }}>{renew ? `เพิ่มแผนเดือนใหม่ (${currentCycle().replace("_", " ")})` : "สร้างเล่มแผนคอนเทนต์ส่วนตัว"}</h1>

      {step > 0 && <div style={{ margin: "14px 0 18px" }}>
        <div className="row" style={{ gap: 6, marginBottom: 6 }}>{[1, 2, 3, 4].map(n => <div key={n} style={{ flex: 1, height: 6, borderRadius: 6, background: n <= step ? "var(--blue)" : "var(--border)" }} />)}</div>
        <div className="muted" style={{ fontSize: 12.5 }}>ขั้นที่ {step}/{TOTAL} · {stepTitle}</div>
      </div>}

      {err && <div className="msg err" style={{ marginBottom: 14 }}>{err}</div>}

      <form onSubmit={submit}>

        {/* ===== ขั้น 0: แยกทาง ===== */}
        {step === 0 && <div>
          <p className="sub" style={{ marginBottom: 18 }}>เริ่มกันเลยค่ะ! ตอนนี้คุณ...</p>
          <button type="button" onClick={() => chooseBranch(true)} className="card" style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "1.5px solid var(--border)", display: "flex", gap: 14, alignItems: "center", margin: "0 0 12px" }}>
            <span style={{ fontSize: 32 }}>📈</span><span><div style={{ fontWeight: 800, fontSize: 16.5, color: "var(--blue-d)" }}>มีช่องอยู่แล้ว</div><div className="muted" style={{ fontSize: 13.5 }}>ทำมาสักพัก มีคนดู/ผู้ติดตามบ้างแล้ว — มีรูปสถิติหลังบ้านให้ดูได้</div></span>
          </button>
          <button type="button" onClick={() => chooseBranch(false)} className="card" style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "1.5px solid var(--border)", display: "flex", gap: 14, alignItems: "center", margin: "0 0 18px" }}>
            <span style={{ fontSize: 32 }}>🌱</span><span><div style={{ fontWeight: 800, fontSize: 16.5, color: "#2C8E8C" }}>เพิ่งเริ่ม / ยังไม่มีช่อง</div><div className="muted" style={{ fontSize: 13.5 }}>อยากเริ่มทำคอนเทนต์ ยังไม่มีสถิติ — ครูพี่คิมช่วยวางแผนเริ่มต้นให้</div></span>
          </button>
          <Link className="link" to="/account" style={{ display: "block", textAlign: "center", fontWeight: 700 }}>เป็นนักเรียนเก่า? เข้าสู่ระบบ →</Link>
        </div>}

        {/* ===== ขั้น 1: ติดต่อ & ช่อง ===== */}
        {step === 1 && <div className="card">
          <div className="field"><label>อีเมล <span style={{ color: "var(--blue)" }}>⭐</span> <span className="muted">(ใช้เข้าดูเล่มย้อนหลังทุกเดือน)</span></label><input type="email" value={f.email} onChange={upd("email")} onFocus={() => setFocus(null)} placeholder="you@email.com" /><div className="hint">ใช้อีเมลเดิมทุกเดือนเพื่อเก็บประวัติและติดตามการเติบโต</div></div>
          <div className="field"><label>ชื่อช่อง (Instagram / TikTok) <span style={{ color: "var(--blue)" }}>⭐</span></label><input value={f.instagram_account} onChange={upd("instagram_account")} {...fieldProps("instagram_account")} placeholder="เช่น @babehouse_academy" />{inlineGuide("instagram_account")}</div>
          <div className="field"><label>ชื่อที่อยากให้ครูพี่คิมเรียก <span className="muted">(ไม่บังคับ)</span></label><input value={f.display_name} onChange={upd("display_name")} onFocus={() => setFocus(null)} placeholder="เช่น พี่มะปราง / Namo" /><div className="hint">เว้นว่างได้ จะเรียก "คุณ" แทนค่ะ</div></div>
        </div>}

        {/* ===== ขั้น 2: เกี่ยวกับช่อง + เป้าหมาย ===== */}
        {step === 2 && <div className="card">
          <div className="field"><label>{hasChannel ? "ช่องของคุณเกี่ยวกับอะไร?" : "อยากทำคอนเทนต์แนวไหน?"} <span className="muted">(แนวที่อยากทำ)</span></label><input value={f.business_type} onChange={upd("business_type")} {...fieldProps("business_type")} placeholder="เช่น รีวิวชีวิตนักศึกษา · สอนแต่งหน้า · ขายเสื้อผ้าวินเทจ · สายกิน-คาเฟ่ · เล่าเรื่อง/ไลฟ์สไตล์" />
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>💡 บอกแนวที่ <b>อยากทำจริงๆ</b> ได้เลย (ไม่จำเป็นต้องเป็นอาชีพตอนนี้) — เช่น ทำงานประจำแต่อยากทำช่องไลฟ์สไตล์ตัวเอง ก็เขียน "ไลฟ์สไตล์" ได้</div>{inlineGuide("business_type")}</div>
          <div className="field"><label>เดือนนี้อยากได้อะไร? <span className="muted">(เลือกได้หลายข้อ)</span></label><ChipGroup options={GOALS} value={f.goal_primary} onChange={v => setVal("goal_primary", v)} multi /></div>
        </div>}

        {/* ===== ขั้น 3: รูป (มีช่อง) หรือ ลูกค้า (มือใหม่) ===== */}
        {step === 3 && hasChannel && <div className="card" ref={imgRef}>
          <div style={{ fontWeight: 800, fontSize: 17, color: "var(--blue-d)", marginBottom: 4 }}>📊 แนบรูปสถิติหลังบ้าน</div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>นี่คือ <b>ตัวช่วยวิเคราะห์ที่สำคัญที่สุด</b> — AI อ่านตัวเลขจริง (คนเข้าถึง · คนเข้าโปรไฟล์ · เพศ-อายุคนดู) ทำให้เล่มแม่นขึ้นมาก</p>
          <div style={{ border: "2px dashed var(--blue)", borderRadius: 14, padding: "20px 16px", textAlign: "center", background: "#F4F8FD" }}>
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple onFocus={() => setFocus("images")} onChange={(e) => setFiles(e.target.files)} style={{ display: "block", margin: "0 auto" }} />
            {files.length > 0 && <div className="hint" style={{ color: "#1a7f43", fontWeight: 700, marginTop: 8 }}>✓ เลือกแล้ว {Math.min(files.length, 8)} รูป</div>}
          </div>
          <div style={{ marginTop: 12 }}><InsightGuide /></div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>ยังไม่มีรูปตอนนี้? กด "ถัดไป" ข้ามได้ แต่เล่มจะแม่นน้อยลงนิดนึงค่ะ</div>
        </div>}

        {step === 3 && !hasChannel && <div className="card">
          <div className="field"><label>อยากให้ใครดูช่องคุณ? <span className="muted">(กลุ่มคนที่อยากได้ — เลือกได้หลายข้อ)</span></label><ChipGroup options={AUDIENCES} value={f.audience} onChange={v => setVal("audience", v)} multi />
            {(showAudOther || f.audience_other) ? <input value={f.audience_other} onChange={upd("audience_other")} onFocus={() => setFocus(null)} autoFocus placeholder="พิมพ์เอง เช่น คนเลี้ยงแมว / เด็กมหาลัยปี 1" style={{ marginTop: 10 }} /> : <button type="button" style={linkBtn} onClick={() => setShowAudOther(true)}>+ ไม่มีที่ตรง? พิมพ์เอง</button>}
          </div>
          <div className="msg" style={{ background: "#e4f4f3", color: "#2C8E8C", border: "1px dashed #9ad0ce", fontSize: 12.5 }}>🌱 มือใหม่ไม่ต้องมีรูปสถิติค่ะ — ครูพี่คิมจะวางแผนเริ่มต้นจากแนวที่อยากทำ + กลุ่มที่อยากได้ พอทำไป 1 เดือนค่อยกลับมาใส่รูป เดี๋ยววิเคราะห์ตัวเลขจริงให้</div>
        </div>}

        {/* ===== ขั้น 4: STORY (ดาว) + optional + ส่ง ===== */}
        {step === 4 && <div>
          <div className="card" style={{ borderTop: "4px solid #e0b85b" }}>
            <span style={{ display: "inline-block", background: "#fff7e6", color: "#8a6d1f", fontWeight: 800, fontSize: 11.5, padding: "3px 10px", borderRadius: 20, marginBottom: 8 }}>⭐ ข้อนี้สำคัญที่สุด</span>
            <div className="field"><label style={{ fontSize: 15.5 }}>ทำไมถึงเริ่มทำช่องนี้? <span className="muted">(จุดเริ่มต้น/แรงบันดาลใจ)</span></label><textarea value={f.q_origin} onChange={upd("q_origin")} onFocus={() => setFocus(null)} style={{ minHeight: 90 }} placeholder="เล่าสั้นๆ เหมือนคุยกับเพื่อนก็พอค่ะ เช่น เคยเป็นสิวหนักมาก เสียเงินเป็นแสน จนเจอวิธีที่ใช่ เลยอยากช่วยคนงบน้อยให้ไม่เสียเงินเปล่าเหมือนเรา" /><div className="hint">💡 นี่คือสิ่งที่ทำให้เล่ม "เป็นคุณคนเดียว" — เรื่องของคุณที่ AI เดาแทนไม่ได้</div></div>
          </div>

          <div className="card" style={{ background: "#F4F8FD", border: "1px dashed #c5dcf3" }}>
            <button type="button" onClick={() => setShowExtra(s => !s)} style={{ width: "100%", background: "none", border: 0, cursor: "pointer", textAlign: "left", padding: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span><span style={{ display: "inline-block", background: "#e8f5ee", color: "#1a7f43", fontWeight: 800, fontSize: 11.5, padding: "3px 10px", borderRadius: 20, marginBottom: 7 }}>ไม่บังคับ · ข้ามได้</span>
                <div style={{ fontWeight: 800, fontSize: 16, color: "var(--blue-d)" }}>✨ อยากให้แม่นขึ้นอีก? เล่าเพิ่ม</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>จุดต่าง · ความฝัน · น้ำเสียงในสคริปต์ (ส่วนใหญ่แค่กดปุ่ม)</div></span>
              <span style={{ fontSize: 15, color: "var(--blue)", fontWeight: 800, flexShrink: 0 }}>{showExtra ? "▲ ปิด" : "▼ เปิด"}</span>
            </button>
            {showExtra && <div style={{ marginTop: 18 }}>
              <div className="field"><label>อะไรทำให้คุณต่างจากคนอื่นในสายเดียวกัน? <span className="muted">(จุดเด่น/ของดี)</span></label><textarea value={f.q_diff} onChange={upd("q_diff")} onFocus={() => setFocus(null)} style={{ minHeight: 64 }} placeholder="เช่น สอนแบบจับมือทำจริง / ใช้ของออร์แกนิกล้วน / ราคาเข้าถึงง่ายกว่าเจ้าอื่น" /></div>
              <div className="field"><label>อยากให้ช่อง/ธุรกิจโตไปถึงไหน? <span className="muted">(ความฝันระยะยาว)</span></label><textarea value={f.q_vision} onChange={upd("q_vision")} onFocus={() => setFocus(null)} style={{ minHeight: 64 }} placeholder="เช่น อยากมีคอร์สเป็นของตัวเอง / เปิดร้านสาขา 2 / เป็นที่รู้จักทั่วประเทศ" /></div>
              <div className="msg" style={{ background: "#eef4fb", color: "#3F6BAE", border: "1px dashed #bcd4ee", margin: "4px 0 14px", fontSize: 12.5 }}>🎤 ตอบ 3 ข้อล่างนี้ ครูพี่คิมจะเขียนสคริปต์ให้พูดเหมือนเป็นคุณ</div>
              <div className="field"><label>คุณแทนตัวเองว่าอะไร?</label><input value={f.self_term} onChange={upd("self_term")} onFocus={() => setFocus(null)} placeholder="เช่น เรา / ฉัน / พี่" />
                <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>{["เรา", "ฉัน", "พี่"].map(t => <button key={t} type="button" onClick={() => setVal("self_term", t)} style={{ background: f.self_term === t ? "#EAF3FD" : "#fff", border: `1px solid ${f.self_term === t ? "var(--blue)" : "var(--border)"}`, color: f.self_term === t ? "var(--blue-d)" : "var(--ink)", borderRadius: 20, padding: "6px 15px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>{t}</button>)}</div>
              </div>
              <div className="field"><label>เรียกคนดูว่าอะไร?</label><input value={f.audience_term} onChange={upd("audience_term")} onFocus={() => setFocus(null)} placeholder="เช่น ทุกคน / เพื่อนๆ / สาวๆ" />
                <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>{["ทุกคน", "เพื่อนๆ", "สาวๆ", "คุณ"].map(t => <button key={t} type="button" onClick={() => setVal("audience_term", t)} style={{ background: f.audience_term === t ? "#EAF3FD" : "#fff", border: `1px solid ${f.audience_term === t ? "var(--blue)" : "var(--border)"}`, color: f.audience_term === t ? "var(--blue-d)" : "var(--ink)", borderRadius: 20, padding: "6px 15px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>{t}</button>)}</div>
              </div>
              <div className="field"><label>คำติดปาก/สไตล์การพูด <span className="muted">(ถ้ามี)</span></label><textarea value={f.catchphrases} onChange={upd("catchphrases")} onFocus={() => setFocus(null)} style={{ minHeight: 56 }} placeholder="เช่น ติดคำว่า 'บอกเลย' / ลงท้ายด้วย 🩵 / พูดตรงๆ ไม่อ้อม" /></div>
              <div className="field"><label>โทนที่อยากได้</label><ChipGroup options={TONES} value={f.tone} onChange={v => setVal("tone", v)} /></div>
            </div>}
          </div>

          <label className="row" style={{ alignItems: "flex-start", fontSize: 13, color: "var(--muted)", margin: "4px 2px 14px" }}>
            <input type="checkbox" style={{ width: 18, height: 18, marginTop: 3 }} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>ฉันยินยอมให้ Babe House เก็บและใช้ข้อมูลที่กรอก (รวมถึงรูปสถิติ) เพื่อวิเคราะห์และสร้างแผนคอนเทนต์เฉพาะตัว ตาม <Link to="/privacy" target="_blank" className="link">นโยบายความเป็นส่วนตัว</Link></span>
          </label>
          <button className="btn full" type="submit" disabled={busy}>{busy ? "กำลังไปหน้าสรุป..." : "ดูสรุป & ดำเนินการต่อ →"}</button>
          <p className="center muted" style={{ fontSize: 13, marginTop: 10 }}>ราคาเต็ม <span style={{ textDecoration: "line-through" }}>1,590฿</span> · โปรเปิดตัว <b style={{ color: "var(--blue)" }}>490฿</b> · มีหน้าสรุป/ใส่โค้ดก่อนจ่าย กดแล้วยังไม่ตัดเงิน</p>
        </div>}

        {/* ===== ปุ่มนำทาง (ขั้น 1-3) ===== */}
        {step >= 1 && step <= 3 && <div className="row" style={{ gap: 10, marginTop: 16 }}>
          <button type="button" className="btn ghost" onClick={goBack} style={{ flex: 1 }}>← ย้อนกลับ</button>
          <button type="button" className="btn" onClick={goNext} style={{ flex: 2 }}>ถัดไป →</button>
        </div>}
        {step === 4 && <button type="button" className="btn ghost full" onClick={goBack} style={{ marginTop: 4 }}>← ย้อนกลับ</button>}

      </form>
    </div>
  );
}
