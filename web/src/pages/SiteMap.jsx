import { useState } from "react";
import { api } from "../api.js";
import { ACADEMY_LIVE } from "../config.js";

// 🗺️ แผนผังเว็บทั้งหมด — คิมขอ 2 ส.ค.: "อยากเห็นภาพรวมเว็บทั้งหมด ตอนนี้มันกระจัดกระจายไปหมด
// ทุกอย่างแยกคนละหน้า ฉันไม่เห็นอะไรเลย แล้วมันทำให้ฉันงง"
// หน้านี้ = สารบัญของทุกหน้าที่มีอยู่จริง + บอกว่าลูกค้าเห็นไหม + กดเข้าไปดูได้เลย

const LIVE = { k: "live", label: "เปิดใช้จริง", tone: "#1a7f43", bg: "#E8F5EE", note: "ลูกค้าเข้าถึงได้ตอนนี้" };
const HIDDEN = { k: "hidden", label: "สร้างเสร็จ แต่ปิดอยู่", tone: "#C77700", bg: "#FDF3E4", note: "โค้ดพร้อมแล้ว รอเปิดสวิตช์" };
const DRAFT = { k: "draft", label: "ร่าง", tone: "#7C5CE6", bg: "#F3EFFC", note: "ยังทำไม่เสร็จ ลูกค้าไม่เห็น" };
const STAFF = { k: "staff", label: "ของคิม/ทีม", tone: "#2E86DE", bg: "#EAF3FC", note: "ต้องใช้รหัสถึงเข้าได้" };

