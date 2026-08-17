import React, { useEffect, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import "./styles.css";
import { captureRef, ping } from "./api.js";
import { LangToggle, useI18n } from "./i18n.jsx";
import { ACADEMY_LIVE, WORKSHOP_LIVE, EDIT_LIVE, PREVIEW } from "./config.js";
import { initPixel, track as fbTrack } from "./pixel.js";
import { ConfirmHost } from "./confirm.jsx";

// เปลี่ยนหน้า → เลื่อนขึ้นบนสุดเสมอ (react-router ไม่ทำให้เอง ทำให้บางหน้าเปิดมาค้างกลางหน้า)
if (typeof history !== "undefined" && "scrollRestoration" in history) history.scrollRestoration = "manual"; // ปิด browser auto-restore (กัน reload/สลับแท็บแล้วค้างกลางหน้า)
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  // ⚠️ ถ้าลิงก์ระบุจุดหมายมาด้วย (#buy) ห้ามดีดขึ้นบนสุด ไม่งั้นจะทับการเลื่อนไปยังจุดนั้น
  //    คิมเจอ 12 ส.ค.: กด "ซื้อเครดิตตัดต่อ" แล้วเด้งไปหัวหน้าเว็บแทนที่จะไปกล่องซื้อเครดิต
  useLayoutEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0); document.documentElement.scrollTop = 0;
  }, [pathname, hash]); // ก่อนวาดจอ ไม่ให้เห็นกระพริบกลางหน้า
  // 📣 บอก Meta ว่าลูกค้าเดินถึงขั้นไหนแล้ว (SPA เปลี่ยนหน้าไม่ได้โหลดใหม่ ต้องยิงเอง)
  useEffect(() => {
    if (pathname === "/form") fbTrack("ViewContent", { content_name: "แบบฟอร์มสร้างเล่ม" });
    else if (pathname === "/checkout") fbTrack("InitiateCheckout", { value: 490, currency: "THB" });
  }, [pathname]);
  // ปิงสถานะออนไลน์ทุก 45 วิ ตลอดที่เปิดเว็บอยู่ (ให้หลังบ้านนับคนออนไลน์)
  useEffect(() => { ping(); const t = setInterval(ping, 45000); return () => clearInterval(t); }, []);
  return null;
}

function TopBar() {
  const { t: tb } = useI18n();
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 60, background: "rgba(255,255,255,.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
      {/* 🐛 แก้ 3 ส.ค.: เดิมล็อกความสูง 56px ตายตัว — บนมือถือเมนูตกบรรทัดแล้วล้นออกไปทับหัวข้อของทุกหน้า
          เปลี่ยนเป็นความสูง "อย่างน้อย" 56 แล้วให้ยืดตามเนื้อหา + ให้เมนูตกบรรทัดได้อย่างเป็นระเบียบ */}
      <div className="wrap between" style={{ minHeight: 56, paddingTop: 8, paddingBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <Link to="/" style={{ fontWeight: 800, fontSize: 17 }}>BABE <span style={{ color: "var(--blue)" }}>HOUSE</span></Link>
        <div className="row" style={{ gap: 14, alignItems: "center", flexWrap: "wrap", rowGap: 6 }}>
          <Link to="/" className="muted" style={{ fontWeight: 600, fontSize: 14 }}>{tb("nav_home")}</Link>
          {/* ทางเข้าดูราคา — คิมสั่ง 3 ส.ค. "หน้านี้มันต้องมีในแถบด้านบนขวาด้วย" */}
          <a href="/#offer" className="muted" style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>{tb("nav_promo")}</a>
          {/* เมนูคอร์สเรียน/คลาสสด — โผล่ตอนเปิดตัวเฟส 4 เท่านั้น (สลับที่ config.js) */}
          {ACADEMY_LIVE && <Link to="/academy" className="muted" style={{ fontWeight: 600, fontSize: 14 }}>คอร์สเรียน</Link>}
          {WORKSHOP_LIVE && <Link to="/workshop" className="muted" style={{ fontWeight: 600, fontSize: 14 }}>คลาสสด</Link>}
          {/* 🎬 พลอยขอ 11 ส.ค. — ให้จ้างทีมตัดต่อได้จากเมนูเลย ไม่ต้องเข้าผ่านหน้าเล่มอย่างเดียว */}
          {EDIT_LIVE && <Link to="/edit" className="muted" style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>จ้างทีมตัดต่อ</Link>}
          <Link to="/account" className="link" style={{ fontSize: 14 }}>{tb("nav_account")}</Link>
          <LangToggle />
        </div>
      </div>
    </div>
  );
}
// 🎮 ป้ายสนามเด็กเล่น — โผล่เฉพาะตอนเปิดที่ localhost (เครื่องตัวเอง) เท่านั้น
// เว็บจริงไม่มีทางขึ้นป้ายนี้ เพราะเช็คจากชื่อโฮสต์ตอนเปิดหน้า
const IS_PLAYGROUND = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
async function demoLogin() {
  try {
    const r = await fetch("/api/dev/demo-login", { method: "POST" }).then(x => x.json());
    if (!r.ok) throw new Error();
    localStorage.setItem("babe_session_token", r.token);
    localStorage.setItem("babe_session_email", r.email);
    location.href = "/account";
  } catch { alert("เข้าไม่ได้ — สนามเด็กเล่นอาจปิดอยู่"); }
}
// 👀 แถบเตือนตอนเปิดโหมดพรีวิว — ต้องเห็นชัดว่านี่ไม่ใช่สิ่งที่ลูกค้าเห็น
function PreviewBar() {
  if (IS_PLAYGROUND || !PREVIEW) return null;
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 999, background: "#B45309", color: "#fff",
      textAlign: "center", fontSize: 13, fontWeight: 800, padding: "7px 12px" }}>
      👀 โหมดพรีวิว — คุณเห็นของที่ยังปิดอยู่ · ลูกค้ายังไม่เห็นสิ่งเหล่านี้
      {" · "}
      <a href="/?preview=off" style={{ color: "#fff", textDecoration: "underline" }}>ปิดโหมดพรีวิว</a>
    </div>
  );
}
function PlaygroundBar() {
  if (!IS_PLAYGROUND) return null;
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 999, background: "repeating-linear-gradient(45deg,#7C5CE6,#7C5CE6 14px,#6a4fd0 14px,#6a4fd0 28px)",
      color: "#fff", textAlign: "center", fontSize: 13.5, fontWeight: 800, padding: "7px 12px", letterSpacing: .2,
    }}>
      🎮 สนามเด็กเล่น — เครื่องของคิมเอง · ไม่ใช่เว็บจริง
      {" · "}
      <button onClick={demoLogin} style={{ background: "rgba(255,255,255,.95)", color: "#5a3fc0", border: 0, borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
        👤 เข้าเป็นลูกค้าตัวอย่าง
      </button>
    </div>
  );
}

