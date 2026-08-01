// fetch helper + auth/session/referral utils
const BASE = import.meta.env.VITE_API_BASE || "";

export async function api(path, { method = "GET", body, token, adminKey } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = "Bearer " + token;
  if (adminKey) headers["x-admin-key"] = adminKey;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) { const e = new Error(data.message || `Request failed: ${res.status}`); e.code = data.error; e.status = res.status; e.data = data; throw e; }
  return data;
}

export const baht = (satang) => (satang / 100).toLocaleString("en-US") + "฿";
export const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

export const session = {
  get token() { return localStorage.getItem("babe_session_token"); },
  get email() { return localStorage.getItem("babe_session_email"); },
  set(token, email) { localStorage.setItem("babe_session_token", token); localStorage.setItem("babe_session_email", email); },
  clear() { localStorage.removeItem("babe_session_token"); localStorage.removeItem("babe_session_email"); }
};

// เก็บโค้ดแนะนำเพื่อนจาก ?ref
export function captureRef() {
  const r = new URLSearchParams(location.search).get("ref");
  if (r) localStorage.setItem("babe_ref", r);
  captureSource();
}
export const getRef = () => localStorage.getItem("babe_ref") || undefined;

// 📣 จำว่าลูกค้าคนนี้มาจากไหน (ครั้งแรกที่เข้าเว็บเท่านั้น — ไม่ทับของเดิม)
// Facebook/Instagram ต่อ ?fbclid= มาให้ทุกคลิกจากแอดอยู่แล้ว → รู้ได้ทันทีว่ามาจากแอด
// ถ้าใส่ utm_* ในลิงก์แอดด้วย จะแยกได้ละเอียดถึงระดับ "แอดตัวไหน"
export function captureSource() {
  try {
    if (localStorage.getItem("babe_src")) return;   // มาครั้งแรกอย่างไหน จำอันนั้น
    const p = new URLSearchParams(location.search);
    const utm = p.get("utm_source"), content = p.get("utm_content") || p.get("utm_campaign");
    let src = null;
    if (utm) src = content ? `${utm}/${content}` : utm;
    else if (p.get("fbclid")) src = "meta-ads";       // คลิกมาจากแอด Facebook/Instagram
    else if (p.get("ref")) src = "referral";
    else {
      const ref = document.referrer || "";
      if (ref && !ref.includes(location.host)) {
        const h = (ref.match(/^https?:\/\/([^/]+)/) || [])[1] || "";
        if (/facebook|instagram|fb\.me/i.test(h)) src = "meta-organic";
        else if (/line\./i.test(h)) src = "line";
        else if (/google|bing/i.test(h)) src = "search";
        else if (h) src = h.slice(0, 40);
      } else if (!ref) src = "direct";
    }
    if (src) localStorage.setItem("babe_src", src.slice(0, 60));
  } catch {}
}
export const getSource = () => localStorage.getItem("babe_src") || undefined;

// บันทึก funnel step (landing/form_view/form_submit/checkout_view/paid) — ไม่ throw ไม่บล็อก UI
function sessionId() {
  let s = localStorage.getItem("babe_sid");
  if (!s) { s = "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem("babe_sid", s); }
  return s;
}
export function track(step) {
  try { fetch(BASE + "/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true, body: JSON.stringify({ step, session_id: sessionId(), email: session.email || undefined, source: getSource() }) }).catch(() => {}); } catch {}
}
// ปิงสถานะออนไลน์ (ให้หลังบ้านเห็นว่ามีคน/นักเรียนเปิดหน้าอยู่กี่คน)
export function ping() {
  try { fetch(BASE + "/api/presence", { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true, body: JSON.stringify({ session_id: sessionId(), email: session.email || undefined }) }).catch(() => {}); } catch {}
}

// ย่อ+บีบอัดรูปก่อนอัป (กัน payload ใหญ่/อัปช้า/ค้าง) — สกรีนช็อต Insight ไม่ต้องความละเอียดเต็ม AI ก็อ่านตัวเลขได้
async function compressImage(file, maxDim = 1800, quality = 0.85) {
  const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = dataUrl; });
  let w = img.width, h = img.height;
  if (Math.max(w, h) > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}
export async function fileToBase64(file) {
  if (!file || !file.name) return null;
  if (/^image\//.test(file.type || "")) { try { return await compressImage(file); } catch { /* ถ้าย่อไม่ได้ ใช้ไฟล์เดิม */ } }
  return new Promise((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file);
  });
}
export async function filesToBase64(list, max = 8) {
  const arr = [...(list || [])].slice(0, max);
  return (await Promise.all(arr.map(fileToBase64))).filter(Boolean);
}
const MO = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const currentCycle = () => { const d = new Date(); return `${MO[d.getMonth()]}_${d.getFullYear()}`; };
