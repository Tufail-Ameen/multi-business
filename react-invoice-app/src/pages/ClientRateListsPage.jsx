import { faAngleLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Can } from "../auth/guards";
import RateListStatusBadge from "../components/rateLists/RateListStatusBadge";
import EmptyState from "../components/ui/EmptyState";
import FilterMenu from "../components/ui/FilterMenu";
import { useClients } from "../hooks/useClients";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import { useGetRateListsQuery } from "../services/invoiceApi";

const STATUS_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "DRAFT" },
  { label: "Sent", value: "SENT" },
  { label: "Archived", value: "ARCHIVED" },
];

export default function ClientRateListsPage() {
  const navigate = useNavigate();
  const { clients } = useClients();
  const [statusFilter, setStatusFilter] = useState("");
  const [clientId, setClientId] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const params = useMemo(() => {
    const next = { page, limit: 50 };
    if (statusFilter) next.status = statusFilter;
    if (clientId) next.clientId = clientId;
    if (q.trim()) next.q = q.trim();
    return next;
  }, [statusFilter, clientId, q, page]);

  const { data, isLoading, isError, error } = useGetRateListsQuery(params);
  const rateLists = data?.rateLists || [];
  const pagination = data?.pagination;
  const totalLists = pagination?.total ?? rateLists.length;

  useEffect(() => {
    setPage(1);
  }, [statusFilter, clientId, q]);

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Failed to load rate lists"));
  }, [isError, error]);

  let listsBody = null;
  if (isLoading) {
    listsBody = <p className="textcklr m-0 px-4 py-5">Loading…</p>;
  } else if (!rateLists.length) {
    listsBody = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title="No client lists yet"
        message="Use the catalog rate list, then save a list for a client."
      />
    );
  } else {
    listsBody = (
      <table className="product-table w-full min-w-[48rem] md:min-w-full">
        <thead>
          <tr>
            <th className="col-index text-left">#</th>
            <th className="text-left">Number</th>
            <th className="text-left">Title</th>
            <th className="text-left">Client</th>
            <th className="text-left">Items</th>
            <th className="text-left">Status</th>
            <th className="text-left">Sent</th>
          </tr>
        </thead>
        <tbody>
          {rateLists.map((list, index) => (
            <tr
              key={list.id}
              className="cursor-pointer"
              onClick={() => navigate(`/rate-lists/${list.id}`)}
            >
              <td className="col-index text-left">
                {((pagination?.page || page) - 1) * (pagination?.limit || 50) + index + 1}
              </td>
              <td className="table-text-size text-left">
                <span className="hash-clr">#</span>
                {list.number}
              </td>
              <td className="text-left">{list.title || "—"}</td>
              <td className="text-left">{list.clientName || `Client #${list.clientId}`}</td>
              <td className="text-left">{list.itemCount ?? 0}</td>
              <td className="text-left">
                <RateListStatusBadge status={list.status} />
              </td>
              <td className="cell-muted text-left">
                {list.sentAt ? new Date(list.sentAt).toLocaleDateString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="clients-page mx-auto w-full max-w-6xl">
      <section className="clients-page-section">
        <button
          type="button"
          className="back-link mb-3 shrink-0"
          onClick={() => navigate("/rate-lists")}
        >
          <FontAwesomeIcon className="icon me-2" icon={faAngleLeft} size="2xs" />
          Go back
        </button>

        <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="product-list-heading mb-1 !text-[1.35rem] !font-extrabold">
              Client rate lists
            </h1>
            <p className="textcklr small mb-0">
              There {totalLists === 1 ? "is" : "are"} {totalLists} total rate
              {totalLists === 1 ? " list" : " lists"}.
            </p>
          </div>
          <Can permission={PERMISSIONS.RATE_LISTS_CREATE}>
            <Link to="/rate-lists/new" className="btn save-changes w-full py-2 px-3 sm:w-auto">
              New rate list
            </Link>
          </Can>
        </div>

        <div className="form-card product-list-card client-list-card">
          <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--color-border)] px-3 py-3 sm:flex-row sm:items-center">
            <input
              type="search"
              className="form-control input-settings h-10 w-full rounded-[10px] md:max-w-[280px]"
              placeholder="Search title or number…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search rate lists"
            />
            <select
              className="form-select input-settings h-10 w-full rounded-[10px] sm:w-auto"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              aria-label="Filter by client"
            >
              <option value="">All clients</option>
              {clients.map((client) => (
                <option key={client.key || client.id} value={String(client.id)}>
                  {client.name}
                </option>
              ))}
            </select>
            <FilterMenu
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </div>
          <div className="product-table-scroll client-table-scroll">{listsBody}</div>
        </div>

        {pagination?.pages > 1 && (
          <div className="mt-3 flex shrink-0 items-center justify-end gap-2">
            <button
              type="button"
              className="btn cancel px-3 py-1"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="textcklr small">
              Page {pagination.page} of {pagination.pages}
            </span>
            <button
              type="button"
              className="btn cancel px-3 py-1"
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
