import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api, fileToBase64, baht, session } from "../api.js";

const SAMPLE = {
  first_impression: "คลิปมีพลังและของให้เล่าชัด แต่ 3 วิแรกยัง 'ขี่ม้าช้า' ทำให้คนเลื่อนผ่านก่อนถึงช่วงเด็ด",
  hook: { observation: "ช่วง 0:00–0:03 เปิดด้วยการนั่งยิ้มแล้วทักทาย 'สวัสดีค่ะวันนี้จะมา...' กว่าจะเข้าเรื่องคือวินาทีที่ 4", fix: "ตัดช่วงทักทายทิ้ง เปิดมาพูดประโยคเด็ด/ปมจริงทันทีตั้งแต่ 0:00 เช่น 'ทำคลิปมาเป็นสิบ ยอดไม่ขยับเลยใช่ไหม'" },
  visual: { observation: "เสื้อสีเข้มกลืนกับฉากหลังที่เป็นห้องค่อนข้างมืด หน้าไม่ค่อยสว่าง", fix: "เพิ่มไฟสว่างเข้าหน้า (นั่งหันเข้าหาหน้าต่าง/ใช้ไฟวงแหวน) + เลือกเสื้อสีตัดกับฉากหลังให้เด้ง" },
  voice: { observation: "พูดเร็วสม่ำเสมอทั้งคลิป ไม่มีจังหวะเน้น ทำให้ฟังเพลินแต่ไม่มีจุดสะดุดให้จำ", fix: "เน้นเสียงคำสำคัญให้หนักขึ้น + เว้นจังหวะเงียบ 1 วินาทีหลังประโยคฮุก ก่อนเฉลย" },
  editing: { observation: "ภาพแช่หน้าตรงนิ่งยาวเกือบทั้งคลิป ไม่มีคัต/ซูม/ตัวอักษรบนจอ", fix: "ตัดคัตหรือซูมเล็กๆ ทุก 2–3 วินาที + ใส่ตัวอักษรตัวหนาสรุปประเด็นเด้งตามที่พูด" },
  caption_cta: { observation: "แคปชันบอกว่าคลิปเกี่ยวกับอะไร แต่จบห้วน ไม่ได้ชวนให้คนมีส่วนร่วม", fix: "ปิดท้ายด้วยคำถามให้คนคอมเมนต์ เช่น 'ข้อไหนโดนคุณที่สุด?' + บอกให้กดติดตามไว้ดูตอนต่อไป" },
  top_fixes: ["เปลี่ยน 3 วิแรกให้เข้าเรื่องทันที ตัดคำทักทายทิ้ง", "เพิ่มไฟเข้าหน้า + จังหวะตัดต่อทุก 2–3 วิ", "ปิดท้ายด้วยคำถามชวนคอมเมนต์"],
  encouragement: "คลิปนี้มีของอยู่แล้วนะคะ แก้แค่ไม่กี่จุดก็ปังขึ้นเยอะเลย ลองทำคลิปหน้าแล้วส่งมาให้ครูพี่คิมดูอีกได้ค่ะ 🩵"
};

const SECTIONS = [["🎣", "Hook 3 วิแรก", "hook"], ["🎨", "ภาพ/แต่งตัว/ฉาก", "visual"], ["🎙️", "น้ำเสียง/จังหวะพูด", "voice"], ["✂️", "การตัดต่อ", "editing"], ["💬", "แคปชัน/ปิดท้าย", "caption_cta"]];

