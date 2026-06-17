import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, session, fmt } from "../api.js";

const METRICS = [["followers", "ผู้ติดตาม"], ["reach", "การเข้าถึง (Reach)"], ["profile_visits", "เข้าชมโปรไฟล์"], ["link_taps", "กดลิงก์ (Link Taps)"], ["engagement_rate", "Engagement (%)"]];
const pct = (a, b) => (a == null || b == null || a === 0) ? null : Math.round((b - a) / a * 1000) / 10;

export default function Compare() {
  const nav = useNavigate();
  const [months, setMonths] = useState(null);
  const [coach, setCoach] = useState("loading");

  useEffect(() => {
    if (!session.token) { nav("/account"); return; }
    api("/api/me/blueprints", { token: session.token }).then(d => setMonths(d.months)).catch(() => { session.clear(); nav("/account"); });
    api("/api/me/growth-analysis", { token: session.token }).then(d => setCoach(d.analysis || null)).catch(() => setCoach(null));
  }, []);

  if (!months) return <div className="wrap narrow page-pad center"><div className="spinner" /><p className="muted">กำลังโหลด...</p></div>;
  if (months.length === 0) return <div className="wrap narrow page-pad"><h1 className="page">เส้นทางการเติบโต</h1><div className="card center muted">ยังไม่มีเล่มในบัญชีนี้<br /><br /><Link className="btn" to="/form">สร้างเล่มแรก</Link></div></div>;

  const single = months.length < 2;
  const first = months[0], last = months[months.length - 1];
  const flw = pct(first.metrics?.followers, last.metrics?.followers);
  const maxF = Math.max(...months.map(m => m.metrics?.followers || 0), 1);

  return (
    <div className="wrap narrow page-pad">
      <div className="between"><span className="brand">BABE HOUSE · ACADEMY</span><Link className="link" to="/account">← บัญชีของฉัน</Link></div>
      <h1 className="page">เส้นทางการเติบโต</h1>

      {single ? <>
        <div className="card" style={{ background: "linear-gradient(135deg,var(--blue),var(--blue-d))", color: "#fff", borderRadius: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>📊 เดือนแรกของคุณ</div>
          <div style={{ opacity: .9, fontSize: 14, marginTop: 6 }}>นี่คือจุดเริ่มต้น — เดือนหน้ากลับมาดูว่าคุณโตขึ้นแค่ไหนกับ Babe House 🩵</div>
        </div>
        <div className="card"><h3 style={{ marginBottom: 12 }}>สถิติตั้งต้น · {first.billing_cycle.replace("_", " ")}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
            {METRICS.map(([k, label]) => first.metrics?.[k] != null && <div key={k} style={{ background: "var(--soft)", borderRadius: 12, padding: "14px" }}><div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{label}</div><div style={{ fontSize: 22, fontWeight: 800, color: "var(--blue)", marginTop: 4 }}>{fmt(first.metrics[k])}</div></div>)}
          </div>
        </div>
        <Link className="btn full" to={`/form?renew=1&email=${encodeURIComponent(session.email || "")}`} style={{ marginBottom: 16 }}>+ ปลดล็อกเดือนถัดไป เพื่อเริ่มเทียบการเติบโต</Link>
      </> : <>
        <div className="card" style={{ background: "linear-gradient(135deg,var(--blue),var(--blue-d))", color: "#fff", borderRadius: 20 }}>
          <div style={{ fontSize: 40, fontWeight: 700 }}>{flw == null ? "—" : (flw >= 0 ? "+" : "") + flw + "%"}</div>
          <div style={{ opacity: .9 }}>ผู้ติดตามเติบโตจากเดือนแรก</div>
          <div style={{ opacity: .85, fontSize: 13, marginTop: 8 }}>จาก {fmt(first.metrics?.followers)} → {fmt(last.metrics?.followers)} ใน {months.length} เดือนกับ Babe House 🩵</div>
        </div>
        <div className="card"><h3 style={{ marginBottom: 14 }}>ผู้ติดตามรายเดือน</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 150 }}>
            {months.map(m => { const v = m.metrics?.followers || 0; return <div key={m.blueprint_id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}><div style={{ fontSize: 12, fontWeight: 700 }}>{fmt(v || null)}</div><div className="bar-fill" style={{ width: "100%", maxWidth: 46, height: `${Math.round(v / maxF * 100)}%`, borderRadius: "8px 8px 0 0" }} /><div className="muted" style={{ fontSize: 11, textAlign: "center" }}>{m.billing_cycle.replace("_", " ")}</div></div>; })}
          </div>
        </div>
        <div className="card"><h3 style={{ marginBottom: 14 }}>เทียบเดือนแรก ↔ เดือนล่าสุด</h3>
          <div className="scroll"><table><thead><tr><th>ตัวชี้วัด</th><th style={{ textAlign: "right" }}>{first.billing_cycle.replace("_", " ")}</th><th style={{ textAlign: "right" }}>{last.billing_cycle.replace("_", " ")}</th><th style={{ textAlign: "right" }}>เปลี่ยน</th></tr></thead>
            <tbody>{METRICS.map(([k, label]) => { const a = first.metrics?.[k], b = last.metrics?.[k], p = pct(a, b); return <tr key={k}><td>{label}</td><td style={{ textAlign: "right" }}>{fmt(a)}</td><td style={{ textAlign: "right" }}>{fmt(b)}</td><td style={{ textAlign: "right", fontWeight: 700, color: p == null ? "var(--muted)" : p >= 0 ? "var(--up)" : "var(--down)" }}>{p == null ? "—" : (p >= 0 ? "▲ +" : "▼ ") + p + "%"}</td></tr>; })}</tbody>
          </table></div>
        </div>
      </>}

      {coach === "loading" && <div className="card center muted">ครูพี่คิมกำลังวิเคราะห์การเติบโตของคุณ... 🩵</div>}
      {coach && coach !== "loading" && <div className="card">
        <div className="row" style={{ marginBottom: 6 }}><div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--blue)", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>คิม</div><div><div style={{ fontWeight: 700, fontSize: 14 }}>ครูพี่คิม</div><div className="muted" style={{ fontSize: 12 }}>บทวิเคราะห์การเติบโตส่วนตัว</div></div></div>
        <div style={{ fontSize: 18, fontWeight: 700, margin: "8px 0 14px" }}>{coach.headline}</div>
        {[["📈 โตขึ้นเพราะอะไร", coach.growth_drivers], ["✅ จุดแข็งของคุณ", coach.strengths], ["⚠️ จุดที่ต้องระวัง", coach.watchouts], ["🎯 เดือนต่อไปโฟกัสอะไร", coach.next_focus]].map(([h, arr]) =>
          <div key={h} style={{ marginBottom: 12 }}><h4 style={{ fontSize: 13, marginBottom: 6 }}>{h}</h4><ul style={{ paddingLeft: 18 }}>{(arr || []).map((x, i) => <li key={i} style={{ fontSize: 14, lineHeight: 1.6 }}>{x}</li>)}</ul></div>)}
        <div className="msg" style={{ background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", border: "1px solid #d6e7fa", fontSize: 15 }}>{coach.coach_message}</div>
        <Link className="btn full" to={`/form?renew=1&email=${encodeURIComponent(session.email || "")}`} style={{ marginTop: 14 }}>ปลดล็อกแผนเดือนต่อไป (490฿) →</Link>
      </div>}
    </div>
  );
}
