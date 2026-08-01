import React, { useEffect, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import "./styles.css";
import { captureRef, ping } from "./api.js";
import { LangToggle, useI18n } from "./i18n.jsx";
import { ACADEMY_LIVE } from "./config.js";
import { initPixel, track as fbTrack } from "./pixel.js";

// เปลี่ยนหน้า → เลื่อนขึ้นบนสุดเสมอ (react-router ไม่ทำให้เอง ทำให้บางหน้าเปิดมาค้างกลางหน้า)
if (typeof history !== "undefined" && "scrollRestoration" in history) history.scrollRestoration = "manual"; // ปิด browser auto-restore (กัน reload/สลับแท็บแล้วค้างกลางหน้า)
function ScrollToTop() {
  const { pathname } = useLocation();
  useLayoutEffect(() => { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; }, [pathname]); // ก่อนวาดจอ ไม่ให้เห็นกระพริบกลางหน้า
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
      <div className="wrap between" style={{ height: 56 }}>
        <Link to="/" style={{ fontWeight: 800, fontSize: 17 }}>BABE <span style={{ color: "var(--blue)" }}>HOUSE</span></Link>
        <div className="row" style={{ gap: 16, alignItems: "center" }}>
          <Link to="/" className="muted" style={{ fontWeight: 600, fontSize: 14 }}>{tb("nav_home")}</Link>
          {/* เมนูคอร์สเรียน/คลาสสด — โผล่ตอนเปิดตัวเฟส 4 เท่านั้น (สลับที่ config.js) */}
          {ACADEMY_LIVE && <Link to="/academy" className="muted" style={{ fontWeight: 600, fontSize: 14 }}>คอร์สเรียน</Link>}
          {ACADEMY_LIVE && <Link to="/workshop" className="muted" style={{ fontWeight: 600, fontSize: 14 }}>คลาสสด</Link>}
          <Link to="/account" className="link" style={{ fontSize: 14 }}>{tb("nav_account")}</Link>
          <LangToggle />
        </div>
      </div>
    </div>
  );
}
function Shell({ children }) {
  const loc = useLocation();
  // แสดงแถบบนทุกหน้า ยกเว้นหน้า Landing (ซึ่งมี nav ของตัวเอง)
  return <>{loc.pathname !== "/" && <TopBar />}{children}</>;
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
import Compare from "./pages/Compare.jsx";
import Admin from "./pages/Admin.jsx";
import Privacy from "./pages/Privacy.jsx";
import VideoAudit from "./pages/VideoAudit.jsx";
import Production from "./pages/Production.jsx";
import Academy from "./pages/Academy.jsx";
import AcademyLearn from "./pages/AcademyLearn.jsx";
import AcademyCourse from "./pages/AcademyCourse.jsx";
import AcademyPaid from "./pages/AcademyPaid.jsx";
import AcademyCertificate from "./pages/AcademyCertificate.jsx";
import Plans from "./pages/Plans.jsx";
import ClubDemo from "./pages/ClubDemo.jsx";
import PreviewAccount from "./pages/PreviewAccount.jsx";
import Workshops from "./pages/Workshops.jsx";
import WorkshopDetail from "./pages/WorkshopDetail.jsx";
import WorkshopPaid from "./pages/WorkshopPaid.jsx";
import NotFound from "./pages/NotFound.jsx";

captureRef();
initPixel();   // 📣 Meta Pixel — เริ่มนับตั้งแต่หน้าแรกที่ลูกค้าเปิด

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
  <BrowserRouter>
    <ScrollToTop />
    <Shell>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/form" element={<Form />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/processing" element={<Processing />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/account" element={<Account />} />
      <Route path="/compare" element={<Compare />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/video-audit" element={<VideoAudit />} />
      <Route path="/production" element={<Production />} />
      <Route path="/academy" element={<Academy />} />
      <Route path="/academy/course/:id" element={<AcademyCourse />} />
      <Route path="/academy/learn" element={<AcademyLearn />} />
      <Route path="/academy/paid" element={<AcademyPaid />} />
      <Route path="/academy/certificate/:id" element={<AcademyCertificate />} />
      <Route path="/preview/account" element={<PreviewAccount />} />
      <Route path="/plans" element={<Plans />} />
      <Route path="/club" element={<ClubDemo />} />
      <Route path="/workshop" element={<Workshops />} />
      <Route path="/workshop/paid" element={<WorkshopPaid />} />
      <Route path="/workshop/:id" element={<WorkshopDetail />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Shell>
  </BrowserRouter>
  </ErrorBoundary>
);