function AuditView({ a, blurred }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ filter: blurred ? "blur(6px)" : "none", pointerEvents: blurred ? "none" : "auto", userSelect: blurred ? "none" : "auto" }}>
        <div className="card" style={{ background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", border: "1px solid #d6e7fa" }}>
          <div style={{ fontWeight: 800, color: "var(--blue-d)", marginBottom: 6 }}>👀 ความรู้สึกแรกของครูพี่คิม</div>
          <div style={{ fontSize: 15, lineHeight: 1.7 }}>{a.first_impression}</div>
        </div>
        {SECTIONS.map(([ic, label, k]) => a[k] && (
          <div key={k} className="card">
            <div className="row" style={{ gap: 10, marginBottom: 8 }}><span style={{ fontSize: 22 }}>{ic}</span><h3 style={{ margin: 0, fontSize: 16 }}>{label}</h3></div>
            <div style={{ background: "var(--soft)", borderRadius: 12, padding: "10px 14px", marginBottom: 8 }}><div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--muted)", marginBottom: 3 }}>👁️ ที่ครูพี่คิมเห็น</div><div style={{ fontSize: 14 }}>{a[k].observation}</div></div>
            <div style={{ background: "#eef7f0", borderRadius: 12, padding: "10px 14px" }}><div style={{ fontWeight: 700, fontSize: 12.5, color: "#1a7f43", marginBottom: 3 }}>✅ แก้ยังไงในคลิปหน้า</div><div style={{ fontSize: 14 }}>{a[k].fix}</div></div>
          </div>
        ))}
        {a.top_fixes?.length > 0 && <div className="card" style={{ border: "1px solid var(--blue)" }}><h3 style={{ marginBottom: 10 }}>🎯 3 อย่างที่ต้องแก้ก่อนเลย</h3>
          {a.top_fixes.map((t, i) => <div key={i} className="row" style={{ gap: 10, margin: "8px 0" }}><span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--blue)", color: "#fff", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span><span style={{ fontSize: 14.5 }}>{t}</span></div>)}
        </div>}
        {a.encouragement && <div className="card" style={{ background: "#FBF9F4", fontStyle: "italic", fontSize: 14.5, lineHeight: 1.7 }}>💛 {a.encouragement}</div>}
      </div>
    </div>
  );
}

