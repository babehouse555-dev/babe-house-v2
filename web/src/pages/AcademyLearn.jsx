import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, session, fileToBase64 } from "../api.js";

// หน้าเรียนคอร์ส — วิดีโอ + ติ๊กจบบท + แถบความคืบหน้า + ส่งการบ้านให้ AI ตรวจ
// สิทธิ์: ลูกค้าที่ซื้อคอร์สนี้ (ออเดอร์ Close) ผ่าน session OTP · แอดมินพรีวิวได้ทุกคอร์ส
const BLUE = "var(--blue)";

// แปลงลิงก์ YouTube ทุกทรง → embed URL (watch?v= / youtu.be / shorts / playlist)
// ใช้โดเมน youtube-nocookie + ปิดคลิปแนะนำท้ายคลิป (กันคนเลื่อนออกไปช่องอื่น) + ปิดคีย์ลัด
function toEmbed(url) {
  const u = String(url || "").trim();
  if (!u) return null;
  const opts = "rel=0&modestbranding=1&disablekb=1&playsinline=1";
  let m = u.match(/[?&]v=([A-Za-z0-9_-]{6,})/); if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?${opts}`;
  m = u.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/); if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?${opts}`;
  m = u.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/); if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?${opts}`;
  m = u.match(/[?&]list=([A-Za-z0-9_-]+)/); if (m) return `https://www.youtube-nocookie.com/embed/videoseries?list=${m[1]}&${opts}`;
  if (u.includes("/embed/")) return u;
  return u; // ไม่รู้จักทรง — ลองใส่ iframe ตรงๆ
}
// ดึงเฉพาะรหัสคลิปออกมา (ใช้กับ player ของเราเอง)
function ytId(url) {
  const u = String(url || "").trim(); if (!u) return null;
  const pats = [/[?&]v=([A-Za-z0-9_-]{6,})/, /youtu\.be\/([A-Za-z0-9_-]{6,})/,
                /youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/, /\/embed\/([A-Za-z0-9_-]{6,})/];
  for (const p of pats) { const m = u.match(p); if (m) return m[1]; }
  return null;
}
const mmss = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// ═══════ 🎬 เครื่องเล่นของเราเอง — ไม่มีโลโก้ YouTube ═══════
// คิมทัก 7 ส.ค.: "มันไม่มีวิธีไหนที่จะไม่ขึ้นยูทูปหรอ ไม่มี logo youtube ขึ้นเลย"
// ⚠️ ทำไมต้องสร้างปุ่มเอง: YouTube เลิกให้ผลของ modestbranding แล้ว ใส่ไปก็ยังขึ้นโลโก้
//    ทางเดียวคือปิดแถบควบคุมของเขา (controls=0) แล้วเราทำปุ่มเล่น/หยุด/เลื่อนเอง
// 🔒 หมายเหตุ: นี่คือ "ซ่อนแบรนด์" ไม่ใช่ "ป้องกันคลิป" — คนที่ตั้งใจยังหาไอดีคลิปจาก source ได้
//    ถ้าต้องการกันจริงต้องย้ายไปโฮสต์วิดีโอที่คิดเงิน (Vimeo/Cloudflare Stream)
function CleanPlayer({ videoId, lessonKey }) {
  const boxRef = useRef(null), playerRef = useRef(null);
  const [ready, setReady] = useState(false), [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0), [dur, setDur] = useState(0), [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false, tick = null;
    // โหลดสคริปต์ของ YouTube ครั้งเดียว แล้วใช้ซ้ำทุกบทเรียน
    const load = () => new Promise((res, rej) => {
      if (window.YT && window.YT.Player) return res(window.YT);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev && prev(); res(window.YT); };
      if (!document.getElementById("yt-api")) {
        const s = document.createElement("script");
        s.id = "yt-api"; s.src = "https://www.youtube.com/iframe_api"; s.onerror = rej;
        document.head.appendChild(s);
      }
      setTimeout(() => (window.YT && window.YT.Player) ? res(window.YT) : rej(new Error("timeout")), 8000);
    });
    load().then(YT => {
      if (dead || !boxRef.current) return;
      playerRef.current = new YT.Player(boxRef.current, {
        videoId, host: "https://www.youtube-nocookie.com",
        playerVars: { controls: 0, rel: 0, modestbranding: 1, disablekb: 1, fs: 0, playsinline: 1, iv_load_policy: 3 },
        events: {
          onReady: (e) => { if (dead) return; setReady(true); setDur(e.target.getDuration() || 0); },
          onStateChange: (e) => { if (!dead) setPlaying(e.data === YT.PlayerState.PLAYING); },
        },
      });
      tick = setInterval(() => {
        const p = playerRef.current;
        if (p && p.getCurrentTime) { setCur(p.getCurrentTime() || 0); if (!dur) setDur(p.getDuration() || 0); }
      }, 400);
    }).catch(() => !dead && setFailed(true));
    return () => { dead = true; if (tick) clearInterval(tick); try { playerRef.current?.destroy(); } catch {} };
  }, [videoId, lessonKey]);   // eslint-disable-line

  const toggle = () => { const p = playerRef.current; if (!p) return; playing ? p.pauseVideo() : p.playVideo(); };
  const seek = (e) => {
    const p = playerRef.current; if (!p || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    p.seekTo(((e.clientX - r.left) / r.width) * dur, true);
  };
  // 🖥️ เต็มจอ — คิมแจ้ง 7 ส.ค. "ขยายจอใหญ่ไม่ได้"
  //    ของเดิมอ้าง boxRef.current?.parentElement แต่ YT.Player "แทนที่" div ตัวนั้นด้วย iframe ของมันเอง
  //    boxRef.current เลยกลายเป็นโหนดที่หลุดจากหน้าเว็บ parentElement = null → กดแล้วเงียบ
  //    → จับกรอบไว้ตั้งแต่ตอน mount จาก overlay ที่ไม่โดนแทนที่
  const wrapRef = useRef(null);
  const full = () => {
    const el = wrapRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); return; }
    (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el)?.catch?.(() => {});
  };

  // โหลด API ไม่ได้ (เน็ตบล็อก/adblock) → ถอยไปใช้ iframe ปกติ ดีกว่าจอดำ
  if (failed) return <iframe src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`}
    title="บทเรียน" style={{ width: "100%", height: "100%", border: 0 }}
    allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />;

  const pct = dur ? (cur / dur) * 100 : 0;
  return (
    <>
      <div ref={boxRef} style={{ width: "100%", height: "100%", pointerEvents: "none" }} />
      {/* ชั้นทับทั้งจอ — คลิกที่ไหนก็เล่น/หยุด และคลิกไม่ทะลุไปโดน UI ของ YouTube */}
      <div ref={wrapRef} onClick={toggle} onDoubleClick={full} onContextMenu={e => e.preventDefault()}
        style={{ position: "absolute", inset: 0, cursor: "pointer" }} />
      {!playing && ready && (
        <div onClick={toggle} style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", cursor: "pointer" }}>
          <div style={{ width: 84, height: 84, borderRadius: "50%", background: "rgba(255,255,255,.94)",
            display: "grid", placeItems: "center", boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}>
            <div style={{ width: 0, height: 0, marginLeft: 7, borderTop: "17px solid transparent",
              borderBottom: "17px solid transparent", borderLeft: "27px solid #16202b" }} />
          </div>
        </div>)}
      {/* แถบควบคุมของเรา */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "10px 14px 12px",
        background: "linear-gradient(transparent,rgba(0,0,0,.75))", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={toggle} aria-label={playing ? "หยุด" : "เล่น"}
          style={{ background: "none", border: 0, color: "#fff", fontSize: 19, cursor: "pointer", lineHeight: 1, padding: 0 }}>
          {playing ? "❚❚" : "▶"}
        </button>
        <div onClick={seek} style={{ flex: 1, height: 16, display: "flex", alignItems: "center", cursor: "pointer" }}>
          <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,.34)", borderRadius: 3 }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "#fff", borderRadius: 3 }} />
          </div>
        </div>
        <span style={{ color: "#fff", fontSize: 12.5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {mmss(cur)} / {mmss(dur)}
        </span>
        <button onClick={full} aria-label="เต็มจอ"
          style={{ background: "none", border: 0, color: "#fff", fontSize: 16, cursor: "pointer", padding: 0 }}>⛶</button>
      </div>
    </>
  );
}
// คลิปตัดต่อจัดเต็มเกิน 100MB ได้ง่ายๆ (คิมบอกเอง) → ไฟล์ใหญ่ส่งแบบ multipart เขียนลงดิสก์ที่เซิร์ฟเวอร์
// รูปเล็กยังส่งแบบเดิม (ย่อ+บีบในเบราว์เซอร์แล้ว จะได้เก็บไว้โชว์เป็นผลงานได้)
const MAX_MB = 200;
const INLINE_MB = 8;   // เล็กกว่านี้ส่งแบบ JSON (เก็บรูปลง DB ได้) · ใหญ่กว่านี้ส่งเป็นไฟล์

export default function AcademyLearn() {
  const [sp] = useSearchParams();
  const courseId = sp.get("course") || "";
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [cur, setCur] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("lessons");
  const [hw, setHw] = useState(null);
  const adminKey = localStorage.getItem("babe_admin_key") || "";

  useEffect(() => {
    if (!courseId) { setErr({ code: "NO_COURSE" }); return; }
    api(`/api/academy/learn/${courseId}`, { token: session.token || undefined, adminKey: adminKey || undefined })
      .then(d => { setData(d); const first = (d.lessons || []).findIndex(l => !l.done); setCur(first >= 0 ? first : 0); })
      .catch(e => setErr(e));
    if (session.token) api(`/api/academy/homework/${courseId}`, { token: session.token }).then(setHw).catch(() => {});
  }, [courseId]);

  async function reloadHw() { try { setHw(await api(`/api/academy/homework/${courseId}`, { token: session.token })); } catch {} }

  async function mark(lesson, done) {
    if (adminKey && !session.token) return; // โหมดพรีวิวแอดมิน ไม่บันทึก progress
    setBusy(true);
    try {
      const r = await api("/api/academy/progress", { method: "POST", token: session.token, body: { course_id: courseId, lesson_id: lesson.id, done } });
      setData(p => ({ ...p, cert_id: r.cert_id || p.cert_id, cert_blocked_by: r.cert_blocked_by, lessons: p.lessons.map(l => l.id === lesson.id ? { ...l, done } : l) }));
    } catch {}
    setBusy(false);
  }

  // บันทึกว่าเปิดดูบทไหน (ใช้จับพฤติกรรมแชร์บัญชี — ไม่กระทบการใช้งาน)
  function noteView(lesson) {
    if (!session.token || !lesson) return;
    api("/api/academy/lesson-view", { method: "POST", token: session.token, body: { course_id: courseId, lesson_id: lesson.id } }).catch(() => {});
  }

  if (err) return (
    <div className="wrap narrow page-pad center" style={{ minHeight: "60vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontSize: 44 }}>🔒</div>
      <h2 style={{ fontSize: 20, margin: "10px 0 6px" }}>{err.code === "NOT_OWNED" ? "คุณยังไม่ได้ซื้อคอร์สนี้ค่ะ" : err.code === "NO_COURSE" ? "ไม่พบคอร์สที่เลือก" : "กรุณาเข้าสู่ระบบก่อนนะคะ"}</h2>
      <p className="muted" style={{ marginBottom: 18 }}>{err.code === "LOGIN_REQUIRED" || err.status === 401 ? "เข้าสู่ระบบด้วยอีเมลที่ใช้ซื้อคอร์ส แล้วกลับมาเรียนได้เลยค่ะ" : ""}</p>
      <div><Link className="btn" to="/account">ไปหน้าเข้าสู่ระบบ</Link> <Link className="btn ghost" to="/academy" style={{ marginLeft: 6 }}>ดูคอร์สทั้งหมด</Link></div>
    </div>
  );
  if (!data) return <div className="wrap narrow page-pad center"><p className="muted">กำลังโหลด...</p></div>;

  const lessons = data.lessons || [];
  const doneN = lessons.filter(l => l.done).length;
  const pct = lessons.length ? Math.round(doneN / lessons.length * 100) : 0;
  const lesson = lessons[cur];
  const embed = lesson ? toEmbed(lesson.url) : null;
  const asgs = hw?.assignments || [];
  const hwLeft = asgs.filter(a => a.required && a.my?.status !== "passed").length;
  const allDone = pct === 100 && lessons.length > 0;

  return (
    <div style={{ minHeight: "100vh" }}>
      {adminKey && !session.token && <div style={{ background: "#fff7cf", color: "#7a5b00", textAlign: "center", fontSize: 13, padding: "7px 12px", fontWeight: 700 }}>🚧 โหมดพรีวิวแอดมิน — ดูได้ทุกคอร์ส · ไม่บันทึกความคืบหน้า</div>}

      <div className="wrap" style={{ paddingTop: 22, paddingBottom: 50 }}>
        <Link to="/academy" className="muted" style={{ fontSize: 13.5 }}>← คอร์สทั้งหมด</Link>
        <h1 className="serif" style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, margin: "8px 0 10px" }}>{data.course.name}</h1>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{ flex: 1, height: 10, background: "var(--soft)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: BLUE, borderRadius: 6, transition: "width .3s" }} />
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: BLUE, whiteSpace: "nowrap" }}>{doneN}/{lessons.length} บท · {pct}%</div>
        </div>

        {allDone && (
          data.cert_id ? (
            <Celebration certId={data.cert_id} courseName={data.course.name} />
          ) : hwLeft > 0 ? (
            <div className="card" style={{ background: "#fff7e6", border: "1px solid #f0d9a0", borderRadius: 14, textAlign: "center", color: "#8a6d1f" }}>
              <b>เหลืออีกนิดเดียว!</b> ดูครบทุกบทแล้ว ส่งการบ้านอีก {hwLeft} ชิ้นให้ผ่าน แล้วรับประกาศนียบัตรได้เลยค่ะ
              <div style={{ marginTop: 10 }}><button className="btn" onClick={() => setTab("homework")} style={{ padding: "9px 18px" }}>📝 ไปส่งการบ้าน</button></div>
            </div>
          ) : null
        )}

        {asgs.length > 0 && (
          <div style={{ display: "flex", gap: 8, margin: "0 0 14px" }}>
            {[["lessons", `🎬 บทเรียน (${lessons.length})`], ["homework", `📝 การบ้าน (${asgs.length})${hwLeft ? ` · เหลือ ${hwLeft}` : " ✓"}`]].map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)} style={{ border: `1.5px solid ${tab === v ? BLUE : "var(--border)"}`, background: tab === v ? BLUE : "#fff", color: tab === v ? "#fff" : "var(--ink)", borderRadius: 20, padding: "7px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>{l}</button>
            ))}
          </div>
        )}

        {tab === "homework" ? (
          <Homework assignments={asgs} courseId={courseId} onDone={reloadHw} onCert={id => setData(p => ({ ...p, cert_id: id || p.cert_id }))} />
        ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 18, alignItems: "start" }} className="learn-grid">
          <div>
            {/* 🔒 ลายน้ำอีเมลผู้เรียนทับบนคลิป — อัดจอไปแจกก็รู้ว่าใครทำ (กันการอัดจอ 100% ไม่ได้ แต่ทำให้ไม่คุ้มที่จะทำ) */}
            <div style={{ position: "relative", aspectRatio: "16/9", background: "#000", borderRadius: 14, overflow: "hidden" }}
                 onContextMenu={e => e.preventDefault()}>
              {/* 🎬 คลิป YouTube → ใช้เครื่องเล่นของเราเอง ไม่มีโลโก้/ปุ่ม "ดูใน YouTube"
                  คลิปที่ไม่ใช่ YouTube (ถ้ามีในอนาคต) ยังใช้ iframe เดิมได้ */}
              {ytId(lesson?.url)
                ? <CleanPlayer key={lesson.id} videoId={ytId(lesson.url)} lessonKey={lesson.id} />
                : embed
                  ? <iframe key={lesson.id} src={embed} title={lesson.name} style={{ width: "100%", height: "100%", border: 0 }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                  : <div style={{ color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 14 }}>บทนี้ยังไม่มีวิดีโอ</div>}
              {data.watermark && embed && <Watermark text={data.watermark} />}
            </div>
            {lesson && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, fontSize: 15.5 }}>{cur + 1}. {lesson.name} {lesson.time && <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· {lesson.time}</span>}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {!lesson.done
                    ? <button className="btn" disabled={busy} onClick={() => { mark(lesson, true); if (cur < lessons.length - 1) { setCur(cur + 1); noteView(lessons[cur + 1]); } }} style={{ padding: "9px 16px" }}>✓ เรียนจบบทนี้{cur < lessons.length - 1 ? " · ไปบทต่อไป" : ""}</button>
                    : <button className="btn ghost" disabled={busy} onClick={() => mark(lesson, false)} style={{ padding: "9px 16px" }}>↺ ยกเลิกติ๊กจบ</button>}
                </div>
              </div>
            )}
            <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>🔒 วิดีโอในคอร์สเป็นลิขสิทธิ์ของ Babe House Academy สำหรับผู้เรียนท่านนี้เท่านั้น — ห้ามบันทึกหน้าจอ ทำซ้ำ หรือเผยแพร่ต่อ</p>
          </div>

          <div className="card" style={{ margin: 0, borderRadius: 14, padding: "14px 14px", maxHeight: "70vh", overflowY: "auto" }}>
            <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 10 }}>บทเรียน ({lessons.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {lessons.map((l, i) => (
                <button key={l.id} onClick={() => { setCur(i); noteView(l); }} style={{ display: "flex", gap: 9, alignItems: "flex-start", textAlign: "left", background: i === cur ? "var(--soft)" : "none", border: 0, borderRadius: 9, padding: "8px 9px", cursor: "pointer", fontSize: 13.5, lineHeight: 1.45 }}>
                  <span style={{ color: l.done ? "#1a7f43" : "#c7c7cf", fontWeight: 800, flexShrink: 0 }}>{l.done ? "✓" : "○"}</span>
                  <span style={{ fontWeight: i === cur ? 700 : 400 }}>{i + 1}. {l.name}{l.time ? <span className="muted"> · {l.time}</span> : null}</span>
                </button>
              ))}
              {!lessons.length && <div className="muted" style={{ fontSize: 13 }}>คอร์สนี้ยังไม่มีบทเรียนในระบบ</div>}
            </div>
          </div>
        </div>
        )}
      </div>
      <style>{`@media (max-width: 860px){ .learn-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

/* 🎉 หน้าจบคอร์ส — ถ้วยรางวัล + พลุ (คิมบอกว่าของเดิมดูจืดไป)
   พลุวาดด้วย CSS ล้วน ไม่โหลดไลบรารีเพิ่ม เว็บไม่หนักขึ้น */
function Celebration({ certId, courseName }) {
  const bits = Array.from({ length: 26 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: (i % 9) * 0.28,
    dur: 2.6 + (i % 5) * 0.45,
    color: ["#2E86DE", "#FFC93C", "#FF7AA2", "#4ED8A0", "#B084F5"][i % 5],
    w: 6 + (i % 3) * 3,
    rot: (i * 53) % 360,
  }));
  return (
    <div className="card" style={{ position: "relative", overflow: "hidden", textAlign: "center", borderRadius: 18,
      background: "linear-gradient(160deg,#EAF3FD 0%,#FDF2F8 55%,#FFF9E8 100%)", border: "1px solid #d6e7fa", padding: "30px 20px 26px" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {bits.map((b, i) => (
          <span key={i} style={{ position: "absolute", top: -14, left: `${b.left}%`, width: b.w, height: b.w * 1.6,
            background: b.color, borderRadius: 2, opacity: .9, transform: `rotate(${b.rot}deg)`,
            animation: `bhFall ${b.dur}s linear ${b.delay}s infinite` }} />
        ))}
      </div>
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 62, lineHeight: 1, animation: "bhPop .7s cubic-bezier(.2,1.4,.4,1) both" }}>🏆</div>
        <h2 className="serif" style={{ fontSize: "clamp(21px,3.4vw,28px)", fontWeight: 800, margin: "12px 0 6px", color: "#1a7f43" }}>
          ยินดีด้วยค่ะ! เรียนจบแล้ว 🎉
        </h2>
        <p style={{ fontSize: 14.5, lineHeight: 1.8, margin: "0 auto 18px", maxWidth: 460, color: "var(--ink)" }}>
          คุณเรียน <b>{courseName}</b> จบครบทุกบทแล้ว<br />
          ครูพี่คิมภูมิใจด้วยจริงๆ นะคะ — ประกาศนียบัตรของคุณพร้อมแล้ว
        </p>
        <Link className="btn" to={`/academy/certificate/${certId}`} style={{ padding: "12px 26px", fontSize: 15.5 }}>🎓 เปิดประกาศนียบัตรของฉัน</Link>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>เก็บไว้ในบัญชีของคุณตลอด กลับมาโหลดใหม่ได้ทุกเมื่อ</div>
      </div>
      <style>{`
        @keyframes bhFall { 0%{transform:translateY(0) rotate(0);opacity:0} 10%{opacity:.95} 100%{transform:translateY(320px) rotate(540deg);opacity:0} }
        @keyframes bhPop { 0%{transform:scale(.3) rotate(-18deg);opacity:0} 100%{transform:scale(1) rotate(0);opacity:1} }
        @media (prefers-reduced-motion: reduce){ span[style*="bhFall"]{ animation: none !important; opacity: 0 !important; } }
      `}</style>
    </div>
  );
}

