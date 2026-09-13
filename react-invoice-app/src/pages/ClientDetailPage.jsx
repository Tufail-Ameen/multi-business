import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { faAngleLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Can } from "../auth/guards";
import ClientRateListsTab from "../components/clients/ClientRateListsTab";
import SendClientRateListModal from "../components/clients/SendClientRateListModal";
import EmptyState from "../components/ui/EmptyState";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import { useGetClientQuery } from "../services/invoiceApi";

function formatCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("details");
  const [sendOpen, setSendOpen] = useState(false);
  const { data, isLoading, isError, error } = useGetClientQuery(id);
  const client = data?.client;

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Client not found"));
  }, [isError, error]);

  if (isLoading) {
    return (
      <div className="page-wrap">
        <p className="textcklr">Loading…</p>
      </div>
    );
  }

  if (!client) {
    return (
      <EmptyState title="Client not found" message="This client does not exist or was deleted." />
    );
  }

  return (
    <div className="page-wrap">
      <button type="button" className="back-link" onClick={() => navigate("/clients")}>
        <FontAwesomeIcon className="icon me-2" icon={faAngleLeft} size="2xs" />
        Go back
      </button>

      <div className="invoices-header mb-3">
        <div>
          <p className="count-invoices-tect mb-1">{client.name}</p>
          <p className="textcklr small mb-0">{formatCell(client.phone)}</p>
        </div>
        <Can permission={PERMISSIONS.RATE_LISTS_SEND}>
          <button
            type="button"
            className="btn save-changes py-2 px-3"
            onClick={() => setSendOpen(true)}
          >
            <FontAwesomeIcon icon={faWhatsapp} />
            Send rate list
          </button>
        </Can>
      </div>

      <nav className="stock-tab-nav mb-4" aria-label="Client sections">
        <button
          type="button"
          className={`stock-tab-btn ${tab === "details" ? "active" : ""}`}
          onClick={() => setTab("details")}
        >
          Details
        </button>
        <Can permission={PERMISSIONS.RATE_LISTS_VIEW}>
          <button
            type="button"
            className={`stock-tab-btn ${tab === "rate-lists" ? "active" : ""}`}
            onClick={() => setTab("rate-lists")}
          >
            Rate lists
          </button>
        </Can>
      </nav>

      {tab === "details" && (
        <div className="detail-card">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-6">
              <span className="edit-discription block">Shop name</span>
              <span className="date-bill-email block">{formatCell(client.name)}</span>
            </div>
            <div className="col-span-12 md:col-span-6">
              <span className="edit-discription block">Phone</span>
              <span className="date-bill-email block">{formatCell(client.phone)}</span>
            </div>
            <div className="col-span-12 md:col-span-6">
              <span className="edit-discription block">Area</span>
              <span className="date-bill-email block">{formatCell(client.area)}</span>
            </div>
            <div className="col-span-12 md:col-span-6">
              <span className="edit-discription block">Address</span>
              <span className="date-bill-email block">{formatCell(client.address)}</span>
            </div>
            <div className="col-span-12 md:col-span-3">
              <span className="edit-discription block">City</span>
              <span className="date-bill-email block">{formatCell(client.city)}</span>
            </div>
            <div className="col-span-12 md:col-span-3">
              <span className="edit-discription block">Country</span>
              <span className="date-bill-email block">{formatCell(client.country)}</span>
            </div>
          </div>
        </div>
      )}

      {tab === "rate-lists" && <ClientRateListsTab clientId={id} />}

      {sendOpen ? (
        <SendClientRateListModal client={client} onClose={() => setSendOpen(false)} />
      ) : null}
    </div>
  );
}
