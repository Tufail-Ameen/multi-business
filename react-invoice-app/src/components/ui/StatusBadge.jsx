import { faCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const STATUS_MAP = {
  draft: { label: "Draft", className: "draftbtn", key: 1 },
  pending: { label: "Pending", className: "pendingbtn", key: 2 },
  paid: { label: "Paid", className: "paidbtn", key: 3 },
  confirmed: { label: "Confirmed", className: "paidbtn", key: 3 },
  cancelled: { label: "Cancelled", className: "draftbtn", key: 1 },
  active: { label: "Active", className: "paidbtn", key: 3 },
  archived: { label: "Archived", className: "draftbtn", key: 1 },
  1: { label: "Draft", className: "draftbtn", key: 1 },
  2: { label: "Pending", className: "pendingbtn", key: 2 },
  3: { label: "Paid", className: "paidbtn", key: 3 },
};

function resolveStatus(status) {
  if (status == null) return STATUS_MAP.draft;
  if (typeof status === "number" || STATUS_MAP[status]) {
    return STATUS_MAP[status] || STATUS_MAP.draft;
  }
  const key = String(status).trim().toLowerCase();
  return STATUS_MAP[key] || STATUS_MAP.draft;
}

export default function StatusBadge({ status, compact = false }) {
  const config = resolveStatus(status);

  return (
    <button
      type="button"
      className={`btn ${config.className} ${compact ? "px-3 py-1" : "px-4"}`}
      style={compact ? { fontSize: "12px" } : undefined}
    >
      <span className="me-1">
        <FontAwesomeIcon icon={faCircle} size="2xs" />
      </span>
      <label className={config.key === 2 ? "pending" : undefined}>{config.label}</label>
    </button>
  );
}
