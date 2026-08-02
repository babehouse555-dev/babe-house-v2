import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, session } from "../api.js";

// 🎬 ให้ทีมช่วยลงมือทำ — ลูกค้ามีสคริปต์อยู่แล้วจากเล่ม แค่ไม่มีเวลาตัด
// ขอบเขต (คิมเคาะ 2 ส.ค.): ตัดต่ออย่างเดียว · ลูกค้าส่งฟุตเทจ+เสียงเอง · ไม่รับถ่ายในเว็บ
const money = (n) => "฿" + Number(n || 0).toLocaleString();
const PACKS = [1, 4, 10, 20, 30];

export default function EditOrder() {
  const [sp] = useSearchParams();
  const [clips, setClips] = useState(Number(sp.get("clips")) || 1);
  const [price, setPrice] = useState(null);
  const [orders, setOrders] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const brief = (() => { try { return JSON.parse(decodeURIComponent(sp.get("brief") || "")); } catch { return null; } })();

  const load = () => { if (session.token) api("/api/edit/my", { token: session.token }).then(d => setOrders(d.orders || [])).catch(() => {}); };
  useEffect(() => { api(`/api/edit/price?clips=${clips}`).then(setPrice).catch(() => {}); }, [clips]);
  useEffect(load, []);   // eslint-disable-line

  async function order() {
    if (!session.token) { setMsg("เข้าสู่ระบบก่อนสั่งงานนะคะ"); return; }
    setBusy(true); setMsg("");
    try {
      await api("/api/edit/order", { method: "POST", token: session.token, body: {
        clips, note, brief, blueprint_id: sp.get("bp") || undefined,
        billing_cycle: sp.get("cycle") || undefined, script_day: sp.get("day") || undefined } });
      setMsg("รับงานแล้วค่ะ 🎉 ส่งลิงก์ฟุตเทจให้ทีมได้เลยด้านล่าง"); setNote(""); load();
    } catch (e) { setMsg(e.message || "สั่งงานไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  return (
    <div className="wrap narrow page-pad">
      <div className="brand">BABE HOUSE · PRODUCTION</div>
      <h1 className="page" style={{ marginBottom: 4 }}>ให้ทีมช่วยลงมือทำ</h1>
      <p className="sub" style={{ marginBottom: 20 }}>
        มีแผนแล้วแต่ไม่มีเวลาตัด — ส่งฟุตเทจมา เดี๋ยวทีมครูพี่คิมตัดให้จากสคริปต์ในแผนของคุณเอง
      </p>

      {brief && (
        <div className="card" style={{ marginTop: 0, background: "#F4F8FD", border: "1px solid #d6e7fa" }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--blue)", marginBottom: 4 }}>📋 บรีฟจากแผนของคุณ — ไม่ต้องเขียนเอง</div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>วันที่ {brief.d} · {brief.t || brief.title || ""}</div>
          {brief.h && <div className="muted" style={{ fontSize: 13.5, marginTop: 4, lineHeight: 1.6 }}>ฮุก: {brief.h}</div>}
        </div>
      )}

      <div className="card" style={{ marginTop: brief ? 12 : 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>อยากให้ตัดกี่คลิป?</div>
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
            {clips > 1 && <div style={{ fontSize: 12.5, color: "#1a7f43", marginTop: 6, fontWeight: 700 }}>
              ถูกลงคลิปละ {money(1900 - price.price_per_clip)} จากสั่งทีละคลิป
            </div>}
          </div>
        )}

        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
          placeholder="อยากบอกทีมอะไรเพิ่มไหมคะ เช่น สไตล์ที่ชอบ เพลงที่อยากได้ (ไม่มีก็เว้นว่างได้)"
          style={{ width: "100%", boxSizing: "border-box", fontSize: 14, padding: "11px 13px", borderRadius: 12, border: "1px solid var(--border)", fontFamily: "inherit", marginBottom: 12 }} />

        <button className="btn full" onClick={order} disabled={busy}>{busy ? "กำลังส่ง…" : `สั่งงาน ${clips} คลิป · ${money(price?.total)}`}</button>
        {msg && <div className="msg" style={{ marginTop: 10 }}>{msg}</div>}

        {price?.eta_if_send_now && (
          <div style={{ marginTop: 12, background: "#F2F7F3", border: "1px solid #cfe3d6", borderRadius: 12, padding: "11px 14px", fontSize: 13.5, lineHeight: 1.7 }}>
            📅 ส่งฟุตเทจวันนี้ <b>ได้งานประมาณ {price.eta_if_send_now}</b><br />
            <span className="muted" style={{ fontSize: 12.5 }}>
              ทีมทำงาน {price.hours} · {price.working_now ? "ตอนนี้เปิดทำการอยู่ค่ะ" : "ตอนนี้นอกเวลาทำการ"} · นับเฉพาะวันทำการ ไม่รวมวันหยุด
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
