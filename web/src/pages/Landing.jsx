import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, track } from "../api.js";
import { useI18n, LangToggle } from "../i18n.jsx";

// เสียงจากคนใช้จริง — โชว์เฉพาะรีวิวที่แอดมินอนุมัติแล้ว (social proof)
function SocialProof() {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  useEffect(() => { api("/api/reviews/public").then(setData).catch(() => {}); }, []);
  if (!data || !data.reviews?.length) return null;
  return (
    <section style={{ background: "var(--soft)", padding: "52px 0" }}><div className="wrap">
      <p className="center" style={{ letterSpacing: 2, fontSize: 12, fontWeight: 800, color: "var(--blue)", textTransform: "uppercase", marginBottom: 6 }}>{t("sp_label")}</p>
      <h2 className="center serif" style={{ fontSize: "clamp(22px,3.6vw,30px)", fontWeight: 800, marginBottom: 6 }}>{t("sp_title")}</h2>
      {data.avg > 0 && <p className="center muted" style={{ fontSize: 15, marginBottom: 28 }}><span style={{ color: "#f5b301", fontSize: 18 }}>{"★".repeat(Math.round(data.avg))}</span> <b>{data.avg}/5</b> {t("sp_from")} {data.total} {t("sp_reviews")}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16 }}>
        {data.reviews.map((r, i) => <div key={i} className="card" style={{ margin: 0, flex: "0 1 340px", maxWidth: "100%" }}>
          <div style={{ color: "#f5b301", fontSize: 15, marginBottom: 6 }}>{"★".repeat(r.rating)}<span style={{ color: "#dcdce3" }}>{"★".repeat(5 - r.rating)}</span></div>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, margin: "0 0 10px" }}>“{r.text}”</p>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{r.display_name || t("sp_anon")}</div>
          {r.role && <div className="muted" style={{ fontSize: 13 }}>{r.role}</div>}
        </div>)}
      </div>
      <div className="center" style={{ marginTop: 22 }}><Link className="btn" to="/form">{t("sp_cta")} →</Link></div>
    </div></section>
  );
}
function PriceTag({ big = 52, gap = 12 }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap, flexWrap: "wrap" }}>
      <span style={{ textDecoration: "line-through", color: "var(--muted)", fontSize: Math.round(big * 0.42), fontWeight: 700 }}>{t("price_full")}</span>
      <span style={{ fontSize: big, fontWeight: 800, color: "var(--blue)", lineHeight: 1 }}>{t("price_promo")}</span>
    </div>
  );
}

const labelStyle = { color: "var(--blue)", fontWeight: 700, fontSize: 13, letterSpacing: 1, marginBottom: 10 };
const h2Style = { fontSize: "clamp(23px,4vw,33px)", marginBottom: 12, lineHeight: 1.25 };

