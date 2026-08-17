import { useState, useEffect } from "react";
import { api } from "../api.js";
import { askConfirm } from "../confirm.jsx";

// แผงหลังบ้านของ "คอร์สเรียน + workshop" — แยกไฟล์ไว้ให้ Admin.jsx ไม่บวม
// ทุกแผงในไฟล์นี้ยังไม่ผูกกับหน้าลูกค้า จนกว่าจะถึงเฟสเปิดตัว
const BLUE = "var(--blue)";
const box = { border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginBottom: 10, background: "#fff" };
const inp = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13.5, fontFamily: "inherit" };
const lbl = { fontSize: 12.5, fontWeight: 700, display: "block", marginBottom: 4, marginTop: 8 };
const money = (n) => "฿" + Number(n || 0).toLocaleString();

// วัน-เวลาไทย (เซิร์ฟเวอร์เก็บเป็น UTC — ต้องบังคับโซนเวลาไทยตอนแสดง ไม่งั้นเวลาเพี้ยน 7 ชม.)
const thDate = (iso) => iso ? new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) : "-";
// ค่าใน <input type="datetime-local"> → ISO ที่ระบุว่าเป็นเวลาไทย (กันเซิร์ฟเวอร์ตีความเป็น UTC)
const toIsoTH = (local) => local ? `${local}:00+07:00` : null;
const fromIsoTH = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const th = new Date(d.getTime() + (7 * 60 + d.getTimezoneOffset()) * 60000);
  return th.toISOString().slice(0, 16);
};

/* ══════════ 1) ภาพรวมยอดขายทุกสินค้า ══════════ */
export function SalesOverview({ adminKey }) {
  const [d, setD] = useState(null);
  const [days, setDays] = useState(30);
  useEffect(() => { api(`/api/admin/sales-overview?days=${days}`, { adminKey }).then(setD).catch(() => setD({ error: true })); }, [days]);
  if (!d) return <div className="card"><h3>💰 ยอดขายรวมทุกสินค้า</h3><p className="muted">กำลังโหลด...</p></div>;
  if (d.error) return <div className="card"><h3>💰 ยอดขายรวมทุกสินค้า</h3><p className="muted">โหลดไม่สำเร็จ</p></div>;

  // 🎬 โปรดักชั่นเพิ่งมาทีหลัง — เว็บที่ deploy ยังไม่ทันอาจไม่มีคีย์นี้ กัน undefined ไว้
  const pd = d.production || { period: { jobs: 0, revenue: 0 }, all: { jobs: 0, revenue: 0 }, breakdown: {}, jobs_without_amount: 0 };
  const sv = d.services || { period: { orders: 0, revenue: 0 }, all: { orders: 0, revenue: 0 } };
  const total = d.blueprint.period.revenue + d.courses.period.revenue + d.workshops.period.revenue + pd.period.revenue + sv.period.revenue;
  const cards = [
    { label: "📘 Blueprint", rev: d.blueprint.period.revenue, sub: `${d.blueprint.period.orders} เล่ม`, allRev: d.blueprint.all.revenue, allSub: `${d.blueprint.all.orders} เล่มรวม` },
    { label: "🎓 คอร์สเรียน", rev: d.courses.period.revenue, sub: `${d.courses.period.orders} คอร์ส`, allRev: d.courses.all.revenue, allSub: `${d.courses.all.orders} คอร์สรวม` },
    { label: "🎟️ Workshop", rev: d.workshops.period.revenue, sub: `${d.workshops.period.seats} ที่นั่ง`, allRev: d.workshops.all.revenue, allSub: `${d.workshops.all.seats} ที่นั่งรวม` },
    { label: "🎬 โปรดักชั่น", rev: pd.period.revenue, sub: `${pd.period.jobs} งาน`, allRev: pd.all.revenue, allSub: `${pd.all.jobs} งานรวม` },
    // 🧩 เครดิตสคริปต์ · ตรวจคลิป · ค่ารอบแก้ — เดิมไม่ถูกนับที่ไหนเลย เงินเข้าจริงแต่หายจากหน้ายอดขาย
    { label: "🧩 บริการอื่น", rev: sv.period.revenue, sub: `${sv.period.orders} รายการ`, allRev: sv.all.revenue, allSub: `${sv.all.orders} รายการรวม` },
  ].filter(c => c.rev > 0 || c.allRev > 0 || ["📘 Blueprint", "🎓 คอร์สเรียน", "🎟️ Workshop", "🎬 โปรดักชั่น"].includes(c.label));
  return (
    <div className="card">
      <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0 }}>💰 ยอดขายรวมทุกสินค้า</h3>
        <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ ...inp, width: "auto", padding: "6px 10px" }}>
          <option value={7}>7 วันล่าสุด</option><option value={30}>30 วันล่าสุด</option><option value={90}>90 วันล่าสุด</option><option value={365}>1 ปีล่าสุด</option>
        </select>
      </div>
      <div style={{ margin: "14px 0 6px", fontSize: 34, fontWeight: 800, color: BLUE }}>{money(total)}</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>รวมทุกสินค้าใน {d.days} วันล่าสุด</div>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        {cards.map(c => (
          <div key={c.label} style={{ flex: 1, minWidth: 150, background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{c.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: BLUE, marginTop: 4 }}>{money(c.rev)}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{c.sub}</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6, borderTop: "1px dashed var(--border)", paddingTop: 5 }}>ตั้งแต่เปิด: {money(c.allRev)} · {c.allSub}</div>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Blueprint นับเฉพาะ "เงินเข้าจริง" แบบเดียวกับการ์ดรายได้ด้านล่าง — ไม่รวมออเดอร์ทดสอบและโค้ดฟรี</p>
      {pd.all.revenue > 0 && <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
        🎬 โปรดักชั่นรวม 3 ทาง: งานตัดต่อในเว็บ {money(pd.breakdown.edit_web || 0)} · แพ็กเครดิต {money(pd.breakdown.credits || 0)} · งานรับตรงนอกเว็บ {money(pd.breakdown.outside_web || 0)}
      </p>}
      {pd.jobs_without_amount > 0 && <p style={{ fontSize: 12.5, marginTop: 8, color: "#b4700f", background: "#fff8ed",
        border: "1px solid #f5dfb8", borderRadius: 10, padding: "9px 12px" }}>
        ⚠️ มีงานโปรดักชั่นรับตรง <b>{pd.jobs_without_amount} งาน</b> ที่ยังไม่ได้ใส่ยอดเงิน — ยอดโปรดักชั่นด้านบนจึงยังไม่ครบ
        ให้ทีมใส่ยอดตอนเพิ่มงานที่หน้า <b>/team → ตารางงาน → งานนอกเว็บ</b> นะคะ
      </p>}
      {d.courses.legacy.orders > 0 && (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
          📦 ยอดคอร์สจากเว็บเก่า (ก่อนย้ายระบบ): {money(d.courses.legacy.revenue)} · {d.courses.legacy.orders} ออเดอร์ — แยกไว้ไม่ให้ปนกับยอดเว็บใหม่
        </p>
      )}
      {d.top_courses.length > 0 && <>
        <h4 style={{ margin: "18px 0 8px", fontSize: 14.5 }}>คอร์สขายดี (เว็บใหม่)</h4>
        <div className="scroll"><table><thead><tr><th>คอร์ส</th><th>ขายได้</th><th>ยอดเงิน</th></tr></thead>
          <tbody>{d.top_courses.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.orders}</td><td>{money(c.revenue)}</td></tr>)}</tbody></table></div>
      </>}
    </div>
  );
}

