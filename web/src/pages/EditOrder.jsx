import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, session, getSource } from "../api.js";
import TaxInvoiceBox, { validateTax } from "../TaxInvoiceBox.jsx";
import { TAX_INVOICE_LIVE } from "../config.js";
import LoginBox from "../LoginBox.jsx";
import { OUR_STYLES } from "../editStyles.js";

// 🎬 ให้ทีมช่วยลงมือทำ — ลูกค้ามีสคริปต์อยู่แล้วจากเล่ม แค่ไม่มีเวลาตัด
// ขอบเขต (คิมเคาะ 2 ส.ค.): ตัดต่ออย่างเดียว · ลูกค้าส่งฟุตเทจ+เสียงเอง · ไม่รับถ่ายในเว็บ
const money = (n) => "฿" + Number(n || 0).toLocaleString();
const PACKS = [1, 5, 10, 15, 20, 30];   // คิมเคาะ 5 ส.ค. — เพิ่ม 5 กับ 15 อุดช่องว่างที่เดิมกระโดดไกลเกิน


export default function EditOrder() {
  const [sp] = useSearchParams();
  const [clips, setClips] = useState(Number(sp.get("clips")) || 1);
  const [price, setPrice] = useState(null);
  // 🔐 ยังไม่ล็อกอิน = ซื้อเครดิตไม่ได้ — เดิมขึ้นแค่ "เข้าสู่ระบบก่อนนะคะ" แล้วจบ ไม่มีทางไปล็อกอินต่อ
  const [authed, setAuthed] = useState(!!session.token);
  const [showLogin, setShowLogin] = useState(false);
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const brief = (() => { try { return JSON.parse(decodeURIComponent(sp.get("brief") || "")); } catch { return null; } })();

  const [credits, setCredits] = useState(0);
  const [tax, setTax] = useState(null);   // 🧾 ใบกำกับในนามบริษัท (null = ไม่ได้ขอ)
  // 🎟️ โค้ดส่วนลด (คิมสั่ง 11 ส.ค.) — เดิมหน้านี้เป็นที่เดียวที่ใส่โค้ดไม่ได้
  // ลูกค้าที่ได้โค้ดรางวัลแนะนำเพื่อนมาจึงเอามาใช้กับเครดิตตัดต่อไม่ได้เลย
  const [code, setCode] = useState("");
  const [promo, setPromo] = useState(null);
  const [codeMsg, setCodeMsg] = useState("");
  // ราคาเปลี่ยน (เปลี่ยนจำนวนคลิป) → ส่วนลดที่เช็กไว้ใช้ไม่ได้แล้ว ต้องกดใช้โค้ดใหม่ กันโชว์ราคาผิด
  useEffect(() => { setPromo(null); setCodeMsg(""); }, [clips]);
  async function checkCode() {
    const c = code.trim();
    if (!c) { setPromo(null); setCodeMsg(""); return; }
    if (!price?.total) return;
    setCodeMsg("กำลังตรวจ...");
    try {
      const r = await api("/api/promo/preview", { method: "POST", body: { code: c, amount_satang: price.total * 100 } });
      setPromo(r); setCodeMsg(r.percent >= 100 ? "🎉 โค้ดนี้ได้เครดิตฟรีเลยค่ะ!" : `✅ ใช้ได้ ลด ${r.percent}%`);
    } catch (e) { setPromo(null); setCodeMsg(e.message || "โค้ดไม่ถูกต้องค่ะ"); }
  }
  const load = () => {
    if (!session.token) return;
    api("/api/edit/my", { token: session.token }).then(d => setOrders(d.orders || [])).catch(() => {});
    api("/api/edit/credits", { token: session.token }).then(d => setCredits(Number(d.credits || 0))).catch(() => {});
  };
  // ⚠️ ต้องส่ง token ไปด้วย — ไม่งั้นเซิร์ฟเวอร์ไม่รู้ว่าเป็นสมาชิกแพ็กไหน ส่วนลดจะไม่ขึ้น
  useEffect(() => { api(`/api/edit/price?clips=${clips}`, { token: session.token }).then(setPrice).catch(() => {}); }, [clips, session.token]);
  useEffect(load, []);   // eslint-disable-line

  // 🎯 มาจากลิงก์ /edit#buy → เลื่อนลงไปที่กล่องซื้อเครดิตให้เลย
  // ⚠️ หน้านี้ของขึ้นทีละส่วน (ราคา · เครดิตคงเหลือ · รายการงาน) ความสูงหน้าเลยขยับอยู่หลายวินาที
  //    ถ้าสั่งเลื่อนครั้งเดียวตอนไหนก็ตาม มีโอกาสพลาดสูงมาก (ลองแล้วไม่ขยับเลย)
  //    → ตามเลื่อนซ้ำจนกว่ากล่องจะเข้ามาอยู่ในจอจริง แล้วค่อยหยุด
  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#buy") return;
    let tries = 0;
    const t = setInterval(() => {
      const el = document.getElementById("buy");
      if (el) {
        const top = el.getBoundingClientRect().top;
        if (top > -20 && top < window.innerHeight * 0.6) { clearInterval(t); return; }   // เข้าที่แล้ว
        el.scrollIntoView({ behavior: tries === 0 ? "smooth" : "instant", block: "start" });
      }
      if (++tries > 12) clearInterval(t);   // ~3 วินาที เผื่อเน็ตช้า แล้วเลิกตาม
    }, 250);
    return () => clearInterval(t);
  }, []);

  // 🎟️ ซื้อเครดิตตัดต่อ — ไม่ต้องเลือกตอนนี้ว่าจะให้ตัดวันไหน ไปเลือกในตาราง 30 วันทีหลัง
  // (คิมเคาะ 2 ส.ค.: เดิมบังคับเลือกจำนวนคลิปพร้อมบรีฟวันเดียว ลูกค้างงว่าอีก 29 คลิปคืออะไร)
  async function order() {
    if (!session.token) { setShowLogin(true); setMsg("เข้าสู่ระบบก่อนนะคะ — ล็อกอินตรงนี้ได้เลยค่ะ"); return; }
    const bad = validateTax(tax);
    if (bad) { setMsg(bad); return; }
    setBusy(true); setMsg("");
    try {
      const r = await api("/api/edit/credits/buy", { method: "POST", token: session.token, body: { credits: clips, tax, code: code.trim() || undefined, source: getSource() } });
      // จ่ายผ่าน Stripe → เด้งออกไปหน้าจ่ายเงิน · สนามเด็กเล่น → กลับมาโหลดยอดใหม่
      if (r.external && r.redirect_url) { location.href = r.redirect_url; return; }
      setMsg(`ได้เครดิตตัดต่อ ${clips} คลิปแล้วค่ะ 🎉 เปิดเล่มของคุณ แล้วเลือกได้เลยว่าจะให้ทีมตัดวันไหนบ้าง`);
      setCode(""); setPromo(null); setCodeMsg("");
      load();
    } catch (e) { setMsg(e.message || "ไม่สำเร็จ ลองใหม่นะคะ"); }
    finally { setBusy(false); }
  }

  return (
    <div className="wrap narrow page-pad">
      <div className="brand">BABE HOUSE · PRODUCTION</div>
      <h1 className="page" style={{ marginBottom: 4 }}>ให้ทีมช่วยลงมือทำ</h1>
      <p className="sub" style={{ marginBottom: 20 }}>
        มีแผนแล้วแต่ไม่มีเวลาตัด — ซื้อเครดิตตัดต่อไว้ แล้วเปิดเล่มเลือกได้เลยว่าจะให้ทีมตัดวันไหนบ้าง
      </p>

      {/* เครดิตคงเหลือ — เห็นทันทีว่ามีสิทธิ์ค้างอยู่กี่คลิป */}
      {credits > 0 && (
        <div className="card" style={{ marginTop: 0, background: "#F5F1FD", border: "1px solid #DDD2F0" }}>
          <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 15 }}>🎬 คุณมีเครดิตตัดต่อ <span style={{ color: "var(--blue)" }}>{credits} คลิป</span></span>
            <Link className="link" to="/account" style={{ fontSize: 13.5, fontWeight: 700 }}>เปิดเล่มไปเลือกวัน →</Link>
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.6 }}>
            เข้าเล่มของคุณ → แท็บคอนเทนต์ → แตะวันที่อยากให้ทีมตัด แล้วกด “ให้ทีมตัดคลิปนี้” ได้เลยค่ะ
          </div>
        </div>
      )}

      {/* 📝 งานนอกแผน 30 วัน — พลอยทัก 11 ส.ค. "ถ้าเขามีโปรเจคแยกล่ะ จะสั่งตรงไหน"
          ⚠️ ต้องโผล่เสมอ ไม่ใช่เฉพาะตอนมีเครดิต — คิมเปิดมาแล้วเครดิต 0 เลยไม่เห็นปุ่ม (11 ส.ค.) */}
      <div className="card" style={{ marginTop: 12, background: "#F6F2FE", border: "1.5px solid #C4B2EC" }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 3 }}>📝 มีงานที่ไม่ได้อยู่ในแผน 30 วัน?</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 11, lineHeight: 1.65 }}>
          งานอีเวนต์ · รีวิวสินค้า · คลิปสปอนเซอร์ · คลิปที่ถ่ายไว้แล้วอยากให้ทีมตัด — บรีฟตรงนี้ได้เลย ใช้เครดิตใบเดียวกันค่ะ
        </div>
        <Link to="/edit/new?free=1" className="btn full"
          style={{ background: "#4B2FA8", textAlign: "center", display: "block", textDecoration: "none" }}>
          {/* ⚠️ ห้ามใช้ ＋ (fullwidth) — เบราว์เซอร์ตกไปใช้ฟอนต์จีน กลายเป็นตัวจีน (คิมเจอ 11 ส.ค.) */}
          ✏️ บรีฟงานนอกแผน 30 วัน
        </Link>
      </div>

      {/* 🎬 ตัวอย่างงานจริงของทีม — พลอยทัก 11 ส.ค. "ลูกค้าไม่เห็นภาพว่าจะได้ประมาณไหน ก่อนกดซื้อ"
          ใช้ชุดเดียวกับที่ให้เลือกตอนบรีฟงาน (คิมสั่ง) แก้ที่ editStyles.js ที่เดียวขึ้นทั้ง 2 หน้า */}
      <div className="card" style={{ marginTop: credits > 0 ? 12 : 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 3 }}>🎬 ตัวอย่างงานที่ทีมเราตัด</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 11, lineHeight: 1.6 }}>
          กดดูได้เลยค่ะ ว่างานที่ได้จะออกมาประมาณไหน — ตอนสั่งงานเลือกได้ว่าอยากได้แนวไหน
        </div>
        <div className="st-row">
          {OUR_STYLES.map(x => (
            <a key={x.id} href={x.url} target="_blank" rel="noreferrer" className="st"
               style={{ display: "block", textDecoration: "none", color: "inherit" }}>
              <span className="st-pick" style={{ cursor: "pointer" }}>
                <span style={{ fontSize: 17, flexShrink: 0 }}>▶</span>
                <span className="st-label">{x.label}</span>
              </span>
              <span className="st-see">ดูตัวอย่าง →</span>
            </a>
          ))}
        </div>
      </div>

      {/* 🎯 จุดหมายของปุ่ม "ซื้อเครดิตตัดต่อ →" จากหน้าบรีฟ — ต้องพาลงมาถึงตรงนี้เลย
          คิมเจอเอง 12 ส.ค.: กดแล้วเด้งไปบนสุดของหน้า /edit ต้องเลื่อนหาเองอีกยาว */}
      <div id="buy" className="card" style={{ marginTop: 12, scrollMarginTop: 90 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 3 }}>ซื้อเครดิตตัดต่อกี่คลิปดีคะ?</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10, lineHeight: 1.6 }}>
          1 เครดิต = ตัดให้ 1 คลิป · ยังไม่ต้องเลือกตอนนี้ว่าจะให้ตัดวันไหน · ซื้อเยอะราคาต่อคลิปถูกลง
          <br />ทุกราคารวมภาษีมูลค่าเพิ่มแล้ว · จ่ายด้วยบัตรเครดิตหรือสแกนพร้อมเพย์ก็ได้ค่ะ
        </div>
        {/* ปุ่มเลือกจำนวน — ตาราง 3 ช่อง = 2 บรรทัดพอดี ทุกปุ่มกว้างเท่ากัน ระยะห่างเท่ากัน
            (เดิมใช้ flex แล้วมันเรียง 5 + 1 ทำให้ปุ่มสุดท้ายยาวเต็มบรรทัด ดูไม่เรียบร้อย) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
          {PACKS.map(n => (
            <button key={n} onClick={() => setClips(n)}
              style={{ padding: "13px 8px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
                border: clips === n ? "2px solid var(--blue)" : "1px solid var(--border)",
                background: clips === n ? "#EDF4FB" : "#fff", fontWeight: 800, fontSize: 14 }}>
              {n} คลิป
            </button>
          ))}
        </div>

        {price && (
          <div style={{ background: "var(--soft)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
            <div className="between"><span className="muted" style={{ fontSize: 13.5 }}>ราคาต่อคลิป</span><b>{money(price.price_per_clip)}</b></div>
            {/* 🎬 ส่วนลดสมาชิกแพ็ก 12 เดือน — เซิร์ฟเวอร์คิดให้แล้ว หน้าเว็บแค่โชว์ว่าประหยัดไปเท่าไหร่ */}
            {price.member_off_pct > 0 && (
              <div className="between" style={{ marginTop: 6, fontSize: 13.5 }}>
                <span style={{ color: "#1a7f43", fontWeight: 700 }}>ส่วนลดสมาชิก {price.member_off_pct}%</span>
                <span style={{ color: "#1a7f43", fontWeight: 700 }}>−{money(price.member_saved)}</span>
              </div>
            )}
            <div className="between" style={{ marginTop: 6, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <span style={{ fontWeight: 700 }}>รวม {clips} คลิป</span>
              <span>
                {price.member_off_pct > 0 && (
                  <span className="muted" style={{ textDecoration: "line-through", fontSize: 15, marginRight: 8 }}>{money(price.full_total)}</span>
                )}
                <b style={{ fontSize: 22, color: "var(--blue)" }}>{money(price.total)}</b>
              </span>
            </div>
            {price.member_off_pct > 0 && (
              <div style={{ marginTop: 8, background: "#E8F5EE", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, color: "#1a7f43", fontWeight: 700 }}>
                🎉 ราคานี้เป็นราคาสมาชิกแพ็ก 12 เดือนของคุณแล้วค่ะ
              </div>
            )}
            {/* ราคาตั้งต้น (สั่งทีละคลิป) ดึงจากเซิร์ฟเวอร์ ไม่ฝังตัวเลขไว้ในหน้าเว็บ — ขึ้นราคาทีเดียวจบ */}
            {clips > 1 && (() => {
              const base = Math.max(...(price.tiers || []).map(t => t.price), price.price_per_clip);
              return base > price.price_per_clip ? (
                <div style={{ fontSize: 12.5, color: "#1a7f43", marginTop: 6, fontWeight: 700 }}>
                  ถูกลงคลิปละ {money(base - price.price_per_clip)} จากสั่งทีละคลิป
                </div>) : null;
            })()}
          </div>
        )}

        {/* ⛔ ตัดตัวเลือกสไตล์กับช่องโน้ตออกจากหน้านี้ (คิมทัก 3 ส.ค.)
            "เส้นทางการทำงานของลูกค้ามันซับซ้อนเกินไป" — หน้านี้ทำอย่างเดียวคือ "ซื้อเครดิตกี่คลิป"
            เรื่องสไตล์/ฟุตเทจ/โน้ต เป็นของ "คลิปนั้นๆ" ไปถามตอนสั่งงานจริงที่หน้าบรีฟ */}
        {/* 🎟️ ช่องใส่โค้ดส่วนลด — ใช้ได้ทั้งโค้ดรางวัลแนะนำเพื่อนและโค้ดโปรโมชั่น */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setPromo(null); setCodeMsg(""); }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); checkCode(); } }}
              placeholder="มีโค้ดส่วนลด? ใส่ตรงนี้"
              style={{ flex: 1, minWidth: 0, padding: "9px 11px", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13.5, fontFamily: "inherit", textTransform: "uppercase" }} />
            <button className="btn ghost" onClick={checkCode} style={{ padding: "9px 14px", fontSize: 13.5, whiteSpace: "nowrap" }}>ใช้โค้ด</button>
          </div>
          {codeMsg && <div style={{ fontSize: 12.5, marginTop: 6, color: promo ? "#1a7f43" : "#b3261e" }}>{codeMsg}</div>}
          {promo && <div style={{ background: "#e8f7ee", border: "1px solid #9ed3b0", borderRadius: 10, padding: "9px 12px", marginTop: 8, fontSize: 13.5, color: "#1a7f43", fontWeight: 700 }}>
            ราคาหลังใช้โค้ด: {promo.final <= 0 ? "ฟรี!" : `฿${(promo.final / 100).toLocaleString()}`}
          </div>}
        </div>
        {/* ⚠️ ต้องส่ง totalSatang เสมอ — ไม่งั้นกล่องสรุป "ยอดที่ต้องชำระ" ไม่ขึ้นเลย
            ลูกค้าติ๊ก "หัก ณ ที่จ่าย" แล้วเหมือนไม่มีอะไรเกิดขึ้น (พลอยแจ้ง 18 ส.ค. 69) */}
        {TAX_INVOICE_LIVE &&
          <TaxInvoiceBox onChange={setTax} totalSatang={promo ? promo.final : Math.round((price?.total || 0) * 100)} />}
        {!authed && showLogin
          ? <LoginBox title="เข้าสู่ระบบก่อนซื้อเครดิตนะคะ"
              hint={<>ใช้อีเมลเดิมที่เคยซื้อกับเรา — <b>เครดิตจะไปเข้าบัญชีนี้ค่ะ</b></>}
              onDone={async () => {
                setAuthed(true); setShowLogin(false); setMsg("");
                api(`/api/edit/price?clips=${clips}`, { token: session.token }).then(setPrice).catch(() => {});
                api("/api/edit/credits", { token: session.token }).then(d => setCredits(Number(d.credits || 0))).catch(() => {});
              }} />
          : <button className="btn full" onClick={order} disabled={busy}>{busy ? "กำลังส่ง…"
              : !authed ? "🔐 เข้าสู่ระบบ แล้วซื้อเครดิต"
              : promo ? (promo.final <= 0 ? `รับเครดิต ${clips} คลิป (ฟรี)` : `ซื้อเครดิต ${clips} คลิป · ฿${(promo.final / 100).toLocaleString()}`)
              : `ซื้อเครดิต ${clips} คลิป · ${money(price?.total)}`}</button>}
        {msg && <div className="msg" style={{ marginTop: 10 }}>{msg}</div>}

        {price?.eta_if_send_now && (
          <div style={{ marginTop: 12, background: "#F2F7F3", border: "1px solid #cfe3d6", borderRadius: 12, padding: "11px 14px", fontSize: 13.5, lineHeight: 1.7 }}>
            📅 ส่งฟุตเทจวันนี้ <b>ได้งานประมาณ {price.eta_if_send_now}</b><br />
            <span className="muted" style={{ fontSize: 12.5 }}>
              {price.lead_days} วันทำการ · ทีมทำหลายคลิปพร้อมกันได้ · ทีมทำงาน {price.hours}<br />
              นับเฉพาะวันทำการ ไม่รวมเสาร์-อาทิตย์และวันหยุด
            </span>
          </div>
        )}
        <div className="muted" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.75 }}>
          ✅ ตัดต่อ + ใส่ซับ + เอฟเฟกต์ + กราฟิกประกอบ · แก้ฟรี {price?.free_revisions ?? 2} ครั้ง<br />
          📎 คุณส่งฟุตเทจและไฟล์เสียงมาเอง (ลิงก์ Drive ก็ได้)<br />
          🎥 <b>ยังไม่รับงานถ่ายผ่านเว็บ</b> — อยากให้ทีมไปถ่ายด้วย ทักมาคุยกับทีมได้เลยค่ะ
        </div>
      </div>


      {orders.length > 0 && <>
        <h2 style={{ fontSize: 17, margin: "26px 0 10px" }}>งานของฉัน</h2>
        {orders.map(o => (
          <Link key={o.order_id} to={`/edit/${o.order_id}`} className="card"
            style={{ display: "block", textDecoration: "none", color: "inherit", marginTop: 0, marginBottom: 10 }}>
            <div className="between" style={{ gap: 8, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{o.clips} คลิป · {money((o.amount_satang || 0) / 100)}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>สั่งเมื่อ {new Date(o.created_at).toLocaleDateString("th-TH", { dateStyle: "medium" })}</div>
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 800, borderRadius: 20, padding: "5px 12px",
                background: o.status === "done" ? "#E8F5EE" : o.status === "awaiting_files" ? "#FDF3E4" : "#EAF3FC",
                color: o.status === "done" ? "#1a7f43" : o.status === "awaiting_files" ? "#C77700" : "#2E86DE" }}>
                {o.status_th}
              </span>
            </div>
          </Link>
        ))}
      </>}
    </div>
  );
}
