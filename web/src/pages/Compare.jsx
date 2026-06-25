import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, session, fmt } from "../api.js";

const METRICS = [["followers", "ผู้ติดตาม", "💙"], ["reach", "การเข้าถึง (Reach)", "👁️"], ["profile_visits", "เข้าชมโปรไฟล์", "👤"], ["link_taps", "กดลิงก์ไบโอ", "🔗"], ["engagement_rate", "Engagement", "⚡", "%"]];
const pct = (a, b) => (a == null || b == null || a === 0) ? null : Math.round((b - a) / a * 1000) / 10;

export default function Compare() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const channel = sp.get("channel") || ""; // เทียบการโตเฉพาะช่องนี้ (ถ้ามี)
  const [months, setMonths] = useState(null);
  const [coach, setCoach] = useState("loading");
  const [sponsors, setSponsors] = useState([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!session.token) { nav("/account"); return; }
    api("/api/me/blueprints", { token: session.token }).then(d => setMonths(channel ? (d.months || []).filter(m => String(m.instagram_account || "") === channel) : (d.months || []))).catch(() => { session.clear(); nav("/account"); });
    api("/api/me/growth-analysis" + (channel ? `?channel=${encodeURIComponent(channel)}` : ""), { token: session.token }).then(d => { setCoach(d.analysis || null); setSponsors(d.sponsors || []); }).catch(() => setCoach(null));
  }, []);

  if (!months) return <div className="wrap narrow page-pad center"><div className="spinner" /><p className="muted">กำลังโหลด...</p></div>;
  if (months.length === 0) return <div className="wrap narrow page-pad"><h1 className="page">เส้นทางการเติบโต</h1><div className="card center muted">ยังไม่มีเล่มในบัญชีนี้<br /><br /><Link className="btn" to="/form">สร้างเล่มแรก</Link></div></div>;

  const single = months.length < 2;
  const first = months[0], last = months[months.length - 1];
  const flw = pct(first.metrics?.followers, last.metrics?.followers);
  const maxF = Math.max(...months.map(m => m.metrics?.followers || 0), 1);
  const renewLink = `/form?renew=1&email=${encodeURIComponent(session.email || "")}`;
  const co = coach && coach !== "loading" ? coach : null;

  // ดาวน์โหลดรายงานการเติบโตเป็น Excel (เอเจนซีส่งต่อลูกค้า: โต %, จุดแข็ง/อ่อน, แผน)
  async function exportGrowthXLSX() {
    if (exporting) return; setExporting(true);
    try {
      const writeXlsxFile = (await import("write-excel-file/browser")).default;
      const ch = channel || last.instagram_account || "ช่อง";
      const cyc = (c) => String(c || "").replace("_", " ");
      const HEAD = { fontWeight: "bold", color: "#FFFFFF", backgroundColor: "#3F6BAE", wrap: true };
      const SEC = (txt, bg) => [{ value: txt, span: 4, fontWeight: "bold", backgroundColor: bg || "#ECEAF6", wrap: true }, null, null, null];
      const FULL = (txt, extra) => [{ value: String(txt ?? ""), span: 4, wrap: true, alignVertical: "top", type: String, ...extra }, null, null, null];
      const rows = [];
      rows.push(FULL(`📈 รายงานการเติบโต — ${ch}`, { fontWeight: "bold", fontSize: 16 }));
      if (co?.headline) rows.push(FULL(co.headline, { fontWeight: "bold", color: "#3F6BAE" }));
      rows.push(FULL(`ช่วงเวลา: ${cyc(first.billing_cycle)} → ${cyc(last.billing_cycle)} · ${months.length} เดือน`, { color: "#777777" }));
      rows.push(FULL(""));
      rows.push([{ value: "ตัวชี้วัด", ...HEAD }, { value: cyc(first.billing_cycle), ...HEAD }, { value: cyc(last.billing_cycle), ...HEAD }, { value: "เปลี่ยนแปลง", ...HEAD }]);
      for (const [k, label, ic, suf] of METRICS) {
        const a = first.metrics?.[k], b = last.metrics?.[k]; if (a == null && b == null) continue;
        const p = pct(a, b);
        rows.push([
          { value: `${ic} ${label}`, type: String, wrap: true },
          { value: (a == null ? "-" : a.toLocaleString()) + (suf || ""), type: String },
          { value: (b == null ? "-" : b.toLocaleString()) + (suf || ""), type: String, fontWeight: "bold" },
          { value: p == null ? "-" : (p >= 0 ? `▲ +${p}` : `▼ ${p}`) + (suf === "%" ? " จุด" : "%"), type: String, fontWeight: "bold", color: p != null && p >= 0 ? "#1a7f43" : "#b3261e" },
        ]);
      }
      rows.push(FULL(""));
      if (sponsors.length) {
        rows.push(SEC("🤝 งานสปอนเซอร์รายเดือน", "#ECEAF6"));
        for (const m of sponsors) rows.push(FULL(`${m.ym}: ${m.total} เจ้า — ${m.brands.map(b => b.name + (b.n > 1 ? ` ×${b.n}` : "")).join(", ")}`));
        rows.push(FULL(""));
      }
      for (const [h, arr, bg] of [["📈 โตขึ้นเพราะอะไร", co?.growth_drivers, "#E4F4F3"], ["✅ จุดแข็งของคุณ", co?.strengths, "#E7EDF8"], ["⚠️ จุดที่ต้องระวัง", co?.watchouts, "#F7F4EA"], ["🎯 เดือนนี้/ถัดไปโฟกัส", co?.next_focus, "#ECEAF6"]]) {
        if (!(arr || []).length) continue;
        rows.push(SEC(h, bg));
        for (const item of arr) rows.push(FULL(`•  ${item}`));
      }
      if (co?.coach_message) { rows.push(SEC("💬 ข้อความจากครูพี่คิม")); rows.push(FULL(co.coach_message)); }
      rows.push(SEC("🎯 แผน/เป้าหมายเดือนล่าสุด", "#E7EDF8"));
      rows.push(FULL(last.monthly_goal || "-"));
      const columns = [{ width: 30 }, { width: 24 }, { width: 24 }, { width: 20 }];
      await writeXlsxFile(rows, { columns, fileName: `BabeHouse_รายงานการเติบโต_${ch.replace(/[^\w@.-]/g, "")}.xlsx`, sheet: "รายงานการเติบโต" });
    } catch (e) { alert("ดาวน์โหลดไม่สำเร็จ ลองอีกครั้งนะคะ"); console.error(e); }
    finally { setExporting(false); }
  }

  return (
    <div className="wrap narrow page-pad">
      <div className="between"><span className="brand">BABE HOUSE · ACADEMY</span><Link className="link" to="/account">← บัญชีของฉัน</Link></div>
      <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
        <h1 className="page" style={{ margin: 0 }}>📈 เส้นทางการเติบโตของคุณ</h1>
        <button onClick={exportGrowthXLSX} disabled={exporting} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#1a7f43", color: "#fff", border: 0, borderRadius: 10, padding: "9px 15px", fontSize: 13.5, fontWeight: 700, cursor: exporting ? "default" : "pointer", opacity: exporting ? .6 : 1 }}>{exporting ? "กำลังสร้างไฟล์..." : "📥 ดาวน์โหลดรายงาน (Excel)"}</button>
      </div>

      {single ? <>
        <div style={{ background: "linear-gradient(135deg,#6E63A6,#2C8E8C)", color: "#fff", borderRadius: 22, padding: "26px 24px", boxShadow: "0 16px 38px rgba(110,99,166,.32)" }}>
          <div style={{ fontSize: 30 }}>🌱</div>
          <div style={{ fontSize: 23, fontWeight: 800, marginTop: 4 }}>นี่คือจุดเริ่มต้นของคุณ</div>
          <div style={{ opacity: .95, fontSize: 14.5, marginTop: 6, lineHeight: 1.6 }}>เดือนนี้คือ "เส้นสตาร์ท" ค่ะ — เดือนหน้ากลับมาดูว่าช่องคุณโตขึ้นแค่ไหน ครูพี่คิมจะเทียบให้เห็นเป็นตัวเลขเลย 🩵</div>
        </div>
        <div className="card"><h3 style={{ marginBottom: 12 }}>📊 สถิติตั้งต้น · {first.billing_cycle.replace("_", " ")}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
            {METRICS.map(([k, label, ic, suf], i) => first.metrics?.[k] != null && (() => { const c = [["#ECEAF6", "#6E63A6"], ["#E7EDF8", "#3F6BAE"], ["#E4F4F3", "#2C8E8C"], ["#F3F0F5", "#7E7392"], ["#F7F4EA", "#9A8458"]][i % 5]; return <div key={k} style={{ background: c[0], borderRadius: 16, padding: "16px 14px" }}><div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{ic} {label}</div><div style={{ fontSize: 24, fontWeight: 800, color: c[1], marginTop: 4 }}>{fmt(first.metrics[k])}{suf || ""}</div></div>; })())}
          </div>
        </div>
        <Link className="btn full" to={renewLink} style={{ marginBottom: 16 }}>+ ปลดล็อกเดือนถัดไป เพื่อเริ่มเทียบการเติบโต (490฿)</Link>
      </> : <>
        <div style={{ background: "linear-gradient(135deg,#3F6BAE,#2C8E8C)", color: "#fff", borderRadius: 22, padding: "28px 24px", textAlign: "center", boxShadow: "0 16px 38px rgba(63,107,174,.34)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, opacity: .9, letterSpacing: 1 }}>ผู้ติดตามเติบโตจากเดือนแรก</div>
          <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.1, margin: "4px 0" }}>{flw == null ? "—" : (flw >= 0 ? "▲ +" : "▼ ") + flw + "%"}</div>
          <div style={{ opacity: .95, fontSize: 14.5 }}>จาก <b>{fmt(first.metrics?.followers)}</b> → <b>{fmt(last.metrics?.followers)}</b> ใน {months.length} เดือนกับ Babe House 🩵</div>
        </div>

        <div className="card"><h3 style={{ marginBottom: 16 }}>💙 ผู้ติดตามรายเดือน</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 168 }}>
            {months.map((m, i) => { const v = m.metrics?.followers || 0, isLast = i === months.length - 1; return <div key={m.blueprint_id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: isLast ? "#2C8E8C" : "var(--muted)" }}>{fmt(v || null)}</div>
              <div style={{ width: "100%", maxWidth: 52, height: `${Math.max(6, Math.round(v / maxF * 100))}%`, borderRadius: "10px 10px 0 0", background: isLast ? "linear-gradient(180deg,#2C8E8C,#75C9C8)" : "linear-gradient(180deg,#8093d4,#C0B9DD)", transition: "height .5s ease" }} />
              <div style={{ fontSize: 11, textAlign: "center", fontWeight: isLast ? 800 : 500, color: isLast ? "#2C8E8C" : "var(--muted)" }}>{m.billing_cycle.replace("_", " ").split(" ")[0]}{isLast ? " ⭐" : ""}</div>
            </div>; })}
          </div>
        </div>

        <h3 style={{ margin: "22px 0 10px" }}>🎯 เทียบทุกตัวชี้วัด · เดือนแรก → ล่าสุด</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          {METRICS.map(([k, label, ic, suf]) => { const a = first.metrics?.[k], b = last.metrics?.[k], p = pct(a, b); if (a == null && b == null) return null; const up = p != null && p >= 0; return <div key={k} className="card" style={{ margin: 0, padding: "14px 16px" }}>
            <div className="between"><span style={{ fontWeight: 700, fontSize: 14 }}>{ic} {label}</span>
              {p != null && <span style={{ background: up ? "#E4F4F3" : "#fdeaea", color: up ? "#2C8E8C" : "#b3261e", fontWeight: 800, fontSize: 13, padding: "3px 11px", borderRadius: 20 }}>{up ? "▲ +" : "▼ "}{p}{suf === "%" ? " จุด" : "%"}</span>}
            </div>
            <div className="row" style={{ gap: 8, alignItems: "baseline", marginTop: 8 }}><span className="muted" style={{ fontSize: 14 }}>{fmt(a)}{suf || ""}</span><span className="muted" style={{ fontSize: 13 }}>→</span><span style={{ fontSize: 21, fontWeight: 800, color: up ? "#2C8E8C" : "var(--ink)" }}>{fmt(b)}{suf || ""}</span></div>
          </div>; })}
        </div>
      </>}

      {sponsors.length > 0 && <div className="card" style={{ marginTop: 16, borderTop: "4px solid #6E63A6" }}>
        <h3 style={{ margin: "0 0 4px" }}>🤝 งานสปอนเซอร์รายเดือน</h3>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>นับจากสคริปต์งานสปอนเซอร์ที่สร้าง — เอาไปโชว์ลูกค้าได้ว่าเดือนนี้รับงานกี่เจ้า</p>
        {sponsors.map(m => <div key={m.ym} style={{ borderTop: "1px solid var(--border)", padding: "10px 0" }}>
          <div className="between"><b style={{ fontSize: 14 }}>{m.ym}</b><span style={{ background: "#ECEAF6", color: "#6E63A6", fontWeight: 800, fontSize: 13, padding: "2px 11px", borderRadius: 20 }}>{m.total} เจ้า</span></div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>{m.brands.map((b, i) => <span key={i} style={{ fontSize: 12.5, background: "#f4f2f8", borderRadius: 10, padding: "3px 10px" }}>{b.name}{b.n > 1 ? ` ×${b.n}` : ""}</span>)}</div>
        </div>)}
      </div>}

      {coach === "loading" && <div className="card center muted" style={{ marginTop: 16 }}>ครูพี่คิมกำลังวิเคราะห์การเติบโตของคุณ... 🩵</div>}
      {coach && coach !== "loading" && <div className="card" style={{ marginTop: 16, borderTop: "4px solid #6E63A6" }}>
        <div className="row" style={{ marginBottom: 8, gap: 10 }}><div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#6E63A6,#3F6BAE)", color: "#fff", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>คิม</div><div><div style={{ fontWeight: 800, fontSize: 15 }}>ครูพี่คิม</div><div className="muted" style={{ fontSize: 12 }}>บทวิเคราะห์การเติบโตส่วนตัว</div></div></div>
        <div style={{ fontSize: 18, fontWeight: 800, margin: "10px 0 16px", color: "var(--blue-d)", lineHeight: 1.5 }}>{coach.headline}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
          {[["📈 โตขึ้นเพราะอะไร", coach.growth_drivers, "#E4F4F3", "#2C8E8C"], ["✅ จุดแข็งของคุณ", coach.strengths, "#E7EDF8", "#3F6BAE"], ["⚠️ จุดที่ต้องระวัง", coach.watchouts, "#F7F4EA", "#9A8458"], ["🎯 เดือนหน้าโฟกัส", coach.next_focus, "#ECEAF6", "#6E63A6"]].map(([h, arr, bg, fg]) => (arr || []).length > 0 &&
            <div key={h} style={{ background: bg, borderRadius: 14, padding: "13px 15px" }}><div style={{ fontWeight: 700, fontSize: 13, color: fg, marginBottom: 6 }}>{h}</div><ul style={{ paddingLeft: 18, margin: 0 }}>{(arr || []).map((x, i) => <li key={i} style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 3 }}>{x}</li>)}</ul></div>)}
        </div>
        {coach.coach_message && <div style={{ marginTop: 14, background: "linear-gradient(135deg,#ECEAF6,#E4F4F3)", borderRadius: 14, padding: "14px 16px", fontSize: 15, fontStyle: "italic", lineHeight: 1.7 }}>💬 {coach.coach_message}</div>}
        <Link className="btn full" to={renewLink} style={{ marginTop: 16, background: "linear-gradient(135deg,#6E63A6,#3F6BAE)" }}>🚀 ปลดล็อกแผนเดือนต่อไป — โตต่อกันเลย (490฿)</Link>
      </div>}
    </div>
  );
}
