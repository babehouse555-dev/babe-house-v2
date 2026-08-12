import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { api, session } from "../api.js";
import { OUR_STYLES } from "../editStyles.js";

// 🎨 งานเก่าของทีมให้ลูกค้ากดเลือกว่าชอบสไตล์ไหน
// ⚠️ ย้ายมาจากหน้าซื้อเครดิต (คิมทัก 3 ส.ค.: "เส้นทางการทำงานของลูกค้ามันซับซ้อนเกินไป")
//    สไตล์เป็นเรื่องของ "คลิปนี้" ไม่ใช่เรื่องของ "การซื้อเครดิต" — ต้องถามตอนสั่งงานจริง

// ═══════ 🎬 หน้ากรอกรายละเอียดก่อนให้ทีมตัด (คิมสั่ง 3 ส.ค. 2569) ═══════
// "หน้านี้ไปให้เขาใส่รายละเอียดก่อน แล้วหักเครดิตตอนกดปุ่มด้านในดีกว่า
//  ขึ้นแบบนี้ลูกค้าไม่กล้ากด กลัวเครดิตหายเลย"
//
// เดิม: กดปุ่มในเล่ม → เด้ง confirm → หักเครดิตทันที (น่ากลัว ไม่รู้ว่าจะได้กรอกอะไรไหม)
// ใหม่: กดปุ่ม → มาหน้านี้ ดูสคริปต์ + กรอกฟุตเทจ/โน้ต → กดส่งค่อยหักเครดิต
// ⛔ ตราบใดที่ยังไม่กดปุ่มล่างสุด เครดิตไม่หายแม้แต่คลิปเดียว (เขียนบอกลูกค้าให้ชัด)

