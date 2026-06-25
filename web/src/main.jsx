import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import "./styles.css";
import { captureRef, ping } from "./api.js";

// เปลี่ยนหน้า → เลื่อนขึ้นบนสุดเสมอ (react-router ไม่ทำให้เอง ทำให้บางหน้าเปิดมาค้างกลางหน้า)
if (typeof history !== "undefined" && "scrollRestoration" in history) history.scrollRestoration = "manual"; // ปิด browser auto-restore (กัน reload/สลับแท็บแล้วค้างกลางหน้า)
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  // ปิงสถานะออนไลน์ทุก 45 วิ ตลอดที่เปิดเว็บอยู่ (ให้หลังบ้านนับคนออนไลน์)
  useEffect(() => { ping(); const t = setInterval(ping, 45000); return () => clearInterval(t); }, []);
  return null;
}

function TopBar() {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 60, background: "rgba(255,255,255,.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
      <div className="wrap between" style={{ height: 56 }}>
        <Link to="/" style={{ fontWeight: 800, fontSize: 17 }}>BABE <span style={{ color: "var(--blue)" }}>HOUSE</span></Link>
        <div className="row" style={{ gap: 18 }}>
          <Link to="/" className="muted" style={{ fontWeight: 600, fontSize: 14 }}>หน้าแรก</Link>
          <Link to="/account" className="link" style={{ fontSize: 14 }}>บัญชีของฉัน</Link>
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

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) return (
      <div className="wrap narrow page-pad center" style={{ minHeight: "70vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div className="serif" style={{ fontSize: 56, color: "var(--blue)" }}>🩵</div>
        <h1 style={{ fontSize: 22, margin: "10px 0 6px" }}>ระบบขัดข้องชั่วคราว</h1>
        <p className="muted" style={{ marginBottom: 20 }}>ขออภัยค่ะ ลองโหลดหน้าใหม่อีกครั้งนะคะ</p>
        <div><a className="btn" href="/">กลับหน้าแรก</a></div>
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
import NotFound from "./pages/NotFound.jsx";

captureRef();

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
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Shell>
  </BrowserRouter>
  </ErrorBoundary>
);
