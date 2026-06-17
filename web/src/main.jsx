import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./styles.css";
import { captureRef } from "./api.js";

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
import NotFound from "./pages/NotFound.jsx";

captureRef();

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
  <BrowserRouter>
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
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
  </ErrorBoundary>
);