export default function VideoAudit() {
  const [sp] = useSearchParams();
  const orderId = sp.get("order_id");
  const [phase, setPhase] = useState(orderId ? "loading" : "intro");
  const [email, setEmail] = useState(session.email || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [file, setFile] = useState(null);
  const [context, setContext] = useState("");
  const [audit, setAudit] = useState(null);

  useEffect(() => { if (orderId) refresh(); }, [orderId]);

  async function refresh() {
    try {
      const d = await api(`/api/video-audit/${orderId}`);
      if (!d.paid) return setPhase("needpay");
      if (d.audit_status === "ready" && d.audit) { setAudit(d.audit); return setPhase("ready"); }
      if (d.audit_status === "analyzing") { setPhase("analyzing"); return poll(); }
      setPhase("upload");
    } catch { setPhase("intro"); }
  }

  async function unlock() {
    if (!email.trim()) { setErr("ใส่อีเมลก่อนนะคะ (ไว้ส่งผลวิเคราะห์)"); return; }
    setBusy(true); setErr("");
    try {
      const c = await api("/api/video-audit/create", { method: "POST", body: { email: email.trim().toLowerCase() } });
      const pay = await api("/api/create-payment-session", { method: "POST", body: { order_id: c.order_id } });
      window.location.href = pay.redirect_url;
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  async function analyze() {
    if (!file) { setErr("เลือกคลิปก่อนนะคะ"); return; }
    if (file.size > 24 * 1024 * 1024) { setErr("คลิปใหญ่เกินไป (เกิน 24MB) — ลองอัปคลิปสั้นกว่า ~1 นาที หรือลดความละเอียดลงนะคะ"); return; }
    setBusy(true); setErr("");
    try {
      const video = await fileToBase64(file);
      await api("/api/video-audit/analyze", { method: "POST", body: { order_id: orderId, video, mime: file.type || "video/mp4", context } });
      setPhase("analyzing"); setBusy(false); poll();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  function poll() {
    let n = 0;
    const t = setInterval(async () => {
      n++;
      try {
        const d = await api(`/api/video-audit/${orderId}`);
        if (d.audit_status === "ready" && d.audit) { clearInterval(t); setAudit(d.audit); setPhase("ready"); }
        else if (d.audit_status === "error") { clearInterval(t); setErr("วิเคราะห์ไม่สำเร็จ ลองอัปคลิปใหม่อีกครั้งนะคะ"); setPhase("upload"); }
      } catch {}
      if (n > 75) { clearInterval(t); setErr("ใช้เวลานานผิดปกติ ลองรีเฟรชหน้าดูนะคะ"); }
    }, 4000);
  }

  return (
    <div className="wrap narrow page-pad">
      <div className="brand">BABE HOUSE · VIDEO AUDIT</div>
      <h1 className="page">🎬 ครูพี่คิม AI ตรวจคลิป</h1>

      {phase === "loading" && <div className="card center muted">กำลังโหลด...</div>}

      {(phase === "intro" || phase === "needpay") && <>
        <p className="sub">ลงคลิปแล้วแต่ <b>คนไม่ดู / ไม่ซื้อ / ไม่กดติดตาม</b>? ส่งคลิปให้ครูพี่คิม (AI) ดูทุกวินาที แล้วบอกตรงๆ ว่าต้องแก้อะไร — Hook 3 วิแรก · ภาพ/แต่งตัว/แสง · น้ำเสียง/จังหวะ · การตัดต่อ · แคปชัน/CTA</p>
        <div className="card" style={{ background: "#fff7e6", border: "1px dashed #e0b85b", color: "#8a6d1f" }}>
          👇 <b>นี่คือตัวอย่างผลวิเคราะห์ที่คุณจะได้</b> (เบลอไว้บางส่วน) — ของจริงคือคลิป<b>ของคุณเอง</b> วิเคราะห์ทีละวินาที
        </div>
        <AuditView a={SAMPLE} blurred />
        <div className="card" style={{ border: "1px solid var(--blue)", marginTop: 8 }}>
          <h3 style={{ margin: "0 0 6px" }}>ปลดล็อกตรวจคลิปของคุณ</h3>
          <div className="row" style={{ alignItems: "baseline", gap: 8, marginBottom: 12 }}><div style={{ fontSize: 30, fontWeight: 800, color: "var(--blue)" }}>{baht(19900)}</div><span className="muted">/ คลิป</span></div>
          <div className="field"><label>อีเมล (ไว้ส่งผลวิเคราะห์)</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" /></div>
          {err && <div className="msg err">{err}</div>}
          <button className="btn full" disabled={busy} onClick={unlock}>{busy ? "กำลังไปหน้าชำระเงิน..." : "🔓 ปลดล็อกตรวจคลิป · 199฿"}</button>
          <p className="center muted" style={{ fontSize: 13, marginTop: 10 }}>จ่ายครั้งเดียวต่อ 1 คลิป · ชำระผ่านบัตร/PromptPay</p>
        </div>
      </>}

      {phase === "upload" && <>
        <div className="card" style={{ background: "#eef7f0", border: "1px solid #bfe3cc", color: "#1a7f43", fontWeight: 700 }}>✓ ชำระเงินแล้ว — อัปคลิปที่อยากให้ครูพี่คิมตรวจได้เลยค่ะ</div>
        <div className="card">
          <div className="field"><label>อัปโหลดคลิป (mp4/mov · แนะนำสั้นกว่า 1 นาที · ไม่เกิน ~25MB)</label>
            <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={e => setFile(e.target.files?.[0] || null)} />
            {file && <div className="hint">เลือกแล้ว: {file.name} ({(file.size / 1048576).toFixed(1)}MB)</div>}
          </div>
          <div className="field"><label>อยากให้ครูพี่คิมรู้อะไรเพิ่ม? <span className="muted">(ไม่บังคับ)</span></label><textarea value={context} onChange={e => setContext(e.target.value)} style={{ minHeight: 64 }} placeholder="เช่น คลิปนี้อยากขายคอร์ส / รู้สึกว่าคนดูไม่จบ" /></div>
          {err && <div className="msg err">{err}</div>}
          <button className="btn full" disabled={busy} onClick={analyze}>{busy ? "กำลังอัปโหลด..." : "ส่งให้ครูพี่คิมตรวจ 🎬"}</button>
        </div>
      </>}

      {phase === "analyzing" && <div className="card center" style={{ padding: "40px 20px" }}>
        <div style={{ fontSize: 40 }}>🎬</div>
        <h3 style={{ margin: "10px 0 6px" }}>ครูพี่คิมกำลังดูคลิปของคุณ...</h3>
        <p className="muted" style={{ fontSize: 14 }}>ดูทุกวินาที วิเคราะห์ภาพ-เสียง-จังหวะ ใช้เวลาประมาณ 1–2 นาที<br />เปิดหน้านี้ค้างไว้นะคะ เดี๋ยวผลขึ้นเอง</p>
      </div>}

      {phase === "ready" && audit && <>
        <div className="card" style={{ background: "#eef7f0", border: "1px solid #bfe3cc", color: "#1a7f43", fontWeight: 700 }}>✓ ครูพี่คิมตรวจคลิปเสร็จแล้ว! เลื่อนอ่านได้เลยค่ะ 🩵</div>
        <AuditView a={audit} />
        <div className="card center" style={{ marginTop: 8 }}>
          <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>แก้ตามนี้แล้วลองคลิปใหม่ ส่งมาให้ครูพี่คิมตรวจอีกได้นะคะ</p>
          <Link className="btn" to="/video-audit">🎬 ตรวจคลิปใหม่อีกคลิป</Link>
        </div>
      </>}
    </div>
  );
}
