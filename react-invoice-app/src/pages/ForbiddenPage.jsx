import { Link } from "react-router-dom";

export default function ForbiddenPage() {
  return (
    <div className="page-wrap">
      <div className="empty-state">
        <h1 className="empty-state-title">403 — Access denied</h1>
        <p className="empty-state-message mb-3">
          Is page / action ke liye aapke role mein permission nahi hai.
        </p>
        <Link to="/invoices" className="btn input-clr1 save-changes">
          Back to invoices
        </Link>
      </div>
    </div>
  );
}