/* ══════════ 2) จัดการคอร์ส: การบ้าน + รีวิวผลงาน + เช็กลิงก์วิดีโอ ══════════ */
export function AcademyManage({ adminKey }) {
  const [courses, setCourses] = useState([]);
  const [cid, setCid] = useState("");
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [asg, setAsg] = useState(null);      // ฟอร์มการบ้านที่กำลังแก้
  const [shw, setShw] = useState(null);      // ฟอร์มรีวิวที่กำลังแก้
  const [busy, setBusy] = useState(false);

  useEffect(() => { api("/api/admin/academy/manage", { adminKey }).then(d => setCourses(d.courses || [])).catch(() => {}); loadHealth(); }, []);
  async function loadHealth() { try { setHealth(await api("/api/admin/academy/health", { adminKey })); } catch {} }
  async function load(id) { setCid(id); setAsg(null); setShw(null); if (!id) { setData(null); return; } setData(await api(`/api/admin/academy/manage?course_id=${encodeURIComponent(id)}`, { adminKey })); }

  async function saveAsg() {
    if (!asg.title?.trim()) return alert("ใส่ชื่อการบ้านก่อนนะคะ");
    setBusy(true);
    try { await api("/api/admin/academy/assignment", { method: "POST", adminKey, body: { ...asg, course_id: cid } }); await load(cid); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function delAsg(id) {
    if (!(await askConfirm({ title: "ลบการบ้านชิ้นนี้?", detail: "งานที่นักเรียนส่งไปแล้วจะยังอยู่ แต่จะไม่ถูกใช้เป็นเงื่อนไขออกใบประกาศอีก", ok: "ลบเลย", danger: true }))) return;
    await api("/api/admin/academy/assignment", { method: "POST", adminKey, body: { action: "delete", assignment_id: id } }); load(cid);
  }
  async function saveShw() {
    if (!shw.url?.trim()) return alert("ใส่ลิงก์ก่อนนะคะ");
    setBusy(true);
    try { await api("/api/admin/academy/showcase", { method: "POST", adminKey, body: { ...shw, course_id: cid } }); await load(cid); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function delShw(id) { if (!(await askConfirm({ title: "ลบรีวิวนี้?", ok: "ลบเลย", danger: true }))) return; await api("/api/admin/academy/showcase", { method: "POST", adminKey, body: { action: "delete", showcase_id: id } }); load(cid); }

  return (
    <div className="card">
      <h3>🎓 จัดการคอร์สเรียน</h3>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>ตั้งการบ้าน (AI ตรวจให้) · ใส่คลิปรีวิว/ผลงานนักเรียนช่วยปิดการขาย · เช็กว่าบทไหนยังไม่มีวิดีโอ</p>

      {health && (health.missing_url?.length > 0 || health.courses_without_lessons?.length > 0) && (
        <div className="msg" style={{ background: "#fff7e6", color: "#8a6d1f", marginTop: 12 }}>
          ⚠️ <b>ต้องแก้ก่อนเปิดขาย</b>
          {health.missing_url?.length > 0 && <div style={{ marginTop: 6 }}>บทเรียนที่ยังไม่มีลิงก์วิดีโอ ({health.missing_url.length} บท):
            <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>{health.missing_url.slice(0, 10).map((m, i) => <li key={i}>{m.course_name} → บทที่ {m.seq}: {m.name}</li>)}</ul></div>}
          {health.courses_without_lessons?.length > 0 && <div style={{ marginTop: 6 }}>คอร์สที่ยังไม่มีบทเรียนเลย: {health.courses_without_lessons.map(c => c.name).join(", ")}</div>}
        </div>
      )}

      <label style={lbl}>เลือกคอร์ส</label>
      <select value={cid} onChange={e => load(e.target.value)} style={inp}>
        <option value="">— เลือกคอร์ส —</option>
        {courses.map(c => <option key={c.id} value={c.id}>{c.visible ? "" : "🔒 "}{c.name}</option>)}
      </select>

      {data && <>
        {/* ── การบ้าน ── */}
        <div style={{ marginTop: 18 }}>
          <div className="between"><h4 style={{ margin: 0, fontSize: 15 }}>📝 การบ้านของคอร์สนี้ ({data.assignments?.length || 0})</h4>
            <button className="btn ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => setAsg({ title: "", brief: "", submit_type: "any", criteria: "", required: true, seq: (data.assignments?.length || 0) + 1 })}>+ เพิ่มการบ้าน</button></div>
          {!data.assignments?.length && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>ยังไม่มีการบ้าน — คอร์สนี้จะออกใบประกาศให้เมื่อเรียนครบทุกบทเลย</p>}
          {(data.assignments || []).map(a => (
            <div key={a.assignment_id} style={box}>
              <div className="between" style={{ gap: 8 }}>
                <div><b style={{ fontSize: 14 }}>{a.seq}. {a.title}</b>
                  <div className="muted" style={{ fontSize: 12.5 }}>ส่งเป็น{a.submit_type === "image" ? "รูป" : a.submit_type === "video" ? "คลิป" : "รูปหรือคลิป"} · {a.required ? "บังคับ (ต้องผ่านถึงได้ใบประกาศ)" : "ไม่บังคับ"}</div></div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="link" style={{ background: "none", border: 0, fontSize: 13 }} onClick={() => setAsg(a)}>แก้ไข</button>
                  <button className="link" style={{ background: "none", border: 0, fontSize: 13, color: "#b3261e" }} onClick={() => delAsg(a.assignment_id)}>ลบ</button>
                </div>
              </div>
              {a.brief && <div style={{ fontSize: 13, marginTop: 6, whiteSpace: "pre-wrap" }}>{a.brief}</div>}
            </div>
          ))}
          {asg && (
            <div style={{ ...box, background: "#f7fbff", borderColor: BLUE }}>
              <label style={lbl}>ชื่อการบ้าน</label>
              <input style={inp} value={asg.title || ""} onChange={e => setAsg({ ...asg, title: e.target.value })} placeholder="เช่น ตัดคลิปแนะนำตัว 30 วินาที" />
              <label style={lbl}>โจทย์ (บอกนักเรียนว่าต้องทำอะไรส่งมา)</label>
              <textarea style={{ ...inp, minHeight: 70 }} value={asg.brief || ""} onChange={e => setAsg({ ...asg, brief: e.target.value })} placeholder="เช่น ใช้เทคนิคจากบทที่ 3 ตัดคลิปแนะนำตัวเอง ความยาวไม่เกิน 30 วินาที ต้องมีตัวอักษรบนจออย่างน้อย 1 จุด" />
              <label style={lbl}>เกณฑ์ตรวจเพิ่มเติม (บอก AI ว่าให้ดูอะไรเป็นพิเศษ — เว้นว่างได้)</label>
              <textarea style={{ ...inp, minHeight: 60 }} value={asg.criteria || ""} onChange={e => setAsg({ ...asg, criteria: e.target.value })} placeholder="เช่น ดูว่าใช้ keyframe เป็นไหม จังหวะตัดเข้ากับเพลงหรือเปล่า" />
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 130 }}><label style={lbl}>ให้ส่งเป็น</label>
                  <select style={inp} value={asg.submit_type} onChange={e => setAsg({ ...asg, submit_type: e.target.value })}>
                    <option value="any">รูปหรือคลิปก็ได้</option><option value="image">รูปเท่านั้น</option><option value="video">คลิปเท่านั้น</option>
                  </select></div>
                <div style={{ width: 90 }}><label style={lbl}>ลำดับ</label><input style={inp} type="number" value={asg.seq || 1} onChange={e => setAsg({ ...asg, seq: e.target.value })} /></div>
              </div>
              <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={asg.required !== false} onChange={e => setAsg({ ...asg, required: e.target.checked })} style={{ width: "auto" }} />
                บังคับส่ง (ต้องผ่านชิ้นนี้ถึงจะได้ใบประกาศ)
              </label>
              <div className="row" style={{ gap: 8, marginTop: 12 }}>
                <button className="btn" disabled={busy} onClick={saveAsg} style={{ padding: "9px 18px" }}>{busy ? "บันทึก..." : "บันทึก"}</button>
                <button className="btn ghost" onClick={() => setAsg(null)} style={{ padding: "9px 18px" }}>ยกเลิก</button>
              </div>
            </div>
          )}
        </div>

        {/* ── รีวิว/ผลงานนักเรียน ── */}
        <div style={{ marginTop: 22 }}>
          <div className="between"><h4 style={{ margin: 0, fontSize: 15 }}>⭐ คลิปรีวิว / ผลงานนักเรียน ({data.showcase?.length || 0})</h4>
            <button className="btn ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => setShw({ kind: "clip", url: "", caption: "", student_name: "", seq: (data.showcase?.length || 0) + 1, active: true })}>+ เพิ่มรีวิว</button></div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>วางลิงก์ IG Reel / TikTok / YouTube ได้เลย จะไปโชว์ในหน้ารายละเอียดคอร์ส ช่วยให้คนตัดสินใจซื้อง่ายขึ้น</p>
          {(data.showcase || []).map(s => (
            <div key={s.showcase_id} style={box}>
              <div className="between" style={{ gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: BLUE, fontWeight: 700 }}>{s.kind === "work" ? "ผลงานนักเรียน" : s.kind === "quote" ? "คำรีวิว" : "คลิปรีวิว"}{s.active ? "" : " · ปิดอยู่"}</div>
                  <a className="link" href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, wordBreak: "break-all" }}>{s.url}</a>
                  {s.caption && <div className="muted" style={{ fontSize: 12.5 }}>{s.caption}</div>}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button className="link" style={{ background: "none", border: 0, fontSize: 13 }} onClick={() => setShw(s)}>แก้ไข</button>
                  <button className="link" style={{ background: "none", border: 0, fontSize: 13, color: "#b3261e" }} onClick={() => delShw(s.showcase_id)}>ลบ</button>
                </div>
              </div>
            </div>
          ))}
          {shw && (
            <div style={{ ...box, background: "#f7fbff", borderColor: BLUE }}>
              <label style={lbl}>ลิงก์</label>
              <input style={inp} value={shw.url || ""} onChange={e => setShw({ ...shw, url: e.target.value })} placeholder="https://www.instagram.com/reel/..." />
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 130 }}><label style={lbl}>ประเภท</label>
                  <select style={inp} value={shw.kind} onChange={e => setShw({ ...shw, kind: e.target.value })}>
                    <option value="clip">คลิปรีวิว</option><option value="work">ผลงานนักเรียน</option><option value="quote">คำรีวิว (ข้อความ)</option>
                  </select></div>
                <div style={{ flex: 1, minWidth: 130 }}><label style={lbl}>ชื่อนักเรียน (ถ้ามี)</label><input style={inp} value={shw.student_name || ""} onChange={e => setShw({ ...shw, student_name: e.target.value })} /></div>
                <div style={{ width: 90 }}><label style={lbl}>ลำดับ</label><input style={inp} type="number" value={shw.seq || 1} onChange={e => setShw({ ...shw, seq: e.target.value })} /></div>
              </div>
              <label style={lbl}>คำบรรยาย{shw.kind === "quote" ? " (ใส่คำรีวิวตรงนี้)" : " (ไม่ใส่ก็ได้)"}</label>
              <textarea style={{ ...inp, minHeight: 55 }} value={shw.caption || ""} onChange={e => setShw({ ...shw, caption: e.target.value })} />
              <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={shw.active !== false} onChange={e => setShw({ ...shw, active: e.target.checked })} style={{ width: "auto" }} /> แสดงในหน้าคอร์ส
              </label>
              <div className="row" style={{ gap: 8, marginTop: 12 }}>
                <button className="btn" disabled={busy} onClick={saveShw} style={{ padding: "9px 18px" }}>{busy ? "บันทึก..." : "บันทึก"}</button>
                <button className="btn ghost" onClick={() => setShw(null)} style={{ padding: "9px 18px" }}>ยกเลิก</button>
              </div>
            </div>
          )}
        </div>
      </>}
    </div>
  );
}

