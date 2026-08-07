import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { api, session } from "../api.js";
import { useI18n } from "../i18n.jsx";
import MyLearning, { SectionHead } from "./MyLearning.jsx";
import { TAX_INVOICE_LIVE } from "../config.js";

// จำว่าลูกค้าเปิดเล่มไหนแล้ว (localStorage) — เล่มใหม่ที่ยังไม่เปิด = เด่น, เปิดแล้ว = ปกติ
const isOpened = (id) => { try { return JSON.parse(localStorage.getItem("babe_opened") || "[]").includes(id); } catch { return false; } };
const markOpened = (id) => { try { const a = JSON.parse(localStorage.getItem("babe_opened") || "[]"); if (!a.includes(id)) { a.push(id); localStorage.setItem("babe_opened", JSON.stringify(a)); } } catch {} };

export default function Account() {
  const [taxInv, setTaxInv] = useState([]);   // 🧾 ใบกำกับภาษีของลูกค้าคนนี้
  const [taxQ, setTaxQ] = useState("");       // ค้นหาใบกำกับ — คิมทัก 5 ส.ค. "คนซื้อเยอะ หาไม่เจออีก"
  // 🔘 ปุ่มเลื่อนโฟลเดอร์ — คิมขอ 7 ส.ค. "ขอแค่มีปุ่มที่ทำให้รู้ว่าเลื่อนได้"
  //    ปุ่มโผล่เฉพาะด้านที่ยังเลื่อนต่อได้จริง จะได้ไม่มีปุ่มกดแล้วไม่เกิดอะไร
  const fldRef = useRef(null);
  const [fldCan, setFldCan] = useState({ l: false, r: false });
  const fldScroll = () => {
    const e = fldRef.current; if (!e) return;
    setFldCan({ l: e.scrollLeft > 4, r: e.scrollLeft + e.clientWidth < e.scrollWidth - 4 });
  };
  useEffect(() => {
    fldScroll();
    window.addEventListener("resize", fldScroll);
    return () => window.removeEventListener("resize", fldScroll);
  });   // ไม่ใส่ deps ตั้งใจ — จำนวนโฟลเดอร์เปลี่ยนได้ตลอด (โหลดคอร์ส/ใบกำกับมาทีหลัง) ต้องคำนวณใหม่ทุกรอบ
  const { t, lang } = useI18n();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [msg, setMsg] = useState(null);
  const [data, setData] = useState(null);
  const [ref, setRef] = useState(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState({}); // ช่องไหนกางอยู่ (accordion) — หลายช่องจะพับไว้ กันหน้ายาว
  const [chQ, setChQ] = useState("");             // ค้นหาช่อง (โผล่เมื่อมีหลายช่อง)
  const [deleted, setDeleted] = useState([]);     // เล่มที่ลบไปแล้วแต่ยังกู้ได้ 30 วัน
  const [folder, setFolder] = useState("plan");   // 🗂️ โฟลเดอร์ที่เปิดอยู่
  const [counts, setCounts] = useState({ courses: 0, certs: 0, ws: 0, edits: 0 });
  const [subs, setSubs] = useState({});           // 💳 แพ็ก 6/12 เดือนที่ใช้อยู่ ของแต่ละช่อง
  const [perks, setPerks] = useState(null);       // 🎁 สิทธิ์สมาชิก + คอร์สฟรี (แพ็ก 12 เดือน)
  const [pickBusy, setPickBusy] = useState("");
  const [showCourses, setShowCourses] = useState(false);  // กางรายชื่อคอร์สฟรีหลังกดปุ่ม

  useEffect(() => { if (session.token) loadMonths(); }, []);
  // 🎁 สิทธิ์ของฉัน — โหลดครั้งเดียวตอนเข้าหน้า
  useEffect(() => { if (session.token) api("/api/me/perks", { token: session.token }).then(setPerks).catch(() => {}); }, [step]);
  async function pickFreeCourse(id, name) {
    if (!window.confirm(`เลือก "${name}" เป็นคอร์สฟรีของคุณใช่ไหมคะ?\n\nเลือกได้ครั้งเดียว เปลี่ยนทีหลังไม่ได้นะคะ`)) return;
    setPickBusy(id);
    try {
      await api("/api/me/free-course", { method: "POST", token: session.token, body: { course_id: id } });
      const p = await api("/api/me/perks", { token: session.token }); setPerks(p);
      alert(`เปิดคอร์ส "${name}" ให้แล้วค่ะ 🎉 เข้าเรียนได้เลยที่โฟลเดอร์คอร์สเรียน`);
      loadMonths();
    } catch (e) { alert(e.message || "เลือกไม่สำเร็จ ลองใหม่นะคะ"); }
    finally { setPickBusy(""); }
  }
  // 💳 แพ็กที่ใช้อยู่ของแต่ละช่อง — โชว์ว่าเหลืออีกกี่เดือน ลูกค้าจะได้รู้ว่ายังไม่ต้องจ่ายเพิ่ม
  useEffect(() => {
    const chans = [...new Set((data?.months || []).map(m => m.instagram_account).filter(Boolean))];
    if (!data?.email || !chans.length) return;
    Promise.all(chans.map(c =>
      api(`/api/plans?email=${encodeURIComponent(data.email)}&channel=${encodeURIComponent(c)}`)
        .then(d => [c, d.active]).catch(() => [c, null])
    )).then(rows => setSubs(Object.fromEntries(rows.filter(r => r[1]))));
  }, [data?.email, (data?.months || []).length]);
  // ถ้ามีเล่มกำลังสร้าง → รีเฟรชเองทุก 15 วิ จนกว่าจะเสร็จ (ลูกค้าไม่ต้องกดเอง)
  useEffect(() => {
    if (step !== "list" || !(data?.pending || []).length) return;
    const t = setInterval(() => { if (session.token) loadMonths(); }, 15000);
    return () => clearInterval(t);
  }, [step, data?.pending?.length]);

  async function loadMonths() {
    try {
      const d = await api("/api/me/blueprints", { token: session.token });
      loadDeleted();
      setData(d); setStep("list");
      api("/api/me/referral", { token: session.token }).then(setRef).catch(() => {});
      api("/api/me/tax-invoices", { token: session.token }).then(d => setTaxInv(d.invoices || [])).catch(() => {});
    } catch { session.clear(); setStep("email"); }
  }
  async function sendCode() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setMsg({ k: "err", t: t("ac_email_invalid") }); return; }
    setBusy(true); setMsg(null);
    try { const d = await api("/api/auth/request-otp", { method: "POST", body: { email: email.trim().toLowerCase(), lang } }); setDevCode(d.dev_code || ""); setStep("otp"); }
    catch (e) { setMsg({ k: "err", t: e.message }); } finally { setBusy(false); }
  }
  async function verify() {
    if (code.length !== 6) { setMsg({ k: "err", t: t("ac_otp_len") }); return; }
    setBusy(true); setMsg(null);
    try { const d = await api("/api/auth/verify-otp", { method: "POST", body: { email: email.trim().toLowerCase(), code } }); session.set(d.token, d.email); await loadMonths(); }
    catch (e) { setMsg({ k: "err", t: e.message }); } finally { setBusy(false); }
  }
  function logout() { session.clear(); setData(null); setStep("email"); }
  // 🗑️ ลบเล่ม — ต้องพิมพ์ชื่อเดือนยืนยัน (มีลูกค้าเผลอกดลบจริง 2 ส.ค.)
  async function deleteBook(bpId, cycle) {
    const label = String(cycle).replace("_", " ");
    const typed = window.prompt(
      `⚠️ กำลังจะลบเล่ม "${label}"\n\nเล่มนี้จะหายจากหน้าบัญชี แต่กู้คืนเองได้ภายใน 30 วัน\n\nถ้าแน่ใจ พิมพ์ชื่อเดือนให้ตรงเพื่อยืนยัน:\n${label}`);
    if (typed == null) return;
    if (typed.trim().toLowerCase() !== label.trim().toLowerCase()) { alert("ชื่อเดือนไม่ตรงค่ะ ยกเลิกการลบแล้วนะคะ 🩵"); return; }
    try {
      await api("/api/me/delete-book", { method: "POST", token: session.token, body: { blueprint_id: bpId } });
      alert(`ลบเล่ม "${label}" แล้วค่ะ — ถ้าเปลี่ยนใจ กดกู้คืนได้ที่ท้ายหน้านี้ภายใน 30 วันนะคะ`);
      loadMonths(); loadDeleted();
    } catch (e) { alert(e.message || t("ac_delete_fail")); }
  }
  // เล่มที่ลบไปแล้วแต่ยังกู้ได้
  async function loadDeleted() {
    if (!session.token) return;
    try { const d = await api("/api/me/deleted-books", { token: session.token }); setDeleted(d.books || []); }
    catch { setDeleted([]); }
  }
  async function restoreBook(bpId) {
    try { await api("/api/me/restore-book", { method: "POST", token: session.token, body: { blueprint_id: bpId } });
      alert("กู้เล่มกลับมาแล้วค่ะ 🩵"); loadMonths(); loadDeleted(); }
    catch (e) { alert(e.message || "กู้คืนไม่สำเร็จ"); }
  }
  // สร้างลิงก์จาก origin จริงของเบราว์เซอร์ — ถูกเสมอแม้ APP_BASE_URL บนเซิร์ฟเวอร์จะไม่ถูกตั้ง
  const refLink = ref ? `${window.location.origin}/?ref=${encodeURIComponent(ref.code)}` : "";
  const [copied, setCopied] = useState("");
  const shareMsg = ref ? `${t("ac_share_msg")} ${ref.percent}% ${t("ac_share_msg_tail")}\n${refLink}` : "";
  function copyRef() { if (refLink) { navigator.clipboard.writeText(refLink); setCopied("link"); setTimeout(() => setCopied(""), 1800); } }
  function copyMsg() { if (shareMsg) { navigator.clipboard.writeText(shareMsg); setCopied("msg"); setTimeout(() => setCopied(""), 1800); } }
  function shareNative() { if (navigator.share) navigator.share({ text: shareMsg }).catch(() => {}); else copyMsg(); }
  // มีของมากกว่า 1 ประเภท → โชว์แท็บโฟลเดอร์ · ลูกค้า Blueprint ล้วนเห็นหน้าเดิมเป๊ะ
  const showFolders = [(data?.channels || []).length, counts.courses, counts.certs, counts.ws, counts.edits,
                       TAX_INVOICE_LIVE ? taxInv.length : 0].filter(n => n > 0).length > 1;
  const lineShare = ref ? `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(refLink)}` : "";

  return (
    <div className="wrap narrow page-pad">
      <div className="brand">BABE HOUSE · ACADEMY</div>
      <h1 className="page">{t("ac_title")}</h1>
      <p className="sub">{t("ac_sub")}</p>

      {step === "email" && <div className="card">
        <div className="field"><label>{t("ac_email_label")}</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" /></div>
        <button className="btn full" onClick={sendCode} disabled={busy}>{t("ac_send_code")}</button>
        {msg && <div className={`msg ${msg.k}`}>{msg.t}</div>}
      </div>}

      {step === "otp" && <div className="card">
        <label>{t("ac_otp_label_pre")} <b style={{ color: "var(--blue)" }}>{email}</b></label>
        <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="______" style={{ letterSpacing: 8, textAlign: "center", fontSize: 22 }} />
        {devCode && <div className="msg" style={{ background: "#fff7e6", color: "#8a6d1f", border: "1px dashed #e0b85b" }}>{t("ac_dev_mode_pre")} <b style={{ fontSize: 18 }}>{devCode}</b></div>}
        <button className="btn full" onClick={verify} disabled={busy} style={{ marginTop: 12 }}>{t("ac_verify")}</button>
        <button className="link" onClick={() => setStep("email")} style={{ background: "none", border: 0, marginTop: 12 }}>{t("ac_change_email")}</button>
        {msg && <div className={`msg ${msg.k}`}>{msg.t}</div>}
      </div>}

      {step === "list" && data && <>
        <div className="between" style={{ marginBottom: 14 }}><span className="muted">{t("ac_books_of_pre")} <b>{data.email}</b></span><button className="link" onClick={logout} style={{ background: "none", border: 0 }}>{t("ac_logout")}</button></div>

        {/* 🎁 บัตรสมาชิก — คิมเลือกดีไซน์ 6 ส.ค. (แบบ A · สีน้ำเงินแบรนด์ · ขนาดตัวหนังสือเท่าเว็บ 16px)
            โผล่เฉพาะคนที่ซื้อแพ็กยาว · ลูกค้ารายเดือนเห็นหน้าเดิมเป๊ะ ไม่มีอะไรมากวน
            ⚠️ ขนาดตัวหนังสือตั้งใจให้เท่าเนื้อหาส่วนอื่นของเว็บ (16px) — เลื่อนผ่านแล้วสายตาไม่ต้องปรับ */}
        {/* 🗂️ โฟลเดอร์ — คิมขอ 2 ส.ค. ให้หน้าบัญชีเป็นโฟลเดอร์แบบเดียวกับที่ดูใน /preview/account
            โผล่เฉพาะคนที่มีของมากกว่า 1 ประเภท · ลูกค้า Blueprint ล้วนเห็นหน้าเดิมเป๊ะ ไม่มีอะไรมากวน */}
        {showFolders && (
          <div className="fld-wrap">
          {fldCan.l && <button className="fld-arrow l" aria-label="เลื่อนไปทางซ้าย"
            onClick={() => fldRef.current?.scrollBy({ left: -220, behavior: "smooth" })}>‹</button>}
          {fldCan.r && <button className="fld-arrow r" aria-label="เลื่อนไปทางขวา"
            onClick={() => fldRef.current?.scrollBy({ left: 220, behavior: "smooth" })}>›</button>}
          <div className="fld-row" ref={fldRef} onScroll={fldScroll}>
            {[
              { key: "plan", icon: "📘", label: "แผนคอนเทนต์", pastel: "#C7DEF0", deep: "#A9CCE6", n: (data.channels || []).length },
              { key: "course", icon: "🎓", label: "คอร์สเรียน", pastel: "#DDCCEE", deep: "#C9B4E3", n: counts.courses },
              { key: "cert", icon: "🏆", label: "ประกาศนียบัตร", pastel: "#C6DBCB", deep: "#AECBB6", n: counts.certs },
              { key: "ws", icon: "🎟️", label: "คลาสสด", pastel: "#F3D6B6", deep: "#E9C398", n: counts.ws },
              { key: "edit", icon: "🎬", label: "งานตัดต่อ", pastel: "#E4D6F0", deep: "#D0BCE6", n: counts.edits },
              // 🧾 คิมสั่ง 5 ส.ค.: "แยกออกมาอีกโฟลเดอร์นึงเลย เพราะลูกค้าไม่ได้เอาใบกำกับแค่งานตัด"
              { key: "tax", icon: "🧾", label: "ใบกำกับภาษี", pastel: "#DCE4EF", deep: "#C2CFE0", n: TAX_INVOICE_LIVE ? taxInv.length : 0 },
              // 💳 คิมสั่ง 6 ส.ค.: "มันควรจะอยู่ในโฟลเดอร์ จะได้ไม่รบกวนหน้าอื่น อันนี้มาใหญ่มาก"
              //    บัตรสมาชิกย้ายมาอยู่ในนี้ · จุดแดงเตือนเมื่อยังไม่ได้เลือกคอร์สฟรี (กันลืมของมูลค่า 5,990)
              { key: "member", icon: "💳", label: "แพ็กเกจของฉัน", pastel: "#C7DEF0", deep: "#8FB9DF",
                n: perks && perks.plan !== "monthly" ? (perks.months_left || 1) : 0,
                dot: !!(perks?.free_course && !perks.free_course.claimed) },
            ].filter(f => f.n > 0).map(f => {
              const on = f.key === folder;
              return (
                <button key={f.key} className={`fld${on ? " on" : ""}`} onClick={() => setFolder(f.key)} aria-pressed={on}
                  style={{ position: "relative" }}>
                  <span className="fld-body" style={{ "--c": f.pastel, "--d": f.deep }}>
                    <span className="fld-icon">{f.icon}</span>
                    <span className="fld-n">{f.n}</span>
                  </span>
                  <span className="fld-label">{f.label}</span>
                  {/* จุดแดง = มีของรอให้กด (ตอนนี้ใช้กับคอร์สฟรีที่ยังไม่ได้เลือก) */}
                  {f.dot && <span style={{ position: "absolute", top: 2, right: 6, width: 11, height: 11, borderRadius: "50%",
                    background: "#e5484d", border: "2px solid #fff" }} />}
                </button>
              );
            })}
          </div>
          </div>
        )}
        {perks && perks.plan !== "monthly" && (!showFolders || folder === "member") && (() => {
          const DIM = "#D3E7FA";
          const rule = "1px solid rgba(255,255,255,.24)";
          const Row = ({ k, v, unit }) => (
            <div className="between" style={{ gap: 12, padding: "13px 0", borderBottom: rule, fontSize: 16 }}>
              <span style={{ color: DIM }}>{k}</span>
              <span style={{ fontWeight: 800, fontSize: unit ? 19 : 16, fontVariantNumeric: "tabular-nums" }}>
                {v}{unit && <small style={{ fontWeight: 600, fontSize: 13, color: DIM, marginLeft: 4 }}>{unit}</small>}
              </span>
            </div>
          );
          return (
            <div style={{ borderRadius: 20, padding: "22px 20px", color: "#fff", marginBottom: 16,
              background: "linear-gradient(158deg,#3E93E4 0%,#2E86DE 55%,#1B6FC4 100%)",
              boxShadow: "0 10px 26px rgba(27,111,196,.32)" }}>

              <div className="between" style={{ alignItems: "flex-start", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11.5, letterSpacing: ".14em", textTransform: "uppercase", color: DIM, fontWeight: 700 }}>Babe House Member</div>
                  <div className="serif" style={{ fontSize: 27, fontWeight: 700, marginTop: 2 }}>
                    แพ็ก {perks.plan === "12m" ? "12" : "6"} เดือน
                  </div>
                </div>
                {perks.months_left > 0 && (
                  <div style={{ background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.3)", borderRadius: 20,
                    padding: "5px 12px", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>
                    เหลือ {perks.months_left} เดือน
                  </div>
                )}
              </div>

              <div style={{ marginTop: 16, borderTop: rule }}>
                <Row k="✍️ สคริปต์เพิ่มคงเหลือ" v={perks.credits} unit="คลิป" />
                <Row k="🔁 แก้เล่มใหม่" v={perks.improve} unit="ครั้ง/เดือน" />
                {perks.edit_off > 0 && <Row k="🎬 ส่วนลดค่าตัดต่อ" v={`${perks.edit_off}%`} />}
                {perks.priority && <Row k="⚡ คิวงานตัดต่อ" v="ได้ก่อน" />}
              </div>

              {/* 🎓 คอร์สฟรี — กล่องขาวตัดกับพื้นน้ำเงิน ให้เด่นที่สุดในการ์ด (เป็นของมูลค่าถึง 5,990) */}
              {perks.free_course && !perks.free_course.claimed && (
                <div style={{ marginTop: 15, background: "#fff", borderRadius: 14, padding: "14px 15px", color: "var(--ink)" }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>🎓 คอร์สออนไลน์ฟรี 1 คอร์ส</div>
                  <p className="muted" style={{ fontSize: 13, margin: "3px 0 11px" }}>เลือกได้ครั้งเดียว มูลค่าถึง 5,990฿</p>
                  {!showCourses
                    ? <button onClick={() => setShowCourses(true)}
                        style={{ display: "block", width: "100%", background: "var(--blue-d)", color: "#fff", border: 0, borderRadius: 11,
                          padding: 13, fontFamily: "inherit", fontSize: 15.5, fontWeight: 800, cursor: "pointer" }}>
                        เลือกคอร์สของฉัน →
                      </button>
                    : <div style={{ display: "grid", gap: 8 }}>
                        {(perks.free_course.choices || []).map(c => (
                          <button key={c.id} onClick={() => pickFreeCourse(c.id, c.name)} disabled={!!pickBusy}
                            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, textAlign: "left",
                              background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 13px",
                              cursor: pickBusy ? "default" : "pointer", fontFamily: "inherit", fontSize: 15,
                              opacity: pickBusy && pickBusy !== c.id ? .5 : 1 }}>
                            <span style={{ fontWeight: 700 }}>{c.name}</span>
                            <span className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                              {pickBusy === c.id ? "กำลังเปิด…" : `฿${Number(c.price || 0).toLocaleString()}`}
                            </span>
                          </button>
                        ))}
                      </div>}
                </div>
              )}
              {perks.free_course?.claimed && (
                <div style={{ marginTop: 15, background: "rgba(255,255,255,.14)", border: rule, borderRadius: 12,
                  padding: "11px 14px", fontSize: 14.5, fontWeight: 700 }}>
                  ✓ เลือกคอร์สฟรีแล้ว — เข้าเรียนได้ที่โฟลเดอร์ 🎓 คอร์สเรียน
                </div>
              )}
            </div>
          );
        })()}

        {(data.pending || []).map(p => p.status === "error"
          ? <div key={p.order_id} className="card" style={{ background: "#fff7e6", border: "1px solid #e8d49a" }}>
              <div style={{ fontWeight: 800, color: "#8a6d1f" }}>⚠️ {p.billing_cycle.replace("_", " ")} — {t("ac_pending_err_title")}</div>
              <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{t("ac_pending_err_sub")}</div>
              <Link className="btn full" to={`/processing?order_id=${encodeURIComponent(p.order_id)}`} style={{ marginTop: 12, background: "#8a6d1f" }}>{t("ac_view_status")}</Link>
            </div>
          : <div key={p.order_id} className="card" style={{ background: "linear-gradient(135deg,#EAF3FD,#F4F9FF)", border: "1px solid #d6e7fa" }}>
              <div className="row" style={{ gap: 12, alignItems: "center" }}>
                <div className="spinner" style={{ width: 24, height: 24, flexShrink: 0 }} />
                <div><div style={{ fontWeight: 800, color: "var(--blue-d)" }}>{t("ac_pending_title")}</div><div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>{p.billing_cycle.replace("_", " ")} {t("ac_pending_sub")}</div></div>
              </div>
              <Link className="btn full" to={`/processing?order_id=${encodeURIComponent(p.order_id)}`} style={{ marginTop: 12 }}>{t("ac_view_gen_status")}</Link>
            </div>)}
        {(data.channels || []).length === 0 && (data.pending || []).length === 0 && <div className="card center muted">{t("ac_no_books")}</div>}

        {/* หัวข้อหมวดแบบเดียวกับคอร์ส/ใบประกาศ/คลาสสด — ให้ทั้งหน้าอ่านเป็นระบบเดียว ไม่ใช่ของแปะกัน */}
        {(![(data.channels || []).length, counts.courses, counts.certs, counts.ws, counts.edits].filter(n => n > 0).length > 1 || folder === "plan") && <>
        {(data.channels || []).length > 0 && <SectionHead icon="📘" title="แผนคอนเทนต์ของฉัน" count={(data.channels || []).length + " ช่อง"} />}
        {(() => { const chs = data.channels || []; const singleCh = chs.length === 1;
          const q = chQ.trim().toLowerCase();
          const filtered = q ? chs.filter(ch => String(ch.channel || "").toLowerCase().includes(q)) : chs;
          const chOpen = (ch, idx) => (ch.channel in expanded) ? expanded[ch.channel] : (q ? true : (singleCh || idx === 0));
          return <>
          {chs.length > 3 && <input value={chQ} onChange={e => setChQ(e.target.value)} placeholder={t("ac_search_channel")} style={{ width: "100%", boxSizing: "border-box", fontSize: 14, padding: "11px 14px", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 12 }} />}
          {filtered.length === 0 && <div className="card center muted" style={{ fontSize: 14 }}>{t("ac_no_channel_found")} “{chQ}”</div>}
          {filtered.map((ch, ci) => {
          const months = ch.months.slice().reverse(); // ใหม่ → เก่า
          const anyFresh = months.some(m => !isOpened(m.blueprint_id));
          const open = chOpen(ch, ci);
          const latest = months[0];
          return <div key={ch.channel} className="card" style={anyFresh ? { borderTop: "4px solid #2C8E8C" } : undefined}>
            <button onClick={() => setExpanded(p => ({ ...p, [ch.channel]: !open }))} style={{ width: "100%", background: "none", border: 0, padding: 0, cursor: "pointer", display: "flex", gap: 11, alignItems: "center", marginBottom: open ? 12 : 0, textAlign: "left" }}>
              <span style={{ fontSize: 22 }}>📺</span>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 15.5 }}>{ch.channel}</div><div className="muted" style={{ fontSize: 12.5 }}>{ch.count} {t("ac_months_suffix")}{!open && latest ? ` · ${latest.billing_cycle.replace("_", " ")}` : ""}</div></div>
              {!open && anyFresh && <span style={{ fontSize: 10.5, fontWeight: 800, background: "#2C8E8C", color: "#fff", borderRadius: 20, padding: "2px 8px" }}>{t("ac_new_badge")}</span>}
              <span style={{ color: "var(--muted)", fontSize: 17, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>›</span>
            </button>
            {open && <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {months.map((m, i) => {
                const fresh = !isOpened(m.blueprint_id);
                const to = `/dashboard?user_id=${encodeURIComponent(m.user_id)}&billing_cycle=${encodeURIComponent(m.billing_cycle)}&blueprint_id=${encodeURIComponent(m.blueprint_id)}`;
                return <div key={m.blueprint_id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Link onClick={() => markOpened(m.blueprint_id)} to={to} style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none", borderRadius: 12, padding: "12px 14px", background: fresh ? "linear-gradient(135deg,#EAF3FD,#F4F9FF)" : "var(--bg-soft,#f7f7f8)", border: fresh ? "1px solid #d6e7fa" : "1px solid var(--border)", color: "inherit" }}>
                    <div><span style={{ fontWeight: 700, fontSize: 14.5 }}>{m.billing_cycle.replace("_", " ")}{i === 0 ? t("ac_latest") : ""}</span>{fresh && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, background: "#2C8E8C", color: "#fff", borderRadius: 20, padding: "2px 8px" }}>{t("ac_new_badge")}</span>}</div>
                    <span style={{ color: "var(--blue)", fontSize: 18 }}>›</span>
                  </Link>
                  <button onClick={() => deleteBook(m.blueprint_id, m.billing_cycle)} title="ลบเล่มนี้" style={{ background: "none", border: 0, cursor: "pointer", color: "#b9b9c2", fontSize: 16, padding: "8px 6px", flexShrink: 0 }}>🗑️</button>
                </div>;
              })}
            </div>
            {/* 💳 มีแพ็กยาวอยู่ = เดือนถัดไปไม่ต้องจ่ายเพิ่ม บอกให้ชัดจะได้ไม่กังวล */}
            {subs[ch.channel] && <div style={{ background: "#EAF3FD", border: "1px solid #d6e7fa", borderRadius: 12, padding: "10px 13px", marginBottom: 10, fontSize: 13.5, lineHeight: 1.7 }}>
              💳 <b>{t("ac_plan_active")}:</b> {t("co_plan_name")[subs[ch.channel].plan]} · {t("ac_plan_left")} <b>{subs[ch.channel].months_left}</b> {t("ac_plan_months")}
              <div className="muted" style={{ fontSize: 12.5 }}>{t("ac_plan_note")}</div>
            </div>}
            <div className="row" style={{ gap: 8 }}>
              <Link className="btn" to={`/form?renew=1&email=${encodeURIComponent(data.email)}&channel=${encodeURIComponent(ch.channel)}`} style={{ flex: 1, fontSize: 13, padding: "10px" }}>{subs[ch.channel] ? t("ac_plan_unlock") : t("ac_renew")}</Link>
              {ch.count >= 1 && <Link className="btn ghost" to={`/compare?channel=${encodeURIComponent(ch.channel)}`} style={{ flex: 1, fontSize: 13, padding: "10px" }}>{t("ac_see_growth")}</Link>}
            </div>
            </>}
          </div>;
        })}
          </>;
        })()}

        <Link className="card center" to={`/form?email=${encodeURIComponent(data.email)}`} style={{ color: "var(--blue)", fontWeight: 700, display: "block", border: "1.5px dashed var(--blue)", background: "#F4F8FD" }}>{t("ac_add_channel")}</Link>
        </>}

        {/* คอร์ส/ใบประกาศ/คลาสสด — ไม่แสดงอะไรเลยถ้าลูกค้าคนนั้นยังไม่มี (ลูกค้า Blueprint เห็นหน้าเดิม) */}
        <MyLearning
          channelCount={(data.channels || []).length}
          bookCount={(data.channels || []).reduce((a, ch) => a + (ch.months || []).length, 0)}
          only={showFolders ? folder : null}
          onCounts={setCounts}
        />
        {deleted.length > 0 && (
          <div className="card" style={{ background: "#FDF7EE", border: "1px solid #EFDFC4" }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>🗑️ เล่มที่ลบไป — กู้คืนได้</div>
            <div className="muted" style={{ fontSize: 12.5, margin: "3px 0 10px" }}>เล่มที่ลบยังเก็บไว้ให้ 30 วัน กดกู้กลับมาได้เลยค่ะ</div>
            {deleted.map(b => (
              <div key={b.blueprint_id} className="between" style={{ gap: 8, flexWrap: "wrap", padding: "9px 0", borderTop: "1px solid var(--border)" }}>
                <span>
                  <b style={{ fontSize: 14.5 }}>{String(b.billing_cycle).replace("_", " ")}</b>
                  <span className="muted" style={{ fontSize: 12.5, display: "block" }}>{b.instagram_account} · เหลือเวลากู้อีก {b.days_left} วัน</span>
                </span>
                <button className="btn" onClick={() => restoreBook(b.blueprint_id)} style={{ padding: "8px 16px", fontSize: 13.5 }}>กู้คืนเล่มนี้</button>
              </div>
            ))}
          </div>
        )}

        {/* 🧾 ใบกำกับภาษี — คิมสั่ง 4 ส.ค.
            "เวลาฉันไปขอใบกำกับที่เป็นเมล เขาส่งมาแล้วฉันชอบลืม"
            ตอนที่ต้องใช้จริงคือปิดบัญชีสิ้นปี ห่างจากวันซื้อเป็นเดือน กล่องเมลหาไม่เจอแล้ว
            เมลยังส่งเหมือนเดิม แต่ที่นี่คือที่ที่หาเจอตลอด */}
        {/* 🧾 ใบกำกับภาษี — โฟลเดอร์ของตัวเอง (คิมสั่ง 5 ส.ค.)
            "ลูกค้าไม่ได้เอาใบกำกับแค่งานตัด ของคอร์สกับ Blueprint อีก"
            → รวมทุกสินค้าไว้ที่เดียว + มีช่องค้นหา เพราะคนซื้อเยอะแล้วหาไม่เจอ */}
        {TAX_INVOICE_LIVE && taxInv.length > 0 && (!showFolders || folder === "tax") && (() => {
          const kw = taxQ.trim().toLowerCase();
          const list = !kw ? taxInv : taxInv.filter(v => {
            const d = new Date(v.issued_at || v.created_at);
            const hay = [
              v.description, v.doc_number, v.customer_name, v.order_kind,
              String(Math.round((v.amount_satang || 0) / 100)),
              d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }),
              d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }),
            ].filter(Boolean).join(" ").toLowerCase();
            return hay.includes(kw);
          });
          const sum = list.reduce((a, v) => a + Number(v.amount_satang || 0), 0);
          return <div className="card">
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 2 }}>🧾 ใบกำกับภาษี</div>
            <div className="muted" style={{ fontSize: 13.5, marginBottom: 12, lineHeight: 1.6 }}>
              ทุกครั้งที่ชำระเงิน ระบบออกใบกำกับให้อัตโนมัติและเก็บไว้ที่นี่ — ทั้งเล่ม Blueprint คอร์สเรียน คลาสสด และงานตัดต่อ
            </div>

            {/* ช่องค้นหา — โผล่เมื่อมีหลายใบ ค้นได้ทั้งชื่อรายการ เลขที่ วันที่ และยอดเงิน */}
            {taxInv.length > 3 && (
              <input value={taxQ} onChange={e => setTaxQ(e.target.value)}
                placeholder="🔍 ค้นหา — ชื่อรายการ / เลขที่ / เดือน / ยอดเงิน"
                style={{ width: "100%", padding: "11px 13px", borderRadius: 11, border: "1px solid var(--border)", fontSize: 14, marginBottom: 12 }} />
            )}

            <div className="between muted" style={{ fontSize: 12.5, marginBottom: 9 }}>
              <span>{kw ? `พบ ${list.length} จาก ${taxInv.length} ใบ` : `ทั้งหมด ${taxInv.length} ใบ`}</span>
              <span>รวม ฿{(sum / 100).toLocaleString()}</span>
            </div>

            {list.length === 0 ? (
              <div className="muted center" style={{ fontSize: 13.5, padding: "18px 0" }}>ไม่พบใบที่ค้นหาค่ะ ลองพิมพ์สั้นลงดูนะคะ</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {list.map(v => {
                  const issued = v.status === "issued";
                  return <div key={v.invoice_id} className="between"
                    style={{ gap: 12, flexWrap: "wrap", padding: "12px 14px", background: "var(--soft)", borderRadius: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{v.description || "สินค้า/บริการ"}</div>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                        {new Date(v.issued_at || v.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" })}
                        {" · ฿"}{(Number(v.amount_satang || 0) / 100).toLocaleString()}
                        {v.doc_number ? ` · เลขที่ ${v.doc_number}` : ""}
                        {v.is_company ? " · ในนามบริษัท" : ""}
                      </div>
                    </div>
                    {issued
                      ? <Link className="btn ghost" to={`/invoice/${v.invoice_id}`} style={{ padding: "9px 15px", fontSize: 13.5 }}>ดู / โหลดใบ</Link>
                      : <span className="muted" style={{ fontSize: 12.5 }}>กำลังออกใบให้ค่ะ</span>}
                  </div>;
                })}
              </div>
            )}
          </div>;
        })()}

        {ref && <div className="card" style={{ background: "linear-gradient(135deg,#E4F4F3,#EAF3FD)", border: "1px solid #bfe3df", borderTop: "4px solid #2C8E8C" }}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 2 }}>{t("ac_ref_title")}</div>
          <div className="muted" style={{ fontSize: 13.5, marginBottom: 14, lineHeight: 1.6 }}>{t("ac_ref_desc_a")} <b style={{ color: "#2C8E8C" }}>{t("ac_ref_desc_b")} {ref.percent}% {t("ac_ref_desc_c")}</b> <b style={{ color: "#2C8E8C" }}>{t("ac_ref_desc_d")}</b> {t("ac_ref_desc_e")}</div>
          <div className="row" style={{ marginBottom: 10 }}><input readOnly value={refLink} style={{ flex: 1, fontSize: 13 }} onFocus={e => e.target.select()} /><button className="btn" onClick={copyRef} style={{ padding: "11px 16px", background: "#2C8E8C" }}>{copied === "link" ? t("ac_copied_link") : t("ac_copy_link")}</button></div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn ghost" onClick={copyMsg} style={{ padding: "9px 14px", fontSize: 14 }}>{copied === "msg" ? t("ac_copied_msg") : t("ac_copy_msg")}</button>
            <a className="btn" href={lineShare} target="_blank" rel="noreferrer" style={{ padding: "9px 16px", background: "#06C755", fontSize: 14 }}>{t("ac_share_line")}</a>
            {typeof navigator !== "undefined" && navigator.share && <button className="btn ghost" onClick={shareNative} style={{ padding: "9px 14px", fontSize: 14 }}>{t("ac_share")}</button>}
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>{t("ac_ref_count_pre")} <b style={{ color: "#2C8E8C" }}>{ref.count}</b> {t("ac_people")}{ref.count > 0 ? t("ac_ref_thanks") : ""}</div>
        </div>}
      </>}

      <style>{`
        .fld-wrap { position: relative; }
        .fld-row { display: flex; gap: 14px; overflow-x: auto; padding: 20px 2px 16px; margin-bottom: 6px;
          scroll-behavior: smooth; scrollbar-width: none; }
        .fld-row::-webkit-scrollbar { display: none; }
        /* 🔘 ปุ่มลูกศร — คิมขอ 7 ส.ค. "ขอแค่มีปุ่มที่ทำให้รู้ว่าเลื่อนได้"
           โผล่เฉพาะตอนที่เลื่อนไปทางนั้นได้จริง ไม่งั้นจะเป็นปุ่มหลอก */
        .fld-arrow { position: absolute; top: 46%; transform: translateY(-50%); z-index: 3;
          width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border); background: #fff;
          box-shadow: 0 2px 8px rgba(90,80,110,.18); cursor: pointer; font-size: 15px; line-height: 1;
          display: grid; place-items: center; color: var(--ink); padding: 0; }
        .fld-arrow:hover { background: var(--soft); }
        .fld-arrow.l { left: -6px; } .fld-arrow.r { right: -6px; }
        .fld { flex-shrink: 0; width: 92px; background: none; border: 0; padding: 0; cursor: pointer; font-family: inherit; text-align: center; }
        .fld-body { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: 58px; border-radius: 4px 12px 12px 12px; background: var(--c);
          box-shadow: 0 2px 5px rgba(90,80,110,.10); transition: transform .18s, box-shadow .18s, background .18s; }
        .fld-body::before { content: ""; position: absolute; top: -7px; left: 0; width: 42%; height: 9px;
          background: var(--c); border-radius: 7px 7px 0 0; transition: background .18s; }
        .fld-icon { position: absolute; top: -15px; left: 50%; font-size: 22px; line-height: 1; z-index: 2;
          transform: translateX(-46%) rotate(-7deg); transition: transform .18s; filter: drop-shadow(0 2px 3px rgba(90,80,110,.18)); }
        .fld-n { font-size: 12.5px; font-weight: 800; color: #4a4458; background: rgba(255,255,255,.78); border-radius: 20px; padding: 2px 9px; margin-top: 4px; }
        .fld-label { display: block; margin-top: 8px; font-size: 12.5px; font-weight: 600; color: var(--muted); transition: color .18s; }
        .fld:hover .fld-body { transform: translateY(-2px); }
        .fld:hover .fld-icon, .fld.on .fld-icon { transform: translateX(-46%) rotate(-7deg) translateY(-3px) scale(1.06); }
        .fld.on .fld-body, .fld.on .fld-body::before { background: var(--d); }
        .fld.on .fld-body { transform: translateY(-4px); box-shadow: 0 8px 16px rgba(90,80,110,.20); }
        .fld.on .fld-label { color: var(--ink); font-weight: 800; }
        @media (prefers-reduced-motion: reduce){ .fld-body, .fld-icon { transition: none; } }
      `}</style>
    </div>
  );
}
