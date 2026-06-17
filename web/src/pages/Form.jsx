import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, filesToBase64, getRef, currentCycle, session } from "../api.js";

export default function Form() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const renew = sp.get("renew") === "1";
  const [f, setF] = useState({ email: "", instagram_account: "", business_type: "", starting_point: "", monthly_goal: "", competitor_1: "", competitor_2: "" });
  const [files, setFiles] = useState([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const email = sp.get("email") || session.email || "";
    const ig = sp.get("ig") || "";
    setF(v => ({ ...v, email: email || v.email, instagram_account: ig || v.instagram_account }));
  }, []);

  const upd = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }));

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
        form_responses: { business_type: f.business_type, starting_point: f.starting_point, monthly_goal: f.monthly_goal, competitor_1: f.competitor_1, competitor_2: f.competitor_2 },
        insight_images: images, insight_screenshot_base64: images[0] || null
      };
      const r = await api("/api/checkout", { method: "POST", body: { tier: "Premium_490", payload } });
      nav(r.checkout_url || `/checkout?order_id=${r.order_id}`);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <div className="wrap narrow page-pad">
      <div className="brand">BABE HOUSE · AI CREATOR BLUEPRINT</div>
      <h1 className="page">{renew ? `เพิ่มแผนเดือนใหม่ (${currentCycle().replace("_", " ")})` : "สร้างเล่มแผนคอนเทนต์ส่วนตัว"}</h1>
      <p className="sub">{renew ? "ต่อแผนเดือนนี้เพื่อปลดล็อกตารางคอนเทนต์ 30 วันใหม่ และเทียบความคืบหน้า 🩵" : "กรอกข้อมูล + แนบ Insight หลังบ้าน → ชำระเงิน → AI วิเคราะห์เป็น Dashboard ส่วนตัว"}</p>
      <Link className="btn full" to="/account" style={{ marginBottom: 18 }}>นักเรียนเก่า Log in →</Link>
      <form onSubmit={submit}>
        <div className="card">
          <div className="field"><label>อีเมล (ใช้เข้าดูเล่มย้อนหลังทุกเดือน)</label><input type="email" required value={f.email} onChange={upd("email")} placeholder="you@email.com" /><div className="hint">ใช้อีเมลเดิมทุกเดือนเพื่อเก็บประวัติและติดตามการเติบโต</div></div>
          <div className="field"><label>Instagram / TikTok Account</label><input required value={f.instagram_account} onChange={upd("instagram_account")} placeholder="เช่น @babehouse_academy" /></div>
          <div className="field"><label>ประเภทธุรกิจ</label><input required value={f.business_type} onChange={upd("business_type")} placeholder="เช่น สถาบันสอน / เจ้าของแบรนด์ / คลินิก" /></div>
          <div className="field"><label>จุดตั้งต้น / ปัญหาหลังบ้านเดือนนี้</label><textarea required value={f.starting_point} onChange={upd("starting_point")} placeholder="เช่น คนส่องโปรไฟล์เยอะ แต่กดลิงก์น้อย" /></div>
          <div className="field"><label>เป้าหมายประจำเดือน</label><textarea required value={f.monthly_goal} onChange={upd("monthly_goal")} placeholder="เช่น เพิ่มยอดสมัครคอร์ส / อุดรอยรั่ว Link-in-bio" /></div>
          <div className="field"><label>คู่แข่งช่องที่ 1 <span className="muted">(Optional)</span></label><input value={f.competitor_1} onChange={upd("competitor_1")} placeholder="เว้นว่างได้ เดี๋ยว AI วิเคราะห์ให้" /></div>
          <div className="field"><label>คู่แข่งช่องที่ 2 <span className="muted">(Optional)</span></label><input value={f.competitor_2} onChange={upd("competitor_2")} placeholder="เว้นว่างได้ค่ะ" /></div>
          <div className="field"><label>แนบภาพสถิติหลังบ้าน (สูงสุด 8 รูป)</label>
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => setFiles(e.target.files)} />
            <div className="hint">แนบได้หลายรูป (Reach, Profile Visits, Link Taps, Audience) — ยิ่งครบ AI ยิ่งแม่น</div>
            {files.length > 0 && <div className="hint">เลือกแล้ว {Math.min(files.length, 8)} รูป</div>}
          </div>
        </div>
        <label className="row" style={{ alignItems: "flex-start", fontSize: 13, color: "var(--muted)", margin: "4px 2px 14px" }}>
          <input type="checkbox" style={{ width: 18, height: 18, marginTop: 3 }} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>ฉันยินยอมให้ Babe House เก็บและใช้ข้อมูลที่กรอก (รวมถึงรูปสถิติ) เพื่อวิเคราะห์และสร้างแผนคอนเทนต์เฉพาะตัว ตาม <Link to="/privacy" target="_blank" className="link">นโยบายความเป็นส่วนตัว</Link></span>
        </label>
        {err && <div className="msg err">{err}</div>}
        <button className="btn full" type="submit" disabled={busy}>{busy ? "กำลังเปิดหน้าชำระเงิน..." : "ไปหน้าชำระเงิน 490฿"}</button>
      </form>
    </div>
  );
}
