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
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [showSample, setShowSample] = useState(false);

  useEffect(() => { if (orderId) refresh(); }, [orderId]);

  async function refresh() {
    try {
      const d = await api(`/api/video-audit/${orderId}`);
      if (d.audit_status === "ready" && d.audit) { setAudit(d.audit); return setPhase("ready"); }
      if (d.audit_status === "analyzing") { setPhase("analyzing"); return poll(); }
      if (d.paid) { // จ่ายแล้ว — มีคลิปเก็บไว้แล้ว → เริ่มวิเคราะห์เลย
        if (d.has_video || d.audit_status === "uploaded") return startAnalysis();
        return setPhase("upload"); // จ่ายแล้วแต่คลิปหาย (เคสหายาก) → ให้อัปใหม่
      }
      return d.has_video ? setPhase("needpay") : setPhase("intro"); // ยังไม่จ่าย: อัปแล้ว→รอจ่าย, ยังไม่อัป→หน้าแนะนำ
    } catch { setPhase("intro"); }
  }

  // flow ใหม่: อัปคลิปก่อน → แล้วค่อยไปจ่าย (จ่ายเสร็จ AI ถึงเริ่มวิเคราะห์)
  async function submitUpload() {
    setErr("");
    if (!file) { setErr("เลือกคลิปก่อนนะคะ"); return; }
    if (file.size > 24 * 1024 * 1024) { setErr("คลิปใหญ่เกินไป (เกิน 24MB) — ลองคลิปสั้นกว่า ~1 นาที หรือลดความละเอียดนะคะ"); return; }
    if (!email.trim()) { setErr("ใส่อีเมลด้วยนะคะ (ไว้ส่งผลวิเคราะห์)"); return; }
    setBusy(true);
    try {
      const c = await api("/api/video-audit/create", { method: "POST", body: { email: email.trim().toLowerCase() } });
      const video = await fileToBase64(file);
      await api("/api/video-audit/upload", { method: "POST", body: { order_id: c.order_id, video, mime: file.type || "video/mp4", context } });
      if (showCode && code.trim()) { // มีโค้ด → ลองใช้ก่อน ถ้าฟรีข้ามจ่ายเลย
        const r = await api("/api/apply-code", { method: "POST", body: { order_id: c.order_id, code: code.trim() } });
        if (r.free) { window.location.href = `/video-audit?order_id=${encodeURIComponent(c.order_id)}`; return; }
      }
      const pay = await api("/api/create-payment-session", { method: "POST", body: { order_id: c.order_id } });
      window.location.href = pay.redirect_url;
    } catch (e) { setErr(e.message || "อัปคลิปไม่สำเร็จ ลองใหม่นะคะ"); setBusy(false); }
  }

  async function payExisting() { // กลับมาหน้าที่อัปคลิปแล้วแต่ยังไม่จ่าย
    setBusy(true); setErr("");
    try { const pay = await api("/api/create-payment-session", { method: "POST", body: { order_id: orderId } }); window.location.href = pay.redirect_url; }
    catch (e) { setErr(e.message); setBusy(false); }
  }

  async function startAnalysis() { // จ่ายแล้ว → สั่ง AI วิเคราะห์คลิปที่เก็บไว้
    setPhase("analyzing"); setErr("");
    try { await api("/api/video-audit/analyze", { method: "POST", body: { order_id: orderId } }); poll(); }
    catch (e) { setErr(e.message || "เริ่มวิเคราะห์ไม่สำเร็จ ลองรีเฟรชนะคะ"); }
  }

  function poll() {
    let n = 0;
    const t = setInterval(async () => {
      n++;
      try {
        const d = await api(`/api/video-audit/${orderId}`);
        if (d.audit_status === "ready" && d.audit) { clearInterval(t); setAudit(d.audit); setPhase("ready"); }
        else if (d.audit_status === "error" || d.audit_status === "uploaded") { clearInterval(t); setErr("วิเคราะห์ไม่สำเร็จ ลองกดวิเคราะห์อีกครั้งนะคะ (คลิปยังอยู่ ไม่ต้องอัปใหม่)"); setPhase("analyzeretry"); }
      } catch {}
      if (n > 75) { clearInterval(t); setErr("ใช้เวลานานผิดปกติ ลองรีเฟรชหน้าดูนะคะ"); }
    }, 4000);
  }

  return (
    <div className="wrap narrow page-pad">
      <div className="brand">BABE HOUSE · VIDEO AUDIT</div>
      <h1 className="page">🎬 ครูพี่คิม AI ตรวจคลิป</h1>

      {phase === "loading" && <div className="card center muted">กำลังโหลด...</div>}

      {phase === "intro" && <>
        <p className="sub">ลงคลิปแล้วแต่ <b>คนไม่ดู / ไม่ซื้อ / ไม่กดติดตาม</b>? ส่งคลิปให้ครูพี่คิม (AI) ดูทุกวินาที แล้วบอกตรงๆ ว่าต้องแก้อะไร</p>
        <div className="card">
          <h3 style={{ margin: "0 0 10px" }}>ครูพี่คิม AI ดูให้ครบทุกจุด</h3>
          {[["🎣", "Hook 3 วิแรก", "เปิดยังไงให้คนหยุดนิ้ว ไม่เลื่อนผ่าน"], ["🎨", "ภาพ / แต่งตัว / แสง", "หน้าสว่างไหม ฉากกลืนตัวรึเปล่า"], ["🎙️", "น้ำเสียง / จังหวะพูด", "พูดเร็วไป? มีจุดเน้นให้จำไหม"], ["✂️", "การตัดต่อ", "คัต/ซูม/ตัวอักษร พอให้ไม่น่าเบื่อไหม"], ["💬", "แคปชัน / ปิดท้าย (CTA)", "ชวนคอมเมนต์/ติดตามรึยัง"]].map(([ic, t, d], i) =>
            <div key={i} className="row" style={{ gap: 11, alignItems: "flex-start", padding: "8px 0", borderTop: i ? "1px solid var(--border)" : 0 }}>
              <span style={{ fontSize: 20 }}>{ic}</span><div><div style={{ fontWeight: 700, fontSize: 14 }}>{t}</div><div className="muted" style={{ fontSize: 12.5 }}>{d}</div></div>
            </div>)}
        </div>

        <div className="center" style={{ margin: "4px 0 8px" }}>
          <button type="button" onClick={() => setShowSample(s => !s)} style={{ background: "none", border: 0, color: "var(--blue)", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>👀 {showSample ? "ซ่อนตัวอย่าง" : "ดูตัวอย่างผลวิเคราะห์จริง"}</button>
        </div>
        {showSample && <><div className="card" style={{ background: "#eef7f0", border: "1px dashed #9ed3b0", color: "#1a7f43" }}>👇 นี่คือ<b>ตัวอย่าง</b> — ของจริงครูพี่คิม (AI) จะดู<b>คลิปของคุณเอง</b> แล้ววิเคราะห์ทีละวินาทีแบบนี้</div><AuditView a={SAMPLE} /></>}

        <div className="card" style={{ border: "1px solid var(--blue)", marginTop: 8 }}>
          <div className="row" style={{ alignItems: "baseline", gap: 8, marginBottom: 4 }}><div style={{ fontSize: 30, fontWeight: 800, color: "var(--blue)" }}>{baht(19900)}</div><span className="muted">/ คลิป · จ่ายครั้งเดียวต่อ 1 คลิป</span></div>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>อัปคลิปก่อน แล้วค่อยจ่าย — จ่ายเสร็จครูพี่คิมเริ่มตรวจให้ทันที</p>
          <button className="btn full" onClick={() => { setErr(""); setPhase("upload"); }}>🎬 เริ่มตรวจคลิป →</button>
        </div>
      </>}

      {phase === "upload" && <>
        <div className="card">
          <h3 style={{ margin: "0 0 4px" }}>📤 อัปคลิปที่อยากให้ครูพี่คิมตรวจ</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>ขั้นที่ 1/2 — อัปคลิป แล้วขั้นต่อไปจ่าย {baht(19900)} เพื่อปลดล็อกผล</p>
          <div className="field"><label>อัปโหลดคลิป (mp4/mov · แนะนำสั้นกว่า 1 นาที · ไม่เกิน ~25MB)</label>
            <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={e => setFile(e.target.files?.[0] || null)} />
            {file && <div className="hint">เลือกแล้ว: {file.name} ({(file.size / 1048576).toFixed(1)}MB)</div>}
          </div>
          <div className="field"><label>อีเมล (ไว้ส่งผลวิเคราะห์)</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" /></div>
          <div className="field"><label>อยากให้ครูพี่คิมรู้อะไรเพิ่ม? <span className="muted">(ไม่บังคับ)</span></label><textarea value={context} onChange={e => setContext(e.target.value)} style={{ minHeight: 64 }} placeholder="เช่น คลิปนี้อยากขายคอร์ส / รู้สึกว่าคนดูไม่จบ" /></div>
          {err && <div className="msg err">{err}</div>}
          <button className="btn full" disabled={busy} onClick={submitUpload}>{busy ? "กำลังอัปคลิป..." : `ถัดไป — จ่าย ${baht(19900)} ปลดล็อกผล →`}</button>
          <p className="center muted" style={{ fontSize: 13, margin: "10px 0 0" }}>ชำระผ่านบัตร/PromptPay · คลิปจะถูกตรวจหลังจ่ายเสร็จ</p>
          {!showCode
            ? <div className="center" style={{ marginTop: 8 }}><button type="button" onClick={() => { setShowCode(true); setErr(""); }} style={{ background: "none", border: 0, color: "var(--blue)", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>มีโค้ดเข้าใช้ฟรี/ส่วนลด? กดที่นี่</button></div>
            : <div style={{ borderTop: "1px dashed var(--border)", marginTop: 10, paddingTop: 12 }}>
                <div className="field" style={{ marginBottom: 0 }}><label>โค้ดส่วนลด / โค้ดฟรี</label><input value={code} onChange={e => setCode(e.target.value)} placeholder="เช่น BABETEAM" style={{ textTransform: "uppercase" }} /></div>
                <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>ใส่โค้ดไว้ แล้วกดปุ่มด้านบนได้เลย — ถ้าโค้ดฟรีจะข้ามจ่าย</p>
              </div>}
        </div>
      </>}

      {phase === "needpay" && <>
        <div className="card" style={{ background: "#eef7f0", border: "1px solid #bfe3cc", color: "#1a7f43", fontWeight: 700 }}>✓ อัปคลิปเรียบร้อย — จ่ายเพื่อให้ครูพี่คิมเริ่มตรวจได้เลยค่ะ</div>
        <div className="card" style={{ border: "1px solid var(--blue)" }}>
          <div className="row" style={{ alignItems: "baseline", gap: 8, marginBottom: 12 }}><div style={{ fontSize: 30, fontWeight: 800, color: "var(--blue)" }}>{baht(19900)}</div><span className="muted">/ คลิป</span></div>
          {err && <div className="msg err">{err}</div>}
          <button className="btn full" disabled={busy} onClick={payExisting}>{busy ? "กำลังดำเนินการ..." : `🔓 จ่าย ${baht(19900)} · ปลดล็อกผล`}</button>
          <p className="center muted" style={{ fontSize: 13, margin: "10px 0 0" }}>ชำระผ่านบัตร/PromptPay</p>
        </div>
      </>}

      {phase === "analyzeretry" && <div className="card center" style={{ padding: "30px 20px" }}>
        <div style={{ fontSize: 36 }}>😅</div>
        <h3 style={{ margin: "10px 0 6px" }}>ขออภัยค่ะ วิเคราะห์ไม่สำเร็จ</h3>
        {err && <p className="muted" style={{ fontSize: 14 }}>{err}</p>}
        <button className="btn" style={{ marginTop: 12 }} onClick={startAnalysis}>🎬 ลองวิเคราะห์อีกครั้ง</button>
      </div>}

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
