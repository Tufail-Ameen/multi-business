import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { faAngleLeft, faPen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Can } from "../auth/guards";
import ClientFormModal, { toClientPayload } from "../components/clients/ClientFormModal";
import ClientRateListsTab from "../components/clients/ClientRateListsTab";
import SendClientRateListModal from "../components/clients/SendClientRateListModal";
import EmptyState from "../components/ui/EmptyState";
import { useClientMutations } from "../hooks/useClients";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import { useGetClientQuery, useGetClientRateListsQuery } from "../services/invoiceApi";
import { formatInvoiceDate } from "../utils/invoice";

function formatCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function shopInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "SH";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function uniqueLine(parts) {
  const seen = new Set();
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" · ");
}

function telHref(phone) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits.length >= 7 ? `tel:${digits}` : null;
}

function sameText(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function RecordRow({ label, value, href, wide = false }) {
  const text = formatCell(value);
  return (
    <div className={`client-record-row${wide ? " is-wide" : ""}`}>
      <dt>{label}</dt>
      <dd>
        {href && text !== "—" ? (
          <a href={href}>{text}</a>
        ) : (
          text
        )}
      </dd>
    </div>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("details");
  const [sendOpen, setSendOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { data, isLoading, isError, error } = useGetClientQuery(id);
  const { data: listsData } = useGetClientRateListsQuery(
    { id, per_page: 100 },
    { skip: !id }
  );
  const { updateClient, isSaving } = useClientMutations();
  const client = data?.client;
  const phoneHref = telHref(client?.phone);
  const place = uniqueLine([client?.area, client?.city, client?.country]);
  const showAddress = Boolean(client?.address) && !sameText(client.address, client.area);

  const stats = useMemo(() => {
    const lists = listsData?.rateLists || [];
    const lastSentRaw = lists.reduce((latest, list) => {
      if (!list.sentAt) return latest;
      if (!latest || new Date(list.sentAt) > new Date(latest)) return list.sentAt;
      return latest;
    }, null);
    return {
      lists: lists.length,
      sent: lists.filter((list) => list.sentAt).length,
      lastSent: lastSentRaw ? formatInvoiceDate(lastSentRaw) : "Never",
    };
  }, [listsData]);

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Client not found"));
  }, [isError, error]);

  const onSave = async (values, { resetForm }) => {
    try {
      await updateClient({ id: client.id, ...toClientPayload(values) }).unwrap();
      toast.success("Client updated");
      resetForm();
      setEditOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Save failed"));
    }
  };

  if (isLoading) {
    return (
      <div className="client-profile">
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
    <div className="client-profile">
      <article className="client-record">
        <div className="client-record-toolbar">
          <button type="button" className="client-record-back" onClick={() => navigate("/clients")}>
            <FontAwesomeIcon icon={faAngleLeft} size="2xs" />
            Clients
          </button>
          <div className="client-record-actions">
            <Can permission={PERMISSIONS.CLIENTS_UPDATE}>
              <button type="button" className="btn edit py-2 px-3" onClick={() => setEditOpen(true)}>
                <FontAwesomeIcon icon={faPen} />
                Edit
              </button>
            </Can>
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
        </div>

        <header className="client-record-letterhead">
          <div className="client-record-brand">
            <span className="client-record-mark" aria-hidden="true">
              {shopInitials(client.name)}
            </span>
            <div className="min-w-0">
              <h1>{formatCell(client.name)}</h1>
              {place ? <p>{place}</p> : null}
              {phoneHref ? (
                <a href={phoneHref}>{client.phone}</a>
              ) : (
                <p>{formatCell(client.phone)}</p>
              )}
            </div>
          </div>
          <div className="client-record-doctype">
            <span>Client record</span>
            <strong>Active shop</strong>
          </div>
        </header>

        <section className="client-record-stats" aria-label="Client summary">
          <div>
            <span>Rate lists</span>
            <strong>{stats.lists}</strong>
          </div>
          <div>
            <span>Sent</span>
            <strong>{stats.sent}</strong>
          </div>
          <div>
            <span>Last sent</span>
            <strong>{stats.lastSent}</strong>
          </div>
        </section>

        <nav className="client-record-tabs" aria-label="Client sections">
          <button
            type="button"
            className={tab === "details" ? "is-active" : undefined}
            onClick={() => setTab("details")}
          >
            Details
          </button>
          <Can permission={PERMISSIONS.RATE_LISTS_VIEW}>
            <button
              type="button"
              className={tab === "rate-lists" ? "is-active" : undefined}
              onClick={() => setTab("rate-lists")}
            >
              Rate lists
            </button>
          </Can>
        </nav>

        {tab === "details" ? (
          <dl className="client-record-particulars">
            <RecordRow label="Phone" value={client.phone} href={phoneHref} />
            <RecordRow label="Area" value={client.area} />
            {showAddress ? <RecordRow label="Address" value={client.address} wide /> : null}
            <RecordRow label="City" value={client.city} />
            <RecordRow label="Country" value={client.country} />
          </dl>
        ) : (
          <div className="client-record-body">
            <ClientRateListsTab clientId={id} embedded />
          </div>
        )}
      </article>

      {editOpen ? (
        <ClientFormModal
          client={client}
          isSaving={isSaving}
          onClose={() => setEditOpen(false)}
          onSubmit={onSave}
        />
      ) : null}

      {sendOpen ? (
        <SendClientRateListModal client={client} onClose={() => setSendOpen(false)} />
      ) : null}
    </div>
  );
}
