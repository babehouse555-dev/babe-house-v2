import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { api, session } from "../api.js";
import TaxInvoiceBox, { validateTax } from "../TaxInvoiceBox.jsx";
import { TAX_INVOICE_LIVE } from "../config.js";
import LoginBox from "../LoginBox.jsx";

// หน้ารายละเอียดคอร์ส — อ่านก่อน ตัดสินใจก่อน แล้วค่อยซื้อ (ตาม feedback คิม: ไม่เอาปุ่มซื้อโดดใส่หน้าแรก)
const BLUE = "var(--blue)";

// แปลงลิงก์ YouTube (คลิปเดี่ยว / เพลย์ลิสต์ / youtu.be) → ลิงก์ฝังที่เล่นในหน้าเราได้เลย
// ไม่ใช่ YouTube (เช่น TikTok, ไดรฟ์) คืน null → หน้าเว็บจะแสดงเป็นลิงก์กดออกไปแทน
function ytEmbed(url) {
  const u = String(url || "");
  const list = u.match(/[?&]list=([\w-]+)/);
  if (list) return `https://www.youtube.com/embed/videoseries?list=${list[1]}`;
  const v = u.match(/[?&]v=([\w-]{11})/) || u.match(/youtu\.be\/([\w-]{11})/) || u.match(/youtube\.com\/embed\/([\w-]{11})/);
  return v ? `https://www.youtube.com/embed/${v[1]}` : null;
}
// ดึงรหัสรีล Instagram จากลิงก์ (รองรับทั้ง /reel/ /reels/ /p/ /tv/) → เอาไปฝังเล่นในหน้าได้เลย
const igCode = (u) => (String(u || "").match(/instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/) || [])[1] || null;

