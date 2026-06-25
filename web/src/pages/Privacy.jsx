import { Link } from "react-router-dom";
import { useI18n } from "../i18n.jsx";
export default function Privacy() {
  const { t } = useI18n();
  return (
    <div className="wrap narrow page-pad">
      <div className="brand">BABE HOUSE · ACADEMY</div>
      <h1 className="page">{t("pv_title")}</h1>
      <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>{t("pv_pdpa")}</p>
      <div className="card" style={{ background: "var(--soft)" }}>{t("pv_summary")}</div>
      <h3 style={{ margin: "18px 0 6px" }}>{t("pv_h1")}</h3>
      <p className="muted">{t("pv_p1")}</p>
      <h3 style={{ margin: "18px 0 6px" }}>{t("pv_h2")}</h3>
      <p className="muted">{t("pv_p2")}</p>
      <h3 style={{ margin: "18px 0 6px" }}>{t("pv_h3")}</h3>
      <p className="muted">{t("pv_p3")}</p>
      <h3 style={{ margin: "18px 0 6px" }}>{t("pv_h4")}</h3>
      <p className="muted">{t("pv_p4")}</p>
      <p style={{ marginTop: 28 }}><Link className="link" to="/">{t("back_home_arrow")}</Link></p>
    </div>
  );
}