const GROUPS = [
  {
    name: "Blueprint — แผนคอนเทนต์ 490", emoji: "📘", color: "#C7DEF0",
    flow: "ลูกค้าเห็นโฆษณา → หน้าแรก → กรอกฟอร์ม → จ่ายเงิน → รอเจน → เปิดเล่ม",
    pages: [
      ["/", "หน้าแรก (หน้าขาย)", "หน้าที่ลูกค้าเจอก่อนใคร ปุ่ม 'เริ่มสร้าง Blueprint'", LIVE],
      ["/form", "ฟอร์มกรอกข้อมูลช่อง", "ช่อง IG · ธุรกิจ · เป้าหมาย · แนบรูป Insight (อัปได้ 8 รูป)", LIVE],
      ["/checkout", "หน้าจ่ายเงิน", "ใส่โค้ดส่วนลดได้ตรงนี้ (อยู่เหนือปุ่มจ่าย)", LIVE],
      ["/processing", "หน้ารอ AI ทำเล่ม", "โชว์ความคืบหน้าระหว่างเจน", LIVE],
      ["/dashboard", "เล่ม 30 วัน", "หัวใจของสินค้า — 3 แท็บ: กลยุทธ์ · 30 วัน · มาราธอน", LIVE],
      ["/compare", "หน้าเทียบการโต", "ซื้อเดือนที่ 2 ขึ้นไปถึงจะมีข้อมูลเทียบ", LIVE],
      ["/video-audit", "ตรวจคลิปด้วย AI", "สินค้าเสริม ลูกค้าอัปคลิปให้ AI วิจารณ์", LIVE],
    ],
  },
  {
    name: "Academy — คอร์สเรียน", emoji: "🎓", color: "#DDCCEE",
    flow: "เมนู 'คอร์สเรียน' → เลือกคอร์ส → จ่ายเงิน → เข้าเรียน → ส่งการบ้าน → รับใบประกาศ",
    pages: [
      ["/academy", "หน้ารวมคอร์สทั้งหมด", "17 คอร์สที่เปิดขาย + ช่องค้นหา", ACADEMY_LIVE ? LIVE : HIDDEN],
      ["/academy/course/1", "หน้ารายละเอียดคอร์ส", "ราคา · บทเรียน · ผลงานนักเรียน · ปุ่มซื้อ", ACADEMY_LIVE ? LIVE : HIDDEN],
      ["/academy/learn", "หน้าเรียน", "ดูวิดีโอ · ติ๊กจบบท · ส่งการบ้าน (อัปได้ถึง 200MB)", ACADEMY_LIVE ? LIVE : HIDDEN],
      ["/academy/certificate/1", "ใบประกาศนียบัตร", "ออกอัตโนมัติเมื่อเรียนครบ + ส่งการบ้านผ่าน", ACADEMY_LIVE ? LIVE : HIDDEN],
    ],
  },
  {
    name: "Workshop — คลาสสด", emoji: "🎟️", color: "#F3D6B6",
    flow: "เมนู 'คลาสสด' → เลือกคลาส → เลือกรอบวันที่ → จ่ายเงิน → ได้อีเมลยืนยัน",
    pages: [
      ["/workshop", "หน้ารวมคลาสสด", "10 คลาสพร้อมรีวิว — ⚠️ ยังไม่มีรอบวันเรียน คิมต้องใส่วันที่ก่อน", ACADEMY_LIVE ? LIVE : HIDDEN],
      ["/workshop/1", "หน้าจองคลาส", "เลือกรอบ · นับที่นั่งเรียลไทม์ · ใส่โค้ดส่วนลด · จ่ายเงิน", ACADEMY_LIVE ? LIVE : HIDDEN],
    ],
  },
  {
    name: "Club — สมาชิกรายเดือน 199", emoji: "🩵", color: "#CFE3D6",
    flow: "ยังไม่เชื่อมกับหน้าไหนเลย — ต้องตัดสินใจว่าลูกค้าจะเจอจากตรงไหน",
    pages: [
      ["/plans", "หน้าเทียบแพ็กเกจ", "Blueprint 490 ครั้งเดียว vs Club 199/เดือน", DRAFT],
      ["/club", "หน้ารายงาน Club", "ตัวอย่างเนื้อหารายเดือน — คิมสั่งให้รื้อทำใหม่เป็นโฟลเดอร์แยก", DRAFT],
    ],
  },
  {
    name: "บัญชีลูกค้า", emoji: "👤", color: "#EED9C4",
    flow: "ลูกค้า login ด้วยอีเมล → เห็นของทุกอย่างที่ซื้อไว้",
    pages: [
      ["/account", "บัญชีของฉัน (ตัวจริง)", "รวมทุกอย่างที่ลูกค้าซื้อ — แผน · คอร์ส · ใบประกาศ · คลาสสด", LIVE],
      ["/preview/account", "ตัวอย่างหน้าบัญชีแบบใหม่", "โฟลเดอร์พาสเทล — รอคิมบอกว่าเอาไหม", DRAFT],
      ["/privacy", "นโยบายความเป็นส่วนตัว", "ต้องมีตามกฎหมาย PDPA", LIVE],
    ],
  },
  {
    name: "ของคิมและทีม", emoji: "🔑", color: "#D6D2EC",
    flow: "ต้องใช้รหัสถึงเข้าได้ · ลูกค้าไม่มีทางเจอ",
    pages: [
      ["/admin", "หลังบ้าน", "ยอดขาย · ลูกค้า · คุณภาพเล่ม · โค้ดส่วนลด · จัดการคอร์ส/เวิร์กช็อป", STAFF],
      ["/projects", "ห้องทำงาน", "8 โปรเจค · งานที่ทำต่อ · ที่ลงไอเดีย", STAFF],
      ["/production", "หน้าขายงาน Production", "รับผลิตคอนเทนต์ให้แบรนด์", LIVE],
    ],
  },
];

