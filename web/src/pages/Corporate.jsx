import { useState, useEffect } from "react";
import { api } from "../api.js";
import { CORP_PREVIEW_ONLY } from "../config.js";

// ═══════ 🏢 อบรมองค์กร (in-house) — หน้าที่พูดกับ HR โดยตรง ═══════
//
// ทำไมต้องมีหน้านี้แยกจาก /workshop (คิมสั่ง 14 ส.ค. 2569):
//   ของนี้ "มีอยู่แล้ว" ในระบบ — คือ Private Class ที่มีบันไดราคาองค์กรครบตั้งแต่ ฿12,900–฿120,000
//   แต่ไปนั่งอยู่อันดับ 8 จาก 10 ในหน้า /workshop ปนกับคลาสละ ฿3,990 และใช้ชื่อว่า "คลาสส่วนตัว"
//   → HR ที่กำลังหาที่อบรมให้ทีมไม่มีทางหาเจอ และถึงเจอก็ไม่รู้ว่าขายให้บริษัทได้
//
// อัปเกรดรอบ 17 ส.ค. 2569 (คิมสั่ง): จาก "ฟอร์มส่งโจทย์" → "เครื่องคิดราคา"
//   "คัสตอมวิชาเรียนได้ว่าเค้าอยากเรียนอะไร เลือกได้ว่าจะเรียนกี่คน ราคามันก็จะไม่เท่ากัน
//    ทำทุกอย่างเสร็จสรรพในเว็บได้เลย ไม่ต้องผ่านแอดมินเยอะ"
//
// 💡 คอขวดจริงของลูกค้าองค์กรไม่ใช่ปุ่มจ่ายเงิน — คือ "รอคนตอบว่าเท่าไหร่"
//    หน้านี้จึงบอกราคาทันที + ส่งสรุปเข้าอีเมลให้เอาไปขออนุมัติได้ในวันเดียวกัน
//    (ยังไม่ตัดเงิน เพราะองค์กรต้องผ่านขั้นตอนอนุมัติภายในเสมอ)
//
// ⚠️ ราคาทุกตัวมาจากเซิร์ฟเวอร์ ห้ามคำนวณเองในไฟล์นี้ — คิดสองที่เมื่อไหร่ วันหนึ่งจะเพี้ยนคนละราคา

const BLUE = "var(--blue)";
const money = (n) => "฿" + Number(n || 0).toLocaleString("th-TH");

const STEPS = [
  { icon: "🎯", title: "เลือกวิชาที่ทีมต้องใช้", body: "ติ๊กได้หลายวิชา เรียนรวมกันได้ในวันเดียว ไม่คิดเพิ่ม" },
  { icon: "👥", title: "บอกจำนวนคน", body: "ราคาขึ้นกับขนาดทีมเท่านั้น เห็นตัวเลขทันทีไม่ต้องรอใครตอบ" },
  { icon: "🎤", title: "ครูพี่คิมสอนสดเต็มวัน", body: "ลงมือทำกับงานจริงของทีม ไม่ใช่เคสตัวอย่างจากที่อื่น" },
  { icon: "📊", title: "ส่งผลให้ฝ่ายบุคคล", body: "ใบประกาศรายคน + รายงานว่าใครเรียนไปแล้วแค่ไหน ใช้เคลียร์งบอบรมได้" },
];

const FAQ = [
  ["เลือกหลายวิชาราคาเพิ่มไหม", "ไม่เพิ่มค่ะ เหมาเต็มวัน เลือกกี่วิชาก็ได้ — เราจะจัดสัดส่วนเวลาให้ตามที่ทีมต้องใช้จริงมากที่สุด"],
  ["ออกใบกำกับภาษีในนามบริษัทได้ไหม", "ได้ค่ะ ระบบออกใบกำกับภาษีเต็มรูปให้ แจ้งชื่อบริษัทกับเลขผู้เสียภาษีมาตอนตกลงราคาได้เลย"],
  ["ต้องจ่ายก่อนไหม", "ไม่ต้องค่ะ กดส่งแล้วได้สรุปราคาเข้าอีเมลทันทีเอาไปขออนุมัติได้เลย เราส่งใบเสนอราคาอย่างเป็นทางการตามไปให้"],
  ["ทีมพื้นฐานไม่เท่ากันจะตามทันไหม", "ทันค่ะ คนที่ยังไม่เป็นดูคอร์สออนไลน์ปูพื้นก่อนได้ พอถึงวันเรียนสดทุกคนจะอยู่จุดใกล้กันแล้ว"],
  ["ทีมมากกว่า 30 คนได้ไหม", "ได้ค่ะ 31 คนขึ้นไปคิดเรตเดียว ใส่จำนวนจริงลงไปแล้วระบบคำนวณให้เลย"],
];

