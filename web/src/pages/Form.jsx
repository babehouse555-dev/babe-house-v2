import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, filesToBase64, getRef, currentCycle, session } from "../api.js";

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

export default function Form() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const renew = sp.get("renew") === "1";
  const [f, setF] = useState({ email: "", display_name: "", instagram_account: "", business_type: "", starting_point: "", monthly_goal: "", competitor_1: "", competitor_2: "" });
  const [files, setFiles] = useState([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [focus, setFocus] = useState(null);

  useEffect(() => {
    const email = sp.get("email") || session.email || "";
    const ig = sp.get("ig") || "";
    setF(v => ({ ...v, email: email || v.email, instagram_account: ig || v.instagram_account }));
  }, []);

  const upd = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }));
  const fillExample = (k) => { setF(v => ({ ...v, [k]: GUIDE[k].example })); };
  // props ช่วยใส่ onFocus + render guide ใต้ช่อง (มือถือ)
  const fieldProps = (k) => ({ onFocus: () => setFocus(k) });

  async function submit(e) {
    e.preventDefault();
    if (!consent) { setErr("กรุณายอมรับนโยบายความเป็นส่วนตัวก่อนค่ะ"); return; }
    setBusy(true); setErr("");
    try {
      const images = await filesToBase64([...files], 8);
      const userId = `babe_user_${Date.now()}`;
      const payload = {
        user_id: userId, email: f.email.trim().toLowerCase(), referred_by: getRef(),
        meta_purchase: { tier: "Premium_490", billing_cycle: currentCycle() },
        instagram_account: f.instagram_account,
        form_responses: { business_type: f.business_type, starting_point: f.starting_point, monthly_goal: f.monthly_goal, competitor_1: f.competitor_1, competitor_2: f.competitor_2, display_name: f.display_name },
        insight_images: images, insight_screenshot_base64: images[0] || null
      };
      const r = await api("/api/checkout", { method: "POST", body: { tier: "Premium_490", payload } });
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
          <div className="msg" style={{ background: "#fff7e6", color: "#8a6d1f", border: "1px dashed #e0b85b", marginBottom: 16 }}>
            ✍️ <b>กรอกยิ่งละเอียด ผลลัพธ์ยิ่งแม่น</b> — คลิกที่แต่ละช่อง จะมีตัวอย่าง + ไกด์ช่วยกรอกให้ค่ะ
          </div>
          <Link className="btn full" to="/account" style={{ marginBottom: 18 }}>นักเรียนเก่า Log in →</Link>
          <form onSubmit={submit}>
            <div className="card">
              <div className="field"><label>อีเมล (ใช้เข้าดูเล่มย้อนหลังทุกเดือน)</label><input type="email" required value={f.email} onChange={upd("email")} onFocus={() => setFocus(null)} placeholder="you@email.com" /><div className="hint">ใช้อีเมลเดิมทุกเดือนเพื่อเก็บประวัติและติดตามการเติบโต</div></div>

              <div className="field"><label>ชื่อที่อยากให้ครูพี่คิมเรียก <span className="muted">(ไม่บังคับ)</span></label><input value={f.display_name} onChange={upd("display_name")} onFocus={() => setFocus(null)} placeholder="เช่น พี่มะปราง / Namo" /><div className="hint">ครูพี่คิมจะทักด้วยชื่อนี้ในเล่ม — เว้นว่างได้ จะเรียก "คุณ" แทน</div></div>

              <div className="field"><label>Instagram / TikTok Account</label><input required value={f.instagram_account} onChange={upd("instagram_account")} {...fieldProps("instagram_account")} placeholder="เช่น @babehouse_academy" />{inlineGuide("instagram_account")}</div>

              <div className="field"><label>ประเภทธุรกิจ</label><input required value={f.business_type} onChange={upd("business_type")} {...fieldProps("business_type")} placeholder="เช่น สถาบันสอน / เจ้าของแบรนด์ / คลินิก" />{inlineGuide("business_type")}</div>

              <div className="field"><label>จุดตั้งต้น / ปัญหาหลังบ้านเดือนนี้</label><textarea required value={f.starting_point} onChange={upd("starting_point")} {...fieldProps("starting_point")} style={{ minHeight: 100 }} placeholder="เช่น คนส่องโปรไฟล์เยอะ แต่กดลิงก์น้อย" />{inlineGuide("starting_point")}</div>

              <div className="field"><label>เป้าหมายประจำเดือน</label><textarea required value={f.monthly_goal} onChange={upd("monthly_goal")} {...fieldProps("monthly_goal")} style={{ minHeight: 90 }} placeholder="เช่น เพิ่มยอดสมัครคอร์ส / อุดรอยรั่ว Link-in-bio" />{inlineGuide("monthly_goal")}</div>

              <div className="field"><label>คู่แข่งช่องที่ 1 <span className="muted">(Optional)</span></label><input value={f.competitor_1} onChange={upd("competitor_1")} {...fieldProps("competitor_1")} placeholder="เว้นว่างได้ เดี๋ยว AI วิเคราะห์ให้" />{inlineGuide("competitor_1")}</div>

              <div className="field"><label>คู่แข่งช่องที่ 2 <span className="muted">(Optional)</span></label><input value={f.competitor_2} onChange={upd("competitor_2")} {...fieldProps("competitor_2")} placeholder="เว้นว่างได้ค่ะ" />{inlineGuide("competitor_2")}</div>

              <div className="field" onClick={() => setFocus("images")}><label>แนบภาพสถิติหลังบ้าน (สูงสุด 8 รูป)</label>
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple onFocus={() => setFocus("images")} onChange={(e) => setFiles(e.target.files)} />
                <div className="hint">แนบได้หลายรูป (Reach, Profile Visits, Link Taps, Audience) — ยิ่งครบ AI ยิ่งแม่น</div>
                {files.length > 0 && <div className="hint">เลือกแล้ว {Math.min(files.length, 8)} รูป</div>}
                {inlineGuide("images")}
              </div>
            </div>
            <label className="row" style={{ alignItems: "flex-start", fontSize: 13, color: "var(--muted)", margin: "4px 2px 14px" }}>
              <input type="checkbox" style={{ width: 18, height: 18, marginTop: 3 }} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>ฉันยินยอมให้ Babe House เก็บและใช้ข้อมูลที่กรอก (รวมถึงรูปสถิติ) เพื่อวิเคราะห์และสร้างแผนคอนเทนต์เฉพาะตัว ตาม <Link to="/privacy" target="_blank" className="link">นโยบายความเป็นส่วนตัว</Link></span>
            </label>
            {err && <div className="msg err">{err}</div>}
            <button className="btn full" type="submit" disabled={busy}>{busy ? "กำลังเปิดหน้าชำระเงิน..." : "จ่าย 490฿ เพื่อปลดล็อก Blueprint ของฉัน"}</button>
            <p className="center muted" style={{ fontSize: 13, marginTop: 10 }}>ราคาเต็ม <span style={{ textDecoration: "line-through" }}>1,590฿</span> · โปรเปิดตัว <b style={{ color: "var(--blue)" }}>490฿</b></p>
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
