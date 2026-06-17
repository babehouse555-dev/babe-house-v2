// fetch helper + auth/session/referral utils
const BASE = import.meta.env.VITE_API_BASE || "";

export async function api(path, { method = "GET", body, token, adminKey } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = "Bearer " + token;
  if (adminKey) headers["x-admin-key"] = adminKey;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.message || `Request failed: ${res.status}`);
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
}
export const getRef = () => localStorage.getItem("babe_ref") || undefined;

export async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.name) return resolve(null);
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file);
  });
}
export async function filesToBase64(list, max = 8) {
  const arr = [...(list || [])].slice(0, max);
  return (await Promise.all(arr.map(fileToBase64))).filter(Boolean);
}
const MO = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const currentCycle = () => { const d = new Date(); return `${MO[d.getMonth()]}_${d.getFullYear()}`; };
