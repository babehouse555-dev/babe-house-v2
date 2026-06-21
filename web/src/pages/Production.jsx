import { useState } from "react";
import { Link } from "react-router-dom";

const LINE_WORK = { id: "@babehouse_work", url: "https://line.me/ti/p/0yBlh9zXFl" };

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
  const [pack, setPack] = useState("");
  const [addons, setAddons] = useState([]);
  const [f, setF] = useState({ footage: "", voice: "", ref: "", note: "", contact: "", needIdea: false });
  const [sent, setSent] = useState(false);
  const upd = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }));
  const toggleAddon = (a) => setAddons(s => s.includes(a) ? s.filter(x => x !== a) : [...s, a]);

  const briefText = () => [
    "📋 บรีฟงาน Babe House Production",
    pack && `แพ็กที่สนใจ: ${pack}`,
    addons.length && `บริการเสริม: ${addons.join(", ")}`,
    f.footage && `ลิงก์ฟุตเทจ: ${f.footage}`,
    f.voice && `ลิงก์เสียงพากย์: ${f.voice}`,
    f.ref && `คลิป ref: ${f.ref}`,
    f.note && `อยากได้แบบ: ${f.note}`,
    f.needIdea && "• อยากให้ทีมช่วยคิดคอนเซ็ปต์ให้",
    f.contact && `ติดต่อกลับ: ${f.contact}`,
  ].filter(Boolean).join("\n");

  function submitBrief() {
    const txt = briefText();
    try { navigator.clipboard?.writeText(txt); } catch {}
    setSent(true);
    window.location.href = `https://line.me/R/msg/text/?${encodeURIComponent(txt)}`;
  }

  return (
    <div className="wrap narrow page-pad">
      <div className="between"><span className="brand">BABE HOUSE · PRODUCTION</span><Link className="link" to="/">← หน้าแรก</Link></div>
      <h1 className="page">🎬 ไม่มีเวลาทำเอง? ให้ทีมเราทำให้</h1>
      <p className="sub">ตัดต่อ · คิดคอนเทนต์ · กราฟิก · อนิเมชัน — ดูผลงานจริงก่อนตัดสินใจได้เลยค่ะ</p>

      {PORTFOLIO.map((cat, ci) => <div key={ci} style={{ marginBottom: 22 }}>
        <h3 style={{ margin: "0 0 12px", color: cat.color[1] }}>{cat.title}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 }}>
          {cat.items.map((it, i) => it.yt
            ? <a key={i} href={`https://www.youtube.com/watch?v=${it.yt}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", display: "block", background: "#000" }}>
                <div style={{ position: "relative", aspectRatio: "16/9", background: `#000 center/cover url(https://img.youtube.com/vi/${it.yt}/hqdefault.jpg)` }}>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ background: "rgba(0,0,0,.55)", color: "#fff", width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>▶</span></div>
                </div>
                {it.tag && <div style={{ background: "#fff", color: cat.color[1], fontSize: 11.5, fontWeight: 700, padding: "6px 9px" }}>{it.tag}</div>}
              </a>
            : <a key={i} href={it.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: cat.color[1], background: cat.color[0], borderRadius: 12, padding: "18px 12px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 96, fontWeight: 700 }}>
                <span style={{ fontSize: 26 }}>{it.plat === "TikTok" ? "🎵" : it.plat === "Instagram" ? "📸" : "📁"}</span>
                <span style={{ fontSize: 13 }}>▶ ดูบน {it.plat}</span>
              </a>)}
        </div>
      </div>)}

      <div className="card" style={{ borderTop: "4px solid #3F6BAE" }}>
        <h3 style={{ marginBottom: 4 }}>📦 สนใจให้ทีมทำให้? เลือกแพ็กแล้วเล่าบรีฟ</h3>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>คลิปสั้น TikTok · ทุกแพ็กรวม ตัดต่อ + คิดคอนเทนต์ + กราฟิก + ปรึกษารายเดือน · แก้ฟรี 2 ครั้ง/คลิป</p>

        <label style={{ fontSize: 13.5, fontWeight: 700, display: "block", marginBottom: 8 }}>แพ็กที่สนใจ</label>
        <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          {PACKS.map(([p, c]) => <button key={p} type="button" onClick={() => setPack(p)} style={{ flex: "1 1 90px", border: `1.5px solid ${pack === p ? "var(--blue)" : "var(--border)"}`, background: pack === p ? "#EAF3FD" : "#fff", color: pack === p ? "var(--blue-d)" : "var(--ink)", borderRadius: 12, padding: "12px 8px", cursor: "pointer", fontWeight: 700 }}>{p}<div className="muted" style={{ fontSize: 12, fontWeight: 500 }}>{c}</div></button>)}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {["ถ่ายวิดีโอให้", "Voice พากย์เสียง"].map(a => <button key={a} type="button" onClick={() => toggleAddon(a)} style={{ border: `1px solid ${addons.includes(a) ? "var(--blue)" : "var(--border)"}`, background: addons.includes(a) ? "#EAF3FD" : "#fff", color: addons.includes(a) ? "var(--blue-d)" : "var(--ink)", borderRadius: 20, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{addons.includes(a) ? "✓ " : "+ "}{a}</button>)}
        </div>

        <div className="field"><label>ลิงก์ Google Drive — ฟุตเทจ (วิดีโอดิบ)</label><input value={f.footage} onChange={upd("footage")} placeholder="วางลิงก์ หรือเว้นว่างถ้าอยากให้ทีมไปถ่ายให้" /></div>
        <div className="field"><label>ลิงก์ Drive — เสียงพากย์ <span className="muted">(ถ้ามี)</span></label><input value={f.voice} onChange={upd("voice")} placeholder="วางลิงก์ หรือเว้นว่าง" /></div>
        <div className="field"><label>ลิงก์คลิป ref ที่อยากได้แนวนี้</label><input value={f.ref} onChange={upd("ref")} placeholder="วางลิงก์คลิปตัวอย่าง" /></div>
        <div className="field"><label>อยากได้แบบไหน + ไฟล์วางตรงไหน</label><textarea value={f.note} onChange={upd("note")} style={{ minHeight: 64 }} placeholder="เช่น อยากได้ซับใหญ่ จังหวะสนุก / โฟลเดอร์ A คือคลิปเปิด, B คือรีวิว" /></div>
        <label className="row" style={{ fontSize: 13.5, gap: 8, marginBottom: 12 }}><input type="checkbox" style={{ width: 18, height: 18 }} checked={f.needIdea} onChange={e => setF(v => ({ ...v, needIdea: e.target.checked }))} /> ยังไม่มีไอเดีย — ให้ทีมช่วยคิดคอนเซ็ปต์ให้</label>
        <div className="field"><label>ชื่อ/ช่องทางติดต่อกลับ</label><input value={f.contact} onChange={upd("contact")} placeholder="เช่น ชื่อเล่น + เบอร์ หรือ IG" /></div>

        <div className="msg" style={{ background: "#EAF3FD", color: "var(--blue-d)", fontSize: 12.5, lineHeight: 1.6, margin: "4px 0 14px" }}>⏱️ ใช้แพ็กได้ภายใน 6 เดือน · เฉลี่ยส่งงานวันละ 1 คลิป (ไม่รวมวันหยุด) เมื่อได้ไฟล์ครบ · ราคาขึ้นกับงาน — ทีมจะยืนยันใบเสนอราคา + เก็บมัดจำ 50% (เอเจนซี = วางบิลเครดิตเทอม 30/45 วัน)</div>

        <button type="button" onClick={submitBrief} className="btn full" style={{ background: "#06C755", boxShadow: "0 8px 22px rgba(6,199,85,.28)", fontSize: 15.5 }}>📋 ส่งบรีฟ + คุยกับทีมทาง LINE →</button>
        {sent && <div className="msg" style={{ background: "#eef7f0", color: "#1a7f43", marginTop: 10 }}>✓ คัดลอกบรีฟให้แล้ว — เลือกแชต <b>{LINE_WORK.id}</b> แล้วกดส่งใน LINE ได้เลยค่ะ (ถ้า LINE ไม่เด้ง กดปุ่มเพิ่มเพื่อนด้านล่าง แล้ววางข้อความ)</div>}
        <div className="center" style={{ marginTop: 10 }}><a href={LINE_WORK.url} target="_blank" rel="noreferrer" className="link" style={{ fontSize: 13.5, fontWeight: 700 }}>+ เพิ่มเพื่อนทีม Production ({LINE_WORK.id})</a></div>
      </div>
    </div>
  );
}