export default function Landing() {
  const { t } = useI18n();
  useEffect(() => { track("landing"); }, []);
  const FULL = t("price_full"), PROMO = t("price_promo");
  return (
    <div>
      <nav style={{ position: "sticky", top: 0, background: "rgba(255,255,255,.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)", zIndex: 50 }}>
        <div className="wrap between" style={{ height: 60 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>BABE <span style={{ color: "var(--blue)" }}>HOUSE</span></div>
          <div className="row" style={{ gap: 14, alignItems: "center" }}>
            <a href="#offer" className="muted" style={{ fontWeight: 600, fontSize: 14 }}>{t("nav_promo")}</a>
            <Link to="/account" className="link" style={{ fontSize: 14 }}>{t("nav_login")}</Link>
            <LangToggle />
          </div>
        </div>
      </nav>

      {/* 1. HERO */}
      <header className="center" style={{ background: "linear-gradient(180deg,var(--soft),#fff)", padding: "52px 0 46px" }}>
        <div className="wrap narrow">
          <span style={{ display: "inline-block", background: "#fff", border: "1px solid var(--border)", color: "var(--blue)", fontWeight: 700, fontSize: 13, padding: "7px 16px", borderRadius: 30, marginBottom: 20 }}>{t("hero_badge")}</span>
          <h1 className="serif" style={{ fontSize: "clamp(28px,5.4vw,46px)", lineHeight: 1.2, fontWeight: 800 }}>{t("hero_title_a")}<br /><span style={{ color: "var(--blue)" }}>{t("hero_title_b")}</span></h1>
          <p className="muted" style={{ fontSize: "clamp(15px,2.2vw,18px)", maxWidth: 600, margin: "16px auto 22px", textWrap: "balance" }}>{t("hero_sub")}</p>
          <PriceTag big={52} />
          <p className="muted" style={{ fontSize: 13, margin: "8px 0 24px" }}>{t("hero_for_launch")}</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link className="btn" to="/form">{t("cta_start")}</Link>
            <Link className="btn ghost" to="/dashboard?demo=1">{t("cta_see_demo")}</Link>
          </div>
          <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>{t("hero_nocharge")}</p>
          <p style={{ marginTop: 8, fontSize: 13 }}><Link to="/account" className="link">{t("hero_returning")}</Link></p>
        </div>
      </header>

      {/* 2. PAIN POINT */}
      <section style={{ background: "var(--cream)", padding: "50px 0" }}><div className="wrap">
        <h2 className="center serif" style={{ ...h2Style, marginBottom: 26 }}>{t("pain_title")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
          {t("probs").map(([ic, h, p]) => <div key={h} className="card" style={{ margin: 0 }}><div style={{ fontSize: 26 }}>{ic}</div><h3 style={{ fontSize: 16.5, margin: "8px 0 4px" }}>{h}</h3><p className="muted" style={{ fontSize: 14 }}>{p}</p></div>)}
        </div>
      </div></section>

      {/* 3. HOW IT WORKS */}
      <section style={{ padding: "52px 0" }}><div className="wrap">
        <p className="center" style={labelStyle}>{t("how_label")}</p>
        <h2 className="center serif" style={{ ...h2Style, marginBottom: 30 }}>{t("how_title")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 18 }}>
          {t("steps3").map(([ic, h, p]) => <div key={h} className="card" style={{ margin: 0 }}><div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 12 }}>{ic}</div><h3 style={{ fontSize: 17.5, marginBottom: 6 }}>{h}</h3><p className="muted" style={{ fontSize: 14.5 }}>{p}</p></div>)}
        </div>
        <p className="center muted" style={{ fontSize: 14, marginTop: 22 }}>{t("how_note")}</p>
      </div></section>

      {/* 4. โปรเปิดตัว 490 ได้อะไรบ้าง */}
      <section style={{ background: "var(--soft)", padding: "52px 0" }}><div className="wrap narrow">
        <h2 className="center serif" style={h2Style}>{t("offer_title_pre")} {PROMO} {t("offer_title_post")}</h2>
        <p className="center muted" style={{ maxWidth: 600, margin: "0 auto 28px", fontSize: 15 }}>{t("offer_desc_a")} <span style={{ textDecoration: "line-through" }}>{FULL}</span> {t("offer_desc_b")} <b style={{ color: "var(--blue)" }}>{PROMO}</b></p>
        <div className="card" style={{ maxWidth: 600, margin: "0 auto" }}>
          <ul style={{ listStyle: "none", margin: 0 }}>
            {t("offer_includes").map((x, i, arr) => <li key={i} style={{ padding: "10px 0 10px 30px", position: "relative", fontSize: 15, borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}><span style={{ position: "absolute", left: 0, color: "var(--blue)", fontWeight: 800 }}>✓</span>{x}</li>)}
          </ul>
        </div>
        <p className="center" style={{ fontWeight: 700, fontSize: 15.5, margin: "24px auto 18px", maxWidth: 560 }}>{t("offer_worth")}</p>
        <div className="center"><Link className="btn" to="/form">{t("offer_cta")} {PROMO}</Link></div>
      </div></section>

      {/* 5. LAUNCH OFFER PRICE CARD */}
      <section id="offer" style={{ padding: "52px 0" }}><div className="wrap">
        <p className="center" style={labelStyle}>{t("launch_label")}</p>
        <h2 className="center serif" style={{ ...h2Style, marginBottom: 26 }}>{t("launch_title")}</h2>
        <div className="card" style={{ maxWidth: 430, margin: "0 auto", border: "2px solid var(--blue)", borderRadius: 26, textAlign: "center", padding: "32px 28px", boxShadow: "0 14px 40px rgba(46,134,222,.18)" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Babe House AI Creator Blueprint</div>
          <div style={{ margin: "16px 0 6px" }}><PriceTag big={56} /></div>
          <div style={{ display: "inline-block", background: "#E8F5EE", color: "var(--up)", fontWeight: 700, fontSize: 13.5, padding: "5px 14px", borderRadius: 20, marginBottom: 18 }}>{t("launch_save")}</div>
          <ul style={{ listStyle: "none", textAlign: "left", margin: "6px 0 22px" }}>
            {t("card_includes").map((x) => <li key={x} style={{ padding: "9px 0 9px 28px", position: "relative", fontSize: 15, borderBottom: "1px solid var(--border)" }}><span style={{ position: "absolute", left: 0, color: "var(--blue)", fontWeight: 800 }}>✓</span>{x}</li>)}
          </ul>
          <Link className="btn full" to="/form">{t("cta_start")}</Link>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>{t("card_nocharge")}</p>
        </div>
      </div></section>

      {/* 6. ตัวอย่าง Blueprint */}
      <section style={{ background: "var(--cream)", padding: "52px 0" }}><div className="wrap">
        <p className="center" style={labelStyle}>{t("ex_label")}</p>
        <h2 className="center serif" style={{ ...h2Style, marginBottom: 28 }}>{t("ex_title")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 16 }}>
          {t("example_cards").map(([ic, h, p]) => <div key={h} className="card" style={{ margin: 0 }}><div style={{ width: 46, height: 46, borderRadius: 13, background: "var(--soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 11 }}>{ic}</div><h3 style={{ fontSize: 16.5, marginBottom: 5 }}>{h}</h3><p className="muted" style={{ fontSize: 14 }}>{p}</p></div>)}
        </div>
        <div className="center" style={{ marginTop: 28 }}>
          <Link className="btn ghost" to="/dashboard?demo=1">{t("ex_see_dash")}</Link>
          <Link className="btn" to="/form" style={{ marginLeft: 6 }}>{t("ex_try")} {PROMO}</Link>
        </div>
      </div></section>

      {/* 7. ต่างจากใช้ AI เองยังไง */}
      <section style={{ padding: "52px 0" }}><div className="wrap narrow">
        <h2 className="center serif" style={{ ...h2Style, marginBottom: 18 }}>{t("vs_title")}</h2>
        <p className="muted center" style={{ fontSize: 15, marginBottom: 8 }}>{t("vs_p1")}</p>
        <p className="center" style={{ fontSize: 15, marginBottom: 26 }}>{t("vs_p2")}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
          <div className="card" style={{ margin: 0, background: "var(--soft)" }}>
            <div style={{ fontWeight: 800, marginBottom: 12, fontSize: 15 }}>{t("vs_self_h")}</div>
            {t("vs_self").map((x) => <div key={x} style={{ fontSize: 14.5, padding: "6px 0", color: "var(--muted)" }}>✗ {x}</div>)}
          </div>
          <div className="card" style={{ margin: 0, border: "2px solid var(--blue)" }}>
            <div style={{ fontWeight: 800, marginBottom: 12, fontSize: 15, color: "var(--blue-d)" }}>{t("vs_bp_h")}</div>
            {t("vs_bp").map((x) => <div key={x} style={{ fontSize: 14.5, padding: "6px 0" }}><span style={{ color: "var(--blue)", fontWeight: 800 }}>✓</span> {x}</div>)}
          </div>
        </div>
        <p className="center" style={{ fontSize: 14.5, marginTop: 22, fontStyle: "italic", color: "var(--blue-d)" }}>{t("vs_tagline")}</p>
      </div></section>

      {/* 8. PROOF */}
      <section style={{ background: "var(--soft)", padding: "52px 0" }}><div className="wrap narrow">
        <h2 className="center serif" style={{ ...h2Style, marginBottom: 16 }}>{t("proof_title")}</h2>
        <p className="muted center" style={{ fontSize: 15, marginBottom: 8 }}>{t("proof_intro")}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, margin: "20px 0" }}>
          {t("proof_points").map((x) => <div key={x} className="card" style={{ margin: 0, padding: "14px 16px", fontSize: 14.5 }}><span style={{ color: "var(--blue)", fontWeight: 800 }}>✓</span> {x}</div>)}
        </div>
        <p className="center" style={{ fontSize: 14.5, marginBottom: 18 }}>{t("proof_outro")}</p>
        <div className="row" style={{ justifyContent: "center", gap: 8 }}>
          {["Reach", "Profile Visits", "Link Taps", "Followers", "Top Content"].map((m) => <span key={m} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 20, padding: "7px 14px", fontSize: 13, fontWeight: 600 }}>{m}</span>)}
        </div>
      </div></section>

      {/* 8.5 SOCIAL PROOF — รีวิวจริงจากลูกค้า (โชว์เมื่อมีรีวิวอนุมัติ) */}
      <SocialProof />

      {/* 9. ทำไมควรสร้าง Blueprint ใหม่ทุกเดือน */}
      <section style={{ padding: "52px 0" }}><div className="wrap">
        <h2 className="center serif" style={{ ...h2Style, marginBottom: 16 }}>{t("monthly_title")}</h2>
        <p className="muted center" style={{ fontSize: 15, maxWidth: 640, margin: "0 auto 10px" }}>{t("monthly_p1")}</p>
        <p className="center" style={{ fontSize: 15, maxWidth: 640, margin: "0 auto 28px" }}>{t("monthly_p2")}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
          {t("monthly_cards").map(([ic, h, p]) => <div key={h} className="card" style={{ margin: 0 }}><div style={{ fontSize: 26 }}>{ic}</div><h3 style={{ fontSize: 16.5, margin: "8px 0 4px" }}>{h}</h3><p className="muted" style={{ fontSize: 14 }}>{p}</p></div>)}
        </div>
        <div className="center" style={{ marginTop: 28 }}><Link className="btn" to="/form">{t("monthly_cta")} {PROMO}</Link></div>
      </div></section>

      {/* 10. FAQ */}
      <section style={{ background: "var(--cream)", padding: "52px 0" }}><div className="wrap narrow">
        <h2 className="center serif" style={{ ...h2Style, marginBottom: 24 }}>{t("faq_title")}</h2>
        {t("faqs").map(([q, a]) => <details key={q} className="card" style={{ margin: "0 0 10px", padding: "4px 18px" }}><summary style={{ fontWeight: 700, padding: "14px 0", cursor: "pointer" }}>{q}</summary><p className="muted" style={{ padding: "0 0 16px", fontSize: 14.5 }}>{a}</p></details>)}
      </div></section>

      {/* 11. FINAL CTA */}
      <section style={{ padding: "52px 0" }}><div className="wrap"><div className="center" style={{ background: "linear-gradient(135deg,var(--blue),var(--blue-d))", color: "#fff", borderRadius: 28, padding: "48px 26px" }}>
        <h2 className="serif" style={{ fontSize: "clamp(23px,4vw,32px)", color: "#fff" }}>{t("final_title")}</h2>
        <p style={{ opacity: .92, maxWidth: 520, margin: "12px auto 8px", fontSize: 16 }}>{t("final_sub")}</p>
        <div style={{ margin: "8px 0 18px" }}>
          <span style={{ textDecoration: "line-through", opacity: .75, fontSize: 18, fontWeight: 700, marginRight: 10 }}>{FULL}</span>
          <span style={{ fontSize: 40, fontWeight: 800 }}>{PROMO}</span>
        </div>
        <Link className="btn" to="/form" style={{ background: "#fff", color: "var(--blue)" }}>{t("cta_start")}</Link>
        <p style={{ opacity: .88, fontSize: 12.5, marginTop: 16, maxWidth: 460, marginInline: "auto", lineHeight: 1.6 }}>{t("final_disclaimer")}</p>
      </div></div></section>

      <footer className="center muted" style={{ padding: "34px 0", fontSize: 13, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>BABE <span style={{ color: "var(--blue)" }}>HOUSE</span> · Academy</div>
        <Link to="/form" className="muted">{t("footer_make")}</Link> · <Link to="/account" className="muted">{t("nav_login")}</Link> · <Link to="/privacy" className="muted">{t("footer_privacy")}</Link>
        <p style={{ marginTop: 12 }}>© 2026 Babe House Academy</p>
      </footer>
    </div>
  );
}
