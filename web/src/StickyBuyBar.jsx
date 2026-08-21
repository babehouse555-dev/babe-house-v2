// ═══════ 📱 แถบ "จองเลย" ลอยติดขอบล่างจอ — เฉพาะมือถือ ═══════
//
// ⚠️ ทำไมต้องมี (คิมสั่ง 21 ส.ค. 2569):
//    เดิมบนมือถือ กล่องจอง/กล่องซื้ออยู่บนสุด คนเปิดหน้ามาเจอฟอร์มกรอกชื่อทันที
//    ทั้งที่ยังไม่รู้ว่าคลาสสอนอะไร → คิมสั่งย้ายกล่องจองลงไปล่างสุด ใต้รายละเอียดและรีวิว
//    แต่พอย้ายลงล่าง เกิดปัญหาใหม่: คนที่ตัดสินใจแล้วต้องเลื่อนยาวมากกว่าจะเจอปุ่ม
// → แถบนี้แก้ทั้งสองอย่างพร้อมกัน: อ่านเนื้อหาก่อนได้ครบ และปุ่มก็อยู่ในมือตลอดเวลา
//
// 📌 กฎที่ต้องรักษาไว้
//    · โผล่เฉพาะจอ ≤900px — บนคอมกล่องจองลอยอยู่ข้างขวาอยู่แล้ว ไม่ต้องมีแถบนี้
//    · ต้อง "หายไปเอง" เมื่อเลื่อนถึงกล่องจองจริง ไม่งั้นจะบังปุ่มจริงที่อยู่ข้างใต้
//    · เผื่อขอบล่างจอ iPhone (env safe-area) ไม่งั้นปุ่มไปทับแถบของ Safari

import { useEffect, useRef, useState } from "react";

export default function StickyBuyBar({ targetId, price, note, label, disabled }) {
  const [show, setShow] = useState(false);
  const seen = useRef(false);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    // เห็นกล่องจองจริงเมื่อไหร่ → ซ่อนแถบ (กันบังปุ่ม)
    const io = new IntersectionObserver(([e]) => { seen.current = e.isIntersecting; setShow(!e.isIntersecting); },
      { rootMargin: "0px 0px -35% 0px" });
    io.observe(el);
    setShow(true);
    return () => io.disconnect();
  }, [targetId]);

  if (disabled) return null;

  return (
    <>
      <div className="sticky-buy" style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60,
        display: show ? "flex" : "none", alignItems: "center", gap: 12,
        background: "rgba(255,255,255,.97)", borderTop: "1px solid var(--border)",
        backdropFilter: "blur(8px)", padding: "10px 16px",
        paddingBottom: "max(10px, env(safe-area-inset-bottom))",
        boxShadow: "0 -6px 20px rgba(0,0,0,.07)",
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.15 }}>{price}</div>
          {note && <div className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{note}</div>}
        </div>
        <button className="btn" style={{ flexShrink: 0, padding: "11px 22px", fontSize: 15 }}
          onClick={() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          {label}
        </button>
      </div>
      {/* 🛟 ที่ว่างกันชน — สูงเท่าแถบพอดี วางไว้ท้ายหน้าเสมอ
          ต่อให้ตัวซ่อนอัตโนมัติ (IntersectionObserver) ไม่ทำงานบนมือถือรุ่นเก่า
          แถบก็จะไม่มีวันไปทับปุ่ม "จองและชำระเงิน" ที่อยู่ล่างสุด — ห้ามเอาออก */}
      <div className="sticky-buy-pad" style={{ height: 78 }} />
      <style>{`@media (min-width: 901px){ .sticky-buy, .sticky-buy-pad{ display: none !important; } }`}</style>
    </>
  );
}
