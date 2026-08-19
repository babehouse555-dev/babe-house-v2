// ═══════ กล่องเข้าสู่ระบบแบบอยู่กับที่ — ใช้ตรงไหนก็ได้ ไม่ต้องพาลูกค้าออกจากหน้า ═══════
//
// ⚠️ ทำไมต้องมี: เดิมการล็อกอินอยู่ในหน้า "บัญชีของฉัน" หน้าเดียว
//    ลูกค้าที่กรอกบรีฟงานตัดต่อจนเสร็จแล้วกดส่ง ถ้ายังไม่ได้ล็อกอินจะเจอแค่ "เข้าสู่ระบบก่อนนะคะ"
//    ตัวหน้าไม่มีทางไปล็อกอินให้เลย ต้องออกไปหน้าอื่นเอง = บรีฟที่พิมพ์มาหายหมด
//    (คิมเจอเองบนมือถือ 13 ส.ค. 2569)
// → กล่องนี้ล็อกอินเสร็จตรงนั้นเลย ไม่มีการเปลี่ยนหน้า ของที่กรอกไว้จึงอยู่ครบเสมอ

import { useState } from "react";
import { api, session } from "./api.js";
import EmailTypoWarn from "./EmailTypoWarn.jsx";

export default function LoginBox({ title = "เข้าสู่ระบบก่อนส่งงานนะคะ", hint, onDone }) {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [devCode, setDevCode] = useState("");

  async function sendCode() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr("ใส่อีเมลให้ถูกต้องนะคะ"); return; }
    setBusy(true); setErr("");
    try {
      const d = await api("/api/auth/request-otp", { method: "POST", body: { email: email.trim().toLowerCase() } });
      setDevCode(d.dev_code || ""); setStep("otp");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function verify() {
    if (code.trim().length !== 6) { setErr("รหัสมี 6 หลักค่ะ"); return; }
    setBusy(true); setErr("");
    try {
      const d = await api("/api/auth/verify-otp", { method: "POST", body: { email: email.trim().toLowerCase(), code: code.trim() } });
      session.set(d.token, d.email);
      onDone?.(d.email);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ background: "#F5F1FD", border: "1.5px solid #C4B2EC" }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 3 }}>🔐 {title}</div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12, lineHeight: 1.65 }}>
        {hint || <>ใช้อีเมลเดิมที่เคยซื้อกับเรานะคะ — <b>ล็อกอินตรงนี้ได้เลย ไม่ต้องออกจากหน้านี้ ของที่กรอกไว้ไม่หายค่ะ</b></>}
      </div>

      {step === "email" ? (
        <>
          <div className="field">
            <label>อีเมลของคุณ</label>
            <input type="email" inputMode="email" autoComplete="email" value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendCode()}
              placeholder="you@email.com" />
            {/* 📧 พิมพ์อีเมลผิดตรงนี้ = ไม่ได้รหัส OTP เลย ล็อกอินไม่ได้ทั้งที่จ่ายเงินแล้ว */}
            <EmailTypoWarn value={email} onFix={setEmail} />
          </div>
          <button className="btn full" onClick={sendCode} disabled={busy}>
            {busy ? "กำลังส่งรหัส…" : "ส่งรหัส 6 หลักไปที่อีเมล"}
          </button>
        </>
      ) : (
        <>
          <div className="field">
            <label>รหัส 6 หลักที่ส่งไปที่ {email}</label>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={e => e.key === "Enter" && verify()}
              placeholder="000000" style={{ letterSpacing: 4, fontSize: 18, textAlign: "center" }} />
          </div>
          {devCode && <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>🎮 สนามทดสอบ · รหัสคือ <b>{devCode}</b></div>}
          <button className="btn full" onClick={verify} disabled={busy}>
            {busy ? "กำลังตรวจรหัส…" : "ยืนยันรหัส"}
          </button>
          <button className="link" onClick={() => { setStep("email"); setCode(""); setErr(""); }}
            style={{ background: "none", border: 0, padding: "10px 0 0", fontSize: 13, cursor: "pointer", display: "block", margin: "0 auto" }}>
            ← ใช้อีเมลอื่น
          </button>
        </>
      )}

      {err && <div className="msg" style={{ background: "#fde8e8", color: "#b42318", marginTop: 10, marginBottom: 0 }}>{err}</div>}
    </div>
  );
}
