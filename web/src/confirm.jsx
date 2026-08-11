import { useEffect, useState } from "react";

// ═══════ กล่องยืนยันของเราเอง — ใช้แทน window.confirm ทั้งเว็บ ═══════
//
// ⚠️ ทำไมต้องมี: window.confirm ถูกปิดได้ และปิดแล้วไม่มีสัญญาณอะไรบอกเลย
//    • Chrome ขึ้นช่อง "ไม่ต้องแสดงกล่องโต้ตอบอีก" ให้ติ๊ก — ติ๊กครั้งเดียวโดนทั้งโดเมน ตลอดไป
//    • เบราว์เซอร์ในไลน์ / IG / Facebook บล็อกตั้งแต่แรก
//    พอกล่องไม่ขึ้น confirm() คืน false ทันที = ระบบเข้าใจว่า "กดยกเลิก" → ปุ่มเงียบ ไม่มี error ให้ตามด้วย
//    คิมเจอเอง 11 ส.ค. 2569: กดส่งรอบแก้ในหน้าลูกค้าแล้วไม่มีอะไรเกิดขึ้นเลย
//
// วิธีใช้:  if (!(await askConfirm("ลบเลยไหมคะ?"))) return;
//          หรือ  await askConfirm({ title: "ลบโค้ดนี้?", detail: "ออเดอร์เก่าไม่กระทบ", ok: "ลบเลย", danger: true })
//
// ต้องมี <ConfirmHost /> วางไว้ที่ main.jsx ครั้งเดียว (วางแล้ว)

let openConfirm = null;   // ตัวเชื่อมไปยัง ConfirmHost ที่ mount อยู่

export function askConfirm(arg) {
  const o = typeof arg === "string" ? { title: arg } : (arg || {});
  // ถ้ายังไม่มี ConfirmHost (เช่นถูกเรียกก่อนหน้าเว็บพร้อม) — ยอมให้ผ่าน ดีกว่าค้างไม่มีอะไรเกิดขึ้น
  if (!openConfirm) return Promise.resolve(true);
  return openConfirm(o);
}

export function ConfirmHost() {
  const [state, setState] = useState(null);   // { opts, resolve }

  useEffect(() => {
    openConfirm = (opts) => new Promise(resolve => setState({ opts, resolve }));
    return () => { openConfirm = null; };
  }, []);

  // ปิดด้วยปุ่ม Esc ได้ = ตอบว่า "ไม่"
  useEffect(() => {
    if (!state) return;
    const onKey = (e) => { if (e.key === "Escape") done(false); if (e.key === "Enter") done(true); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });   // ผูกใหม่ทุกรอบ เพื่อให้ done ชี้ไป state ปัจจุบันเสมอ

  function done(v) { if (!state) return; state.resolve(v); setState(null); }
  if (!state) return null;

  const o = state.opts;
  // ข้อความหลายบรรทัดที่เขียนด้วย \n (ของเดิมที่ย้ายมาจาก window.confirm) ต้องขึ้นบรรทัดให้ถูก
  const lines = String(o.title || "").split("\n");
  const head = lines[0];
  const rest = [...lines.slice(1), ...String(o.detail || "").split("\n")].filter(x => x.trim());

  return (
    <div onClick={() => done(false)}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(20,16,30,.45)",
               display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
        style={{ background: "#fff", borderRadius: 18, padding: "20px 20px 18px", width: "100%", maxWidth: 400,
                 boxShadow: "0 20px 60px rgba(0,0,0,.28)", fontFamily: "inherit" }}>
        <div style={{ fontSize: 16.5, fontWeight: 800, lineHeight: 1.5 }}>{head}</div>
        {rest.length > 0 && (
          <div style={{ fontSize: 13.5, lineHeight: 1.8, color: "#6b6470", marginTop: 8 }}>
            {rest.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          <button autoFocus onClick={() => done(true)}
            style={{ flex: "1 1 140px", whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit",
                     background: o.danger ? "#c0392b" : "#2E86DE", color: "#fff", border: 0,
                     borderRadius: 999, padding: "12px 18px", fontSize: 15, fontWeight: 700 }}>
            {o.ok || "ยืนยัน"}
          </button>
          <button onClick={() => done(false)}
            style={{ flex: "1 1 110px", whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit",
                     background: "#fff", color: "#2f2a26", border: "1px solid #ddd2c8",
                     borderRadius: 999, padding: "12px 18px", fontSize: 15, fontWeight: 600 }}>
            {o.cancel || "ยกเลิก"}
          </button>
        </div>
      </div>
    </div>
  );
}
