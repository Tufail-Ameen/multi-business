import { faCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const STATUS_MAP = {
  DRAFT: { label: "Draft", className: "draftbtn" },
  SENT: { label: "Sent", className: "paidbtn" },
  ARCHIVED: { label: "Archived", className: "draftbtn opacity-70" },
};

export default function RateListStatusBadge({ status, compact = true }) {
  const key = String(status || "DRAFT").toUpperCase();
  const config = STATUS_MAP[key] || STATUS_MAP.DRAFT;

  return (
    <span className={`btn ${config.className} ${compact ? "px-3 py-1 text-xs" : "px-4"}`}>
      <span className="me-1">
        <FontAwesomeIcon icon={faCircle} size="2xs" />
      </span>
      {config.label}
    </span>
  );
}
