import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, session } from "../api.js";

// 🎬 หน้างานเดี่ยว — ส่งไฟล์ · ดูสถานะ · คอมเมนต์งาน · กดรับงาน
// คิมขอ 2 ส.ค.: "มีช่องให้เค้าคอมเมนต์งาน แล้วมันก็เด้งระบบหลังบ้านทีม"
const money = (n) => "฿" + Number(n || 0).toLocaleString();
const STEPS = [
  { k: "awaiting_files", l: "ส่งไฟล์" },
  { k: "editing", l: "ทีมกำลังตัด" },
  { k: "draft_sent", l: "ดูงาน" },
  { k: "done", l: "เสร็จ" },
];

export default function EditJob() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [footage, setFootage] = useState("");
  const [voice, setVoice] = useState("");
  const [cmt, setCmt] = useState("");
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [rounds, setRounds] = useState(null);   // 🔁 รอบแก้ — รวบทุกจุดแล้วส่งทีเดียว

  const load = () => {
    api(`/api/edit/order/${id}`, { token: session.token }).then(setD).catch(() => setD({ err: true }));
    api(`/api/edit/rounds?order_id=${encodeURIComponent(id)}`, { token: session.token }).then(setRounds).catch(() => {});
  };
  useEffect(load, [id]);   // eslint-disable-line

  // เพิ่ม/ลบจุดที่อยากแก้ในรอบที่กำลังเขียน (ยังไม่ส่งให้ทีม)
  async function noteAdd() {
    if (!cmt.trim()) return;
    setBusy(true);
    try { await api("/api/edit/rounds/note", { method: "POST", token: session.token, body: { order_id: id, text: cmt.trim(), at: at.trim() } });
      setCmt(""); setAt(""); setMsg(""); load(); }
    catch (e) { setMsg(e.message || "เพิ่มไม่สำเร็จ"); } finally { setBusy(false); }
  }
  async function noteRemove(i) {
    setBusy(true);
    try { await api("/api/edit/rounds/note", { method: "POST", token: session.token, body: { order_id: id, remove: i } }); load(); }
    catch (e) { setMsg(e.message || "ลบไม่สำเร็จ"); } finally { setBusy(false); }
  }
  // ส่งทั้งรอบให้ทีมทีเดียว — ถ้าเป็นรอบที่ต้องจ่าย จะเด้งไปหน้าจ่ายเงินก่อน
  async function roundSubmit() {
    setBusy(true); setMsg("");
    try {
      await api("/api/edit/rounds/submit", { method: "POST", token: session.token, body: { order_id: id } });
      setMsg("ส่งให้ทีมแล้วค่ะ 🩵 ทีมจะแก้ให้ครบทุกจุดในรอบเดียว"); load();
    } catch (e) {
      if (/PAYMENT_REQUIRED/i.test(e.code || "") || /ค่าใช้จ่าย/.test(e.message || "")) { await payRound(); return; }
      setMsg(e.message || "ส่งไม่สำเร็จ");
    } finally { setBusy(false); }
  }
  async function payRound() {
    setBusy(true);
    try {
      const r = await api("/api/edit/rounds/checkout", { method: "POST", token: session.token, body: { order_id: id } });
      if (r.redirect_url) { location.href = r.redirect_url; return; }
      load();
    } catch (e) { setMsg(e.message || "เปิดหน้าจ่ายเงินไม่สำเร็จ"); } finally { setBusy(false); }
  }

  if (!d) return <div className="wrap narrow page-pad center"><p className="muted">กำลังโหลด…</p></div>;
  if (d.err) return <div className="wrap narrow page-pad center"><p className="muted">ไม่พบงานนี้ค่ะ</p></div>;
  const o = d.order;
  const stepIdx = Math.max(0, STEPS.findIndex(s => s.k === (o.status === "revising" ? "draft_sent" : o.status)));
  const overFree = Number(o.revisions_used || 0) >= (d.free_revisions ?? 2);

  const send = async (fn, ok) => { setBusy(true); setMsg(""); try { await fn(); setMsg(ok); await load(); } catch (e) { setMsg(e.message || "ไม่สำเร็จ"); } finally { setBusy(false); } };

  return (
    <div className="wrap narrow page-pad">
      <Link className="link" to="/edit" style={{ fontSize: 14 }}>← งานทั้งหมด</Link>
      <h1 className="page" style={{ margin: "10px 0 4px" }}>{o.clips} คลิป</h1>
      <p className="sub">{money((o.amount_satang || 0) / 100)} · สั่งเมื่อ {new Date(o.created_at).toLocaleDateString("th-TH", { dateStyle: "medium" })}</p>

      {/* แถบสถานะ */}
      <div className="card" style={{ marginTop: 0 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {STEPS.map((s, i) => (
            <div key={s.k} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 5, borderRadius: 20, background: i <= stepIdx ? "var(--blue)" : "var(--border)" }} />
              <div style={{ fontSize: 11.5, marginTop: 6, fontWeight: i === stepIdx ? 800 : 500, color: i <= stepIdx ? "var(--ink)" : "var(--muted)" }}>{s.l}</div>
            </div>
          ))}
        </div>
        <div className="center" style={{ marginTop: 12, fontWeight: 800, fontSize: 15.5, color: "var(--blue)" }}>{o.status_th}</div>
        {o.due_th && o.status !== "done" && (
          <div className="center" style={{ marginTop: 6, fontSize: 13.5 }}>
            📅 คาดว่าได้งาน <b>{o.due_th}</b>
          </div>
        )}
        <div className="center muted" style={{ marginTop: 6, fontSize: 12 }}>
          ทีมทำงาน {d.hours}{d.working_now ? "" : " · ตอนนี้นอกเวลาทำการ"}
        </div>
      </div>

      {o.brief && (
        <div className="card" style={{ background: "#F4F8FD", border: "1px solid #d6e7fa" }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--blue)" }}>📋 บรีฟจากแผนของคุณ</div>
          <div style={{ fontWeight: 700, marginTop: 4 }}>วันที่ {o.brief.d} · {o.brief.t || ""}</div>
          {o.brief.h && <div className="muted" style={{ fontSize: 13.5, marginTop: 4, lineHeight: 1.6 }}>ฮุก: {o.brief.h}</div>}
        </div>
      )}

      {/* ส่งไฟล์ */}
      <div className="card">
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 3 }}>📎 ไฟล์ของคุณ</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>วางลิงก์ Google Drive / WeTransfer ก็ได้ค่ะ (อย่าลืมเปิดสิทธิ์ให้ทีมเข้าดูได้)</div>
        {o.footage_url
          ? <div style={{ fontSize: 14, lineHeight: 1.9 }}>
              🎞️ <a className="link" href={o.footage_url} target="_blank" rel="noreferrer">ฟุตเทจที่ส่งไว้</a><br />
              {o.voice_url && <>🎙️ <a className="link" href={o.voice_url} target="_blank" rel="noreferrer">ไฟล์เสียง</a></>}
            </div>
          : <>
              <input value={footage} onChange={e => setFootage(e.target.value)} placeholder="ลิงก์ฟุตเทจ (จำเป็น)"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, marginBottom: 8 }} />
              <input value={voice} onChange={e => setVoice(e.target.value)} placeholder="ลิงก์ไฟล์เสียง / Voice Over (ถ้ามี)"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, marginBottom: 10 }} />
              <button className="btn full" disabled={busy || !footage.trim()}
                onClick={() => send(() => api("/api/edit/files", { method: "POST", token: session.token, body: { order_id: o.order_id, footage_url: footage.trim(), voice_url: voice.trim() } }), "ส่งไฟล์ให้ทีมแล้วค่ะ 🎬")}>
                ส่งไฟล์ให้ทีม
              </button>
            </>}
      </div>

      {/* งานที่ทีมส่งมา */}
      {o.draft_url && (
        <div className="card" style={{ background: "#F2F7F3", border: "1px solid #cfe3d6" }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>🎬 งานที่ทีมส่งมา</div>
          <a className="btn" href={o.draft_url} target="_blank" rel="noreferrer" style={{ marginTop: 10, display: "inline-block", padding: "10px 20px" }}>เปิดดูงาน →</a>
          {o.status !== "done" && (
            <button className="btn ghost" style={{ marginTop: 10, marginLeft: 8, padding: "10px 18px" }} disabled={busy}
              onClick={() => send(() => api("/api/edit/approve", { method: "POST", token: session.token, body: { order_id: o.order_id } }), "รับงานเรียบร้อยค่ะ ขอบคุณนะคะ 🩵")}>
              ✅ พอใจแล้ว รับงาน
            </button>
          )}
        </div>
      )}

      {/* คุยงาน */}
      <div className="card">
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 3 }}>💬 คุยกับทีม</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          แก้ฟรี {d.free_revisions} ครั้ง · ใช้ไปแล้ว {o.revisions_used || 0} ครั้ง
          {overFree && <span style={{ color: "#C77700", fontWeight: 700 }}> · ครั้งต่อไปทีมจะแจ้งค่าใช้จ่ายก่อนนะคะ</span>}
        </div>
        {(d.comments || []).map(c => (
          <div key={c.id} style={{ display: "flex", justifyContent: c.author === "team" ? "flex-start" : "flex-end", marginBottom: 8 }}>
            <div style={{ maxWidth: "82%", background: c.author === "team" ? "var(--soft)" : "#EDF4FB",
              border: "1px solid var(--border)", borderRadius: 14, padding: "10px 13px" }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: c.author === "team" ? "#7a7486" : "var(--blue)", marginBottom: 3 }}>
                {c.author === "team" ? "ทีม Babe House" : "คุณ"}{c.at_time ? ` · นาที ${c.at_time}` : ""}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{c.text}</div>
            </div>
          </div>
        ))}
        {/* 🔁 รอบแก้ — รวบทุกจุดไว้ก่อน แล้วกดส่งทีเดียว (คิมสั่ง 5 ส.ค.)
            เดิมพิมพ์ทีละบรรทัดแล้วส่งเลย ทีมได้งานทีละหยด วางแผนตัดไม่ได้ */}
        {rounds && rounds.can_open && rounds.current && (() => {
          const cur = rounds.current, notes = cur.notes || [], mustPay = cur.charge_satang > 0 && !cur.paid;
          return <div style={{ marginTop: 14, border: "1px solid var(--border)", borderRadius: 14, padding: "14px 15px", background: "var(--soft)" }}>
            <div className="between" style={{ flexWrap: "wrap", gap: 6, marginBottom: 3 }}>
              <b style={{ fontSize: 14.5 }}>📝 รอบแก้ที่ {cur.round_no}</b>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: mustPay ? "#C77700" : "#1a7f43" }}>
                {mustPay ? `รอบนี้มีค่าใช้จ่าย ${cur.charge_satang / 100} บาท` : "ฟรี"}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 11, lineHeight: 1.65 }}>
              ใส่ให้ครบทุกจุดที่อยากแก้ก่อนนะคะ แล้วค่อยกดส่งทีเดียว — ทีมจะได้แก้ให้ครบในรอบเดียว
            </div>

            {notes.length > 0 && <div style={{ display: "grid", gap: 7, marginBottom: 11 }}>
              {notes.map((x, i) => (
                <div key={i} className="between" style={{ gap: 9, background: "#fff", border: "1px solid var(--border)", borderRadius: 11, padding: "9px 12px" }}>
                  <span style={{ fontSize: 13.5, lineHeight: 1.6, minWidth: 0 }}>
                    {x.at && <b style={{ color: "var(--blue)" }}>{x.at} </b>}{x.text}
                  </span>
                  <button onClick={() => noteRemove(i)} disabled={busy} title="ลบจุดนี้"
                    style={{ background: "none", border: 0, cursor: "pointer", fontSize: 15, color: "var(--muted)", padding: "0 2px" }}>🗑</button>
                </div>
              ))}
            </div>}

            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <input value={at} onChange={e => setAt(e.target.value)} placeholder="0:12"
                style={{ width: 78, padding: "10px 11px", borderRadius: 11, border: "1px solid var(--border)", fontSize: 14 }} />
              <input value={cmt} onChange={e => setCmt(e.target.value)} placeholder="อยากให้แก้ตรงไหนคะ"
                onKeyDown={e => { if (e.key === "Enter") noteAdd(); }}
                style={{ flex: "1 1 160px", padding: "10px 13px", borderRadius: 11, border: "1px solid var(--border)", fontSize: 14 }} />
              <button className="btn ghost" disabled={busy || !cmt.trim()} onClick={noteAdd} style={{ padding: "10px 16px" }}>+ เพิ่ม</button>
            </div>

            {notes.length > 0 && <>
              <button className="btn full" disabled={busy} onClick={mustPay ? payRound : roundSubmit} style={{ marginTop: 12 }}>
                {mustPay ? `จ่าย ${cur.charge_satang / 100} บาท แล้วส่งให้ทีม` : `ส่งให้ทีม (${notes.length} จุด)`}
              </button>
              <div className="muted" style={{ fontSize: 12, marginTop: 7, lineHeight: 1.6 }}>
                ส่งแล้วเพิ่มจุดไม่ได้จนกว่าจะได้คลิปใหม่นะคะ · แก้ฟรี {rounds.free_revisions} รอบ
                {" "}· รอบถัดไปคิด {rounds.extra_baht} บาทต่อรอบ
              </div>
            </>}
          </div>;
        })()}

        {/* ล็อกอยู่ — บอกเหตุผลให้ชัด ลูกค้าจะได้ไม่งงว่าทำไมพิมพ์ไม่ได้ */}
        {rounds && !rounds.can_open && rounds.locked_reason && (
          <div className="msg" style={{ marginTop: 12, background: "#EAF3FD", color: "#3F6BAE" }}>
            {rounds.locked_reason}
          </div>
        )}
        {msg && <div className="msg" style={{ marginTop: 10 }}>{msg}</div>}
      </div>
    </div>
  );
}