const inputStyle = { width: "100%", boxSizing: "border-box", fontSize: 15, padding: "11px 13px", borderRadius: 11, border: "1px solid var(--border)", fontFamily: "inherit", background: "#fff" };

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 5 }}>{label}</div>
      {hint && <div className="muted" style={{ fontSize: 12.5, marginBottom: 6, lineHeight: 1.55 }}>{hint}</div>}
      {children}
    </label>
  );
}

export default function Corporate() {
  const [cfg, setCfg] = useState(null);
  const [f, setF] = useState({ org_name: "", contact_name: "", email: "", phone: "", goal: "",
    headcount: "20", level: "", place: "ที่บริษัท (กรุงเทพฯ / ปริมณฑล)", refs_text: "", budget: "", when_text: "" });
  const [topics, setTopics] = useState([]);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => { api("/api/corp/pricing").then(setCfg).catch(() => setCfg({ topics: [], levels: [], places: [], tiers: [] })); }, []);
  // ราคาอัปเดตทุกครั้งที่เปลี่ยนจำนวนคน/สถานที่ — ถามเซิร์ฟเวอร์เสมอ ไม่คิดเองในหน้า
  useEffect(() => {
    if (!cfg) return;
    const n = Number(f.headcount) || 0;
    if (n < 1) { setQuote(null); return; }
    const ac = new AbortController();
    api(`/api/corp/quote?headcount=${n}&place=${encodeURIComponent(f.place)}`, { signal: ac.signal })
      .then(setQuote).catch(() => {});
    return () => ac.abort();
  }, [f.headcount, f.place, cfg]);

  const set = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }));
  const toggleTopic = (t) => setTopics(v => v.includes(t) ? v.filter(x => x !== t) : [...v, t]);

  async function send() {
    setBusy(true); setErr("");
    try {
      const d = await api("/api/corp/lead", { method: "POST", body: { ...f, topics, source: "corporate-page" } });
      setDone(d);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { setErr(e?.message || "ส่งไม่สำเร็จ ลองใหม่อีกครั้งนะคะ"); }
    setBusy(false);
  }

  if (done) return (
    <div className="wrap page-pad" style={{ maxWidth: 620 }}>
      <div className="card" style={{ textAlign: "center", padding: "34px 24px" }}>
        <div style={{ fontSize: 44 }}>🩵</div>
        <h1 className="page" style={{ marginTop: 8 }}>ได้รับโจทย์แล้วค่ะ</h1>
        <p style={{ fontSize: 15, lineHeight: 1.8, color: "var(--muted)" }}>{done.message}</p>
        {done.quote && (
          <div style={{ background: "var(--soft)", borderRadius: 14, padding: "16px 18px", marginTop: 18, textAlign: "left" }}>
            <div className="between" style={{ padding: "6px 0" }}><span>ทีม {done.quote.headcount} คน</span><b>{done.quote.tier_label}</b></div>
            <div className="between" style={{ padding: "6px 0" }}><span>ราคาเหมาเต็มวัน</span><b>{money(done.quote.base_satang / 100)}</b></div>
            {done.quote.travel_satang > 0 &&
              <div className="between" style={{ padding: "6px 0" }}><span>ค่าเดินทาง</span><b>{money(done.quote.travel_satang / 100)}</b></div>}
            <div className="between" style={{ padding: "10px 0 0", borderTop: "1px solid var(--border)", marginTop: 6 }}>
              <b>รวม</b><b style={{ fontSize: 22, color: BLUE }}>{money(done.quote.total_satang / 100)}</b>
            </div>
            {done.quote.note && <p className="muted" style={{ fontSize: 12.5, margin: "8px 0 0", lineHeight: 1.7 }}>{done.quote.note}</p>}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="wrap page-pad" style={{ maxWidth: 760 }}>
      {CORP_PREVIEW_ONLY && (
        <div style={{ background: "#FFF4E5", border: "1px solid #f0d9ae", borderRadius: 12, padding: "10px 14px",
          fontSize: 13, color: "#8a6d3b", marginBottom: 16, lineHeight: 1.6 }}>
          👀 <b>โหมดพรีวิว</b> — หน้านี้ลูกค้าจริงยังไม่เห็นค่ะ ราคาที่แสดงมาจากบันไดราคา Private Class ที่ใช้อยู่จริง
        </div>
      )}

      <div className="brand">BABE HOUSE · อบรมองค์กร</div>
      <h1 className="page">ติดอาวุธให้ทีมทำคอนเทนต์เองได้</h1>
      <p className="sub" style={{ maxWidth: 560 }}>
        เลือกวิชาที่ทีมต้องใช้ บอกจำนวนคน แล้วเห็นราคาทันทีในหน้านี้เลย —
        ไม่ต้องรออีเมลตอบกลับ เอาสรุปไปขออนุมัติได้วันนี้
      </p>

      <div className="row" style={{ gap: 12, flexWrap: "wrap", margin: "22px 0 30px" }}>
        {STEPS.map((s, i) => (
          <div key={i} className="card" style={{ flex: "1 1 168px", minWidth: 168, margin: 0, padding: "15px 16px" }}>
            <div style={{ fontSize: 22 }}>{s.icon}</div>
            <div style={{ fontWeight: 800, fontSize: 14.5, marginTop: 5 }}>{s.title}</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.65 }}>{s.body}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 19, margin: "0 0 4px" }}>ออกแบบวันอบรมของทีมคุณ</h2>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 20px", lineHeight: 1.7 }}>
          ราคาขยับตามจำนวนคนเท่านั้น — <b>เลือกกี่วิชาก็ได้ในวันเดียว ไม่คิดเพิ่ม</b>
        </p>

        <Field label="อยากให้ทีมเรียนเรื่องอะไรบ้าง" hint="ติ๊กได้หลายข้อ · ถ้าไม่มีที่ตรงใจ เขียนบอกในช่องโจทย์ด้านล่างได้เลย">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {(cfg?.topics || []).map(t => {
              const on = topics.includes(t);
              return (
                <button type="button" key={t} onClick={() => toggleTopic(t)}
                  style={{ border: `1.5px solid ${on ? BLUE : "var(--border)"}`, background: on ? BLUE : "#fff",
                    color: on ? "#fff" : "var(--ink)", borderRadius: 999, padding: "8px 15px",
                    fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  {on ? "✓ " : ""}{t}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 190px" }}>
            <Field label="ทีมกี่คน">
              <input type="number" min="1" max="9999" inputMode="numeric" value={f.headcount} onChange={set("headcount")} style={inputStyle} />
            </Field>
          </div>
          <div style={{ flex: "1 1 230px" }}>
            <Field label="อยากจัดที่ไหน">
              <select value={f.place} onChange={set("place")} style={inputStyle}>
                {(cfg?.places || []).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {/* 💰 ราคาโชว์สดตรงนี้ — หัวใจของหน้านี้ทั้งหน้า */}
        {quote && (
          <div style={{ background: "linear-gradient(158deg,#3E93E4,#1B6FC4)", color: "#fff", borderRadius: 16,
            padding: "18px 20px", margin: "6px 0 20px", boxShadow: "0 8px 22px rgba(27,111,196,.28)" }}>
            <div style={{ fontSize: 11.5, letterSpacing: ".12em", fontWeight: 700, opacity: .85 }}>ราคาสำหรับทีมของคุณ</div>
            <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.25, margin: "2px 0 6px" }}>{money(quote.total_satang / 100)}</div>
            <div style={{ fontSize: 13.5, opacity: .92, lineHeight: 1.75 }}>
              ทีม {quote.headcount} คน ({quote.tier_label}) · เรียนสดเต็มวันกับครูพี่คิม
              {topics.length > 0 && <><br />วิชาที่เลือก: {topics.join(" · ")}</>}
              {quote.travel_satang > 0 && <><br />รวมค่าเดินทาง {money(quote.travel_satang / 100)} แล้ว</>}
            </div>
            {quote.note && <div style={{ fontSize: 12.5, marginTop: 8, background: "rgba(255,255,255,.16)",
              borderRadius: 9, padding: "8px 11px", lineHeight: 1.65 }}>ℹ️ {quote.note}</div>}
            <div style={{ fontSize: 12.5, marginTop: 8, opacity: .9 }}>
              รวมใบประกาศรายคน + รายงานผลให้ฝ่ายบุคคล · ออกใบกำกับภาษีในนามบริษัทได้
            </div>
          </div>
        )}

        <Field label="อยากให้ทีมเก่งขึ้นเรื่องอะไร" hint="ไม่ต้องรู้ว่าอยากได้คอร์สอะไร บอกแค่ว่าทีมติดปัญหาตรงไหน เช่น “ทีมการตลาดถ่ายคลิปเองไม่เป็น ต้องจ้างข้างนอกทุกครั้ง”">
          <textarea value={f.goal} onChange={set("goal")} style={{ ...inputStyle, minHeight: 92 }} />
        </Field>

        <Field label="มีงานตัวอย่างที่อยากให้ทีมทำได้แบบนั้นไหม" hint="วางลิงก์มาได้เลย เช่น คลิป IG/TikTok ที่ชอบสไตล์ หรือเพจคู่แข่ง — จะได้ออกแบบวันสอนให้ตรงสไตล์ที่คุณต้องการจริงๆ">
          <textarea value={f.refs_text} onChange={set("refs_text")} placeholder={"https://www.instagram.com/reel/...\nhttps://www.tiktok.com/@..."} style={{ ...inputStyle, minHeight: 72 }} />
        </Field>

        <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 210px" }}>
            <Field label="พื้นฐานของทีมตอนนี้">
              <select value={f.level} onChange={set("level")} style={inputStyle}>
                <option value="">— เลือก —</option>
                {(cfg?.levels || []).map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ flex: "1 1 210px" }}>
            <Field label="อยากจัดช่วงไหน" hint="ไม่ต้องเป๊ะก็ได้ค่ะ">
              <input value={f.when_text} onChange={set("when_text")} placeholder="เช่น ต้นเดือนหน้า" style={inputStyle} />
            </Field>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>ให้เราติดต่อกลับที่ไหน</div>
          <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 210px" }}><Field label="ชื่อบริษัท"><input value={f.org_name} onChange={set("org_name")} style={inputStyle} /></Field></div>
            <div style={{ flex: "1 1 210px" }}><Field label="ชื่อผู้ติดต่อ"><input value={f.contact_name} onChange={set("contact_name")} style={inputStyle} /></Field></div>
          </div>
          <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 210px" }}><Field label="อีเมล" hint="สรุปราคาจะส่งไปที่นี่ทันที"><input type="email" value={f.email} onChange={set("email")} style={inputStyle} /></Field></div>
            <div style={{ flex: "1 1 210px" }}><Field label="เบอร์โทร (ไม่บังคับ)"><input value={f.phone} onChange={set("phone")} inputMode="tel" style={inputStyle} /></Field></div>
          </div>
          <Field label="งบที่ตั้งไว้ (ไม่บังคับ)" hint="บอกมาได้ตรงๆ เราจะจัดรูปแบบให้พอดีงบมากที่สุด">
            <input value={f.budget} onChange={set("budget")} placeholder="เช่น ไม่เกิน 80,000" style={inputStyle} />
          </Field>
        </div>

        {err && <div className="msg" style={{ background: "#fde8e8", color: "#b42318", marginBottom: 12 }}>{err}</div>}
        <button className="btn full" onClick={send} disabled={busy} style={{ padding: "14px 20px", fontSize: 16 }}>
          {busy ? "กำลังส่ง…" : "ส่งโจทย์ + รับสรุปราคาทางอีเมล"}
        </button>
        <p className="muted" style={{ fontSize: 12.5, textAlign: "center", margin: "10px 0 0", lineHeight: 1.7 }}>
          ยังไม่ต้องจ่ายอะไรตอนนี้ค่ะ · สรุปราคาเข้าอีเมลทันที เอาไปขออนุมัติได้เลย
        </p>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 18, margin: "0 0 14px" }}>บันไดราคา</h2>
        <table><thead><tr><th>ขนาดทีม</th><th style={{ textAlign: "right" }}>ราคาเหมาเต็มวัน</th></tr></thead>
          <tbody>{(cfg?.tiers || []).map(t => (
            <tr key={t.label}><td>{t.label}</td>
              <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(t.satang / 100)}</td></tr>
          ))}</tbody></table>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.75 }}>
          ราคาเป็นแบบเหมาต่อกลุ่ม ไม่ใช่ต่อคน · เลือกกี่วิชาก็ได้ในวันเดียว
          <br />สอนที่บริษัท มีค่าเดินทาง 2,000 บาท · ต่างจังหวัดมีค่าเครื่องบินและที่พักตามจริงเพิ่ม
        </p>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>คำถามที่ฝ่ายบุคคลถามบ่อย</h2>
        {FAQ.map(([q, a], i) => (
          <div key={i} style={{ padding: "11px 0", borderTop: i ? "1px solid var(--border)" : 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>{q}</div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 4, lineHeight: 1.75 }}>{a}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
