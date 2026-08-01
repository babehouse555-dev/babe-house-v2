// 📣 Meta Pixel — บอก Facebook ว่าใครทำอะไรบนเว็บ เพื่อให้มันหา "คนที่ซื้อจริง" ให้เราได้
// Dataset "Babe House Web" (สร้าง 2026-08-01) ผูกกับบัญชีโฆษณา 232067486860198 แล้ว
const PIXEL_ID = "2068902540366518";

let ready = false;
export function initPixel() {
  if (ready || typeof window === "undefined") return;
  try {
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s)
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
    window.fbq("init", PIXEL_ID);
    window.fbq("track", "PageView");
    ready = true;
  } catch (e) { /* ตัวบล็อกโฆษณาบล็อกได้ ไม่ให้พังเว็บ */ }
}

// ส่งเหตุการณ์ — ห้ามทำให้เว็บพังเด็ดขาดถ้า fbq โหลดไม่ขึ้น (ad blocker / เน็ตช้า)
export function track(event, params) {
  try { if (typeof window !== "undefined" && window.fbq) window.fbq("track", event, params || undefined); } catch {}
}

// 💰 ซื้อสำเร็จ — ตัวสำคัญที่สุด ต้องยิง "ครั้งเดียวต่อออเดอร์" เท่านั้น
// ลูกค้ารีเฟรชหน้า /processing บ่อยมากระหว่างรอเล่มเจน ถ้าไม่กันซ้ำ Meta จะนับยอดขายเกินจริง
// แล้วเราจะตัดสินใจเรื่องงบแอดจากตัวเลขที่ผิด
export function trackPurchaseOnce(orderId, valueBaht) {
  if (!orderId) return;
  try {
    const key = "babe_fbq_purchase";
    const done = JSON.parse(localStorage.getItem(key) || "[]");
    if (done.includes(orderId)) return;
    done.push(orderId);
    localStorage.setItem(key, JSON.stringify(done.slice(-50)));
    track("Purchase", { value: Number(valueBaht) || 490, currency: "THB", content_name: "AI Creator Blueprint" });
  } catch {}
}
