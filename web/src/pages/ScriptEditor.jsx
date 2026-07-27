// ตัวแสดง/แก้ไขสคริปต์ 1 อัน — ใช้ร่วมทั้งแผน 30 วัน (scope="plan") และสคริปต์สปอนเซอร์ (scope="credit")
// ฟีเจอร์: เลือกฮุก 3 แบบ · แก้คำพูดเอง (เซฟถาวร) · คืนค่าต้นฉบับ AI · เจนใหม่ฟรี 1 ครั้ง/สคริปต์
import { useState } from "react";
import { api, session } from "../api.js";
import { useI18n } from "../i18n.jsx";

const BEAT = { HOOK: "#2E86DE", BODY: "#1a7f43", CTA: "#b8860b" };

export function ScriptEditor({ script, scope, refId, day, lang, demo, onChange }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);   // { beats:[{...}], cap }
  const [busy, setBusy] = useState("");        // "save" | "revert" | "regen"
  const [err, setErr] = useState("");
  const [regenOpen, setRegenOpen] = useState(false); // แผงเจนใหม่ (บอกสิ่งที่อยากปรับ)
  const [note, setNote] = useState("");
  if (!script) return null;

  const label = (s) => (t("db_beat") && t("db_beat")[s]) || s;
  const beats = script.beats || [];
  const hooks = Array.isArray(script.hooks) ? script.hooks.filter(Boolean) : [];
  const hookIdx = beats.findIndex(b => b.s === "HOOK");
  const pick = Math.max(0, hooks.findIndex(h => h === (hookIdx >= 0 ? beats[hookIdx].say : "")));
  const canEdit = !demo && !!refId;

  // เลือกฮุก → อัปเดต say ของ beat HOOK (โลคัล ยังไม่เซฟ จนกว่าจะกดบันทึก)
  const chooseHook = (i) => { if (hookIdx < 0) return; const nb = beats.map((b, idx) => idx === hookIdx ? { ...b, say: hooks[i] } : b); onChange({ ...script, beats: nb }); };

  const call = async (path, body, key) => {
    setBusy(key); setErr("");
    try { return await api(path, { method: "POST", token: session.token, body: { scope, ref_id: refId, day, lang, ...body } }); }
    catch (e) { setErr(e.message || "เกิดข้อผิดพลาด ลองใหม่นะคะ"); throw e; }
    finally { setBusy(""); }
  };
  const startEdit = () => { setErr(""); setDraft({ beats: beats.map(b => ({ ...b })), cap: script.cap || "", tip: script.tip || "" }); setEditing(true); };
  const cancel = () => { setEditing(false); setDraft(null); setErr(""); };
  const save = async () => {
    const merged = { ...script, beats: draft.beats, cap: draft.cap, tip: draft.tip };
    try { await call("/api/script/save", { script: merged }, "save"); onChange({ ...merged, _edited: true }); setEditing(false); setDraft(null); } catch {}
  };
  const revert = async () => {
    try { const d = await call("/api/script/revert", {}, "revert"); if (d.script) onChange(d.script); setEditing(false); setDraft(null); } catch {}
  };
  const openRegen = () => { if (script._regen_used || busy) return; setErr(""); setNote(""); setRegenOpen(true); };
  const doRegen = async () => {
    try { const d = await call("/api/script/regenerate", { note: note.trim() || undefined }, "regen"); if (d.script) onChange(d.script); setRegenOpen(false); setNote(""); } catch {}
  };

  // ── โหมดแก้ไข ───────────────────────────────────────────────
  if (editing && draft) {
    const setBeat = (i, v) => setDraft(d => ({ ...d, beats: d.beats.map((b, idx) => idx === i ? { ...b, say: v } : b) }));
    return <div style={{ background: "#fff", border: "1.5px solid var(--blue)", borderRadius: 14, padding: "14px 16px" }}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>✏️ {t("se_edit_hint")}</div>
      {draft.beats.map((b, i) => <div key={i} style={{ marginBottom: 12 }}>
        <span style={{ background: BEAT[b.s] || "#888", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10 }}>{label(b.s)}</span>
        {b.ts && <span className="muted" style={{ fontSize: 11.5, marginLeft: 7 }}>{b.ts}</span>}
        <textarea value={b.say} onChange={e => setBeat(i, e.target.value)} rows={Math.max(2, Math.ceil((b.say || "").length / 46))} style={{ width: "100%", marginTop: 5, fontSize: 14, lineHeight: 1.55, padding: "9px 11px", borderRadius: 10, border: "1px solid var(--border)", resize: "vertical", fontFamily: "inherit" }} />
        {(b.ost || b.vis) && <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{b.ost && `📺 ${b.ost}`}{b.ost && b.vis && " · "}{b.vis && `🎬 ${b.vis}`}</div>}
      </div>)}
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{t("dp_caption")}</div>
      <textarea value={draft.cap} onChange={e => setDraft(d => ({ ...d, cap: e.target.value }))} rows={3} style={{ width: "100%", fontSize: 13.5, lineHeight: 1.55, padding: "9px 11px", borderRadius: 10, border: "1px solid var(--border)", resize: "vertical", fontFamily: "inherit" }} />
      {err && <div style={{ color: "#c0392b", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={save} disabled={!!busy} style={{ background: "var(--blue)", color: "#fff", border: 0, borderRadius: 10, padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1 }}>{busy === "save" ? t("se_saving") : t("se_save")}</button>
        <button onClick={revert} disabled={!!busy} style={{ background: "#fff", color: "#8a6d1f", border: "1px solid #e7dfc5", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer" }}>{busy === "revert" ? "…" : t("se_revert")}</button>
        <button onClick={cancel} disabled={!!busy} style={{ background: "none", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 14px", fontSize: 13, cursor: "pointer" }}>{t("se_cancel")}</button>
      </div>
    </div>;
  }

  // ── โหมดแสดงผล ──────────────────────────────────────────────
  return <>
    {canEdit && <div className="row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "wrap", marginBottom: 8 }}>
      {script._edited && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#8a6d1f", background: "#fff7e6", border: "1px solid #f0deb0", borderRadius: 20, padding: "3px 10px" }}>✏️ {t("se_edited_tag")}</span>}
      <button onClick={startEdit} style={{ background: "#fff", color: "var(--blue)", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>✏️ {t("se_edit")}</button>
      <button onClick={openRegen} disabled={script._regen_used || !!busy} title={script._regen_used ? t("se_regen_used") : ""} style={{ background: script._regen_used ? "#f2f2f2" : (regenOpen ? "#eef4fb" : "#fff"), color: script._regen_used ? "var(--muted)" : "var(--blue)", border: `1px solid ${regenOpen ? "var(--blue)" : "var(--border)"}`, borderRadius: 10, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: script._regen_used ? "default" : "pointer" }}>{busy === "regen" ? t("se_regening") : (script._regen_used ? `✓ ${t("se_regen_used")}` : `🔄 ${t("se_regen")}`)}</button>
    </div>}
    {regenOpen && !script._regen_used && <div style={{ marginBottom: 12, background: "#eef4fb", border: "1px solid #cfe0f3", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>🔄 {t("se_regen_title")}</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{t("se_regen_hint")}</div>
      <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={3} placeholder={t("se_regen_ph")} style={{ width: "100%", fontSize: 13.5, lineHeight: 1.5, padding: "9px 11px", borderRadius: 10, border: "1px solid var(--border)", resize: "vertical", fontFamily: "inherit" }} />
      {err && <div style={{ color: "#c0392b", fontSize: 12.5, marginTop: 6 }}>{err}</div>}
      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={doRegen} disabled={busy === "regen"} style={{ background: "var(--blue)", color: "#fff", border: 0, borderRadius: 10, padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1 }}>{busy === "regen" ? t("se_regening") : t("se_regen_go")}</button>
        <button onClick={() => { setRegenOpen(false); setNote(""); }} disabled={busy === "regen"} style={{ background: "none", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 14px", fontSize: 13, cursor: "pointer" }}>{t("se_cancel")}</button>
      </div>
    </div>}
    {hooks.length > 1 && <div style={{ marginBottom: 12, background: "#eef4fb", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#2E86DE", marginBottom: 7 }}>🎣 {t("dp_hooks_label")}</div>
      {hooks.map((h, i) => <button key={i} onClick={() => chooseHook(i)} style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", marginTop: i ? 6 : 0, border: pick === i ? "2px solid #2E86DE" : "1px solid #d5e2f0", background: pick === i ? "#fff" : "transparent", borderRadius: 8, padding: "8px 10px", fontSize: 13.5, lineHeight: 1.5, color: "#1a2a3a" }}>
        <b style={{ color: "#2E86DE" }}>{i + 1}.</b> {h} {pick === i && <span style={{ fontSize: 11, color: "#1a7f43", fontWeight: 700 }}>✓ {t("dp_hook_using")}</span>}
      </button>)}
    </div>}
    {beats.map((b, i) => <div key={i} style={{ borderLeft: `4px solid ${BEAT[b.s] || "var(--blue)"}`, background: "var(--soft)", borderRadius: "0 12px 12px 0", padding: "12px 14px", marginBottom: 10 }}>
      <div className="row" style={{ gap: 8, marginBottom: 6 }}><span style={{ background: BEAT[b.s] || "var(--blue)", color: "#fff", fontWeight: 700, fontSize: 11, padding: "2px 10px", borderRadius: 20 }}>{label(b.s)}</span>{b.ts && <span className="muted" style={{ fontSize: 12 }}>{b.ts}</span>}</div>
      <p style={{ margin: "0 0 6px", fontSize: 15, lineHeight: 1.6 }}>{b.say}</p>
      <div className="row" style={{ gap: 6 }}>{b.ost && <span style={{ fontSize: 11, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "3px 8px" }}>📺 {b.ost}</span>}{b.vis && <span style={{ fontSize: 11, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "3px 8px" }}>🎬 {b.vis}</span>}</div>
    </div>)}
    {script.cap && <div style={{ background: "var(--soft)", borderRadius: 12, padding: "12px 14px", marginTop: 4 }}><b style={{ fontSize: 13 }}>{t("dp_caption")}</b><p style={{ fontSize: 14, marginTop: 6, whiteSpace: "pre-wrap" }}>{script.cap}</p></div>}
    {script.tip && <div className="msg" style={{ background: "#fff7e6", color: "#8a6d1f", marginTop: 8 }}>💡 {script.tip}</div>}
  </>;
}
