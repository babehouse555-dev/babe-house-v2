import { useState, useEffect, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api, session, filesToBase64 } from "../api.js";
import { sampleBlueprint } from "../sample.js";
import { ToolsAndServices, ReviewCard, FeedbackCard } from "./Dashboard.parts.jsx";
import { useI18n } from "../i18n.jsx";

const G_COLORS = { Awareness: "#2E86DE", Conversion: "#1a7f43", Branding: "#b8860b" };
const Num = ({ n }) => <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--blue)", color: "#fff", fontWeight: 800, fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", marginRight: 8, flexShrink: 0 }}>{n}</span>;
const modH = { display: "flex", alignItems: "center", margin: 0 };

export default function Dashboard() {
  const { t, lang } = useI18n();
  const G_LABEL = t("db_glabel"), BEAT_LABEL = t("db_beat"), MONTHS_TH = t("db_months");
  const [sp] = useSearchParams();
  const demo = sp.get("demo") === "1";
  const userId = sp.get("user_id"), cycle = sp.get("billing_cycle"), bpId = sp.get("blueprint_id");
  const [bp, setBp] = useState(demo ? sampleBlueprint(lang) : null);
  useEffect(() => { if (demo) setBp(sampleBlueprint(lang)); }, [lang]); // เดโม: สลับภาษา → เปลี่ยนตัวอย่างเป็น EN/TH
  const [err, setErr] = useState("");
  const scriptRef = useRef(null), calRef = useRef(null), deepRef = useRef(null);
  // กดวันในปฏิทิน → เลือกวัน + เลื่อนไปที่สคริปต์ทันที (ไม่ต้องเลื่อนยาวเอง)
  const selectDay = (d) => { setSel(d); setTimeout(() => scriptRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); };
  const scrollToCal = () => calRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const [tab, setTab] = useState("strategy");
  const [view, setView] = useState("info");
  const [showDeep, setShowDeep] = useState(false);
  const [sel, setSel] = useState(1);
  const [uploaded, setUploaded] = useState(new Set());
  const [startedAt, setStartedAt] = useState(null);
  const [improveCount, setImproveCount] = useState(0);
  const [improveOpen, setImproveOpen] = useState(false);
  const [improving, setImproving] = useState(false);
  const [improveErr, setImproveErr] = useState("");
  const [ix, setIx] = useState({ products: "", pain_points: "", content_likes: "", content_dislikes: "", brand_info: "", more: "" });
  const [ixFiles, setIxFiles] = useState([]);
  // โหมดแยก 2 สเต็ป: contentReady = สร้างแผน 30 วันแล้วหรือยัง · genState = สถานะปุ่มสร้างแผน
  const [contentReady, setContentReady] = useState(demo);
  const [genState, setGenState] = useState("idle"); // idle | generating | error
  const [snapEdits, setSnapEdits] = useState({}); // แก้ค่า 6 ช่องตรงๆ (index→value ใหม่) ไม่ต้องเจนใหม่
  const [editTile, setEditTile] = useState(null);  // ช่องที่กำลังแก้
  const latestUrl = `/api/blueprints/latest?user_id=${encodeURIComponent(userId || "")}&billing_cycle=${encodeURIComponent(cycle || "")}&blueprint_id=${encodeURIComponent(bpId || "")}`;

  // สเต็ป 2: ลูกค้ายืนยันบทวิเคราะห์แม่น → สร้างปฏิทิน + 30 สคริปต์ (เจนเบื้องหลัง + poll จนเสร็จ)
  async function startContentGen() {
    if (demo) { setTab("calendar"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setGenState("generating");
    // ส่งค่า 6 ช่องที่ลูกค้าแก้เอง (ถ้ามี) → backend เอาไปอัปเดตบทวิเคราะห์ก่อนเจนคอนเทนต์ (ไม่ต้องเจนวิเคราะห์ใหม่)
    const snapshot_edits = Object.keys(snapEdits).length ? Object.entries(snapEdits).map(([i, value]) => ({ i: Number(i), value })) : null;
    try { await api("/api/generate-content", { method: "POST", body: { user_id: userId, billing_cycle: cycle, blueprint_id: bpId, snapshot_edits, lang } }); pollContent(0); }
    catch (e) { setGenState("error"); }
  }
  function pollContent(attempt) {
    setTimeout(async () => {
      try {
        const d = await api(latestUrl, { token: session.token, adminKey: localStorage.getItem("babe_admin_key") || undefined });
        if (d.content_status === "ready") { setBp(d.blueprint); setContentReady(true); setGenState("idle"); setTab("calendar"); setTimeout(() => { if (calRef.current) calRef.current.scrollIntoView({ behavior: "auto", block: "start" }); else window.scrollTo(0, 0); }, 200); return; }
        if (d.content_status === "error") { setGenState("error"); return; }
        if (attempt === 40) { try { await api("/api/generate-content", { method: "POST", body: { user_id: userId, billing_cycle: cycle, blueprint_id: bpId } }); } catch {} } // กู้กรณีค้างจาก deploy
      } catch {}
      if (attempt < 90) pollContent(attempt + 1); else setGenState("error");
    }, 4000);
  }
  // refine บทวิเคราะห์ (ฟรี 1 ครั้ง) — async + poll analysis_status
  async function submitImprove() {
    if (demo) { setImproveErr(t("db_demo_improve")); return; }
    setImproving(true); setImproveErr("");
    try { const images = ixFiles.length ? await filesToBase64([...ixFiles], 8) : []; await api("/api/improve-blueprint", { method: "POST", body: { user_id: userId, billing_cycle: cycle, blueprint_id: bpId, extra: ix, images, lang } }); pollAnalysis(0); }
    catch (e) { setImproveErr(e.message || t("db_err_generic")); setImproving(false); }
  }
  function pollAnalysis(attempt) {
    setTimeout(async () => {
      try {
        const d = await api(latestUrl, { token: session.token, adminKey: localStorage.getItem("babe_admin_key") || undefined });
        if (d.analysis_status === "ready") { setBp(d.blueprint); setImproveCount(d.improve_count || 1); setImproveOpen(false); setImproving(false); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
        if (d.analysis_status === "error") { setImproveErr(t("db_err_gen")); setImproving(false); return; }
      } catch {}
      if (attempt < 60) pollAnalysis(attempt + 1); else { setImproveErr(t("db_err_slow")); setImproving(false); }
    }, 4000);
  }

  useEffect(() => {
    if (demo) return;
    if (!userId || !cycle) { setErr(t("db_err_nobook")); return; }
    api(latestUrl, { token: session.token, adminKey: localStorage.getItem("babe_admin_key") || undefined })
      .then(d => { setBp(d.blueprint); setUploaded(new Set(d.marathon || [])); setStartedAt(d.started_at || null); setImproveCount(d.improve_count || 0); const ready = d.content_status === "ready"; setContentReady(ready); if (ready) setTab("calendar"); /* นักเรียนเก่ากลับมา = เห็นแผน 30 วันเลย ไม่ต้องตามหา */ })
      .catch((e) => { if (e.code === "NOT_OWNER") setErr(`${t("db_err_notowner_a")} ${e.data?.owner_hint || ""} ${t("db_err_notowner_b")}`); else setErr(t("db_err_load")); });
  }, [userId, cycle]);

  async function toggleDay(d) {
    const has = uploaded.has(d);
    const next = new Set(uploaded);
    if (has) next.delete(d); else next.add(d);
    setUploaded(next);
    if (demo) return; // เดโม: โชว์ติ๊กเขียวได้ แต่ไม่บันทึก
    try { await api("/api/marathon/progress", { method: "POST", body: { user_id: userId, instagram_account: bp.instagram_account, billing_cycle: cycle, blueprint_id: bpId, uploaded_days: [...next], day: d, action: has ? "remove" : "upload" } }); } catch {}
  }
  async function clearAllMarathon() {
    if (!window.confirm(t("db_clear_confirm"))) return;
    setUploaded(new Set());
    if (demo) return;
    try { await api("/api/marathon/progress", { method: "POST", body: { user_id: userId, instagram_account: bp.instagram_account, billing_cycle: cycle, blueprint_id: bpId, uploaded_days: [] } }); } catch {}
  }

  // ดาวน์โหลดปฏิทิน 30 วัน เป็น Excel (.xlsx จริง — ตั้งความกว้าง + ตัดบรรทัด + หัวตารางสวย · เปิดใน Excel/Google Sheets)
  const [exporting, setExporting] = useState(false);
  async function exportXLSX() {
    if (exporting) return;
    setExporting(true);
    try {
      const writeXlsxFile = (await import("write-excel-file/browser")).default;
      const G = t("db_xls_g");
      const H = { fontWeight: "bold", color: "#FFFFFF", backgroundColor: "#3F6BAE", align: "center", alignVertical: "center", wrap: true };
      const head = t("db_xls_head").map(v => ({ value: v, type: String, ...H }));
      const rows = [head];
      const scripts = (bp.scripts || []).slice().sort((a, b) => Number(a.d) - Number(b.d));
      const cell = (v, extra) => ({ value: String(v ?? ""), type: String, wrap: true, alignVertical: "top", ...extra });
      for (const s of scripts) {
        const cal = (bp.calendar || []).find(c => Number(c.d) === Number(s.d)) || {};
        const beats = s.beats || [];
        const hook = (beats.find(b => b.s === "HOOK") || {}).say || "";
        const body = beats.filter(b => b.s === "BODY").map(b => b.say).join("\n\n");
        const cta = (beats.find(b => b.s === "CTA") || {}).say || "";
        const detail = [hook && `${t("db_xls_hook")}\n${hook}`, body && `${t("db_xls_body")}\n${body}`, cta && `${t("db_xls_cta")}\n${cta}`, s.tip && `${t("db_xls_tip")} ${s.tip}`].filter(Boolean).join("\n\n");
        const topic = `${cal.t || ""}${s.g ? `\n[${G[s.g] || s.g}]` : ""}`;
        rows.push([cell(s.d, { align: "center", fontWeight: "bold" }), cell(topic, { fontWeight: "bold" }), cell(detail), cell(""), cell(s.cap)]);
      }
      const columns = [{ width: 6 }, { width: 30 }, { width: 75 }, { width: 24 }, { width: 45 }];
      await writeXlsxFile(rows, { columns, fileName: `BabeHouse_${(bp.instagram_account || "content").replace(/[^\w@.-]/g, "")}_${cycle}_${t("db_xls_30d")}.xlsx`, sheet: t("db_xls_sheet") });
    } catch (e) { alert(t("db_download_fail")); console.error(e); }
    finally { setExporting(false); }
  }

  if (err) return <div className="wrap narrow page-pad center"><div className="card"><h2>{err}</h2><Link className="btn" to="/account" style={{ marginTop: 16 }}>{t("db_to_account")}</Link></div></div>;
  if (!bp) return <div className="wrap narrow page-pad center"><div className="spinner" /><p className="muted">{t("db_loading_book")}</p></div>;

  const m = bp.modules || {};
  const script = (bp.scripts || []).find(s => s.d === sel) || (bp.scripts || [])[0];

  return (
    <div>
      {demo && <div style={{ background: "linear-gradient(135deg,var(--blue),var(--blue-d))", color: "#fff", padding: "10px 14px" }}>
        <div className="wrap" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 10, maxWidth: 820 }}>
          <span style={{ fontSize: 13.5, textAlign: "center" }}>{t("db_demo_banner")}</span>
          <Link to="/form" style={{ flexShrink: 0, background: "#fff", color: "var(--blue)", fontWeight: 700, padding: "7px 16px", borderRadius: 10, fontSize: 13.5, whiteSpace: "nowrap" }}>{t("db_make_mine")}</Link>
        </div>
      </div>}
      <div className="wrap page-pad" style={{ maxWidth: 820 }}>
        <Link className="link" to={demo ? "/" : "/account"}>← {demo ? t("db_back_home") : t("db_back_account")}</Link>
        <div className="brand" style={{ marginTop: 12 }}>BABE HOUSE · CREATOR PLATFORM</div>
        <h1 className="page">AI Creator Blueprint</h1>
        <p className="muted" style={{ marginBottom: 16 }}>✓ {bp.instagram_account} · {bp.market_tier || "Premium"} · {bp.theme}</p>

        <div className="row" style={{ marginBottom: 18, background: "var(--soft)", borderRadius: 14, padding: 6 }}>
          {[["strategy", t("db_tab_strategy")], ["calendar", t("db_tab_30")], ["marathon", t("db_tab_marathon")]].map(([k, l]) =>
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "10px", border: 0, borderRadius: 10, fontWeight: 700, cursor: "pointer", background: tab === k ? "#fff" : "transparent", color: tab === k ? "var(--blue)" : "var(--muted)", boxShadow: tab === k ? "0 2px 8px rgba(0,0,0,.06)" : "none" }}>{l}</button>)}
        </div>

        {tab === "strategy" && <>
          <div style={{ background: "linear-gradient(135deg,#ECEAF6,#E4F4F3)", border: "1px solid #d9d3ec", borderRadius: 18, padding: "18px 20px", lineHeight: 1.65, marginBottom: 16, fontSize: 15 }}><span style={{ fontSize: 22, marginRight: 6 }}>🩵</span>{bp.greeting}</div>
          {demo && <div className="card" style={{ border: "1px dashed var(--blue)", background: "#F4F8FD" }}>
            <div style={{ fontWeight: 800, marginBottom: 8, color: "var(--blue-d)" }}>{t("db_demo_dis_title")}</div>
            <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.8, margin: 0 }}>
              {t("db_demo_dis").map((x, i) => <li key={i}>{x}</li>)}
            </ul>
            <Link className="btn full" to="/form" style={{ marginTop: 12 }}>{t("db_make_real")}</Link>
          </div>}
          {bp.snapshot?.length > 0 && <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 4px" }}>{t("db_snap_title")}</h3>
            {!contentReady && <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>{t("db_snap_sub")}</p>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {bp.snapshot.map((s, i) => {
                const c = [["#ECEAF6", "#6E63A6"], ["#E7EDF8", "#3F6BAE"], ["#E4F4F3", "#2C8E8C"], ["#F3F0F5", "#7E7392"], ["#F7F4EA", "#9A8458"], ["#E9EEF6", "#5573A0"]][i % 6];
                const val = snapEdits[i] ?? s.value;
                return <div key={i} style={{ background: c[0], borderRadius: 16, padding: "14px 12px", textAlign: "center", position: "relative" }}>
                  <div style={{ fontSize: 30, lineHeight: 1 }}>{s.emoji}</div>
                  <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, margin: "6px 0 4px", letterSpacing: .2 }}>{s.label}</div>
                  {editTile === i
                    ? <textarea autoFocus value={val} onChange={e => setSnapEdits(p => ({ ...p, [i]: e.target.value }))} onBlur={() => setEditTile(null)} rows={2} style={{ width: "100%", fontSize: 13, fontWeight: 700, color: c[1], textAlign: "center", border: `1.5px solid ${c[1]}`, borderRadius: 8, padding: "4px", background: "#fff", resize: "none" }} />
                    : <div style={{ fontSize: 14.5, fontWeight: 800, color: c[1], lineHeight: 1.3 }}>{val}</div>}
                  {!contentReady && editTile !== i && <button onClick={() => setEditTile(i)} style={{ marginTop: 9, background: "#fff", border: `1.5px solid ${c[1]}`, borderRadius: 20, color: c[1], fontSize: 12, fontWeight: 800, cursor: "pointer", padding: "4px 14px", boxShadow: "0 2px 6px rgba(0,0,0,.06)" }}>{snapEdits[i] != null ? t("db_edited") : t("db_edit")}</button>}
                </div>;
              })}
            </div>
          </div>}
          {!showDeep && <div className="center" style={{ background: "linear-gradient(135deg,#6E63A6,#3F6BAE,#2C8E8C)", color: "#fff", borderRadius: 20, padding: "26px 22px", margin: "4px 0 28px", boxShadow: "0 16px 38px rgba(63,107,174,.36)" }}>
            <div style={{ fontSize: 38, lineHeight: 1 }}>🔮</div>
            <h3 style={{ margin: "10px 0 6px", color: "#fff", fontSize: 22, lineHeight: 1.35 }}>{t("db_teaser_title")}</h3>
            <p style={{ fontSize: 15.5, margin: "0 auto 18px", maxWidth: 440, opacity: .96, lineHeight: 1.6 }}>{t("db_teaser_sub")}</p>
            <button className="btn-pulse" onClick={() => { setShowDeep(true); setTimeout(() => deepRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }} style={{ background: "#fff", color: "#3F6BAE", border: 0, borderRadius: 12, padding: "16px 30px", fontWeight: 800, fontSize: 17, cursor: "pointer" }}>{t("db_open_analysis")}</button>
            <div style={{ fontSize: 12.5, opacity: .85, marginTop: 12 }}>{t("db_read_2min")} {contentReady ? t("db_has_plan") : t("db_then_plan")} 🩵</div>
          </div>}
          {(showDeep || !(bp.story?.length > 0)) && <>
          <div ref={deepRef} style={{ scrollMarginTop: 70 }} />
          {bp.story?.length > 0 && <div style={{ marginBottom: 18 }}>
            <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>{t("db_deep_intro")}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {bp.story.map((c, i) => { const sc = [["#ECEAF6", "#6E63A6"], ["#E7EDF8", "#3F6BAE"], ["#E4F4F3", "#2C8E8C"], ["#F3F0F5", "#7E7392"], ["#F7F4EA", "#9A8458"], ["#E9EEF6", "#5573A0"]][i % 6]; return <div key={i} style={{ background: sc[0], borderRadius: 16, padding: "16px 18px" }}>
                <div className="row" style={{ gap: 10, marginBottom: 6 }}><span style={{ fontSize: 26 }}>{c.emoji}</span><h3 style={{ margin: 0, fontSize: 16.5, color: sc[1] }}>{c.title}</h3></div>
                <p style={{ fontSize: 15, lineHeight: 1.8, margin: 0 }}>{c.body}</p>
              </div>; })}
            </div>
          </div>}
          {bp.metrics && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 16 }}>
            {[[t("db_m_reach"), bp.metrics.reach], [t("db_m_followers"), bp.metrics.followers], [t("db_m_pv"), bp.metrics.profile_visits], [t("db_m_lt"), bp.metrics.link_taps], ["⚡ Engagement", bp.metrics.engagement_rate, "%"]].filter(([, v]) => v != null).map(([l, v, suf]) =>
              <div key={l} className="card" style={{ margin: 0, padding: "16px 14px" }}><div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{l}</div><div style={{ fontSize: 24, fontWeight: 800, color: "var(--blue)", marginTop: 4 }}>{Number(v).toLocaleString("en-US")}{suf || ""}</div></div>)}
          </div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 16 }}>
            {[[t("db_t_goal"), bp.theme], [t("db_t_market"), bp.market_tier], [t("db_t_audience"), bp.audience_summary], [t("db_t_insight"), bp.follower_insight]].map(([l, v]) => v && <div key={l} className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{l}</div><div style={{ marginTop: 6, fontSize: 14.5 }}>{v}</div></div>)}
          </div>
          <div className="card"><h3 style={{ marginBottom: 12 }}>{t("db_what_kim_sees")}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
              {(bp.what_we_see || []).map((x, i) => <div key={i} style={{ display: "flex", gap: 10, background: "var(--soft)", borderRadius: 12, padding: "12px 14px" }}><span style={{ color: "var(--blue)", fontWeight: 800 }}>{i + 1}</span><span style={{ fontSize: 14 }}>{x}</span></div>)}
            </div>
            {bp.kim_insight && <div style={{ display: "flex", gap: 12, marginTop: 14, background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", border: "1px solid #d6e7fa", borderRadius: 14, padding: "14px 16px" }}><div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--blue)", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13 }}>{t("db_kim")}</div><div style={{ fontSize: 14.5 }}>{bp.kim_insight}</div></div>}
          </div>
          <div className="card"><h3 style={{ marginBottom: 14 }}>SWOT</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
              {[[t("db_swot")[0], bp.swot?.strengths, "💪", "#E4F4F3", "#2C8E8C"], [t("db_swot")[1], bp.swot?.weaknesses, "⚠️", "#F3F0F5", "#7E7392"], [t("db_swot")[2], bp.swot?.opportunities, "🚀", "#E7EDF8", "#3F6BAE"], [t("db_swot")[3], bp.swot?.threats, "🛡️", "#F7F4EA", "#9A8458"]].map(([l, arr, ic, bg, fg]) =>
                <div key={l} style={{ background: bg, borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ fontWeight: 700, color: fg, marginBottom: 8 }}>{ic} {l}</div>
                  <ul style={{ paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{(arr || []).map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{x}</li>)}</ul>
                </div>)}
            </div>
          </div>
          <h2 className="serif" style={{ fontSize: 22, margin: "26px 0 6px" }}>{t("db_5modules")}</h2>
          {m.archetype && <div className="card"><div className="row" style={{ gap: 10 }}><span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--blue)", color: "#fff", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>1</span><h3 style={{ margin: 0 }}>{t("db_archetype")}</h3></div>
            <div style={{ fontWeight: 700, fontSize: 17, color: "var(--blue-d)", margin: "12px 0 6px" }}>{m.archetype.name}</div>
            <p style={{ fontSize: 14.5 }}>{m.archetype.body}</p>
            {m.archetype.tone && <div style={{ background: "var(--soft)", borderRadius: 12, padding: "12px 14px", marginTop: 12 }}><div style={{ fontWeight: 700, color: "var(--blue-d)", fontSize: 13, marginBottom: 4 }}>🎙️ Tone of Voice</div><div style={{ fontSize: 14 }}>{m.archetype.tone}</div></div>}
            {m.archetype.look && <div style={{ background: "var(--soft)", borderRadius: 12, padding: "12px 14px", marginTop: 10 }}><div style={{ fontWeight: 700, color: "var(--blue-d)", fontSize: 13, marginBottom: 4 }}>📸 ลุคหน้ากล้อง</div><div style={{ fontSize: 14 }}>{m.archetype.look}</div></div>}
          </div>}
          {m.avatar && <div className="card"><h3 style={modH}><Num n={2} />{t("db_dream_customer")}</h3>
            <div className="row" style={{ margin: "10px 0 14px", gap: 14 }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg,#EAF3FD,#d6e7fa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, flexShrink: 0 }}>🙋‍♀️</div>
              <div><div style={{ fontWeight: 700, fontSize: 18, color: "var(--blue-d)" }}>{m.avatar.name}</div><div className="muted" style={{ fontSize: 13 }}>{t("db_avatar_sub")}</div></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
              {[["💭", t("db_avatar_think"), m.avatar.think], ["👀", t("db_avatar_see"), m.avatar.see], ["👂", t("db_avatar_hear"), m.avatar.hear], ["😰", t("db_avatar_fear"), m.avatar.fear]].filter(([, , v]) => v).map(([ic, l, v]) =>
                <div key={l} style={{ background: "var(--soft)", borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 22 }}>{ic}</div><div style={{ fontWeight: 700, fontSize: 12, color: "var(--muted)", margin: "4px 0" }}>{l}</div><div style={{ fontSize: 13.5 }}>{v}</div></div>)}
            </div>
            {m.avatar.hookbank && <div style={{ marginTop: 14 }}><div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{t("db_hookbank")}</div><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{m.avatar.hookbank.map((h, i) => <div key={i} style={{ background: "#fff7e6", border: "1px solid #f0deb0", borderRadius: 10, padding: "10px 12px", fontSize: 13.5 }}>"{h}"</div>)}</div></div>}
          </div>}
          {m.competitor && <div className="card"><h3 style={{ ...modH, marginBottom: 6 }}><Num n={3} />{t("db_competitor")}</h3><p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>{m.competitor.intro}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
              {(m.competitor.rows || []).map((r, i) => <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ background: "var(--soft)", padding: "10px 14px", fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: 13.5, marginBottom: 8 }}><span className="muted" style={{ fontWeight: 700 }}>{t("db_they_do")}</span>{r.they}</div>
                  <div style={{ fontSize: 13.5, color: "var(--up)" }}><b>{t("db_we_win")}</b>{r.gap}</div>
                </div>
              </div>)}
            </div>
            {m.competitor.blueocean && <div style={{ marginTop: 14, background: "linear-gradient(135deg,#2E86DE,#1B6FC4)", color: "#fff", borderRadius: 14, padding: "16px 18px" }}><div style={{ fontWeight: 700, marginBottom: 4 }}>{t("db_blueocean")}</div><div style={{ fontSize: 14.5, opacity: .95 }}>{m.competitor.blueocean}</div></div>}
          </div>}
          {m.values && <div className="card"><h3 style={modH}><Num n={4} />{t("db_core_values")}</h3>
            {m.values.list && <div className="row" style={{ gap: 8, margin: "12px 0" }}>{m.values.list.map((v, i) => <span key={i} style={{ background: "#EAF3FD", color: "var(--blue-d)", fontWeight: 700, fontSize: 13, padding: "8px 14px", borderRadius: 20 }}>{v}</span>)}</div>}
            {m.values.manifesto && <div style={{ background: "linear-gradient(135deg,#FBF9F4,#fff)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", fontStyle: "italic", fontSize: 14.5, lineHeight: 1.7 }}>"{m.values.manifesto}"</div>}
          </div>}
          {m.funnel && <div className="card"><h3 style={modH}><Num n={5} />🫧 Funnel</h3><div style={{ marginTop: 12 }}>{["top", "middle", "bottom"].map(k => m.funnel[k] && <div key={k} style={{ margin: "8px 0" }}><div className="between" style={{ fontSize: 13 }}><span><b>{m.funnel[k].label}</b> · {m.funnel[k].body}</span><span className="muted">{m.funnel[k].pct}%</span></div><div className="bar-track"><div className="bar-fill" style={{ width: `${m.funnel[k].pct}%` }} /></div></div>)}</div><p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{m.funnel.note}</p></div>}

          {contentReady ? <div className="center" style={{ background: "linear-gradient(135deg,#6E63A6,#3F6BAE)", color: "#fff", borderRadius: 18, padding: "26px 22px", marginTop: 12, marginBottom: 28, boxShadow: "0 14px 34px rgba(110,99,166,.34)" }}>
            <div style={{ fontSize: 32 }}>📅</div>
            <h3 style={{ margin: "6px 0 6px", color: "#fff", fontSize: 21 }}>{t("db_strat_cta_title")}</h3>
            <p style={{ fontSize: 15, marginBottom: 18, maxWidth: 540, marginInline: "auto", opacity: .95, lineHeight: 1.65 }}>{t("db_strat_cta_sub")}</p>
            <button className="btn-pulse" onClick={() => { setTab("calendar"); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ background: "#fff", color: "#3F6BAE", border: 0, borderRadius: 12, padding: "15px 28px", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>{t("db_start_content")}</button>
          </div> : <div className="center" style={{ background: "linear-gradient(135deg,#6E63A6,#3F6BAE)", color: "#fff", borderRadius: 18, padding: "28px 22px", marginTop: 12, marginBottom: 28, boxShadow: "0 14px 34px rgba(110,99,166,.34)" }}>
            {genState === "generating" ? <>
              <div className="spinner" style={{ border: "4px solid rgba(255,255,255,.35)", borderTopColor: "#fff", margin: "0 auto 14px" }} />
              <h3 style={{ color: "#fff", fontSize: 20, margin: "0 0 6px" }}>{t("db_gen_title")}</h3>
              <p style={{ opacity: .95, fontSize: 14.5 }}>{t("db_gen_sub")}</p>
            </> : genState === "error" ? <>
              <div style={{ fontSize: 30 }}>🥺</div>
              <h3 style={{ color: "#fff", fontSize: 19, margin: "4px 0 6px" }}>{t("db_gen_err_title")}</h3>
              <p style={{ opacity: .95, fontSize: 14.5, marginBottom: 14 }}>{t("db_gen_err_sub")}</p>
              <button className="btn-pulse" onClick={startContentGen} style={{ background: "#fff", color: "#3F6BAE", border: 0, borderRadius: 12, padding: "14px 26px", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>{t("db_gen_retry")}</button>
            </> : <>
              <div style={{ fontSize: 32 }}>📋</div>
              <h3 style={{ margin: "6px 0 6px", color: "#fff", fontSize: 21 }}>{t("db_confirm_title")}</h3>
              <p style={{ fontSize: 15, marginBottom: 18, maxWidth: 540, marginInline: "auto", opacity: .95, lineHeight: 1.65 }}>{t("db_confirm_sub")}</p>
              {!improveOpen && <div className="row" style={{ gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="btn-pulse" onClick={startContentGen} style={{ background: "#fff", color: "#3F6BAE", border: 0, borderRadius: 12, padding: "15px 26px", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>{t("db_confirm_ok")}</button>
                {improveCount < 1 && <button onClick={() => setImproveOpen(true)} style={{ background: "transparent", color: "#fff", border: "1.5px solid rgba(255,255,255,.7)", borderRadius: 12, padding: "15px 20px", fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}>{t("db_confirm_refine")}</button>}
              </div>}
              {improveCount >= 1 && !improveOpen && <div style={{ marginTop: 12, fontSize: 13.5, opacity: .9 }}>{t("db_refined_note")}</div>}
              {improveOpen && <div style={{ background: "#fff", color: "var(--ink)", borderRadius: 14, padding: "16px", marginTop: 6, textAlign: "left" }}>
                {improving ? <div className="center" style={{ padding: "22px 10px" }}>
                  <div className="spinner" style={{ margin: "0 auto 16px" }} />
                  <div style={{ fontWeight: 800, fontSize: 16.5, color: "var(--blue-d)" }}>{t("db_refining_title")}</div>
                  <p className="muted" style={{ fontSize: 14, margin: "8px auto 0", maxWidth: 360, lineHeight: 1.6 }}>{t("db_refining_sub")}</p>
                </div> : <>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "var(--blue-d)", marginBottom: 4 }}>{t("db_tell_more_title")}</div>
                  <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{t("db_tell_more_sub")}</p>
                  <div style={{ background: "#fff7e6", border: "1px dashed #e0b85b", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#8a6d1f" }}>{t("db_forgot_img_title")}</div>
                    <p className="muted" style={{ fontSize: 12.5, margin: "4px 0 8px" }}>{t("db_forgot_img_sub")}</p>
                    <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => setIxFiles(e.target.files)} />
                    {ixFiles.length > 0 && <div className="hint" style={{ color: "#1a7f43" }}>{t("db_attached")} {Math.min(ixFiles.length, 8)} {t("fm_images_word")}</div>}
                  </div>
                  {t("db_improve_fields").map(([k, label, ph]) =>
                    <div key={k} className="field"><label style={{ fontSize: 13.5 }}>{label}</label><textarea value={ix[k]} onChange={e => setIx(v => ({ ...v, [k]: e.target.value }))} style={{ minHeight: 60 }} placeholder={ph} /></div>)}
                  {improveErr && <div className="msg err">{improveErr}</div>}
                  <div className="row" style={{ gap: 10, justifyContent: "center" }}>
                    <button className="btn" onClick={submitImprove}>{t("db_improve_submit")}</button>
                    <button className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => setImproveOpen(false)}>{t("db_cancel")}</button>
                  </div>
                </>}
              </div>}
            </>}
          </div>}
          </>}

          <ReviewCard demo={demo} bpId={bpId} />
          <FeedbackCard demo={demo} bpId={bpId} />

          {!demo && <Link to="/video-audit" className="card" style={{ display: "block", textDecoration: "none", color: "inherit", border: "1px dashed #d6a0e0", background: "#faf3fc" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#6b3fa0" }}>{t("db_va_title")}</div>
            <p className="muted" style={{ fontSize: 14, margin: "6px 0 0" }}>{t("db_va_sub")}</p>
          </Link>}
        </>}

        {tab !== "strategy" && !contentReady && <div className="card center" style={{ padding: "30px 20px" }}>
          <div style={{ fontSize: 32 }}>📋</div>
          <h3 style={{ margin: "8px 0 4px" }}>{t("db_cal_empty_title")}</h3>
          <p className="muted" style={{ fontSize: 14.5, maxWidth: 420, margin: "0 auto 14px" }}>{t("db_cal_empty_sub")}</p>
          <button className="btn" onClick={() => { setTab("strategy"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t("db_go_confirm")}</button>
        </div>}
        {tab === "calendar" && contentReady && <>
          {(() => {
            // การ์ด "วันนี้ทำอะไร" — วันปัจจุบันนับจากวันเริ่มเล่ม (ตรรกะเดียวกับ Marathon), ลูกค้ารายวันหยิบสคริปต์ได้ใน 1 คลิก
            const startMs = startedAt ? new Date(startedAt).getTime() : Date.now();
            const todayD = Math.max(1, Math.min(30, Math.floor((Date.now() - startMs) / 86400000) + 1));
            const c = (bp.calendar || []).find(x => Number(x.d) === todayD);
            if (!c) return null;
            let streak = 0, d0 = uploaded.has(todayD) ? todayD : todayD - 1;
            while (d0 >= 1 && uploaded.has(d0)) { streak++; d0--; }
            const doneToday = uploaded.has(todayD);
            const st = t("db_td_streak"), pg = t("db_td_prog");
            return <div className="card" style={{ border: "2px solid var(--blue)", marginBottom: 16 }}>
              <div className="between" style={{ flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--blue)", background: "#EAF3FD", padding: "3px 11px", borderRadius: 20 }}>{t("db_td_badge")} {todayD}/30</span>
                {streak > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#8a6d1f", background: "#fff7e6", padding: "3px 11px", borderRadius: 20 }}>{st[0]}{streak}{st[1]}</span>}
              </div>
              <h3 style={{ margin: "0 0 6px", fontSize: 17, lineHeight: 1.4 }}>{c.t}</h3>
              {c.h && <p className="muted" style={{ fontSize: 13, margin: "0 0 10px", lineHeight: 1.5 }}>💬 {c.h}</p>}
              <div className="row" style={{ gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: G_COLORS[c.g] || "var(--muted)", background: "var(--soft)", padding: "2px 9px", borderRadius: 20 }}>{G_LABEL[c.g] || c.g}</span>
                {c.f && <span style={{ fontSize: 11, color: "var(--muted)", background: "var(--soft)", padding: "2px 9px", borderRadius: 20 }}>{c.f}</span>}
              </div>
              <button type="button" onClick={() => selectDay(todayD)} style={{ width: "100%", padding: 13, borderRadius: 12, border: 0, cursor: "pointer", fontWeight: 800, fontSize: 15, color: "#fff", background: "var(--blue)", boxShadow: "0 6px 18px rgba(46,134,222,.28)" }}>{t("db_td_open")}</button>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => !demo && toggleDay(todayD)} disabled={demo} style={{ flex: 1, padding: 9, borderRadius: 10, cursor: demo ? "default" : "pointer", fontSize: 13, fontWeight: 700, border: doneToday ? 0 : "1px solid var(--border)", background: doneToday ? "#e8f5ee" : "#fff", color: doneToday ? "#1a7f43" : "var(--ink)" }}>{doneToday ? t("db_td_marked") : t("db_td_mark")}</button>
                {todayD < 30 && <button type="button" onClick={() => selectDay(todayD + 1)} style={{ flex: 1, padding: 9, borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600, border: "1px solid var(--border)", background: "#fff", color: "var(--muted)" }}>{t("db_td_tmr")}</button>}
              </div>
              <div style={{ marginTop: 13 }}>
                <div className="between" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}><span>{pg[0]}{uploaded.size}{pg[1]}</span><span>{uploaded.size}/30</span></div>
                <div style={{ height: 6, background: "var(--soft)", borderRadius: 20, overflow: "hidden" }}><div style={{ width: `${Math.min(100, Math.round(uploaded.size / 30 * 100))}%`, height: "100%", background: "var(--blue)", borderRadius: 20 }} /></div>
              </div>
            </div>;
          })()}
          {!demo && <div className="between" style={{ flexWrap: "wrap", gap: 8, margin: "0 0 14px" }}>
            <span className="muted" style={{ fontSize: 13 }}>{t("db_cal_label")}</span>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {uploaded.size > 0 && <button onClick={clearAllMarathon} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 13px", fontSize: 13, fontWeight: 600, color: "var(--muted)", cursor: "pointer" }}>{t("db_clear_all")}</button>}
              <button onClick={exportXLSX} disabled={exporting} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#1a7f43", color: "#fff", border: 0, borderRadius: 10, padding: "9px 15px", fontSize: 13.5, fontWeight: 700, cursor: exporting ? "default" : "pointer", opacity: exporting ? .6 : 1 }}>{exporting ? t("db_building_file") : t("db_download_excel")}</button>
            </div>
          </div>}
          <div ref={calRef} style={{ scrollMarginTop: 70, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginBottom: 18 }}>
            {(bp.calendar || []).map(c => { const done = uploaded.has(c.d); return <button key={c.d} onClick={() => selectDay(c.d)} style={{ border: sel === c.d ? "2px solid var(--blue)" : done ? "1.5px solid #4caf7d" : "1px solid var(--border)", borderRadius: 12, padding: 12, background: done ? "#e8f5ee" : sel === c.d ? "#EAF3FD" : "#fff", cursor: "pointer", textAlign: "left" }}>
              <div className="between"><span style={{ fontWeight: 800, fontSize: 14, color: done ? "#1a7f43" : "inherit" }}>{done ? "✓ " : ""}{t("db_day")} {c.d}</span><span style={{ width: 9, height: 9, borderRadius: "50%", background: G_COLORS[c.g] || "var(--muted)", display: "inline-block" }} /></div>
              <div style={{ fontSize: 10, color: G_COLORS[c.g] || "var(--muted)", fontWeight: 700, margin: "2px 0 5px" }}>{G_LABEL[c.g] || c.g}</div>
              <div style={{ fontSize: 12, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", color: done ? "#1a7f43" : "inherit" }}>{c.t}</div>
            </button>; })}
          </div>
          {script && (() => {
            const BEAT = { HOOK: "#2E86DE", BODY: "#1a7f43", CTA: "#b8860b" };
            const copy = (t) => navigator.clipboard?.writeText(t);
            const title = (bp.calendar.find(c => c.d === script.d) || {}).t;
            return <div ref={scriptRef} className="card" style={{ scrollMarginTop: 70 }}>
              <div className="between" style={{ marginBottom: 8 }}><span className="tag" style={{ background: "var(--soft)", color: G_COLORS[script.g] }}>{t("db_day")} {script.d} · {G_LABEL[script.g] || script.g}</span><button className="link" onClick={scrollToCal} style={{ background: "none", border: 0, fontSize: 13, cursor: "pointer" }}>{t("db_pick_other_day")}</button></div>
              <h3 style={{ margin: "10px 0 4px" }}>{title}</h3>
              <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>{t("db_script_sub")}</p>
              {(script.beats || []).map((b, i) => <div key={i} style={{ borderLeft: `4px solid ${BEAT[b.s] || "var(--blue)"}`, background: "var(--soft)", borderRadius: "0 12px 12px 0", padding: "12px 14px", marginBottom: 10 }}>
                <div className="row" style={{ gap: 8, marginBottom: 6 }}><span style={{ background: BEAT[b.s] || "var(--blue)", color: "#fff", fontWeight: 700, fontSize: 11, padding: "2px 10px", borderRadius: 20 }}>{BEAT_LABEL[b.s] || b.s}</span><span className="muted" style={{ fontSize: 12 }}>{b.ts}</span></div>
                <p style={{ margin: "0 0 6px", fontSize: 15 }}>{b.say}</p>
                <div className="row" style={{ gap: 6 }}>{b.ost && <span style={{ fontSize: 11, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "3px 8px" }}>📺 {b.ost}</span>}{b.vis && <span style={{ fontSize: 11, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "3px 8px" }}>🎥 {b.vis}</span>}</div>
              </div>)}
              <div style={{ background: "var(--soft)", borderRadius: 12, padding: "12px 14px", marginTop: 4 }}><div className="between"><b style={{ fontSize: 13 }}>{t("db_caption")}</b><button className="link" onClick={() => copy(script.cap)} style={{ background: "none", border: 0, fontSize: 13 }}>{t("db_copy")}</button></div><p style={{ fontSize: 14, marginTop: 6 }}>{script.cap}</p></div>
              <div className="msg" style={{ background: "#fff7e6", color: "#8a6d1f", marginTop: 8 }}>{t("db_tip")} {script.tip}</div>
              <button type="button" onClick={() => toggleDay(script.d)} style={{ width: "100%", marginTop: 14, padding: "14px", borderRadius: 12, border: 0, cursor: "pointer", fontWeight: 800, fontSize: 15, color: "#fff", background: uploaded.has(script.d) ? "#1a7f43" : "var(--blue)", boxShadow: uploaded.has(script.d) ? "0 6px 18px rgba(26,127,67,.28)" : "0 6px 18px rgba(46,134,222,.28)" }}>
                {uploaded.has(script.d) ? t("db_done_yes") : t("db_done_no")}
              </button>
            </div>;
          })()}

          <ToolsAndServices channel={bp.instagram_account} cycle={cycle} demo={demo} />
        </>}

        {tab === "marathon" && contentReady && (() => {
          const done = uploaded.size;
          // ปีศาจเวลานับจาก "วันที่เริ่มเล่ม" เริ่ม 0 แล้วเพิ่มตามเวลาจริง (ไม่ใช่วันที่ของเดือน)
          const startMs = startedAt ? new Date(startedAt).getTime() : Date.now();
          const day = Math.max(0, Math.min(30, Math.floor((Date.now() - startMs) / 86400000)));
          const youPct = Math.min(100, Math.round(done / 30 * 100));
          const ghostPct = Math.min(100, Math.round(day / 30 * 100));
          const lead = done - day;
          const rank = done >= 15 ? "💎 Diamond" : done >= 5 ? "🥇 Gold" : "🥈 Silver";
          const next = done >= 15 ? t("db_diamond_done") : done >= 5 ? `${t("db_more_clips_a")} ${15 - done} ${t("db_more_clips_diamond")}` : `${t("db_more_clips_a")} ${5 - done} ${t("db_more_clips_gold")}`;
          return <>
            <div className="card">
              <div className="between"><h3 style={modH}>{t("db_marathon_title")}</h3><span style={{ background: "#fff7e6", color: "#8a6d1f", fontWeight: 700, fontSize: 12, padding: "4px 12px", borderRadius: 20 }}>{t("db_season")} {MONTHS_TH[new Date().getMonth()]}</span></div>
              <p className="muted" style={{ fontSize: 13, margin: "6px 0 18px" }}>{t("db_marathon_sub")} {day}/30 {t("db_marathon_sub2")}</p>
              {[["🐰", t("db_you"), done, youPct, "46,134,222"], ["👻", t("db_ghost"), day, ghostPct, "138,109,31"]].map(([emo, label, n, pct, rgb]) =>
                <div key={label} style={{ marginBottom: 14 }}>
                  <div className="between" style={{ fontSize: 13, marginBottom: 6 }}><span style={{ fontWeight: 700 }}>{emo} {label}</span><span className="muted">{n} {t("db_days_of_30")}</span></div>
                  <div style={{ position: "relative", height: 36, background: "var(--soft)", borderRadius: 18 }}>
                    <div style={{ position: "absolute", inset: "0 0 0 0", width: `${pct}%`, background: `rgba(${rgb},.18)`, borderRadius: 18 }} />
                    <div style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", fontSize: 18 }}>🏁</div>
                    <div style={{ position: "absolute", top: "50%", left: `calc(${pct}% - 13px)`, transform: "translateY(-50%)", fontSize: 24, transition: "left .5s ease", filter: "drop-shadow(0 1px 2px rgba(0,0,0,.2))" }}>{emo}</div>
                  </div>
                </div>)}
              <div style={{ borderRadius: 12, padding: "14px 16px", background: lead >= 0 ? "#e8f5ee" : "#fff7e6", color: lead >= 0 ? "#1a7f43" : "#8a6d1f", fontSize: 14.5, marginTop: 4 }}>
                💬 <b>{t("db_kim")}:</b> {lead >= 0 ? `${t("db_coach_ahead")} ${lead} ${t("db_coach_ahead2")}` : `${t("db_coach_behind")} ${-lead} ${t("db_coach_behind2")}`}
              </div>
            </div>
            <div className="card between"><div><div className="muted" style={{ fontSize: 12 }}>{t("db_rank_label")}</div><div style={{ fontSize: 22, fontWeight: 800 }}>{rank}</div></div><div style={{ color: "var(--blue)", fontWeight: 700, fontSize: 14 }}>{next}</div></div>
            <div className="card"><h3 style={{ marginBottom: 4 }}>{t("db_tick_title")}</h3><p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{t("db_tick_sub")}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8 }}>
                {Array.from({ length: 30 }, (_, i) => i + 1).map(d => <button key={d} onClick={() => toggleDay(d)} disabled={demo} style={{ aspectRatio: "1", border: 0, borderRadius: 10, cursor: demo ? "default" : "pointer", fontWeight: 700, background: uploaded.has(d) ? "var(--blue)" : "var(--soft)", color: uploaded.has(d) ? "#fff" : "var(--muted)" }}>{uploaded.has(d) ? "✓" : d}</button>)}
              </div>{demo && <p className="muted center" style={{ fontSize: 13, marginTop: 12 }}>{t("db_demo_tick")}</p>}
            </div>
            <ToolsAndServices channel={bp.instagram_account} cycle={cycle} demo={demo} />
          </>;
        })()}

        {!demo && <div className="card center" style={{ background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", border: "1px solid #d6e7fa", marginTop: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{t("db_renew_title")}</div>
          <p className="muted" style={{ margin: "6px 0 14px" }}>{t("db_renew_sub")}</p>
          <Link className="btn" to={`/form?renew=1&email=${encodeURIComponent(session.email || "")}`}>{t("db_renew_btn")}</Link>
        </div>}
      </div>
    </div>
  );
}
