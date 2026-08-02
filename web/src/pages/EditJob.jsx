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

  const load = () => api(`/api/edit/order/${id}`, { token: session.token }).then(setD).catch(() => setD({ err: true }));
  useEffect(load, [id]);   // eslint-disable-line

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
        <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
          <input value={at} onChange={e => setAt(e.target.value)} placeholder="0:12"
            style={{ width: 78, padding: "10px 11px", borderRadius: 11, border: "1px solid var(--border)", fontSize: 14 }} />
          <input value={cmt} onChange={e => setCmt(e.target.value)} placeholder="อยากให้แก้ตรงไหนคะ"
            onKeyDown={e => { if (e.key === "Enter" && cmt.trim()) send(() => api("/api/edit/comment", { method: "POST", token: session.token, body: { order_id: o.order_id, text: cmt.trim(), at_time: at.trim() } }).then(() => { setCmt(""); setAt(""); }), "ส่งให้ทีมแล้วค่ะ"); }}
            style={{ flex: "1 1 160px", padding: "10px 13px", borderRadius: 11, border: "1px solid var(--border)", fontSize: 14 }} />
          <button className="btn" disabled={busy || !cmt.trim()} style={{ padding: "10px 18px" }}
            onClick={() => send(() => api("/api/edit/comment", { method: "POST", token: session.token, body: { order_id: o.order_id, text: cmt.trim(), at_time: at.trim() } }).then(() => { setCmt(""); setAt(""); }), "ส่งให้ทีมแล้วค่ะ")}>
            ส่ง
          </button>
        </div>
        {msg && <div className="msg" style={{ marginTop: 10 }}>{msg}</div>}
      </div>
    </div>
  );
}