export default function EditBrief() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const bpId = sp.get("blueprint_id") || "";
  const cycle = sp.get("billing_cycle") || "";
  const day = Number(sp.get("day") || 0);

  const [bp, setBp] = useState(null);
  const [credits, setCredits] = useState(null);
  const [f, setF] = useState({ footage_url: "", voice_url: "", ref_links: "", note: "" });
  const [picks, setPicks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // 🆕 งานนอกแผน 30 วัน — ไม่ผูกกับเล่ม/วันไหน (พลอยขอ 11 ส.ค.)
  const freeJob = sp.get("free") === "1";
  const [jobTitle, setJobTitle] = useState("");
  useEffect(() => {
    if (freeJob) {
      api(`/api/edit/credits`, { token: session.token }).then(d => setCredits(d.credits ?? 0)).catch(() => {});
      return;
    }
    if (!bpId || !cycle) return;
    const uid = sp.get("user_id") || "";
    api(`/api/blueprints/latest?user_id=${encodeURIComponent(uid)}&billing_cycle=${encodeURIComponent(cycle)}&blueprint_id=${encodeURIComponent(bpId)}`)
      .then(d => setBp(d.blueprint)).catch(() => {});
    api(`/api/edit/credits?blueprint_id=${encodeURIComponent(bpId)}`, { token: session.token })
      .then(d => setCredits(d.credits ?? 0)).catch(() => {});
  }, [bpId, cycle]);   // eslint-disable-line

  const cal = ((bp?.calendar) || []).find(c => Number(c.d) === day) || {};
  const script = ((bp?.scripts) || []).find(x => Number(x.d) === day) || null;

  async function submit() {
    setBusy(true); setErr("");
    try {
      const r = await api("/api/edit/use-credit", { method: "POST", token: session.token, body: freeJob
        ? { script_day: null, job_title: jobTitle, ref_picks: picks, ...f }
        : { blueprint_id: bpId, billing_cycle: cycle, script_day: day,
            brief: { d: day, t: cal.t || "", h: cal.h || "", script },
            ref_picks: picks, ...f } });
      nav(`/edit/${r.order_id}`);
    } catch (e) {
      setErr(e.message || "ส่งไม่สำเร็จ ลองใหม่นะคะ");
      setBusy(false);
    }
  }

  const back = freeJob ? "/edit"
    : `/dashboard?user_id=${encodeURIComponent(sp.get("user_id") || "")}&billing_cycle=${encodeURIComponent(cycle)}&blueprint_id=${encodeURIComponent(bpId)}`;

  if (!freeJob && (!day || !bpId)) return <div className="wrap narrow page-pad"><p className="muted">ลิงก์ไม่ถูกต้องค่ะ</p></div>;

  return (
    <div className="wrap narrow page-pad">
      <Link className="link" to={back}>← กลับไปที่เล่มของฉัน</Link>
      <div className="brand" style={{ marginTop: 12 }}>BABE HOUSE · ให้ทีมตัดคลิป</div>
      <h1 className="page" style={{ marginBottom: 4 }}>{freeJob ? "บรีฟงานตัดต่อ" : `คลิปวันที่ ${day}`}</h1>
      {/* เครดิตหมด = บอกให้ชัดตั้งแต่ต้น ไม่ให้กรอกเสร็จแล้วค่อยเด้ง error (คิมเจอ 11 ส.ค.) */}
      {freeJob && credits === 0 && (
        <div className="card" style={{ background: "#FFF6E6", border: "1px solid #F0D89C", marginTop: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 4 }}>⚠️ ยังไม่มีเครดิตตัดต่อ</div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
            กรอกบรีฟไว้ก่อนได้เลยค่ะ แต่ต้องซื้อเครดิตก่อนถึงจะส่งงานให้ทีมได้นะคะ
          </div>
          {/* #buy = พาไปที่กล่องซื้อเครดิตในหน้า /edit โดยตรง ไม่ใช่บนสุดของหน้า (คิมเจอ 12 ส.ค.) */}
          <Link to="/edit#buy" className="btn full" style={{ marginTop: 11, textAlign: "center", display: "block", textDecoration: "none" }}>
            ซื้อเครดิตตัดต่อ →
          </Link>
        </div>
      )}
      {freeJob && (
        <div className="field" style={{ marginTop: 14 }}>
          <label>งานนี้เกี่ยวกับอะไร <span className="muted">(ตั้งชื่อสั้นๆ ให้ทีมเรียกงานนี้)</span></label>
          <input value={jobTitle} onChange={e => setJobTitle(e.target.value)}
            placeholder="เช่น คลิปรีวิวสินค้าใหม่ · คลิปงานอีเวนต์เมื่อวาน" />
        </div>
      )}
      <p className="sub">{cal.t || "ให้ทีม Babe House ตัดคลิปนี้ให้"}</p>

      {/* ✅ บอกให้ชัดตั้งแต่แรกว่ายังไม่หักอะไร ลูกค้าจะได้กล้ากรอก */}
      <div className="msg" style={{ background: "#eef7f0", color: "#1a7f43", lineHeight: 1.7, marginBottom: 16 }}>
        ✅ <b>ยังไม่หักเครดิตนะคะ</b> — จะหัก 1 คลิปตอนกดปุ่ม "ส่งงานให้ทีม" ด้านล่างเท่านั้น
        {credits != null && <div style={{ fontSize: 13, marginTop: 3 }}>ตอนนี้คุณมี <b>{credits} คลิป</b></div>}
      </div>

      {/* สคริปต์ที่ทีมจะใช้ตัด — ลูกค้าไม่ต้องเขียนบรีฟเอง */}
      {script && <div className="card" style={{ background: "var(--soft)" }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>📄 บรีฟที่ทีมจะได้ (จากแผนของคุณ)</div>
        {(script.beats || []).map((b, i) => (
          <div key={i} style={{ padding: "7px 0", borderTop: i ? "1px solid var(--border)" : 0, fontSize: 14, lineHeight: 1.7 }}>
            <span className="muted" style={{ fontSize: 12 }}>{b.ts} · {b.s}</span>
            <div>{b.say}</div>
          </div>
        ))}
        {script.cap && <div style={{ marginTop: 8, fontSize: 13.5 }}><b>แคปชั่น:</b> {script.cap}</div>}
      </div>}

      <div className="card">
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>📎 ส่งของให้ทีม</div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 14, lineHeight: 1.7 }}>
          ยังไม่มีฟุตเทจตอนนี้ก็ไม่เป็นไรค่ะ ส่งทีหลังได้ในหน้างานตัดต่อ — ทีมจะเริ่มตัดเมื่อได้ไฟล์ครบนะคะ
        </p>
        <div className="field">
          <label>ลิงก์ฟุตเทจ (Google Drive / iCloud)</label>
          <input value={f.footage_url} onChange={e => setF(v => ({ ...v, footage_url: e.target.value }))}
            placeholder="วางลิงก์ที่แชร์ให้คนอื่นเปิดดูได้" />
        </div>
        <div className="field">
          <label>ลิงก์ไฟล์เสียง <span className="muted">(ถ้ามี)</span></label>
          <input value={f.voice_url} onChange={e => setF(v => ({ ...v, voice_url: e.target.value }))}
            placeholder="ไม่มีก็เว้นว่างได้ค่ะ" />
        </div>
        {/* 🎨 อยากได้แนวไหน — เลือกจากงานเราหรือแปะลิงก์เอง */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 3 }}>🎨 อยากได้คลิปแนวไหน?</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>เลือกจากงานที่เราเคยทำ หรือแปะลิงก์คลิปที่ชอบมาก็ได้ค่ะ</div>
          <div className="st-row">
            {OUR_STYLES.map(x => {
              const on = picks.includes(x.id);
              return (
                <div key={x.id} className={`st${on ? " on" : ""}`}>
                  <button type="button" onClick={() => setPicks(p => on ? p.filter(i => i !== x.id) : [...p, x.id])} className="st-pick">
                    <span className="st-check">{on ? "✓" : ""}</span>
                    <span className="st-label">{x.label}</span>
                  </button>
                  <a href={x.url} target="_blank" rel="noreferrer" className="st-see">▶ ดูตัวอย่าง</a>
                </div>
              );
            })}
          </div>
          <input value={f.ref_links} onChange={e => setF(v => ({ ...v, ref_links: e.target.value }))}
            placeholder="หรือแปะลิงก์ TikTok / Reels ที่ชอบ" style={{ marginTop: 10 }} />
        </div>
        <div className="field">
          <label>อยากบอกทีมเพิ่ม</label>
          <textarea value={f.note} onChange={e => setF(v => ({ ...v, note: e.target.value }))} style={{ minHeight: 76 }}
            placeholder="เช่น อยากได้โทนอุ่นๆ · ตัดให้จังหวะเร็ว · ห้ามใส่ซับ" />
        </div>

        {err && <div className="msg" style={{ background: "#fde8e8", color: "#b42318", marginBottom: 10 }}>{err}</div>}

        <button className="btn full" onClick={submit} disabled={busy} style={{ fontSize: 15.5 }}>
          {busy ? "กำลังส่ง…" : "🎬 ส่งงานให้ทีม · ใช้เครดิต 1 คลิป"}
        </button>
        <p className="muted center" style={{ fontSize: 12.5, marginTop: 10 }}>
          กดแล้วจะหักเครดิต 1 คลิป{credits != null ? ` (เหลือ ${Math.max(0, credits - 1)} คลิป)` : ""} · ยกเลิกทีหลังไม่ได้นะคะ
        </p>
      </div>
    </div>
  );
}