export default function SiteMap() {
  const [key, setKey] = useState(localStorage.getItem("babe_admin_key") || "");
  const [authed, setAuthed] = useState(false);
  const [err, setErr] = useState("");
  const isPlay = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  const login = async (k) => {
    try { await api("/api/admin/overview", { adminKey: k }); localStorage.setItem("babe_admin_key", k); setAuthed(true); }
    catch { setErr("รหัสไม่ถูกค่ะ" + (isPlay ? " (ในสนามเด็กเล่นใช้ play)" : "")); }
  };
  if (!authed) return (
    <div className="wrap narrow page-pad" style={{ maxWidth: 420 }}>
      <h1 className="page">แผนผังเว็บ</h1>
      <input value={key} onChange={e => setKey(e.target.value)} placeholder={isPlay ? "รหัส: play" : "ADMIN_KEY"}
             style={{ width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 12, border: "1px solid var(--border)" }} />
      {err && <div style={{ color: "#c00", fontSize: 13, marginTop: 8 }}>{err}</div>}
      <button className="btn full" style={{ marginTop: 10 }} onClick={() => login(key)}>เข้าดู</button>
    </div>
  );

  const all = GROUPS.flatMap(g => g.pages);
  const n = (s) => all.filter(p => p[3].k === s).length;

  return (
    <div className="wrap page-pad" style={{ maxWidth: 980 }}>
      <div className="brand">BABE HOUSE · แผนผังเว็บ</div>
      <h1 className="page" style={{ marginBottom: 6 }}>ทั้งเว็บมีอะไรบ้าง</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
        ทุกหน้าที่มีอยู่จริง <b>{all.length} หน้า</b> · กดชื่อหน้าเพื่อเปิดดูได้เลย
      </p>

      <div className="sm-legend">
        {[LIVE, HIDDEN, DRAFT, STAFF].map(s => (
          <span key={s.k} className="sm-chip" style={{ background: s.bg, color: s.tone }}>
            {s.label} · {n(s.k)}
          </span>
        ))}
      </div>

      {!ACADEMY_LIVE && (
        <div className="card" style={{ marginTop: 0, marginBottom: 18, background: "#FDF3E4", border: "1px solid #F0DCC4" }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 5 }}>⚠️ ทำไมลูกค้าหาหน้าจองเวิร์กช็อปไม่เจอ</div>
          <div style={{ fontSize: 14, lineHeight: 1.75 }}>
            หน้าคอร์สเรียนกับหน้าจองคลาสสด <b>สร้างเสร็จและใช้งานได้จริงแล้ว</b> — แต่ตอนนี้ <b>สวิตช์เปิดตัวยังปิดอยู่</b>
            เมนูด้านบนเลยไม่โผล่ ลูกค้าจึงไม่มีทางกดเข้าไปเจอ (เข้าได้ทางเดียวคือพิมพ์ที่อยู่เว็บเอง)
            <br /><br />
            พอคิมสั่งเปิด → เมนู <b>"คอร์สเรียน"</b> และ <b>"คลาสสด"</b> จะโผล่ขึ้นบนสุดของทุกหน้าพร้อมกันทันที
          </div>
        </div>
      )}

      {GROUPS.map(g => (
        <div key={g.name} className="card" style={{ marginTop: 0, marginBottom: 16, borderLeft: `5px solid ${g.color}` }}>
          <div style={{ fontWeight: 800, fontSize: 16.5 }}>{g.emoji} {g.name}</div>
          <div className="sm-flow">{g.flow}</div>
          {g.pages.map(([path, title, desc, st]) => (
            <div key={path} className="sm-row">
              <a href={path} target="_blank" rel="noreferrer" className="sm-title">{title}</a>
              <span className="sm-badge" style={{ background: st.bg, color: st.tone }}>{st.label}</span>
              <div className="sm-desc">{desc}</div>
              <code className="sm-path">{path}</code>
            </div>
          ))}
        </div>
      ))}

      <style>{`
        .sm-legend { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 18px; }
        .sm-chip { font-size: 12.5px; font-weight: 800; border-radius: 20px; padding: 5px 12px; }
        .sm-flow { font-size: 12.5px; color: #6b6577; background: var(--soft); border-radius: 9px;
          padding: 8px 11px; margin: 9px 0 4px; line-height: 1.6; }
        .sm-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; padding: 11px 0; border-top: 1px solid var(--border); }
        .sm-title { grid-column: 1; font-weight: 700; font-size: 14.5px; color: var(--blue); text-decoration: none; }
        .sm-title:hover { text-decoration: underline; }
        .sm-badge { grid-column: 2; grid-row: 1; font-size: 11px; font-weight: 800; border-radius: 20px; padding: 3px 9px; white-space: nowrap; align-self: start; }
        .sm-desc { grid-column: 1 / -1; font-size: 13px; color: #5d5a68; line-height: 1.6; }
        .sm-path { grid-column: 1 / -1; font-size: 11.5px; color: #9a94a6; }
      `}</style>
    </div>
  );
}