/* ══════════ 3) ตรวจการบ้าน (ดูผล AI + ตัดสินเองได้) ══════════ */
export function HomeworkReview({ adminKey }) {
  const [list, setList] = useState(null);
  const [tab, setTab] = useState("reviewing");
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [feat, setFeat] = useState(false);
  async function feature() {
    setBusy(true);
    try { await api("/api/admin/academy/submission/feature", { method: "POST", adminKey, body: { submission_id: open.submission_id, student_name: "" } }); setFeat(true); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function load(t = tab) { setTab(t); try { setList(await api(`/api/admin/academy/submissions${t ? "?status=" + t : ""}`, { adminKey })); } catch { setList({ submissions: [] }); } }
  useEffect(() => { load(); }, []);
  async function view(id) { setNote(""); setFeat(false); setOpen("loading"); try { const d = await api(`/api/admin/academy/submission/${id}`, { adminKey }); setOpen(d.submission); setNote(d.submission.teacher_note || ""); } catch { setOpen(null); } }
  async function decide(pass) {
    setBusy(true);
    try {
      const r = await api("/api/admin/academy/submission/review", { method: "POST", adminKey, body: { submission_id: open.submission_id, pass, note } });
      alert(pass ? (r.cert_id ? "ให้ผ่านแล้ว + ออกใบประกาศให้เรียบร้อยค่ะ 🎓" : "ให้ผ่านแล้วค่ะ (ยังเรียนไม่ครบทุกบท ใบประกาศจะออกให้เองตอนเรียนจบ)") : "ส่งกลับให้แก้แล้วค่ะ");
      setOpen(null); load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  const TABS = [["reviewing", "⏳ รอตรวจ"], ["revise", "↩️ ให้แก้"], ["passed", "✅ ผ่านแล้ว"], ["", "ทั้งหมด"]];

  return (
    <div className="card">
      <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0 }}>📝 การบ้านนักเรียน{list?.pending > 0 && <span className="tag off" style={{ marginLeft: 8 }}>รอตรวจ {list.pending}</span>}</h3>
        <button className="link" style={{ background: "none", border: 0 }} onClick={() => load()}>↻ รีเฟรช</button>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>AI ตรวจให้อัตโนมัติทันทีที่นักเรียนส่ง — ตรงนี้ไว้ดูย้อนหลังและตัดสินเองในเคสที่ AI ตรวจไม่ได้</p>
      <div className="row" style={{ gap: 6, margin: "12px 0", flexWrap: "wrap" }}>
        {TABS.map(([v, l]) => <button key={v} onClick={() => load(v)} style={{ border: `1.5px solid ${tab === v ? BLUE : "var(--border)"}`, background: tab === v ? BLUE : "#fff", color: tab === v ? "#fff" : "var(--ink)", borderRadius: 18, padding: "5px 13px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{l}</button>)}
      </div>
      {!list ? <p className="muted">กำลังโหลด...</p> : !list.submissions.length ? <p className="muted" style={{ fontSize: 13 }}>ยังไม่มีงานในหมวดนี้</p> : (
        <div className="scroll" style={{ maxHeight: 420, overflowY: "auto" }}><table><thead><tr><th>วันที่</th><th>นักเรียน</th><th>คอร์ส</th><th>การบ้าน</th><th>ผล</th><th></th></tr></thead>
          <tbody>{list.submissions.map(s => (
            <tr key={s.submission_id}>
              <td style={{ whiteSpace: "nowrap" }}>{String(s.created_at || "").slice(0, 10)}</td>
              <td>{s.email}</td><td>{s.course_name}</td><td>{s.title || "-"}</td>
              <td style={{ whiteSpace: "nowrap" }}>{s.status === "passed" ? <span className="tag on">ผ่าน {s.score ? `${s.score}` : ""}</span> : s.status === "revise" ? <span className="tag off">ให้แก้</span> : <span className="tag">รอตรวจ</span>}</td>
              <td><button className="link" style={{ background: "none", border: 0 }} onClick={() => view(s.submission_id)}>ดู ›</button></td>
            </tr>))}</tbody></table></div>
      )}

      {open && <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 620, width: "100%", maxHeight: "88vh", overflowY: "auto", padding: 20 }}>
          {open === "loading" ? <p className="muted">กำลังโหลด...</p> : <>
            <div className="between"><h3 style={{ margin: 0, fontSize: 17 }}>งานของ {open.email}</h3><button className="link" style={{ background: "none", border: 0 }} onClick={() => setOpen(null)}>✕</button></div>
            {open.file_kind === "image" && open.file_data
              ? <img src={open.file_data} alt="" style={{ width: "100%", borderRadius: 12, margin: "12px 0" }} />
              : <div className="msg" style={{ background: "#f7f7f8", marginTop: 12 }}>{open.file_kind === "video" ? "🎬 งานชิ้นนี้เป็นคลิป — ระบบไม่เก็บไฟล์คลิปไว้ (ใหญ่เกินไป) แต่ AI ดูคลิปแล้วและสรุปผลไว้ด้านล่าง" : "ไม่มีไฟล์แนบ"}</div>}
            {open.ai && <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>ผลที่ AI ตรวจ {open.ai.passed ? "✅ ผ่าน" : "↩️ ให้แก้"} · {open.ai.score} คะแนน</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.8, marginTop: 6 }}>{open.ai.summary}</p>
              {open.ai.strengths?.length > 0 && <><div style={{ fontWeight: 700, fontSize: 13, marginTop: 8 }}>ข้อดี</div><ul style={{ margin: "3px 0", paddingLeft: 20, fontSize: 13, lineHeight: 1.7 }}>{open.ai.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
              {open.ai.improvements?.length > 0 && <><div style={{ fontWeight: 700, fontSize: 13, marginTop: 8 }}>จุดที่ควรแก้</div><ul style={{ margin: "3px 0", paddingLeft: 20, fontSize: 13, lineHeight: 1.7 }}>{open.ai.improvements.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
              {open.ai.what_to_fix && <p style={{ fontSize: 13, marginTop: 8 }}><b>ต้องส่งใหม่:</b> {open.ai.what_to_fix}</p>}
            </div>}
            <label style={lbl}>คอมเมนต์จากครูพี่คิม (นักเรียนจะเห็น)</label>
            <textarea style={{ ...inp, minHeight: 70 }} value={note} onChange={e => setNote(e.target.value)} placeholder="เขียนเพิ่มเองได้ ถ้าไม่เขียนจะใช้ผลของ AI อย่างเดียว" />
            <div className="row" style={{ gap: 8, marginTop: 14 }}>
              <button className="btn" disabled={busy} onClick={() => decide(true)} style={{ padding: "10px 20px" }}>✅ ให้ผ่าน</button>
              <button className="btn ghost" disabled={busy} onClick={() => decide(false)} style={{ padding: "10px 20px" }}>↩️ ให้แก้แล้วส่งใหม่</button>
            </div>

            {/* ⭐ เอาผลงานไปโชว์หน้าคอร์ส — ขึ้นเฉพาะงานที่นักเรียนติ๊กอนุญาตแล้วเท่านั้น */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px dashed var(--border)" }}>
              {open.allow_marketing ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1a7f43" }}>✅ นักเรียนอนุญาตให้นำผลงานไปโปรโมตได้</div>
                  <p className="muted" style={{ fontSize: 12.5, margin: "4px 0 10px" }}>กดแล้วผลงานจะไปโชว์ในหน้าขายของคอร์สนี้ทันที (ลบทีหลังได้ที่หัวข้อจัดการคอร์สเรียน)</p>
                  <button className="btn ghost" disabled={busy || feat} onClick={feature} style={{ padding: "9px 16px", fontSize: 13.5 }}>
                    {feat ? "✅ เพิ่มเป็นผลงานโชว์แล้ว" : "⭐ เอาไปโชว์ในหน้าคอร์ส"}
                  </button>
                </>
              ) : (
                <div className="muted" style={{ fontSize: 12.5 }}>
                  🔒 นักเรียนไม่ได้ติ๊กอนุญาตให้นำผลงานไปโปรโมต — ถ้าอยากใช้ ต้องทักไปขออนุญาตเจ้าตัวก่อนนะคะ
                </div>
              )}
            </div>
          </>}
        </div>
      </div>}
    </div>
  );
}

/* ══════════ 4) จัดการ workshop — ลงวันเรียนประจำเดือน ══════════ */
export function WorkshopManage({ adminKey }) {
  const [d, setD] = useState(null);
  const [openWs, setOpenWs] = useState(null);
  const [sess, setSess] = useState(null);
  const [wsForm, setWsForm] = useState(null);
  const [bookings, setBookings] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  async function load() { try { setD(await api("/api/admin/workshops", { adminKey })); } catch { setD({ workshops: [] }); } }
  useEffect(() => { load(); }, []);

  async function saveSess() {
    if (!sess.starts_at) return alert("เลือกวันและเวลาเรียนก่อนนะคะ");
    setBusy(true);
    try {
      await api("/api/admin/workshop/session", { method: "POST", adminKey, body: { ...sess, starts_at: toIsoTH(sess.starts_at), ends_at: sess.ends_at ? toIsoTH(sess.ends_at) : null } });
      setSess(null); await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function delSess(id) {
    if (!(await askConfirm({ title: "ลบรอบนี้?", ok: "ลบเลย", danger: true }))) return;
    try { await api("/api/admin/workshop/session", { method: "POST", adminKey, body: { action: "delete", session_id: id } }); load(); }
    catch (e) { alert(e.message); }
  }
  async function saveWs() {
    setBusy(true);
    try { await api("/api/admin/workshop", { method: "POST", adminKey, body: wsForm }); setWsForm(null); await load(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function showBookings(sessionId) { setBookings("loading"); try { const r = await api(`/api/admin/workshop/bookings?session_id=${encodeURIComponent(sessionId)}`, { adminKey }); setBookings(r.bookings); } catch { setBookings([]); } }
  async function addManual(s) {
    const name = prompt("ชื่อผู้เรียน (คนที่จองผ่านไลน์):"); if (!name) return;
    const email = prompt("อีเมล (ใช้ล็อกอินดูไฟล์สรุปหลังเรียน):"); if (!email) return;
    const phone = prompt("เบอร์โทร:") || "";
    try { await api("/api/admin/workshop/booking", { method: "POST", adminKey, body: { session_id: s.session_id, name, email, phone, qty: 1 } }); alert("เพิ่มแล้วค่ะ"); load(); }
    catch (e) { alert(e.message); }
  }

  if (!d) return <div className="card"><h3>🎟️ Workshop</h3><p className="muted">กำลังโหลด...</p></div>;
  // หน้ายาวเกินไปถ้ากางทั้ง 10 คลาส → ปกติโชว์เฉพาะคลาสที่มีรอบเปิดรับ + ปุ่มลงวันแบบเลือกจากลิสต์
  const withUpcoming = d.workshops.filter(w => (w.sessions || []).some(s => new Date(s.starts_at) > new Date()));
  const shown = showAll ? d.workshops : withUpcoming;
  return (
    <div className="card">
      <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0 }}>🎟️ Workshop (คลาสสด)</h3>
        <button className="btn ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => setWsForm({ name: "", price: 3990, instructor: "ครูพี่คิม", duration: "1 วันเต็ม 11.00–15.30 น.", active: true, seq: (d.workshops.length || 0) + 1 })}>+ เพิ่มคลาสใหม่</button>
      </div>

      {/* ทางลัดที่คิมใช้จริงทุกเดือน: เลือกคลาส → ลงวัน จบ ไม่ต้องเลื่อนหาการ์ด */}
      <div style={{ background: "var(--soft)", borderRadius: 14, padding: "13px 15px", margin: "12px 0" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>📅 ลงวันเรียนรอบใหม่ — เลือกคลาสแล้วกดได้เลย</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select id="ws-quick" style={{ ...inp, flex: 1, minWidth: 200, width: "auto" }} defaultValue="">
            <option value="">— เลือกคลาส —</option>
            {d.workshops.filter(w => w.active).map(w => <option key={w.workshop_id} value={w.workshop_id}>{w.name} · {money(w.price)}</option>)}
          </select>
          <button className="btn" style={{ padding: "9px 18px", fontSize: 13.5, whiteSpace: "nowrap" }} onClick={() => {
            const v = document.getElementById("ws-quick")?.value;
            if (!v) return alert("เลือกคลาสก่อนนะคะ");
            setSess({ workshop_id: v, starts_at: "", seats: 10, location: "", status: "open" });
          }}>+ ลงวันเรียน</button>
        </div>
      </div>

      {!showAll && (
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
          {withUpcoming.length ? `แสดงเฉพาะ ${withUpcoming.length} คลาสที่มีรอบเปิดรับอยู่` : "ตอนนี้ยังไม่มีคลาสไหนเปิดรอบเลย"} ·{" "}
          <button className="link" style={{ background: "none", border: 0, fontSize: 12.5, padding: 0 }} onClick={() => setShowAll(true)}>ดูคลาสทั้งหมด ({d.workshops.length}) ▾</button>
        </p>
      )}
      {showAll && <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
        แสดงทั้งหมด · <button className="link" style={{ background: "none", border: 0, fontSize: 12.5, padding: 0 }} onClick={() => setShowAll(false)}>ย่อให้สั้นลง ▴</button>
      </p>}

      {shown.map(w => {
        const upcoming = (w.sessions || []).filter(s => new Date(s.starts_at) > new Date());
        return (
          <div key={w.workshop_id} style={{ ...box, padding: 14 }}>
            <div className="between" style={{ gap: 8, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 14.5 }}>{w.name}</b> {!w.active && <span className="tag off">ปิดอยู่</span>}
                <div className="muted" style={{ fontSize: 12.5 }}>{money(w.price)} · {w.instructor} · {w.duration} · รีวิว {w.showcase?.length || 0} คลิป</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button className="btn ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => setSess({ workshop_id: w.workshop_id, starts_at: "", seats: 10, location: "", status: "open" })}>+ ลงวันเรียน</button>
                <button className="link" style={{ background: "none", border: 0, fontSize: 13 }} onClick={() => setWsForm(w)}>แก้รายละเอียด</button>
                <button className="link" style={{ background: "none", border: 0, fontSize: 13 }} onClick={() => setOpenWs(openWs === w.workshop_id ? null : w.workshop_id)}>{openWs === w.workshop_id ? "ซ่อนรอบ ▲" : `รอบทั้งหมด (${w.sessions?.length || 0}) ▼`}</button>
              </div>
            </div>
            {upcoming.length > 0 && <div style={{ fontSize: 13, marginTop: 8, color: "#1a7f43", fontWeight: 700 }}>
              รอบที่กำลังเปิดรับ: {upcoming.map(s => `${thDate(s.starts_at)} (เหลือ ${s.left}/${s.seats} ที่)`).join(" · ")}
            </div>}
            {!upcoming.length && <div style={{ fontSize: 13, marginTop: 8 }} className="muted">ยังไม่มีรอบที่เปิดรับ — กด "+ ลงวันเรียน" เพื่อเปิดรอบใหม่</div>}

            {openWs === w.workshop_id && (w.sessions || []).map(s => (
              <div key={s.session_id} style={{ borderTop: "1px dashed var(--border)", padding: "9px 0", fontSize: 13 }}>
                <div className="between" style={{ gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <b>{thDate(s.starts_at)}</b> · {s.location || "ยังไม่ระบุสถานที่"}
                    <div className="muted" style={{ fontSize: 12.5 }}>จองแล้ว {s.taken}/{s.seats} ที่ · รายได้ {money(s.revenue)} · {s.status === "open" ? "เปิดรับ" : s.status === "closed" ? "ปิดรับ" : "จบแล้ว"}{s.summary_url ? " · มีไฟล์สรุปแล้ว" : ""}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button className="link" style={{ background: "none", border: 0, fontSize: 12.5 }} onClick={() => setSess({ ...s, starts_at: fromIsoTH(s.starts_at), ends_at: fromIsoTH(s.ends_at) })}>แก้ไข</button>
                    <button className="link" style={{ background: "none", border: 0, fontSize: 12.5 }} onClick={() => showBookings(s.session_id)}>รายชื่อ</button>
                    <button className="link" style={{ background: "none", border: 0, fontSize: 12.5 }} onClick={() => addManual(s)}>+ เพิ่มคนจองทางไลน์</button>
                    <button className="link" style={{ background: "none", border: 0, fontSize: 12.5, color: "#b3261e" }} onClick={() => delSess(s.session_id)}>ลบ</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {/* ฟอร์มลงวัน */}
      {sess && <div onClick={() => setSess(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 480, width: "100%", maxHeight: "88vh", overflowY: "auto", padding: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>{sess.session_id ? "แก้ไขรอบเรียน" : "ลงวันเรียนใหม่"}</h3>
          <label style={lbl}>วันและเวลาเริ่ม (เวลาไทย)</label>
          <input style={inp} type="datetime-local" value={sess.starts_at || ""} onChange={e => setSess({ ...sess, starts_at: e.target.value })} />
          <label style={lbl}>เวลาจบ (ไม่ใส่ก็ได้)</label>
          <input style={inp} type="datetime-local" value={sess.ends_at || ""} onChange={e => setSess({ ...sess, ends_at: e.target.value })} />
          <label style={lbl}>สถานที่</label>
          <input style={inp} value={sess.location || ""} onChange={e => setSess({ ...sess, location: e.target.value })} placeholder="เช่น Babe House Studio ทองหล่อ" />
          <div className="row" style={{ gap: 10 }}>
            <div style={{ flex: 1 }}><label style={lbl}>รับกี่ที่นั่ง</label><input style={inp} type="number" value={sess.seats || 10} onChange={e => setSess({ ...sess, seats: e.target.value })} /></div>
            <div style={{ flex: 1 }}><label style={lbl}>ราคาเฉพาะรอบนี้ (เว้นว่าง = ใช้ราคาปกติ)</label><input style={inp} type="number" value={sess.price_override || ""} onChange={e => setSess({ ...sess, price_override: e.target.value })} /></div>
          </div>
          <label style={lbl}>สถานะ</label>
          <select style={inp} value={sess.status || "open"} onChange={e => setSess({ ...sess, status: e.target.value })}>
            <option value="open">เปิดรับสมัคร</option><option value="closed">ปิดรับ (ซ่อนจากหน้าเว็บ)</option><option value="done">เรียนจบแล้ว</option>
          </select>
          <label style={lbl}>ข้อความถึงผู้จอง (ใส่ในเมลยืนยัน)</label>
          <textarea style={{ ...inp, minHeight: 55 }} value={sess.note || ""} onChange={e => setSess({ ...sess, note: e.target.value })} placeholder="เช่น เตรียม notebook + ดาวน์โหลด CapCut มาก่อนนะคะ" />
          <div style={{ borderTop: "1px dashed var(--border)", marginTop: 14, paddingTop: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>📄 ไฟล์สรุปหลังเรียน</div>
            <p className="muted" style={{ fontSize: 12, margin: "3px 0 0" }}>ใส่ลิงก์ตรงนี้หลังคลาสจบ ผู้ที่จองรอบนี้จะโหลดได้เองในหน้าบัญชี</p>
            <label style={lbl}>ลิงก์ไฟล์สรุป</label>
            <input style={inp} value={sess.summary_url || ""} onChange={e => setSess({ ...sess, summary_url: e.target.value })} placeholder="ลิงก์ Google Drive / Canva" />
            <label style={lbl}>ข้อความประกอบ</label>
            <input style={inp} value={sess.summary_note || ""} onChange={e => setSess({ ...sess, summary_note: e.target.value })} />
          </div>
          <div className="row" style={{ gap: 8, marginTop: 14 }}>
            <button className="btn" disabled={busy} onClick={saveSess} style={{ padding: "10px 20px" }}>{busy ? "บันทึก..." : "บันทึก"}</button>
            <button className="btn ghost" onClick={() => setSess(null)} style={{ padding: "10px 20px" }}>ยกเลิก</button>
          </div>
        </div>
      </div>}

      {/* ฟอร์มรายละเอียดคลาส */}
      {wsForm && <div onClick={() => setWsForm(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "88vh", overflowY: "auto", padding: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>รายละเอียดคลาส</h3>
          <label style={lbl}>ชื่อคลาส</label><input style={inp} value={wsForm.name || ""} onChange={e => setWsForm({ ...wsForm, name: e.target.value })} />
          <label style={lbl}>คำโปรย (1 บรรทัด)</label><input style={inp} value={wsForm.tagline || ""} onChange={e => setWsForm({ ...wsForm, tagline: e.target.value })} />
          <div className="row" style={{ gap: 10 }}>
            <div style={{ flex: 1 }}><label style={lbl}>ราคา (บาท)</label><input style={inp} type="number" value={wsForm.price || 0} onChange={e => setWsForm({ ...wsForm, price: e.target.value })} /></div>
            <div style={{ flex: 1 }}><label style={lbl}>ผู้สอน</label><input style={inp} value={wsForm.instructor || ""} onChange={e => setWsForm({ ...wsForm, instructor: e.target.value })} /></div>
          </div>
          <label style={lbl}>ระยะเวลา</label><input style={inp} value={wsForm.duration || ""} onChange={e => setWsForm({ ...wsForm, duration: e.target.value })} />
          <label style={lbl}>เรียนอะไรบ้าง</label><textarea style={{ ...inp, minHeight: 90 }} value={wsForm.detail || ""} onChange={e => setWsForm({ ...wsForm, detail: e.target.value })} />
          <label style={lbl}>เหมาะกับใคร</label><textarea style={{ ...inp, minHeight: 70 }} value={wsForm.who_for || ""} onChange={e => setWsForm({ ...wsForm, who_for: e.target.value })} />
          <label style={lbl}>สิ่งที่จะได้รับ</label><textarea style={{ ...inp, minHeight: 70 }} value={wsForm.what_you_get || ""} onChange={e => setWsForm({ ...wsForm, what_you_get: e.target.value })} />
          <label style={lbl}>ลิงก์รูปปก (ไม่ใส่ก็ได้)</label><input style={inp} value={wsForm.image_url || ""} onChange={e => setWsForm({ ...wsForm, image_url: e.target.value })} />
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={wsForm.active !== false} onChange={e => setWsForm({ ...wsForm, active: e.target.checked })} style={{ width: "auto" }} /> เปิดแสดงในหน้าเว็บ
          </label>
          <div className="row" style={{ gap: 8, marginTop: 14 }}>
            <button className="btn" disabled={busy} onClick={saveWs} style={{ padding: "10px 20px" }}>{busy ? "บันทึก..." : "บันทึก"}</button>
            <button className="btn ghost" onClick={() => setWsForm(null)} style={{ padding: "10px 20px" }}>ยกเลิก</button>
          </div>
        </div>
      </div>}

      {/* รายชื่อผู้จอง */}
      {bookings && <div onClick={() => setBookings(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 640, width: "100%", maxHeight: "85vh", overflowY: "auto", padding: 20 }}>
          <div className="between"><h3 style={{ margin: 0, fontSize: 17 }}>รายชื่อผู้จอง</h3><button className="link" style={{ background: "none", border: 0 }} onClick={() => setBookings(null)}>✕</button></div>
          {bookings === "loading" ? <p className="muted">กำลังโหลด...</p> : !bookings.length ? <p className="muted" style={{ fontSize: 13 }}>ยังไม่มีคนจองรอบนี้</p> : <>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>ข้อมูลอาหาร/ที่จอดเก็บมาตั้งแต่ตอนลูกค้าจอง — ไม่ต้องไล่ถามในไลน์แล้วค่ะ</p>
            <div className="scroll"><table style={{ marginTop: 10 }}><thead><tr><th>ชื่อ</th><th>โทร</th><th>ที่</th><th>อาหาร</th><th>ที่จอด</th><th>โน้ต</th><th>สถานะ</th></tr></thead>
              <tbody>{bookings.map(b => <tr key={b.booking_id}>
                <td style={{ whiteSpace: "nowrap" }}>{b.name}<div className="muted" style={{ fontSize: 11.5 }}>{b.email}</div></td>
                <td style={{ whiteSpace: "nowrap" }}>{b.phone ? <a className="link" href={`tel:${b.phone}`}>{b.phone}</a> : "-"}</td>
                <td>{b.qty}</td>
                <td style={{ maxWidth: 130, fontSize: 12.5 }}>{b.food_note || <span className="muted">—</span>}</td>
                <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>{b.needs_parking ? (b.parking_notified ? "✅ แจ้งแล้ว" : "🅿️ ต้องการ") : <span className="muted">ไม่ต้อง</span>}</td>
                <td style={{ maxWidth: 150, fontSize: 12.5 }}>{b.customer_note || <span className="muted">—</span>}</td>
                <td>{b.status === "paid" ? <span className="tag on">จ่ายแล้ว</span> : b.status === "cancelled" ? <span className="tag off">ยกเลิก</span> : <span className="tag">รอจ่าย</span>}</td>
              </tr>)}</tbody></table></div>
          </>}
        </div>
      </div>}
    </div>
  );
}

/* ══════════ 7) ลูกค้ามาจากไหน — ตอบว่า "แอดทำเงินได้จริงไหม" ══════════ */
export function Attribution({ adminKey }) {
  const [d, setD] = useState(null);
  const [days, setDays] = useState(30);
  useEffect(() => { api(`/api/admin/attribution?days=${days}`, { adminKey }).then(setD).catch(() => setD({ sources: [] })); }, [days]);
  if (!d) return null;
  const LABEL = { "meta-ads": "📣 แอด Facebook/IG", "meta-organic": "📱 โพสต์ FB/IG (ไม่ใช่แอด)", "line": "💬 LINE", "search": "🔍 ค้นหา Google", "direct": "🔗 พิมพ์ลิงก์เข้ามาเอง", "referral": "🤝 เพื่อนแนะนำ", "(ไม่รู้ที่มา)": "❔ ก่อนเริ่มเก็บข้อมูล" };
  return (
    <div className="card">
      <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0 }}>📣 ลูกค้ามาจากไหน</h3>
        <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ ...inp, width: "auto", padding: "6px 10px" }}>
          <option value={7}>7 วัน</option><option value={30}>30 วัน</option><option value={90}>90 วัน</option>
        </select>
      </div>
      {!d.tracking_started
        ? <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>เพิ่งเริ่มเก็บข้อมูลที่มาวันนี้ — ออเดอร์ที่เกิดก่อนหน้านี้ย้อนหลังไม่ได้ค่ะ รออีกสัก 1 วันจะเริ่มเห็นภาพ</p>
        : <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>นับจากลิงก์ที่ลูกค้าคลิกเข้ามาครั้งแรก · "แอด Facebook/IG" จับจาก fbclid ที่ Facebook ต่อมาให้ทุกคลิกจากแอด</p>}
      <div className="scroll" style={{ marginTop: 12 }}>
        <table><thead><tr><th>ที่มา</th><th>คนเข้าเว็บ</th><th>เริ่มสั่งซื้อ</th><th>จ่ายจริง</th><th>เงินเข้า</th></tr></thead>
          <tbody>{d.sources.map(s => (
            <tr key={s.source} style={s.source === "meta-ads" ? { background: "#f7fbff" } : undefined}>
              <td style={{ fontWeight: s.source === "meta-ads" ? 700 : 400 }}>{LABEL[s.source] || s.source}</td>
              <td>{s.sessions || "—"}</td><td>{s.orders}</td>
              <td style={{ fontWeight: 700, color: s.paid > 0 ? "#1a7f43" : "inherit" }}>{s.paid}</td>
              <td style={{ fontWeight: 700 }}>{s.revenue ? money(s.revenue) : "—"}</td>
            </tr>))}
            {!d.sources.length && <tr><td colSpan={5} className="muted">ยังไม่มีข้อมูล</td></tr>}
          </tbody></table>
      </div>
    </div>
  );
}

/* ══════════ 6) คนที่ได้บทวิเคราะห์แล้วแต่ยังไม่กด "สร้างแผน 30 วัน" ══════════ */
// ลูกค้าจ่ายเงินมาแล้วแต่ยังไม่ได้ของชิ้นหลัก (สคริปต์ 30 วัน) — กลุ่มนี้สำคัญที่สุดที่ต้องตาม
export function ActivationPending({ adminKey }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function load() { try { setD(await api("/api/admin/activation-pending", { adminKey })); } catch (e) { setD({ error: e.message, pending: [] }); } }
  useEffect(() => { load(); }, []);
  async function send() {
    setBusy(true); setMsg("");
    try { const r = await api("/api/admin/run-activation", { method: "POST", adminKey, body: {} });
      setMsg(r.sent > 0 ? `✅ ส่งเมลเตือนไป ${r.sent} คนแล้วค่ะ` : "ไม่มีใครเข้าเกณฑ์ต้องเตือนตอนนี้ (ทุกคนที่เกิน 24 ชม. ได้รับเมลไปแล้ว)");
      await load();
    } catch (e) { setMsg("❌ " + e.message); } finally { setBusy(false); }
  }
  if (!d) return null;
  if (d.error) return <div className="card"><h3>📋 รอลูกค้ากดสร้างแผน</h3><p className="muted">โหลดไม่สำเร็จ: {d.error}</p></div>;
  if (!d.pending.length) return (
    <div className="card" style={{ background: "#e8f7ee", border: "1px solid #9ed3b0" }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>✅ ไม่มีใครค้างรอกดสร้างแผน</h3>
      <p className="muted" style={{ fontSize: 13, margin: "4px 0 0" }}>ลูกค้าทุกคนที่ได้บทวิเคราะห์แล้ว กดสร้างแผน 30 วันครบหมด</p>
    </div>
  );
  return (
    <div className="card" style={{ borderLeft: `4px solid ${d.over_24h > 0 ? "#e0a800" : BLUE}` }}>
      <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0 }}>📋 รอลูกค้ากดสร้างแผน 30 วัน ({d.total})</h3>
        <button className="link" style={{ background: "none", border: 0 }} onClick={load}>↻ รีเฟรช</button>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
        คนกลุ่มนี้จ่ายเงินแล้วและได้บทวิเคราะห์แล้ว แต่ยังไม่ได้กดปุ่มเพื่อรับสคริปต์ 30 วัน —
        ระบบส่งเมลเตือนให้อัตโนมัติเมื่อเกิน 24 ชม. (คนละ 1 ครั้ง)
      </p>
      <div className="row" style={{ gap: 10, margin: "12px 0", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 120, background: "var(--soft)", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{d.total}</div><div className="muted" style={{ fontSize: 12.5 }}>รอทั้งหมด</div></div>
        <div style={{ flex: 1, minWidth: 120, background: d.over_24h > 0 ? "#fff7e6" : "var(--soft)", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: d.over_24h > 0 ? "#8a6d1f" : "inherit" }}>{d.over_24h}</div><div className="muted" style={{ fontSize: 12.5 }}>เกิน 24 ชม.</div></div>
        <div style={{ flex: 1, minWidth: 120, background: "var(--soft)", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#1a7f43" }}>{d.reminded}</div><div className="muted" style={{ fontSize: 12.5 }}>ส่งเมลเตือนแล้ว</div></div>
      </div>
      <button className="btn" disabled={busy} onClick={send} style={{ padding: "10px 18px" }}>{busy ? "กำลังส่ง..." : "📩 ส่งเมลเตือนคนที่ยังไม่ได้รับ (เดี๋ยวนี้)"}</button>
      {msg && <div className="msg" style={{ marginTop: 10, background: msg.startsWith("❌") ? "#fdeaea" : "#e8f7ee", color: msg.startsWith("❌") ? "#b3261e" : "#1a7f43" }}>{msg}</div>}
      <div className="scroll" style={{ marginTop: 14, maxHeight: 340, overflowY: "auto" }}>
        <table><thead><tr><th>รอมาแล้ว</th><th>IG</th><th>อีเมล</th><th>เมลเตือน</th><th>เล่ม</th></tr></thead>
          <tbody>{d.pending.map(p => (
            <tr key={p.blueprint_id}>
              <td style={{ whiteSpace: "nowrap", fontWeight: p.hours_waiting >= 24 ? 700 : 400, color: p.hours_waiting >= 48 ? "#b3261e" : p.hours_waiting >= 24 ? "#8a6d1f" : "inherit" }}>
                {p.hours_waiting < 24 ? `${p.hours_waiting} ชม.` : `${Math.floor(p.hours_waiting / 24)} วัน`}
              </td>
              <td style={{ whiteSpace: "nowrap" }}>{p.instagram_account || "-"}</td>
              <td>{p.email}</td>
              <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>{p.activation_reminded_at ? "✅ ส่งแล้ว" : p.hours_waiting >= 24 ? <span style={{ color: "#8a6d1f", fontWeight: 700 }}>รอส่ง</span> : <span className="muted">ยังไม่ถึงเวลา</span>}</td>
              <td><a className="link" target="_blank" rel="noreferrer" href={`/dashboard?user_id=${encodeURIComponent(p.user_id)}&billing_cycle=${encodeURIComponent(p.billing_cycle)}&blueprint_id=${encodeURIComponent(p.blueprint_id)}`}>เปิด ›</a></td>
            </tr>))}</tbody></table>
      </div>
    </div>
  );
}

/* ══════════ 5) ความปลอดภัย — จับบัญชีที่น่าจะแชร์รหัสกัน ══════════ */
export function SecurityPanel({ adminKey }) {
  const [d, setD] = useState(null);
  useEffect(() => { api("/api/admin/academy/security?days=7", { adminKey }).then(setD).catch(() => setD({ suspicious: [] })); }, []);
  if (!d || !d.suspicious?.length) return null;   // ไม่มีอะไรผิดปกติ = ไม่ต้องรบกวนสายตา
  return (
    <div className="card" style={{ borderLeft: "4px solid #e0a800" }}>
      <h3>🔒 บัญชีที่น่าสงสัยว่าแชร์กัน (7 วันล่าสุด)</h3>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>เปิดคอร์สจากหลาย IP ผิดปกติ — อาจแชร์รหัสให้คนอื่นเรียนฟรี หรือแค่เปลี่ยนเน็ตบ่อยก็ได้ ดูประกอบก่อนตัดสินนะคะ</p>
      <table style={{ marginTop: 10 }}><thead><tr><th>อีเมล</th><th>จำนวน IP</th><th>เปิดดู</th><th>ล่าสุด</th></tr></thead>
        <tbody>{d.suspicious.map(s => <tr key={s.email}><td>{s.email}</td><td><b style={{ color: s.ips >= 6 ? "#b3261e" : "inherit" }}>{s.ips}</b></td><td>{s.views}</td><td>{thDate(s.last_seen)}</td></tr>)}</tbody></table>
    </div>
  );
}

/* ══════════ 6) ช่วยลูกค้าที่เข้าเรียนไม่ได้ ══════════
   ทำขึ้น 17 ส.ค. 2569 หลังแอดมิน (พลอย) แจ้ง "มีลูกค้าเก่า เข้าเว็บใหม่ ยังไม่เจอคอร์ส"

   ต้นเหตุจริงที่เจอตอนย้ายข้อมูล: ลูกค้าที่จ่ายเงินแล้ว 253 คน "ไม่มีอีเมลในระบบเก่าเลย"
   (สมัครด้วย username อย่างเดียว) รวมเงินที่จ่ายมาแล้ว ~฿1.1 ล้าน — คนกลุ่มนี้ล็อกอินเว็บใหม่ไม่ได้
   เพราะเราใช้อีเมลเป็นตัวยืนยันตัวตน

   เดิมฝั่งเซิร์ฟเวอร์มี endpoint เปิดสิทธิ์อยู่แล้ว แต่ "ไม่มีหน้าจอให้กด" ทีมเลยแก้เองไม่ได้เลย
   ต้องส่งเรื่องมาให้ทีมพัฒนาทุกครั้ง — แผงนี้ตัดคอขวดนั้นออก */
export function CustomerHelp({ adminKey }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({});      // legacy_id → อีเมลที่แอดมินกำลังพิมพ์
  const [msg, setMsg] = useState("");

  async function search(e) {
    e?.preventDefault();
    if (q.trim().length < 2) { setMsg("พิมพ์อย่างน้อย 2 ตัวอักษรนะคะ"); return; }
    setBusy(true); setMsg("");
    try { setRes(await api(`/api/admin/academy/find?q=${encodeURIComponent(q.trim())}`, { adminKey })); }
    catch { setRes(null); setMsg("ค้นหาไม่สำเร็จ ลองใหม่อีกทีนะคะ"); }
    setBusy(false);
  }

  async function link(u) {
    const email = (draft[u.legacy_id] || "").trim();
    if (!email) { setMsg("ใส่อีเมลของลูกค้าก่อนนะคะ"); return; }
    if (!await askConfirm(`ผูกอีเมล ${email} ให้ "${u.name || u.username}" และเปิดสิทธิ์ ${u.bought.length} คอร์สที่เขาจ่ายเงินไปแล้ว?`)) return;
    setBusy(true); setMsg("");
    try {
      const r = await api("/api/admin/academy/set-email", { method: "POST", adminKey,
        body: { legacy_id: u.legacy_id, email, granted_by: "admin" } });
      setMsg(`✅ เรียบร้อย — ${r.email} เข้าเรียนได้ ${r.owns_count} คอร์สแล้ว บอกลูกค้าให้ล็อกอินด้วยอีเมลนี้ได้เลยค่ะ`);
      await search();
    } catch (e) { setMsg("❌ " + (e?.message || "ทำไม่สำเร็จ")); }
    setBusy(false);
  }

  return (
    <div className="card">
      <h3>🙋 ช่วยลูกค้าที่เข้าเรียนไม่ได้</h3>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.7 }}>
        ลูกค้าทักมาว่า “ซื้อคอร์สแล้วแต่ล็อกอินไปไม่เจอ” ให้ค้นที่นี่ได้เลย —
        ใส่ <b>อีเมล ชื่อ ชื่อผู้ใช้ หรือเบอร์โทร</b> อะไรก็ได้ที่ลูกค้าบอกมา
      </p>
      <form onSubmit={search} className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="เช่น kamonlak / 0891153009 / somchai@gmail.com"
          style={{ ...inp, flex: 1, minWidth: 220, width: "auto" }} />
        <button className="btn" disabled={busy} style={{ padding: "8px 18px" }}>{busy ? "…" : "ค้นหา"}</button>
      </form>
      {msg && <p style={{ fontSize: 13, marginTop: 10, fontWeight: 600, color: msg.startsWith("❌") ? "#b3261e" : "#1a7f43" }}>{msg}</p>}

      {res && (res.users.length === 0
        ? <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            ไม่เจอลูกค้าชื่อนี้ในข้อมูลเว็บเก่าเลยค่ะ — ลองค้นด้วยคำอื่น (ชื่อจริง/ชื่อผู้ใช้/เบอร์)
            ถ้ายังไม่เจอ แปลว่าเขาอาจซื้อในชื่อคนอื่น ลองขอสลิปหรือวันที่โอนมาดูนะคะ
          </p>
        : <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {res.users.map(u => (
              <div key={u.legacy_id} style={{ ...box, marginBottom: 0,
                borderLeft: `4px solid ${u.can_see_now > 0 ? "#22c55e" : u.paid_orders > 0 ? "#e0a800" : "var(--border)"}` }}>
                <div className="between" style={{ flexWrap: "wrap", gap: 6 }}>
                  <b style={{ fontSize: 14 }}>{u.name || u.username || "(ไม่มีชื่อ)"}</b>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: u.can_see_now > 0 ? "#1a7f43" : "#8a6d1f" }}>
                    {u.can_see_now > 0 ? `✅ เข้าเรียนได้แล้ว ${u.can_see_now} คอร์ส` : "⚠️ ยังเข้าเรียนไม่ได้"}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.8 }}>
                  อีเมลในระบบ: <b style={{ color: u.needs_email ? "#b3261e" : "inherit" }}>{u.email || "— ไม่มี —"}</b>
                  {" · "}ชื่อผู้ใช้: {u.username || "-"}
                  {u.phone ? <> · โทร: <a className="link" href={`tel:${u.phone}`}>{u.phone}</a></> : null}
                  <br />สมัครเมื่อ {u.joined || "-"} · จ่ายเงินแล้ว {u.paid_orders} ออเดอร์ รวม {money(u.spent_baht)}
                </div>
                {u.bought.length > 0 && <div style={{ fontSize: 12.5, marginTop: 6 }}>
                  📚 คอร์สที่จ่ายเงินแล้ว: {u.bought.map(b => b.name).join(" · ")}
                </div>}

                {u.can_see_now === 0 && u.paid_orders > 0 && <div style={{ marginTop: 10, background: "var(--soft)", borderRadius: 10, padding: "10px 12px" }}>
                  <label style={{ ...lbl, marginTop: 0 }}>
                    ถามอีเมลที่ลูกค้าใช้อยู่ตอนนี้ แล้วใส่ตรงนี้ → เขาจะเข้าเรียนได้ทันที
                  </label>
                  {u.username_is_email && !u.email &&
                    <p className="muted" style={{ fontSize: 12, margin: "0 0 6px", lineHeight: 1.6 }}>
                      💡 ตอนสมัครเขาพิมพ์ <b>{u.username}</b> ไว้ในช่องชื่อผู้ใช้ — น่าจะเป็นอีเมลเขา แต่ยืนยันกับลูกค้าก่อนนะคะ
                    </p>}
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <input type="email" placeholder="อีเมลของลูกค้า"
                      value={draft[u.legacy_id] ?? (u.username_is_email && !u.email ? u.username : "")}
                      onChange={e => setDraft(d => ({ ...d, [u.legacy_id]: e.target.value }))}
                      style={{ ...inp, flex: 1, minWidth: 200, width: "auto" }} />
                    <button className="btn" disabled={busy} onClick={() => link(u)} style={{ padding: "8px 16px" }}>เปิดสิทธิ์ให้</button>
                  </div>
                </div>}

                {u.can_see_now === 0 && u.paid_orders === 0 &&
                  <p className="muted" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.7 }}>
                    บัญชีนี้<b>ไม่มีออเดอร์ที่จ่ายเงินสำเร็จ</b>ในระบบเก่าเลยค่ะ — อาจกดสั่งแล้วไม่ได้โอน
                    หรือโอนในชื่อ/อีเมลอื่น ลองขอสลิปกับวันที่โอนมาตรวจก่อนเปิดสิทธิ์นะคะ
                  </p>}
              </div>
            ))}
          </div>)}
    </div>
  );
}

/* ══════════ 7) คิวลูกค้าที่กดแจ้ง "ไม่เจอคอร์สที่เคยซื้อ" จากหน้าเว็บ ══════════ */
export function ClaimsPanel({ adminKey }) {
  const [d, setD] = useState(null);
  useEffect(() => { api("/api/admin/academy/claims", { adminKey }).then(setD).catch(() => setD({ claims: [] })); }, []);
  const open = (d?.claims || []).filter(c => c.status === "open");
  if (!open.length) return null;         // ไม่มีคนรออยู่ = ไม่ต้องรกสายตา
  return (
    <div className="card" style={{ borderLeft: "4px solid #b3261e" }}>
      <h3>🙋 ลูกค้าแจ้งว่าไม่เจอคอร์สที่เคยซื้อ ({open.length})</h3>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
        คนพวกนี้จ่ายเงินแล้วแต่เข้าเรียนไม่ได้ — เร่งที่สุด · แก้ได้ที่แผง “🙋 ช่วยลูกค้าที่เข้าเรียนไม่ได้” ด้านล่าง
      </p>
      <table style={{ marginTop: 10 }}><thead><tr><th>แจ้งเมื่อ</th><th>อีเมล</th><th>ลูกค้าเล่าว่า</th></tr></thead>
        <tbody>{open.map(c => <tr key={c.claim_id}>
          <td style={{ whiteSpace: "nowrap" }}>{thDate(c.created_at)}</td>
          <td>{c.email}</td>
          <td style={{ fontSize: 12.5 }}>{c.note || <span className="muted">(ไม่ได้เขียนเพิ่ม)</span>}</td>
        </tr>)}</tbody></table>
    </div>
  );
}