export default function AcademyCourse() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const [mine, setMine] = useState(null);
  const [buying, setBuying] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [code, setCode] = useState("");
  const [promo, setPromo] = useState(null);   // {percent, final} หลังกดใช้โค้ด
  const [codeMsg, setCodeMsg] = useState("");
  const [tax, setTax] = useState(null);   // 🧾 ใบกำกับในนามบริษัท (null = ไม่ได้ขอ)
  const [stuName, setStuName] = useState("");   // 🎓 ชื่อ-นามสกุลที่จะขึ้นบนเกียรติบัตร

  useEffect(() => {
    api(`/api/academy/course/${id}`).then(setD).catch(() => setErr(true));
    if (session.token) api("/api/academy/my-courses", { token: session.token }).then(r => setMine(r.courses || [])).catch(() => {});
  }, [id]);

  async function checkCode(amountSatang) {
    const c = code.trim();
    if (!c) { setPromo(null); setCodeMsg(""); return; }
    setCodeMsg("กำลังตรวจ...");
    try {
      const r = await api("/api/promo/preview", { method: "POST", body: { code: c, amount_satang: amountSatang } });
      setPromo(r); setCodeMsg(r.percent >= 100 ? "🎉 โค้ดนี้เรียนฟรีเลยค่ะ!" : `✅ ใช้ได้ ลด ${r.percent}%`);
    } catch (e) { setPromo(null); setCodeMsg(e.message || "โค้ดไม่ถูกต้องค่ะ"); }
  }

  async function buy() {
    // 🔐 ยังไม่ล็อกอิน → เปิดกล่องล็อกอินตรงนี้เลย ไม่พาออกไปหน้าบัญชี
    //    เดิมโยนไป /account ลูกค้าล็อกอินเสร็จต้องเดินกลับมาหาคอร์สนี้เอง = หลุดกลางทางเยอะ
    //    (เจอตอนตรวจก่อนเปิดขายคอร์ส 13 ส.ค. 69 — เส้นนี้คือเส้นซื้อหลักของสินค้าที่เพิ่งเปิด)
    if (!session.token) { setShowLogin(true); return; }
    const bad = validateTax(tax);          // 🧾 เก็บก่อนจ่าย ใบออกทันทีที่เงินเข้า แก้ทีหลังไม่ได้
    if (bad) { alert(bad); return; }
    // 🎓 ชื่อบนเกียรติบัตร — ต้องถามตอนนี้ เพราะใบออกอัตโนมัติตอนเรียนจบ แก้ทีหลังไม่ได้
    const nm = stuName.trim();
    if (nm.length < 2) { alert("กรอกชื่อ-นามสกุลสำหรับเกียรติบัตรด้วยนะคะ"); return; }
    setBuying(true);
    try {
      const r = await api("/api/academy/buy", { method: "POST", token: session.token, body: { course_id: id, code: code.trim() || undefined, tax, student_name: nm } });
      window.location.href = r.free ? r.redirect_url : r.checkout_url;
    }
    catch (e) { alert(e.message || "ลองใหม่อีกครั้งนะคะ"); setBuying(false); }
  }

  if (err) return <div className="wrap narrow page-pad center"><p className="muted">ไม่พบคอร์สนี้ค่ะ</p><Link className="btn ghost" to="/academy">← คอร์สทั้งหมด</Link></div>;
  if (!d) return <div className="wrap narrow page-pad center"><p className="muted">กำลังโหลด...</p></div>;

  const c = d.course;
  const owned = (mine || []).some(m => m.id === c.id);
  // แยก "ตัวอย่างบทเรียน" (preview) ออกจาก "รีวิวผู้เรียน" (clip/work/quote) — คนละบทบาทกันในการตัดสินใจซื้อ
  const previews = (d.showcase || []).filter(s => s.kind === "preview");
  const reviews = (d.showcase || []).filter(s => s.kind !== "preview");
  const sale = c.flag_sale && c.price_sale > 0;
  const finalPrice = sale ? c.price_sale : c.price;

  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="wrap" style={{ paddingTop: 22, paddingBottom: 60 }}>
        <Link to="/academy" className="muted" style={{ fontSize: 13.5 }}>← คอร์สทั้งหมด</Link>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 24, alignItems: "start", marginTop: 12 }} className="course-grid">
          <div>
            <div style={{ fontSize: 13, color: BLUE, fontWeight: 700, marginBottom: 6 }}>{c.category}</div>
            <h1 className="serif" style={{ fontSize: "clamp(22px,3.4vw,30px)", fontWeight: 800, lineHeight: 1.3, margin: "0 0 12px" }}>{c.name}</h1>
            {c.image && <div style={{ borderRadius: 16, overflow: "hidden", marginBottom: 18 }}><img src={c.image} alt="" style={{ width: "100%", display: "block" }} onError={e => { e.target.parentNode.style.display = "none"; }} /></div>}

            {c.detail && <div className="card" style={{ borderRadius: 16 }}>
              <h3 style={{ fontSize: 16, margin: "0 0 8px" }}>คอร์สนี้เรียนอะไร</h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.85, margin: 0, whiteSpace: "pre-wrap" }}>{c.detail}</p>
            </div>}

            <div className="card" style={{ borderRadius: 16 }}>
              <h3 style={{ fontSize: 16, margin: "0 0 10px" }}>บทเรียนในคอร์ส ({d.lessons.length})</h3>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 2.1 }}>
                {d.lessons.map((l, i) => <li key={i}>{l.name}{l.time ? <span className="muted"> · {l.time}</span> : null}</li>)}
              </ol>
            </div>

            {/* 🎬 ตัวอย่างบทเรียน — เล่นได้ในหน้าเลย ไม่ต้องกดออกไปที่อื่น
                (คนตัดสินใจซื้อคอร์สจากการได้เห็นสไตล์การสอนจริง มากกว่าอ่านคำบรรยาย) */}
            {previews.length > 0 && <div className="card" style={{ borderRadius: 16 }}>
              <h3 style={{ fontSize: 16, margin: "0 0 4px" }}>🎬 ดูตัวอย่างการสอนก่อนตัดสินใจ</h3>
              <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>คลิปตัวอย่างจากในคอร์สจริง</p>
              {/* YouTube = จอกว้าง 16:9 · Instagram Reel = การ์ดทรงรีลเลื่อนดูได้ (แบบเดียวกับหน้าเวิร์กช็อป) */}
              {previews.filter(s => ytEmbed(s.url)).map((s, i, arr) => (
                <div key={"yt" + i} style={{ position: "relative", paddingTop: "56.25%", borderRadius: 12, overflow: "hidden", background: "#000", marginBottom: i < arr.length - 1 ? 12 : 0 }}>
                  <iframe src={ytEmbed(s.url)} title={s.caption || "ตัวอย่างบทเรียน"} loading="lazy" allowFullScreen
                    allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />
                </div>
              ))}
              {(() => {
                const reels = previews.map(s => ({ ...s, code: igCode(s.url) })).filter(s => s.code && !ytEmbed(s.url));
                if (!reels.length) return null;
                return (
                  <div className="rv-row" style={{ marginTop: previews.some(s => ytEmbed(s.url)) ? 12 : 0 }}>
                    {reels.map((s, i) => (
                      <div key={s.code} className="rv-box">
                        <iframe src={`https://www.instagram.com/reel/${s.code}/embed`}
                          title={s.caption || `ตัวอย่างที่ ${i + 1}`} loading="lazy" scrolling="no" frameBorder="0" allowFullScreen />
                      </div>
                    ))}
                  </div>
                );
              })()}
              {previews.filter(s => !ytEmbed(s.url) && !igCode(s.url)).map((s, i) => (
                <a key={"lk" + i} className="link" href={s.url} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 14, padding: "10px 0" }}>
                  ▶️ {s.caption || "ดูตัวอย่างบทเรียน"}
                </a>
              ))}
              <style>{`
                .rv-row { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 8px;
                  scroll-snap-type: x proximity; -webkit-overflow-scrolling: touch; }
                .rv-row::-webkit-scrollbar { height: 7px; }
                .rv-row::-webkit-scrollbar-thumb { background: #d9d5e2; border-radius: 20px; }
                .rv-box { --w: 150px; --scale: 0.46; flex: 0 0 auto; scroll-snap-align: start;
                  position: relative; width: var(--w); height: 296px; border-radius: 12px;
                  overflow: hidden; background: var(--soft); border: 1px solid var(--border); }
                .rv-box iframe { width: 326px; height: 640px; border: 0; display: block;
                  transform: scale(var(--scale)); transform-origin: top left; }
                @media (max-width: 420px) { .rv-box { --w: 132px; --scale: 0.405; height: 262px; } }
              `}</style>
            </div>}

            {/* ⭐ รีวิว/ผลงานนักเรียน — ช่วยให้คนตัดสินใจซื้อง่ายขึ้น (คิมใส่ลิงก์เองในหน้าแอดมิน) */}
            {reviews.length > 0 && <div className="card" style={{ borderRadius: 16 }}>
              <h3 style={{ fontSize: 16, margin: "0 0 4px" }}>เสียงจากคนที่เรียนจริง</h3>
              <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>{reviews.length} รีวิว</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {reviews.map((s, i) => s.kind === "quote" ? (
                  <div key={i} style={{ background: "var(--soft)", borderRadius: 12, padding: "12px 15px" }}>
                    <div style={{ fontSize: 14, lineHeight: 1.8 }}>“{s.caption}”</div>
                    {s.student_name && <div className="muted" style={{ fontSize: 12.5, marginTop: 5 }}>— {s.student_name}</div>}
                  </div>
                ) : (
                  <a key={i} className="link" href={s.url} target="_blank" rel="noreferrer"
                     style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid var(--border)", borderRadius: 12, padding: "11px 14px", textDecoration: "none" }}>
                    <span style={{ fontSize: 20 }}>{s.kind === "work" ? "🎨" : "▶️"}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, display: "block" }}>{s.caption || (s.kind === "work" ? "ผลงานนักเรียน" : "คลิปรีวิวจากผู้เรียน")}</span>
                      {s.student_name && <span className="muted" style={{ fontSize: 12.5 }}>{s.student_name}</span>}
                    </span>
                  </a>
                ))}
              </div>
            </div>}

            {c.instructor && <div className="card" style={{ borderRadius: 16, display: "flex", gap: 14, alignItems: "center" }}>
              {c.instructor_image && <img src={c.instructor_image} alt="" style={{ width: 54, height: 54, borderRadius: "50%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />}
              <div>
                <div className="muted" style={{ fontSize: 12.5 }}>ผู้สอน</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{c.instructor}</div>
                {c.instructor_detail && <div className="muted" style={{ fontSize: 13 }}>{c.instructor_detail}</div>}
              </div>
            </div>}
          </div>

          <div className="card" style={{ borderRadius: 18, position: "sticky", top: 76, margin: 0 }}>
            <div style={{ fontSize: 30, fontWeight: 800 }}>
              {sale ? <><span style={{ color: BLUE }}>฿{c.price_sale.toLocaleString()}</span> <span className="muted" style={{ fontSize: 15, textDecoration: "line-through", fontWeight: 400 }}>฿{c.price.toLocaleString()}</span></> : <>฿{c.price.toLocaleString()}</>}
            </div>
            <div className="muted" style={{ fontSize: 13, margin: "4px 0 14px" }}>จ่ายครั้งเดียว · เรียนซ้ำได้ไม่จำกัด</div>
            {/* ⚠️ ช่องโค้ดต้องอยู่ "เหนือ" ปุ่มจ่ายเงินเสมอ — ถ้าอยู่ใต้ปุ่ม ลูกค้าจะกดจ่ายไปก่อนโดยไม่ทันเห็น
                (คิมเจอเองตอนเทสต์: "กดเข้าไปแล้วมันหายจ่ายเงินเลย ไหนปุ่มใส่โค้ด") */}
            {/* 🎓 ชื่อบนเกียรติบัตร — ต้องถามตอนซื้อ เพราะใบออกอัตโนมัติทันทีที่เรียนจบ แก้ทีหลังไม่ได้
                (เดิมไม่ถาม เลยไปตัดอีเมลมาใช้ ได้ใบที่เขียนว่า "babehouse555" เอาไปอวดไม่ได้ — คิมทัก 7 ส.ค.) */}
            {!owned && session.token && <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 5 }}>ชื่อ-นามสกุล (สำหรับเกียรติบัตร)</label>
              <input value={stuName} onChange={e => setStuName(e.target.value)} placeholder="เช่น กัญจน์ชญา อาจหาญ"
                     style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 9, fontSize: 14, fontFamily: "inherit" }} />
              <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>ชื่อนี้จะขึ้นบนเกียรติบัตรตอนเรียนจบ กรอกให้ถูกนะคะ แก้ทีหลังไม่ได้ค่ะ</div>
            </div>}
            {!owned && <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <input value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setPromo(null); setCodeMsg(""); }} placeholder="มีโค้ดส่วนลด? ใส่ตรงนี้"
                       style={{ flex: 1, minWidth: 0, padding: "9px 11px", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13.5, fontFamily: "inherit", textTransform: "uppercase" }} />
                <button className="btn ghost" onClick={() => checkCode(finalPrice * 100)} style={{ padding: "9px 14px", fontSize: 13.5, whiteSpace: "nowrap" }}>ใช้โค้ด</button>
              </div>
              {codeMsg && <div style={{ fontSize: 12.5, marginTop: 6, color: promo ? "#1a7f43" : "#b3261e" }}>{codeMsg}</div>}
            </div>}
            {!owned && promo && <div style={{ background: "#e8f7ee", border: "1px solid #9ed3b0", borderRadius: 10, padding: "9px 12px", marginBottom: 10, fontSize: 13.5, color: "#1a7f43", fontWeight: 700 }}>
              ราคาหลังใช้โค้ด: {promo.final <= 0 ? "ฟรี!" : `฿${(promo.final / 100).toLocaleString()}`}
            </div>}
            {!owned && session.token && TAX_INVOICE_LIVE && <TaxInvoiceBox onChange={setTax} />}
            {owned
              ? <Link className="btn full" to={`/academy/learn?course=${c.id}`} style={{ textAlign: "center" }}>เข้าเรียน →</Link>
              : showLogin && !session.token
                ? <LoginBox title="เข้าสู่ระบบก่อนสมัครเรียนนะคะ"
                    hint={<>ใช้อีเมลที่เคยซื้อกับเราได้เลย — <b>เข้าเสร็จอยู่หน้าคอร์สนี้ต่อ ไม่ต้องเดินกลับมาใหม่ค่ะ</b></>}
                    onDone={() => setShowLogin(false)} />
                : <button className="btn full" disabled={buying} onClick={buy}>{buying ? "กำลังไปหน้าชำระเงิน..." : session.token ? (promo?.final <= 0 ? "เริ่มเรียนเลย (ฟรี)" : "สมัครเรียนคอร์สนี้") : "🔐 เข้าสู่ระบบ แล้วสมัครเรียน"}</button>}
            <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, fontSize: 13.5, lineHeight: 2 }}>
              <li>✓ เรียนได้ทันทีหลังชำระเงิน</li>
              <li>✓ {d.lessons.length} บทเรียน · ดูซ้ำได้ตลอด</li>
              <li>✓ ติดตามความคืบหน้าการเรียน</li>
              <li>✓ ประกาศนียบัตรเมื่อเรียนจบ</li>
              <li>✓ ชำระผ่านบัตร / พร้อมเพย์</li>
            </ul>
          </div>
        </div>
      </div>
      {/* มือถือ: ดันกล่องราคา+ปุ่มสมัครขึ้นมาไว้บนสุด ไม่งั้นต้องเลื่อนผ่านรายละเอียดยาวมากกว่าจะเจอปุ่มซื้อ */}
      <style>{`@media (max-width: 900px){ .course-grid{ grid-template-columns: 1fr !important; } .course-grid > .card{ position: static !important; order: -1; } }`}</style>
    </div>
  );
}
