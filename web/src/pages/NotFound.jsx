import { Link } from "react-router-dom";
import { useI18n } from "../i18n.jsx";
export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="wrap page-pad center" style={{ minHeight: "70vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div className="serif" style={{ fontSize: 88, fontWeight: 700, color: "var(--blue)" }}>404</div>
      <h1 style={{ fontSize: 22, margin: "8px 0 6px" }}>{t("nf_title")}</h1>
      <p className="muted" style={{ marginBottom: 22 }}>{t("nf_sub")}</p>
      <div><Link className="btn" to="/">{t("back_home")}</Link></div>
    </div>
  );
}