// ลายน้ำที่ขยับตำแหน่งช้าๆ — ครอปทิ้งทีเดียวไม่ได้ ต้องครอปทั้งคลิป
function Watermark({ text }) {
  const [pos, setPos] = useState({ top: "8%", left: "6%" });
  useEffect(() => {
    const spots = [{ top: "8%", left: "6%" }, { top: "8%", left: "58%" }, { top: "82%", left: "6%" }, { top: "82%", left: "58%" }, { top: "45%", left: "34%" }];
    let i = 0;
    const t = setInterval(() => { i = (i + 1) % spots.length; setPos(spots[i]); }, 22000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ position: "absolute", ...pos, pointerEvents: "none", color: "rgba(255,255,255,.34)", fontSize: 12, fontWeight: 600,
      textShadow: "0 1px 3px rgba(0,0,0,.6)", transition: "top 1.5s, left 1.5s", userSelect: "none", maxWidth: "40%", wordBreak: "break-all" }}>
      {text}
    </div>
  );
}

/* ══════════ การบ้าน — ส่งงาน ครูพี่คิม (AI) ตรวจให้ทันที ══════════ */
function Homework({ assignments, courseId, onDone, onCert }) {
  return (
    <div>
      <div className="card" style={{ borderRadius: 14, background: "#f7fbff", border: `1px solid ${BLUE}33` }}>
        <div style={{ fontSize: 14, lineHeight: 1.8 }}>
          📝 <b>ส่งงานแล้วรู้ผลเลย</b> — ครูพี่คิมจะดูงานให้แล้วบอกว่าทำอะไรได้ดี และควรปรับตรงไหน
          ส่งผ่านครบทุกชิ้นเมื่อไหร่ ประกาศนียบัตรจะออกให้อัตโนมัติค่ะ · ส่งใหม่ได้ไม่จำกัดครั้ง
        </div>
      </div>
      {assignments.map(a => <HomeworkItem key={a.assignment_id} a={a} courseId={courseId} onDone={onDone} onCert={onCert} />)}
    </div>
  );
}