function Shell({ children }) {
  const loc = useLocation();
  // แสดงแถบบนทุกหน้า ยกเว้นหน้า Landing (ซึ่งมี nav ของตัวเอง)
  // และยกเว้นหน้าทำงานภายในทีม — คิมสั่ง "ทีมจะได้ไม่ต้องมายุ่งกับสินค้าอื่น"
  const internal = ["/team", "/studio"].includes(loc.pathname);
  return <><PlaygroundBar /><PreviewBar />{loc.pathname !== "/" && !internal && <TopBar />}{children}</>;
}

// 🔄 กู้อัตโนมัติเมื่อเว็บถูกอัปเดตระหว่างลูกค้าเปิดหน้าค้างอยู่
// ตอน deploy ชื่อไฟล์ .js เปลี่ยน → ไฟล์เดิมที่หน้านั้นอ้างอิงหายไป → โหลดไม่ได้ → หน้าพัง
// แทนที่จะโชว์ "ระบบขัดข้อง" ให้โหลดหน้าใหม่เงียบๆ (ครั้งเดียว กันวนลูป)
const RELOAD_KEY = "babe_stale_reload";
function recoverFromStaleBuild() {
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false;   // โหลดใหม่ไปแล้วรอบนึง ไม่วนอีก
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    location.reload();
    return true;
  } catch { return false; }
}
// ล้างธงเมื่อหน้าโหลดสำเร็จเกิน 8 วิ (แปลว่ารอบนี้ปกติแล้ว)
setTimeout(() => { try { sessionStorage.removeItem(RELOAD_KEY); } catch {} }, 8000);
if (typeof window !== "undefined") {
  const looksStale = (m) => /Unexpected token '<'|failed to fetch dynamically imported|error loading dynamically imported|Loading chunk|Importing a module script failed|MIME type/i.test(String(m || ""));
  window.addEventListener("error", (e) => { if (looksStale(e?.message)) recoverFromStaleBuild(); }, true);
  window.addEventListener("unhandledrejection", (e) => { if (looksStale(e?.reason?.message || e?.reason)) recoverFromStaleBuild(); });
}

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) {
    // หน้าพังเพราะไฟล์เก่า → โหลดใหม่ให้เลย ลูกค้าไม่ต้องเห็นหน้า error
    if (/Unexpected token '<'|dynamically imported|Loading chunk|MIME type/i.test(String(err?.message || ""))) recoverFromStaleBuild();
  }
  render() {
    if (this.state.err) return (
      <div className="wrap narrow page-pad center" style={{ minHeight: "70vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div className="serif" style={{ fontSize: 56, color: "var(--blue)" }}>🩵</div>
        <h1 style={{ fontSize: 22, margin: "10px 0 6px" }}>ระบบขัดข้องชั่วคราว</h1>
        <p className="muted" style={{ marginBottom: 20 }}>ขออภัยค่ะ กดปุ่มด้านล่างเพื่อโหลดใหม่ได้เลยนะคะ<br />ข้อมูลที่กรอกไว้ยังอยู่ ไม่ต้องเริ่มใหม่ค่ะ</p>
        <div>
          <button className="btn" onClick={() => { try { sessionStorage.removeItem(RELOAD_KEY); } catch {} location.reload(); }}>โหลดหน้านี้ใหม่</button>
          <a className="btn ghost" href="/" style={{ marginLeft: 8 }}>กลับหน้าแรก</a>
        </div>
      </div>
    );
    return this.props.children;
  }
}
import Landing from "./pages/Landing.jsx";
import Form from "./pages/Form.jsx";
import Checkout from "./pages/Checkout.jsx";
import Processing from "./pages/Processing.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Account from "./pages/Account.jsx";
import Invoice from "./pages/Invoice.jsx";
import Compare from "./pages/Compare.jsx";
import Admin from "./pages/Admin.jsx";
import Projects from "./pages/Projects.jsx";
import EditOrder from "./pages/EditOrder.jsx";
import EditJob from "./pages/EditJob.jsx";
import EditBrief from "./pages/EditBrief.jsx";
import SiteMap from "./pages/SiteMap.jsx";
import Studio from "./pages/Studio.jsx";
import Team from "./pages/Team.jsx";
import Privacy from "./pages/Privacy.jsx";
import VideoAudit from "./pages/VideoAudit.jsx";
import Academy from "./pages/Academy.jsx";
import AcademyLearn from "./pages/AcademyLearn.jsx";
import AcademyCourse from "./pages/AcademyCourse.jsx";
import AcademyPaid from "./pages/AcademyPaid.jsx";
import AcademyCertificate from "./pages/AcademyCertificate.jsx";
import PreviewAccount from "./pages/PreviewAccount.jsx";
import Workshops from "./pages/Workshops.jsx";
import Corporate from "./pages/Corporate.jsx";
import WorkshopDetail from "./pages/WorkshopDetail.jsx";
import WorkshopPaid from "./pages/WorkshopPaid.jsx";
import NotFound from "./pages/NotFound.jsx";

captureRef();
initPixel();   // 📣 Meta Pixel — เริ่มนับตั้งแต่หน้าแรกที่ลูกค้าเปิด

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
  <BrowserRouter>
    {/* กล่องยืนยันของเราเอง — ต้องมีตัวเดียวทั้งเว็บ (ดูเหตุผลใน confirm.jsx) */}
    <ConfirmHost />
    <ScrollToTop />
    <Shell>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/form" element={<Form />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/processing" element={<Processing />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/account" element={<Account />} />
      <Route path="/invoice/:id" element={<Invoice />} />
      <Route path="/compare" element={<Compare />} />
      {/* 🏢 อบรมองค์กร — คนละหน้ากับ /workshops เพราะพูดกับ HR ไม่ใช่คนที่อยากเรียนเอง */}
      <Route path="/corporate" element={<Corporate />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/edit" element={<EditOrder />} />
      <Route path="/edit/new" element={<EditBrief />} />
      <Route path="/edit/:id" element={<EditJob />} />
      <Route path="/map" element={<SiteMap />} />
      {/* 🎬 หน้าเฉพาะทีมตัดต่อ — เข้าด้วยรหัสทีม ไม่เห็นยอดขาย/ลูกค้าฝั่งอื่น (คิมสั่ง 2 ส.ค.) */}
      <Route path="/studio" element={<Studio />} />
      <Route path="/team" element={<Team />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/video-audit" element={<VideoAudit />} />
      <Route path="/academy" element={<Academy />} />
      <Route path="/academy/course/:id" element={<AcademyCourse />} />
      <Route path="/academy/learn" element={<AcademyLearn />} />
      <Route path="/academy/paid" element={<AcademyPaid />} />
      <Route path="/academy/certificate/:id" element={<AcademyCertificate />} />
      <Route path="/preview/account" element={<PreviewAccount />} />
      <Route path="/workshop" element={<Workshops />} />
      <Route path="/workshop/paid" element={<WorkshopPaid />} />
      <Route path="/workshop/:id" element={<WorkshopDetail />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Shell>
  </BrowserRouter>
  </ErrorBoundary>
);
