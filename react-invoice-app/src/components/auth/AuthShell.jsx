import {
  faArrowLeft,
  faChartLine,
  faCheck,
  faFileInvoice,
  faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "react-router-dom";

export default function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
  register = false,
}) {
  return (
    <main className="auth-page">
      <section className="auth-showcase">
        <Link to="/" className="auth-brand">
          <span className="auth-brand-mark">
            <FontAwesomeIcon icon={faFileInvoice} />
          </span>
          <span className="auth-brand-text">
            <strong>Invoice App</strong>
            <small>One platform. Many businesses.</small>
          </span>
        </Link>

        <div className="auth-showcase-copy">
          <div className="auth-showcase-icon">
            <FontAwesomeIcon icon={register ? faChartLine : faShieldHalved} />
          </div>
          <p className="auth-showcase-kicker">
            {register ? "Built to help you grow" : "Your business, protected"}
          </p>
          <h2>
            {register
              ? "Run your entire business from one clear workspace."
              : "Welcome back to your business command center."}
          </h2>
          <p>
            Invoices, inventory, clients, and team permissions stay connected,
            organized, and ready when you need them.
          </p>
          <ul>
            <li><FontAwesomeIcon icon={faCheck} /> Secure role-based access</li>
            <li><FontAwesomeIcon icon={faCheck} /> Real-time inventory records</li>
            <li><FontAwesomeIcon icon={faCheck} /> Multi-business data isolation</li>
          </ul>
        </div>

        <p className="auth-showcase-footer">
          Simple operations. Better control. Confident growth.
        </p>
      </section>

      <section className="auth-form-side">
        <div className={`auth-form-panel ${register ? "auth-form-panel-wide" : ""}`}>
          <Link to="/" className="auth-back-link">
            <FontAwesomeIcon icon={faArrowLeft} /> Back to website
          </Link>
          <div className="auth-form-heading">
            <span>{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {children}
          <div className="auth-panel-footer">{footer}</div>
        </div>
      </section>
    </main>
  );
}
