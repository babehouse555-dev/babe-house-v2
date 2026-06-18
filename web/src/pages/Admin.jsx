import { useState, useEffect } from "react";
import { api, baht } from "../api.js";

const fmtTok = (n) => { n = Number(n || 0); return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n); };

export default function Admin() {
  const [key, setKey] = useState(localStorage.getItem("babe_admin_key") || "");
  const [authed, setAuthed] = useState(false);
  const [ov, setOv] = useState(null);
  const [rev, setRev] = useState(null);
  const [codes, setCodes] = useState([]);
  const [industries, setIndustries] = useState(null);
  const [students, setStudents] = useState([]);
  const [filter, setFilter] = useState(null);
  const [insight, setInsight] = useState(null);
  const [usage, setUsage] = useState(null);
  const [custOv, setCustOv] = useState(null);
  const [showCustDetail, setShowCustDetail] = useState(false);
  const [qual, setQual] = useState(null);
  const [nc, setNc] = useState({ code: "", note: "", discount_percent: "", max_uses: "" });
  const [loginErr, setLoginErr] = useState("");
  const [remind, setRemind] = useState("");

  useEffect(() => { if (key) tryLogin(key); }, []);
  async function tryLogin(k) { try { await api("/api/admin/overview", { adminKey: k }); localStorage.setItem("babe_admin_key", k); setAuthed(true); loadAll(k); } catch { setLoginErr("ADMIN_KEY ไม่ถูกต้อง"); } }
  async function loadAll(k = key) {
    setOv(await api("/api/admin/overview", { adminKey: k }));
    setRev(await api("/api/admin/revenue", { adminKey: k }));
    setUsage(await api("/api/admin/ai-usage", { adminKey: k }));
    setCustOv(await api("/api/admin/customer-overview", { adminKey: k }));
    setQual(await api("/api/admin/quality", { adminKey: k }));
    setCodes((await api("/api/admin/codes", { adminKey: k })).codes);
    loadIndustries(k); loadStudents(null, k);
  }
  async function regen(user_id, billing_cycle) {
    if (!window.confirm("รีเจนเล่มนี้ใหม่ด้วย prompt ล่าสุด? (ใช้เวลา ~1-2 นาที)")) return;
    try { await api("/api/admin/regenerate", { method: "POST", adminKey: key, body: { user_id, billing_cycle } }); alert("เริ่มรีเจนแล้ว — รอ ~1-2 นาที แล้วกดรีเฟรชหน้าเช็คอีกที"); }
    catch (e) { alert(e.message); }
  }
  async function loadIndustries(k = key) { setIndustries(await api("/api/admin/industries", { adminKey: k })); }
  async function loadStudents(ind = null, k = key) { const d = await api("/api/admin/students" + (ind ? "?industry=" + encodeURIComponent(ind) : ""), { adminKey: k }); setStudents(d.students); setFilter(ind); }
  async function classify() { await api("/api/admin/classify", { method: "POST", adminKey: key, body: {} }); loadIndustries(); loadStudents(filter); }
  async function aiInsight() { setInsight("loading"); try { const d = await api("/api/admin/ai-insight", { adminKey: key }); setInsight(d.insight); } catch { setInsight(null); } }
  async function addCode() { try { await api("/api/admin/codes", { method: "POST", adminKey: key, body: nc }); setNc({ code: "", note: "", discount_percent: "", max_uses: "" }); setCodes((await api("/api/admin/codes", { adminKey: key })).codes); } catch (e) { alert(e.message); } }
  async function toggleCode(c) { await api("/api/admin/codes/toggle", { method: "POST", adminKey: key, body: { code: c } }); setCodes((await api("/api/admin/codes", { adminKey: key })).codes); }
  function csv() { window.open(`/api/admin/students.csv?admin_key=${encodeURIComponent(key)}` + (filter ? "&industry=" + encodeURIComponent(filter) : ""), "_blank"); }

  if (!authed) return (
    <div className="wrap narrow page-pad">
      <div className="brand">BABE HOUSE · ADMIN</div><h1 className="page">ระบบหลังบ้าน</h1>
      <div className="card"><div className="field"><label>ADMIN_KEY</label><input type="password" value={key} onChange={e => setKey(e.target.value)} /></div><button className="btn full" onClick={() => tryLogin(key)}>เข้าสู่ระบบ</button>{loginErr && <div className="msg err">{loginErr}</div>}</div>
    </div>
  );

  const dLabel = (c) => (c.discount_percent == null || c.discount_percent >= 100) ? "ฟรี 100%" : `ลด ${c.discount_percent}%`;
  const stBadge = (st) => st === "ready" ? <span className="tag on">✅ พร้อม</span> : st === "error" ? <span className="tag off">⚠️ ติดขัด</span> : <span className="tag" style={{ background: "#fff7e6", color: "#8a6d1f" }}>⏳ กำลังสร้าง</span>;
  return (
    <div className="wrap page-pad">
      <div className="between"><h1 className="page">ระบบหลังบ้าน</h1><button className="link" onClick={() => { localStorage.removeItem("babe_admin_key"); setAuthed(false); }} style={{ background: "none", border: 0 }}>ออกจากระบบ</button></div>

      {ov && <div className="card"><h3>ภาพรวม</h3><div className="row" style={{ marginTop: 12 }}>{[["ลูกค้า", ov.customers], ["เล่ม", ov.blueprints], ["จ่ายแล้ว", ov.paid_orders]].map(([l, n]) => <div key={l} style={{ flex: 1, minWidth: 120, background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", borderRadius: 14, padding: 16 }}><div style={{ fontSize: 28, fontWeight: 800, color: "var(--blue)" }}>{n}</div><div className="muted" style={{ fontSize: 13 }}>{l}</div></div>)}</div>
        <div className="row" style={{ marginTop: 14, gap: 10 }}><button className="btn ghost" onClick={async () => { setRemind("ส่ง..."); try { const d = await api("/api/admin/run-reminders", { method: "POST", adminKey: key, body: {} }); setRemind(`ส่งเตือนต่อเดือน ${d.sent} · การบ้าน ${d.homework} ราย`); } catch (e) { setRemind(e.message); } }} style={{ padding: "9px 14px" }}>📩 ส่งอีเมลเตือนต่อเดือน (เดี๋ยวนี้)</button><span className="muted" style={{ fontSize: 13 }}>{remind}</span></div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>ระบบส่งให้อัตโนมัติ <b>ช่วงปลายเดือน (ตั้งแต่วันที่ 25)</b> เพื่อกระตุ้นต่อแผนเดือนหน้า · 1 อีเมล/คน/เดือน — ปุ่มนี้สำหรับสั่งส่งทันทีโดยไม่ต้องรอ</p>
        {(ov.error_gen > 0 || ov.pending_gen > 0) && <div className="msg" style={{ background: ov.error_gen > 0 ? "#fdeaea" : "#fff7e6", color: ov.error_gen > 0 ? "#b3261e" : "#8a6d1f", marginTop: 10 }}>{ov.error_gen > 0 ? `⚠️ มี ${ov.error_gen} เล่มที่จ่ายแล้วแต่ AI สร้างยังไม่สำเร็จ (เช่น Gemini แน่น/token หมด) — ระบบลองใหม่ให้อัตโนมัติทุก 5 นาที ถ้าค้างนานควรเช็ก quota หรือเติม credit ที่ Google` : `⏳ มี ${ov.pending_gen} เล่มกำลังสร้าง...`}</div>}
      </div>}

      {usage && <div className="card"><h3>🤖 ต้นทุน AI (Gemini) เดือนนี้</h3>
        <div className="row" style={{ alignItems: "baseline", margin: "12px 0 6px" }}><div style={{ fontSize: 34, fontWeight: 800, color: "var(--blue)" }}>฿{Number(usage.month.cost_thb).toLocaleString()}</div><div className="muted">{usage.month.count} เล่ม · เฉลี่ย ฿{usage.month.avg_thb}/เล่ม</div></div>
        <p className="muted" style={{ fontSize: 13 }}>โทเค็นเดือนนี้ {fmtTok(usage.month.total)} (เข้า {fmtTok(usage.month.input)} · ออก {fmtTok(usage.month.output)}) · รวมทั้งหมด {fmtTok(usage.all_time.total_tokens)} จาก {usage.all_time.count} เล่ม</p>
        {usage.month.by_model.length > 0 && <div className="scroll" style={{ marginTop: 10 }}><table><thead><tr><th>โมเดล</th><th>เล่ม</th><th>โทเค็น</th><th>฿</th></tr></thead><tbody>{usage.month.by_model.map(m => <tr key={m.model}><td>{m.model}</td><td>{m.count}</td><td>{fmtTok(m.input + m.output)}</td><td>฿{m.cost_thb}</td></tr>)}</tbody></table></div>}
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>ราคาประมาณ (แปลง USD→฿ ~36) · ยอดจริงดูที่ Google AI Studio / Cloud Billing</p>
      </div>}

      {rev && <div className="card"><h3>💰 รายได้จริง (เงินเข้าจริง)</h3><div className="row" style={{ alignItems: "baseline", margin: "12px 0 6px" }}><div style={{ fontSize: 34, fontWeight: 800, color: "var(--up)" }}>{baht(rev.total_satang)}</div><div className="muted">จ่ายจริง · {rev.paid_count} ออเดอร์</div></div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", margin: "0 0 14px" }}>
          <span style={{ background: "#fff7e6", color: "#8a6d1f", fontSize: 12.5, fontWeight: 700, padding: "4px 10px", borderRadius: 20 }}>🎁 โค้ดฟรี/ส่วนลด 100%: {rev.free_count ?? 0}</span>
          <span style={{ background: "#f3edfb", color: "#6b3fa0", fontSize: 12.5, fontWeight: 700, padding: "4px 10px", borderRadius: 20 }}>🧪 ทดสอบ (mock): {rev.test_count ?? 0}</span>
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>* นับเฉพาะที่จ่ายผ่าน Stripe จริง (บัตร/PromptPay) มากกว่า 0฿ — ไม่รวมโค้ดฟรีและออเดอร์ทดสอบ</div>
        {rev.by_month.length >= 2 && <div style={{ marginTop: 6 }}><div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>รายได้แต่ละเดือน</div>{rev.by_month.map(m => { const max = Math.max(...rev.by_month.map(x => x.revenue), 1); return <div key={m.billing_cycle} style={{ margin: "9px 0" }}><div className="between" style={{ fontSize: 13, marginBottom: 4 }}><span>{m.billing_cycle.replace("_", " ")}</span><span className="muted">{baht(m.revenue)} · {m.c}</span></div><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round(m.revenue / max * 100)}%` }} /></div></div>; })}</div>}</div>}

      {custOv && (() => {
        const cats = [["🚺", "เพศ", custOv.by_gender, "214,80,118"], ["🎂", "อายุ", custOv.by_age, "230,150,40"], ["🧑‍💼", "อาชีพ/สถานะ", custOv.by_status, "46,134,222"], ["🎯", "กลุ่มคนดู", custOv.by_audience, "26,127,67"], ["⏳", "ประสบการณ์", custOv.by_experience, "138,109,31"], ["🚀", "เป้าหมาย", custOv.by_goal, "107,63,160"]];
        const has = cats.filter(([, , d]) => d && d.length);
        return <div className="card"><h3>👥 กลุ่มลูกค้าของเรา</h3>
          <p className="muted" style={{ fontSize: 13, margin: "4px 0 14px" }}>สรุปจากลูกค้า {custOv.total_customers} คน{custOv.total_customers < 15 ? " (ข้อมูลยังน้อย จะแม่นขึ้นเมื่อลูกค้ามากขึ้น)" : ""}</p>
          {custOv.summary && <div style={{ background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", border: "1px solid #d6e7fa", borderRadius: 14, padding: "16px 18px", marginBottom: 18, fontSize: 15.5, lineHeight: 1.7 }}>📌 <b>{custOv.summary}</b></div>}
          {has.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
            {has.map(([emoji, label, data]) => <div key={label} style={{ background: "var(--soft)", borderRadius: 14, padding: "14px 14px" }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{emoji} {label}</div>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: "var(--blue-d)", margin: "5px 0 2px", lineHeight: 1.3 }}>{data[0].label}</div>
              <div className="muted" style={{ fontSize: 12 }}>{data[0].count} คน{data.length > 1 ? ` · +${data.length - 1} แบบ` : ""}</div>
            </div>)}
          </div>}
          {has.length > 0 && <button type="button" onClick={() => setShowCustDetail(s => !s)} style={{ background: "none", border: 0, color: "var(--blue)", fontWeight: 700, fontSize: 13.5, cursor: "pointer", padding: "12px 0 4px" }}>{showCustDetail ? "▲ ซ่อนรายละเอียด" : "▼ ดูรายละเอียดทั้งหมด (กราฟแยกหัวข้อ)"}</button>}
          {showCustDetail && has.map(([emoji, label, data, rgb]) => <div key={label} style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{emoji} {label}</div>
            {data.slice(0, 8).map(d => { const max = Math.max(...data.map(x => x.count), 1); return <div key={d.label} style={{ margin: "7px 0" }}><div className="between" style={{ fontSize: 13, marginBottom: 3 }}><span>{d.label}</span><span className="muted">{d.count} คน · {d.pct}%</span></div><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round(d.count / max * 100)}%`, background: `rgb(${rgb})` }} /></div></div>; })}
          </div>)}
          <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>* รวมเฉพาะลูกค้าที่กรอกข้อมูลส่วนนี้ · ข้อมูลเก่าก่อนฟอร์มใหม่จะไม่มีบางหัวข้อ</div>
        </div>;
      })()}

      {qual && (qual.flagged.length > 0
        ? <div className="card" style={{ border: "1px solid #e0b85b", background: "#fffdf5" }}>
            <h3 style={{ color: "#8a6d1f" }}>🔎 เล่มที่ควรเช็ค ({qual.flagged.length})</h3>
            <p className="muted" style={{ fontSize: 13, margin: "4px 0 12px" }}>ตัวตรวจคุณภาพอัตโนมัติพบจุดที่อาจไม่แม่น — กดรีเจนแก้ก่อนลูกค้าเห็นได้เลย (จากทั้งหมด {qual.total} เล่ม)</p>
            {qual.flagged.map(f => <div key={f.blueprint_id} style={{ borderTop: "1px solid var(--border)", padding: "12px 0" }}>
              <div className="between" style={{ marginBottom: 6 }}><b style={{ fontSize: 14 }}>{f.email || f.business_type || f.user_id}</b><span className="muted" style={{ fontSize: 12 }}>{String(f.created_at || "").slice(0, 10)}</span></div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>{f.flags.map((fl, i) => <span key={i} style={{ background: "#fff3d6", color: "#8a6d1f", fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 12 }}>⚠️ {fl}</span>)}</div>
              <div className="row" style={{ gap: 14 }}>
                <a className="link" target="_blank" rel="noreferrer" href={`/dashboard?user_id=${encodeURIComponent(f.user_id)}&billing_cycle=${encodeURIComponent(f.billing_cycle)}&blueprint_id=${encodeURIComponent(f.blueprint_id)}`} style={{ fontSize: 13.5 }}>เปิดเล่ม ›</a>
                <button className="link" onClick={() => regen(f.user_id, f.billing_cycle)} style={{ background: "none", border: 0, cursor: "pointer", fontSize: 13.5, color: "var(--blue)", fontWeight: 700 }}>🔄 รีเจนใหม่</button>
              </div>
            </div>)}
          </div>
        : <div className="card"><h3>🔎 ตรวจคุณภาพเล่ม</h3><p className="muted" style={{ marginTop: 8 }}>✓ ทุกเล่มผ่านการตรวจอัตโนมัติ ไม่พบจุดที่ต้องแก้ ({qual.total} เล่ม)</p></div>)}

      <div className="card"><div className="between"><h3>📊 ลูกค้าแยกตามอุตสาหกรรม</h3><button className="btn" onClick={classify} style={{ padding: "9px 14px" }}>จำแนกด้วย AI</button></div>
        {industries && (industries.breakdown.length ? <div style={{ marginTop: 12 }}><p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>คลิกป้ายเพื่อดูรายชื่อในกลุ่มนั้น</p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>{industries.breakdown.map(b => <button key={b.industry} type="button" onClick={() => loadStudents(b.industry)} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border)", background: "#fff", borderRadius: 20, padding: "7px 8px 7px 14px", cursor: "pointer", fontSize: 13.5 }}><span style={{ fontWeight: 600 }}>{b.industry}</span><span style={{ background: "var(--soft)", color: "var(--blue-d)", fontWeight: 700, fontSize: 12.5, padding: "2px 9px", borderRadius: 12 }}>{b.customers}</span></button>)}</div>
          {industries.untagged > 0 && <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>⚠️ ยังมี {industries.untagged} รายการที่ยังไม่จำแนก</p>}</div> : <p className="muted" style={{ marginTop: 12 }}>ยังไม่มีข้อมูลที่จำแนก{industries.untagged ? ` — มี ${industries.untagged} รายการรอจำแนก` : ""}</p>)}
      </div>

      <div className="card"><div className="between"><h3>🧠 สมองหลังบ้าน — วิเคราะห์ฐานลูกค้า</h3><button className="btn" onClick={aiInsight} style={{ padding: "9px 14px" }}>วิเคราะห์</button></div>
        {insight === "loading" && <p className="muted" style={{ marginTop: 12 }}>AI กำลังวิเคราะห์...</p>}
        {insight && insight !== "loading" && <div style={{ marginTop: 12 }}><p>{insight.summary}</p>{[["กลุ่มธุรกิจเด่น", insight.top_segments], ["เป้าหมายที่พบบ่อย", insight.common_goals], ["ปัญหาที่เจอซ้ำ", insight.common_pains], ["โอกาสทางธุรกิจ", insight.opportunities], ["มุมคอนเทนต์ที่ควรทำ", insight.content_angles]].map(([h, arr]) => <div key={h}><h4 style={{ fontSize: 13, margin: "12px 0 4px" }}>{h}</h4><ul style={{ paddingLeft: 18 }}>{(arr || []).map((x, i) => <li key={i} style={{ fontSize: 14 }}>{x}</li>)}</ul></div>)}</div>}
      </div>

      <div className="card"><h3>โค้ดส่วนลด / เข้าใช้ฟรี</h3>
        <div className="row" style={{ marginTop: 12 }}>
          <input style={{ width: 140 }} placeholder="โค้ด (เว้น=สุ่ม)" value={nc.code} onChange={e => setNc({ ...nc, code: e.target.value })} />
          <input style={{ flex: 1, minWidth: 140 }} placeholder="หมายเหตุ" value={nc.note} onChange={e => setNc({ ...nc, note: e.target.value })} />
          <input style={{ width: 130 }} type="number" placeholder="ลด % (100=ฟรี)" value={nc.discount_percent} onChange={e => setNc({ ...nc, discount_percent: e.target.value })} />
          <input style={{ width: 150 }} type="number" placeholder="จำนวนครั้ง" value={nc.max_uses} onChange={e => setNc({ ...nc, max_uses: e.target.value })} />
          <button className="btn" onClick={addCode}>สร้าง</button>
        </div>
        <div className="scroll" style={{ marginTop: 14 }}><table><thead><tr><th>โค้ด</th><th>ส่วนลด</th><th>หมายเหตุ</th><th>ใช้/สูงสุด</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>{codes.length === 0 ? <tr><td colSpan={6} className="muted">ยังไม่มีโค้ด</td></tr> : codes.map(c => <tr key={c.code}><td><b>{c.code}</b></td><td>{dLabel(c)}</td><td>{c.note}</td><td>{c.used_count}/{c.max_uses == null ? "∞" : c.max_uses}</td><td><span className={`tag ${c.active ? "on" : "off"}`}>{c.active ? "เปิด" : "ปิด"}</span></td><td><button className="link" onClick={() => toggleCode(c.code)} style={{ background: "none", border: 0 }}>{c.active ? "ปิด" : "เปิด"}</button></td></tr>)}</tbody>
        </table></div>
      </div>

      <div className="card"><div className="between"><h3>ข้อมูลนักเรียน ({students.length}){filter && <span className="muted"> · กรอง: {filter}</span>}</h3><div className="row">{filter && <button className="link" onClick={() => loadStudents(null)} style={{ background: "none", border: 0 }}>ดูทั้งหมด</button>}<button className="btn ghost" onClick={csv} style={{ padding: "8px 14px" }}>⬇ CSV</button></div></div>
        <div className="scroll" style={{ marginTop: 12 }}><table><thead><tr><th>วันที่</th><th>อีเมล</th><th>IG</th><th>ธุรกิจ</th><th>อุตสาหกรรม</th><th>เป้าหมาย</th><th>สถานะ</th><th>เล่ม</th></tr></thead>
          <tbody>{students.length === 0 ? <tr><td colSpan={8} className="muted">ยังไม่มีข้อมูล</td></tr> : students.map((s, i) => <tr key={i}><td>{String(s.created_at || "").slice(0, 10)}</td><td>{s.email}</td><td>{s.instagram_account}</td><td>{s.business_type}</td><td>{s.industry || "-"}</td><td>{(s.monthly_goal || "").slice(0, 40)}</td><td>{stBadge(s.status)}</td><td>{s.blueprint_id && s.user_id ? <a className="link" target="_blank" href={`/dashboard?user_id=${encodeURIComponent(s.user_id)}&billing_cycle=${encodeURIComponent(s.billing_cycle)}&blueprint_id=${encodeURIComponent(s.blueprint_id)}`}>เปิด ›</a> : "-"}</td></tr>)}</tbody>
        </table></div>
      </div>
    </div>
  );
}
