import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, session } from "../api.js";

export default function Account() {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [msg, setMsg] = useState(null);
  const [data, setData] = useState(null);
  const [ref, setRef] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (session.token) loadMonths(); }, []);
  // ถ้ามีเล่มกำลังสร้าง → รีเฟรชเองทุก 15 วิ จนกว่าจะเสร็จ (ลูกค้าไม่ต้องกดเอง)
  useEffect(() => {
    if (step !== "list" || !(data?.pending || []).length) return;
    const t = setInterval(() => { if (session.token) loadMonths(); }, 15000);
    return () => clearInterval(t);
  }, [step, data?.pending?.length]);

  async function loadMonths() {
    try {
      const d = await api("/api/me/blueprints", { token: session.token });
      setData(d); setStep("list");
      api("/api/me/referral", { token: session.token }).then(setRef).catch(() => {});
    } catch { session.clear(); setStep("email"); }
  }
  async function sendCode() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setMsg({ k: "err", t: "กรุณากรอกอีเมลให้ถูกต้อง" }); return; }
    setBusy(true); setMsg(null);
    try { const d = await api("/api/auth/request-otp", { method: "POST", body: { email: email.trim().toLowerCase() } }); setDevCode(d.dev_code || ""); setStep("otp"); }
    catch (e) { setMsg({ k: "err", t: e.message }); } finally { setBusy(false); }
  }
  async function verify() {
    if (code.length !== 6) { setMsg({ k: "err", t: "กรอกรหัส 6 หลัก" }); return; }
    setBusy(true); setMsg(null);
    try { const d = await api("/api/auth/verify-otp", { method: "POST", body: { email: email.trim().toLowerCase(), code } }); session.set(d.token, d.email); await loadMonths(); }
    catch (e) { setMsg({ k: "err", t: e.message }); } finally { setBusy(false); }
  }
  function logout() { session.clear(); setData(null); setStep("email"); }
  // สร้างลิงก์จาก origin จริงของเบราว์เซอร์ — ถูกเสมอแม้ APP_BASE_URL บนเซิร์ฟเวอร์จะไม่ถูกตั้ง
  const refLink = ref ? `${window.location.origin}/?ref=${encodeURIComponent(ref.code)}` : "";
  function copyRef() { if (refLink) navigator.clipboard.writeText(refLink); }

  return (
    <div className="wrap narrow page-pad">
      <div className="brand">BABE HOUSE · ACADEMY</div>
      <h1 className="page">บัญชีของฉัน</h1>
      <p className="sub">เข้าสู่ระบบเพื่อดูเล่ม Blueprint ย้อนหลังและติดตามการเติบโตทุกเดือน</p>

      {step === "email" && <div className="card">
        <div className="field"><label>อีเมลที่ใช้ตอนซื้อ</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" /></div>
        <button className="btn full" onClick={sendCode} disabled={busy}>ส่งรหัสเข้าอีเมล</button>
        {msg && <div className={`msg ${msg.k}`}>{msg.t}</div>}
      </div>}

      {step === "otp" && <div className="card">
        <label>รหัส 6 หลักที่ส่งไปที่ <b style={{ color: "var(--blue)" }}>{email}</b></label>
        <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="______" style={{ letterSpacing: 8, textAlign: "center", fontSize: 22 }} />
        {devCode && <div className="msg" style={{ background: "#fff7e6", color: "#8a6d1f", border: "1px dashed #e0b85b" }}>โหมดทดสอบ — รหัสของคุณคือ <b style={{ fontSize: 18 }}>{devCode}</b></div>}
        <button className="btn full" onClick={verify} disabled={busy} style={{ marginTop: 12 }}>ยืนยันและเข้าสู่ระบบ</button>
        <button className="link" onClick={() => setStep("email")} style={{ background: "none", border: 0, marginTop: 12 }}>← เปลี่ยนอีเมล</button>
        {msg && <div className={`msg ${msg.k}`}>{msg.t}</div>}
      </div>}

      {step === "list" && data && <>
        <div className="between" style={{ marginBottom: 14 }}><span className="muted">เล่มของ <b>{data.email}</b></span><button className="link" onClick={logout} style={{ background: "none", border: 0 }}>ออกจากระบบ</button></div>
        {(data.pending || []).map(p => p.status === "error"
          ? <div key={p.order_id} className="card" style={{ background: "#fff7e6", border: "1px solid #e8d49a" }}>
              <div style={{ fontWeight: 800, color: "#8a6d1f" }}>⚠️ เล่มเดือน {p.billing_cycle.replace("_", " ")} — กำลังสร้าง (สะดุดนิดหน่อย)</div>
              <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>ไม่ต้องห่วงนะคะ ระบบกำลังลองใหม่ให้อัตโนมัติ เดี๋ยวเสร็จส่งเมลแจ้งทันที — หรือกดดูสถานะได้เลยค่ะ</div>
              <Link className="btn full" to={`/processing?order_id=${encodeURIComponent(p.order_id)}`} style={{ marginTop: 12, background: "#8a6d1f" }}>ดูสถานะเล่ม</Link>
            </div>
          : <div key={p.order_id} className="card" style={{ background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", border: "1px solid #d6e7fa" }}>
              <div className="row" style={{ gap: 12, alignItems: "center" }}>
                <div className="spinner" style={{ width: 24, height: 24, flexShrink: 0 }} />
                <div><div style={{ fontWeight: 800, color: "var(--blue-d)" }}>⏳ ครูพี่คิมกำลังสร้างเล่มของคุณอยู่นะคะ...</div><div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>เดือน {p.billing_cycle.replace("_", " ")} · กำลังทำงานอยู่ รอสักครู่ค่ะ — พอเสร็จจะส่งลิงก์เข้าเมล และเด้งขึ้นตรงนี้เองอัตโนมัติ 🩵</div></div>
              </div>
              <Link className="btn full" to={`/processing?order_id=${encodeURIComponent(p.order_id)}`} style={{ marginTop: 12 }}>ดูสถานะการสร้างเล่ม</Link>
            </div>)}
        {data.months.length === 0 && (data.pending || []).length === 0 && <div className="card center muted">ยังไม่มีเล่ม Blueprint ในบัญชีนี้</div>}
        {data.months.slice().reverse().map((m, i) =>
          <Link key={m.blueprint_id} className="card between" to={`/dashboard?user_id=${encodeURIComponent(m.user_id)}&billing_cycle=${encodeURIComponent(m.billing_cycle)}&blueprint_id=${encodeURIComponent(m.blueprint_id)}`} style={{ textDecoration: "none", color: "inherit", display: "flex" }}>
            <div><div style={{ fontWeight: 700, fontSize: 16 }}>{m.billing_cycle.replace("_", " ")}{i === 0 ? " · ล่าสุด" : ""}</div><div className="muted" style={{ fontSize: 13 }}>{(m.monthly_goal || "").slice(0, 60) || "—"}</div></div>
            <div style={{ color: "var(--blue)", fontSize: 20 }}>›</div>
          </Link>)}
        <Link className="card center" to={`/form?renew=1&email=${encodeURIComponent(data.email)}`} style={{ color: "var(--blue)", fontWeight: 700, display: "block" }}>+ เพิ่มแผนเดือนใหม่ (490฿)</Link>
        {data.months.length >= 1 && <Link className="btn full" to="/compare" style={{ marginBottom: 16 }}>📈 {data.months.length >= 2 ? "เทียบความคืบหน้าทุกเดือน" : "ดูสถิติ & เส้นทางการเติบโต"}</Link>}
        {ref && <div className="card" style={{ background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", border: "1px solid #d6e7fa" }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>🎁 ชวนเพื่อน รับส่วนลด</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>เพื่อนสมัครผ่านลิงก์คุณ — ได้ลด {ref.percent}% และคุณได้โค้ดลดเดือนถัดไป</div>
          <div className="row"><input readOnly value={refLink} style={{ flex: 1, fontSize: 13 }} /><button className="btn" onClick={copyRef} style={{ padding: "11px 16px" }}>คัดลอก</button></div>
          <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>แนะนำสำเร็จแล้ว: <b>{ref.count}</b> คน</div>
        </div>}
      </>}
    </div>
  );
}