function HomeworkItem({ a, courseId, onDone, onCert }) {
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const [allowMkt, setAllowMkt] = useState(false);
  const fileRef = useRef(null);
  const my = a.my;
  const accept = a.submit_type === "image" ? "image/*" : a.submit_type === "video" ? "video/*" : "image/*,video/*";

  async function send(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const mb = f.size / 1024 / 1024;
    if (mb > MAX_MB) { setMsg(`ไฟล์ใหญ่ ${mb.toFixed(0)}MB เกินไปค่ะ (รับไม่เกิน ${MAX_MB}MB) — ลองบีบไฟล์หรือตัดให้สั้นลงนะคะ`); return; }
    const isImg = /^image\//.test(f.type || "");
    setSending(true);
    setMsg(mb > 40 ? `กำลังอัปไฟล์ ${mb.toFixed(0)}MB... ไฟล์ใหญ่อาจใช้เวลาหลายนาที อย่าเพิ่งปิดหน้านี้นะคะ`
                   : "กำลังส่งให้ครูพี่คิมตรวจ... คลิปอาจใช้เวลาสัก 1-2 นาที รอสักครู่นะคะ");
    try {
      let r;
      if (isImg && mb <= INLINE_MB) {
        // รูป → ย่อ/บีบก่อนแล้วส่งแบบเดิม (เก็บไว้โชว์เป็นผลงานได้)
        const dataUrl = await fileToBase64(f);
        r = await api("/api/academy/homework/submit", { method: "POST", token: session.token,
          body: { course_id: courseId, assignment_id: a.assignment_id, file: dataUrl, mime: f.type, allow_marketing: allowMkt } });
      } else {
        // คลิป/ไฟล์ใหญ่ → ส่งเป็นไฟล์จริง ไม่แปลงเป็นข้อความ (ไม่งั้นไฟล์บวม 1.37 เท่าและกินแรม)
        const fd = new FormData();
        fd.append("course_id", courseId);
        fd.append("assignment_id", a.assignment_id);
        fd.append("allow_marketing", String(allowMkt));
        fd.append("file", f, f.name);
        const res = await fetch("/api/academy/homework/submit-file", {
          method: "POST", headers: { Authorization: "Bearer " + session.token }, body: fd,
        });
        r = await res.json().catch(() => ({}));
        if (!res.ok || r.ok === false) throw new Error(r.message || "ส่งไม่สำเร็จ ลองใหม่อีกครั้งนะคะ");
      }
      setMsg("");
      if (r.cert_id) onCert?.(r.cert_id);
      await onDone?.();
    } catch (e2) { setMsg(e2.message || "ส่งไม่สำเร็จ ลองใหม่อีกครั้งนะคะ"); }
    setSending(false);
  }

  const st = my?.status;
  const badge = st === "passed" ? <span className="tag on">✅ ผ่านแล้ว</span>
    : st === "revise" ? <span className="tag off">↩️ ให้แก้แล้วส่งใหม่</span>
    : st === "reviewing" ? <span className="tag">⏳ รอครูตรวจ</span> : null;

  return (
    <div className="card" style={{ borderRadius: 14 }}>
      <div className="between" style={{ gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{a.seq}. {a.title}</h3>
        <div>{badge}{!a.required && <span className="muted" style={{ fontSize: 12.5, marginLeft: 6 }}>(ไม่บังคับ)</span>}</div>
      </div>
      {a.brief && <p style={{ fontSize: 14, lineHeight: 1.8, margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{a.brief}</p>}

      {my?.ai && (
        <div style={{ marginTop: 14, background: st === "passed" ? "#e8f7ee" : "#fff7e6", border: `1px solid ${st === "passed" ? "#9ed3b0" : "#f0d9a0"}`, borderRadius: 12, padding: "13px 15px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: st === "passed" ? "#1a7f43" : "#8a6d1f" }}>
            {st === "passed"
              ? `✅ ผ่านแล้วค่ะ! ยินดีด้วยนะคะ${my.score ? ` · ${my.score} คะแนน` : ""}`
              : `↩️ ยังไม่ผ่าน ลองแก้แล้วส่งใหม่นะคะ${my.score ? ` · ${my.score} คะแนน` : ""}`}
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.85, margin: "7px 0 0" }}>{my.ai.summary}</p>
          {my.ai.strengths?.length > 0 && <>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 10 }}>สิ่งที่ทำได้ดี</div>
            <ul style={{ margin: "4px 0 0", paddingLeft: 20, fontSize: 13.5, lineHeight: 1.8 }}>{my.ai.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
          {my.ai.improvements?.length > 0 && <>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 10 }}>ลองปรับตรงนี้</div>
            <ul style={{ margin: "4px 0 0", paddingLeft: 20, fontSize: 13.5, lineHeight: 1.8 }}>{my.ai.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
          {my.ai.what_to_fix && st !== "passed" && <p style={{ fontSize: 13.5, marginTop: 10, lineHeight: 1.8 }}><b>ส่งใหม่โดย:</b> {my.ai.what_to_fix}</p>}
          {my.ai.next_step && <p style={{ fontSize: 13.5, marginTop: 10, lineHeight: 1.8, fontStyle: "italic" }}>💡 {my.ai.next_step}</p>}
        </div>
      )}
      {my?.teacher_note && <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.8, background: "var(--soft)", borderRadius: 10, padding: "10px 13px" }}><b>ครูพี่คิมฝากไว้:</b> {my.teacher_note}</div>}

      <div style={{ marginTop: 14 }}>
        {/* ขออนุญาตก่อนเอาผลงานไปโปรโมต — ห้ามเอาไปใช้เงียบๆ ต่อให้เป็นลูกค้าเรา */}
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, lineHeight: 1.6, marginBottom: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={allowMkt} onChange={e => setAllowMkt(e.target.checked)} style={{ width: "auto", marginTop: 3 }} />
          <span>อนุญาตให้ Babe House นำผลงานชิ้นนี้ไปโปรโมตได้ <span className="muted">(ไม่ติ๊กก็ส่งงานได้ตามปกติค่ะ)</span></span>
        </label>
        <input ref={fileRef} type="file" accept={accept} onChange={send} style={{ display: "none" }} />
        <button className={st === "passed" ? "btn ghost" : "btn"} disabled={sending} onClick={() => fileRef.current?.click()} style={{ padding: "10px 18px" }}>
          {sending ? "กำลังตรวจ..." : st ? "ส่งงานใหม่อีกครั้ง" : `📤 ส่ง${a.submit_type === "image" ? "รูป" : a.submit_type === "video" ? "คลิป" : "รูป/คลิป"}งาน`}
        </button>
        <span className="muted" style={{ fontSize: 12.5, marginLeft: 10 }}>ไฟล์ไม่เกิน {MAX_MB}MB</span>
      </div>
      {msg && <div className="msg" style={{ marginTop: 10, background: sending ? "#f7f7f8" : "#fdeaea", color: sending ? "var(--ink)" : "#b3261e" }}>{msg}</div>}
    </div>
  );
}
