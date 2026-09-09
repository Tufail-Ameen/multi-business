import { faChevronDown, faStore } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import { toast } from "react-toastify";
import { useAuth } from "../../auth/AuthContext";
import { getErrorMessage } from "../../lib/rtkBaseQuery";

export default function BusinessSwitcher() {
  const { businesses, activeBusiness, switchBusiness, isLoading } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!businesses?.length) return null;

  const onChange = async (event) => {
    const businessId = event.target.value;
    if (!businessId || businessId === activeBusiness?.id) return;
    setBusy(true);
    try {
      await switchBusiness(businessId);
      toast.success("Business switch ho gaya");
    } catch (err) {
      toast.error(getErrorMessage(err, "Business switch fail"));
    } finally {
      setBusy(false);
    }
  };

  if (businesses.length === 1) {
    return (
      <div className="workspace-chip" title={activeBusiness?.name}>
        <span className="workspace-chip-icon" aria-hidden="true">
          <FontAwesomeIcon icon={faStore} />
        </span>
        <span className="workspace-chip-copy">
          <span className="workspace-chip-label">Workspace</span>
          <span className="workspace-chip-name">{activeBusiness?.name || "—"}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="workspace-chip is-select">
      <span className="workspace-chip-icon" aria-hidden="true">
        <FontAwesomeIcon icon={faStore} />
      </span>
      <span className="workspace-chip-copy">
        <span className="workspace-chip-label">Workspace</span>
        <select
          className="workspace-chip-select"
          value={activeBusiness?.id || ""}
          onChange={onChange}
          disabled={busy || isLoading}
          aria-label="Switch business"
        >
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </span>
      <FontAwesomeIcon icon={faChevronDown} className="workspace-chip-caret" />
    </div>
  );
}
