import { useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n.jsx";
import { api, session } from "../api.js";

// พอร์ตงานจริงของทีม Babe House Production (จัดตามหมวด)
const PORTFOLIO = [
  {
    title: "🎬 ตัดต่อคลิปสั้น (TikTok / Reels)", color: ["#ECEAF6", "#6E63A6"],
    items: [
      { plat: "Instagram", url: "https://www.instagram.com/reel/DVQkYCLEviK/" },
      { plat: "TikTok", url: "https://vt.tiktok.com/ZSQEDyqvN/" },
      { plat: "TikTok", url: "https://www.tiktok.com/@amabella_official/video/7505059615051156754" },
      { plat: "TikTok", url: "https://www.tiktok.com/@irvin_restaurant/video/7564034789829774613" },
      { plat: "TikTok", url: "https://www.tiktok.com/@spicymonsters.sauce/video/7545445063556451591" },
      { plat: "TikTok", url: "https://www.tiktok.com/@panpuriofficial/video/7438944063224646919" },
    ],
  },
  {
    title: "🎥 ตัดต่อคลิปยาว (YouTube)", color: ["#E7EDF8", "#3F6BAE"],
    items: [
      { yt: "1W5b4-E7BWk", tag: "Pack A" },
      { yt: "DSSAXh0RjDk", tag: "Pack A" },
      { yt: "2kcU89z17s8", tag: "Pack B · มีกราฟิก" },
      { yt: "nXz0MGaU-_I", tag: "Pack C · มีอินโทรอนิเมชัน" },
    ],
  },
  {
    title: "🎨 งานกราฟิก", color: ["#E4F4F3", "#2C8E8C"],
    items: [{ plat: "Google Drive", url: "https://drive.google.com/file/d/1985RdomfPsBsCPQIwI8RDqqMT2AbXei8/view" }],
  },
  {
    title: "✨ อนิเมชัน (2D / 3D)", color: ["#F7F4EA", "#9A8458"],
    items: [
      { yt: "xi-girS7Sl8", tag: "2D" },
      { yt: "F6HT8NNNmes", tag: "2D" },
      { yt: "O3U3B4E8_cs", tag: "2D" },
      { yt: "biEl_mU5wdY", tag: "2D & 3D" },
      { plat: "Instagram", url: "https://www.instagram.com/reel/DW33J5kkjbU/" },
      { plat: "Google Drive", url: "https://drive.google.com/file/d/18HGow9N-rr-B6_Vn3XTAsXfVF03sZFkK/view" },
    ],
  },
];

const PACKS = [["Pack A", "10 คลิป"], ["Pack B", "15 คลิป"], ["Pack C", "30 คลิป"]];

export default function Production() {
  const { t, lang } = useI18n();
  const tagTr = (tg) => lang === "en" ? String(tg || "").replace("มีกราฟิก", "with graphics").replace("มีอินโทรอนิเมชัน", "with intro animation") : tg;
  const [pack, setPack] = useState("");
  const [addons, setAddons] = useState([]);
  const [f, setF] = useState({ footage: "", voice: "", ref: "", note: "", contact: "", needIdea: false });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const upd = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }));
  const toggleAddon = (a) => setAddons(s => s.includes(a) ? s.filter(x => x !== a) : [...s, a]);

  const briefText = () => [
    t("pd_brief_head"),
    pack && `${t("pd_brief_pack")} ${pack}`,
    addons.length && `${t("pd_brief_addon")} ${addons.join(", ")}`,
    f.footage && `${t("pd_brief_footage")} ${f.footage}`,
    f.voice && `${t("pd_brief_voice")} ${f.voice}`,
    f.ref && `${t("pd_brief_ref")} ${f.ref}`,
    f.note && `${t("pd_brief_note")} ${f.note}`,
    f.needIdea && t("pd_brief_idea"),
    f.contact && `${t("pd_brief_contact")} ${f.contact}`,
  ].filter(Boolean).join("\n");

  // ⛔ เดิมเด้งออกไป LINE — คิมสั่ง 3 ส.ค. ให้จบในเว็บ "เราย้ายมาทำงานในเว็บได้แล้ว"
  async function submitBrief() {
    if (!f.contact.trim()) { setErr(t("pd_need_contact")); return; }
    setBusy(true); setErr("");
    try {
      const r = await api("/api/production/inquiry", { method: "POST", body: {
        contact: f.contact, email: session.email || "", pack, addons,
        footage: f.footage, voice: f.voice, ref: f.ref, note: f.note, need_idea: f.needIdea } });
      setSent(r.ref || true);
    } catch (e) { setErr(e.message || t("pd_send_failed")); }
    finally { setBusy(false); }
  }

  return (
    <div className="wrap narrow page-pad">
      <div className="between"><span className="brand">BABE HOUSE · PRODUCTION</span><Link className="link" to="/">{t("pd_home_arrow")}</Link></div>
      <h1 className="page">{t("pd_h1")}</h1>
      <p className="sub">{t("pd_sub")}</p>

      {PORTFOLIO.map((cat, ci) => <div key={ci} style={{ marginBottom: 22 }}>
        <h3 style={{ margin: "0 0 12px", color: cat.color[1] }}>{t("pd_cats")[ci]}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 }}>
          {cat.items.map((it, i) => it.yt
            ? <a key={i} href={`https://www.youtube.com/watch?v=${it.yt}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", display: "block", background: "#000" }}>
                <div style={{ position: "relative", aspectRatio: "16/9", background: `#000 center/cover url(https://img.youtube.com/vi/${it.yt}/hqdefault.jpg)` }}>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ background: "rgba(0,0,0,.55)", color: "#fff", width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>▶</span></div>
                </div>
                {it.tag && <div style={{ background: "#fff", color: cat.color[1], fontSize: 11.5, fontWeight: 700, padding: "6px 9px" }}>{tagTr(it.tag)}</div>}
              </a>
            : <a key={i} href={it.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: cat.color[1], background: cat.color[0], borderRadius: 12, padding: "18px 12px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 96, fontWeight: 700 }}>
                <span style={{ fontSize: 26 }}>{it.plat === "TikTok" ? "🎵" : it.plat === "Instagram" ? "📸" : "📁"}</span>
                <span style={{ fontSize: 13 }}>{t("pd_watch_on")} {it.plat}</span>
              </a>)}
        </div>
      </div>)}

      <div className="card" style={{ borderTop: "4px solid #3F6BAE" }}>
        <h3 style={{ marginBottom: 4 }}>{t("pd_form_title")}</h3>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>{t("pd_form_sub")}</p>

        <label style={{ fontSize: 13.5, fontWeight: 700, display: "block", marginBottom: 8 }}>{t("pd_pack_label")}</label>
        <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          {t("pd_packs").map(([p, c]) => <button key={p} type="button" onClick={() => setPack(p)} style={{ flex: "1 1 90px", border: `1.5px solid ${pack === p ? "var(--blue)" : "var(--border)"}`, background: pack === p ? "#EAF3FD" : "#fff", color: pack === p ? "var(--blue-d)" : "var(--ink)", borderRadius: 12, padding: "12px 8px", cursor: "pointer", fontWeight: 700 }}>{p}<div className="muted" style={{ fontSize: 12, fontWeight: 500 }}>{c}</div></button>)}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {t("pd_addons").map(a => <button key={a} type="button" onClick={() => toggleAddon(a)} style={{ border: `1px solid ${addons.includes(a) ? "var(--blue)" : "var(--border)"}`, background: addons.includes(a) ? "#EAF3FD" : "#fff", color: addons.includes(a) ? "var(--blue-d)" : "var(--ink)", borderRadius: 20, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{addons.includes(a) ? "✓ " : "+ "}{a}</button>)}
        </div>

        <div className="field"><label>{t("pd_footage_label")}</label><input value={f.footage} onChange={upd("footage")} placeholder={t("pd_footage_ph")} /></div>
        <div className="field"><label>{t("pd_voice_label")} <span className="muted">{t("pd_if_any")}</span></label><input value={f.voice} onChange={upd("voice")} placeholder={t("pd_blank_ok")} /></div>
        <div className="field"><label>{t("pd_ref_label")}</label><input value={f.ref} onChange={upd("ref")} placeholder={t("pd_ref_ph")} /></div>
        <div className="field"><label>{t("pd_note_label")}</label><textarea value={f.note} onChange={upd("note")} style={{ minHeight: 64 }} placeholder={t("pd_note_ph")} /></div>
        <label className="row" style={{ fontSize: 13.5, gap: 8, marginBottom: 12 }}><input type="checkbox" style={{ width: 18, height: 18 }} checked={f.needIdea} onChange={e => setF(v => ({ ...v, needIdea: e.target.checked }))} /> {t("pd_need_idea")}</label>
        <div className="field"><label>{t("pd_contact_label")}</label><input value={f.contact} onChange={upd("contact")} placeholder={t("pd_contact_ph")} /></div>

        <div className="msg" style={{ background: "#EAF3FD", color: "var(--blue-d)", fontSize: 12.5, lineHeight: 1.6, margin: "4px 0 14px" }}>{t("pd_terms")}</div>

        {!sent && <button type="button" onClick={submitBrief} disabled={busy} className="btn full" style={{ fontSize: 15.5, opacity: busy ? .6 : 1 }}>{busy ? t("pd_sending") : t("pd_submit")}</button>}
        {err && <div className="msg" style={{ background: "#fde8e8", color: "#b42318", marginTop: 10 }}>{err}</div>}
        {sent && <div className="msg" style={{ background: "#eef7f0", color: "#1a7f43", marginTop: 10, lineHeight: 1.75 }}>
          {t("pd_sent_ok")}{typeof sent === "string" && <> <b>{sent}</b></>}<br />{t("pd_sent_next")}
        </div>}
        {/* คลิปสั้นสั่งเองจ่ายเองได้เลยไม่ต้องรอใครตอบ — งานอื่น (ยูทูป/กราฟิก/อนิเมชัน) ทีมตีราคาให้ */}
        <div className="msg" style={{ background: "#F3F0FB", color: "var(--ink)", fontSize: 13, lineHeight: 1.7, marginTop: 12 }}>
          {t("pd_selfserve")} <Link className="link" to="/edit" style={{ fontWeight: 700 }}>{t("pd_selfserve_link")}</Link>
        </div>
      </div>
    </div>
  );
}
