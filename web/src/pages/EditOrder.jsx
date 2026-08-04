import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, session } from "../api.js";
import TaxInvoiceBox, { validateTax } from "../TaxInvoiceBox.jsx";
import { TAX_INVOICE_LIVE } from "../config.js";

// 🎬 ให้ทีมช่วยลงมือทำ — ลูกค้ามีสคริปต์อยู่แล้วจากเล่ม แค่ไม่มีเวลาตัด
// ขอบเขต (คิมเคาะ 2 ส.ค.): ตัดต่ออย่างเดียว · ลูกค้าส่งฟุตเทจ+เสียงเอง · ไม่รับถ่ายในเว็บ
const money = (n) => "฿" + Number(n || 0).toLocaleString();
const PACKS = [1, 5, 10, 15, 20, 30];   // คิมเคาะ 5 ส.ค. — เพิ่ม 5 กับ 15 อุดช่องว่างที่เดิมกระโดดไกลเกิน


export default function EditOrder() {
  const [sp] = useSearchParams();
  const [clips, setClips] = useState(Number(sp.get("clips")) || 1);
  const [price, setPrice] = useState(null);
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const brief = (() => { try { return JSON.parse(decodeURIComponent(sp.get("brief") || "")); } catch { return null; } })();

  const [credits, setCredits] = useState(0);
  const [tax, setTax] = useState(null);   // 🧾 ใบกำกับในนามบริษัท (null = ไม่ได้ขอ)
  const load = () => {
    if (!session.token) return;
    api("/api/edit/my", { token: session.token }).then(d => setOrders(d.orders || [])).catch(() => {});
    api("/api/edit/credits", { token: session.token }).then(d => setCredits(Number(d.credits || 0))).catch(() => {});
  };
  useEffect(() => { api(`/api/edit/price?clips=${clips}`).then(setPrice).catch(() => {}); }, [clips]);
  useEffect(load, []);   // eslint-disable-line

  // 🎟️ ซื้อเครดิตตัดต่อ — ไม่ต้องเลือกตอนนี้ว่าจะให้ตัดวันไหน ไปเลือกในตาราง 30 วันทีหลัง
  // (คิมเคาะ 2 ส.ค.: เดิมบังคับเลือกจำนวนคลิปพร้อมบรีฟวันเดียว ลูกค้างงว่าอีก 29 คลิปคืออะไร)
  async function order() {
    if (!session.token) { setMsg("เข้าสู่ระบบก่อนนะคะ"); return; }
    const bad = validateTax(tax);
    if (bad) { setMsg(bad); return; }
    setBusy(true); setMsg("");
    try {
      const r = await api("/api/edit/credits/buy", { method: "POST", token: session.token, body: { credits: clips, tax } });
      // จ่ายผ่าน Stripe → เด้งออกไปหน้าจ่ายเงิน · สนามเด็กเล่น → กลับมาโหลดยอดใหม่
      if (r.external && r.redirect_url) { location.href = r.redirect_url; return; }
      setMsg(`ได้เครดิตตัดต่อ ${clips} คลิปแล้วค่ะ 🎉 เปิดเล่มของคุณ แล้วเลือกได้เลยว่าจะให้ทีมตัดวันไหนบ้าง`);
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

      <div className="card" style={{ marginTop: credits > 0 ? 12 : 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 3 }}>ซื้อเครดิตตัดต่อกี่คลิปดีคะ?</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10, lineHeight: 1.6 }}>
          1 เครดิต = ตัดให้ 1 คลิป · ยังไม่ต้องเลือกตอนนี้ว่าจะให้ตัดวันไหน · ซื้อเยอะราคาต่อคลิปถูกลง
          <br />ทุกราคารวมภาษีมูลค่าเพิ่มแล้ว · จ่ายด้วยบัตรเครดิตหรือสแกนพร้อมเพย์ก็ได้ค่ะ
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {PACKS.map(n => (
            <button key={n} onClick={() => setClips(n)}
              style={{ flex: "1 1 88px", padding: "12px 8px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
                border: clips === n ? "2px solid var(--blue)" : "1px solid var(--border)",
                background: clips === n ? "#EDF4FB" : "#fff", fontWeight: 800, fontSize: 14 }}>
              {n} คลิป
            </button>
          ))}
        </div>

        {price && (
          <div style={{ background: "var(--soft)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
            <div className="between"><span className="muted" style={{ fontSize: 13.5 }}>ราคาต่อคลิป</span><b>{money(price.price_per_clip)}</b></div>
            <div className="between" style={{ marginTop: 6, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <span style={{ fontWeight: 700 }}>รวม {clips} คลิป</span>
              <b style={{ fontSize: 22, color: "var(--blue)" }}>{money(price.total)}</b>
            </div>
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
        {TAX_INVOICE_LIVE && <TaxInvoiceBox onChange={setTax} />}
        <button className="btn full" onClick={order} disabled={busy}>{busy ? "กำลังส่ง…" : `ซื้อเครดิต ${clips} คลิป · ${money(price?.total)}`}</button>
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
