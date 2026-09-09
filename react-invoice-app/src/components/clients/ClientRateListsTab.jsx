import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Can } from "../../auth/guards";
import { PERMISSIONS } from "../../lib/permissions";
import { getErrorMessage } from "../../lib/rtkBaseQuery";
import { useGetClientRateListsQuery } from "../../services/invoiceApi";
import EmptyState from "../ui/EmptyState";
import RateListStatusBadge from "../rateLists/RateListStatusBadge";

export default function ClientRateListsTab({ clientId }) {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useGetClientRateListsQuery(clientId, {
    skip: !clientId,
  });
  const [q, setQ] = useState("");

  const rateLists = useMemo(() => data?.rateLists || [], [data?.rateLists]);

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Failed to load rate lists"));
  }, [isError, error]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rateLists;
    return rateLists.filter((list) =>
      `${list.number || ""} ${list.title || ""}`.toLowerCase().includes(term)
    );
  }, [rateLists, q]);

  let body = null;
  if (isLoading) {
    body = <p className="textcklr m-0 px-4 py-5">Loading…</p>;
  } else if (!filtered.length) {
    body = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title="No rate lists yet"
        message="Create a list with custom rates for this client."
      />
    );
  } else {
    body = (
      <table className="product-table w-full min-w-[48rem] md:min-w-full">
        <thead>
          <tr>
            <th className="col-index text-left">#</th>
            <th className="text-left">Number</th>
            <th className="text-left">Title</th>
            <th className="text-left">Items</th>
            <th className="text-left">Status</th>
            <th className="text-left">Sent</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((list, index) => (
            <tr
              key={list.id}
              className="cursor-pointer"
              onClick={() => navigate(`/rate-lists/${list.id}`)}
            >
              <td className="col-index text-left">{index + 1}</td>
              <td className="table-text-size text-left">
                <span className="hash-clr">#</span>
                {list.number}
              </td>
              <td className="text-left">{list.title || "—"}</td>
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
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="mb-0 textcklr small">
          {rateLists.length} rate list{rateLists.length === 1 ? "" : "s"} for this client
        </p>
        <Can permission={PERMISSIONS.RATE_LISTS_CREATE}>
          <Link
            to={`/rate-lists/new?clientId=${encodeURIComponent(clientId)}`}
            className="btn save-changes w-full px-3 py-2 sm:w-auto"
          >
            New rate list
          </Link>
        </Can>
      </div>

      <div className="form-card product-list-card client-list-card">
        <div className="flex items-center border-b border-[var(--color-border)] px-3 py-3">
          <input
            type="search"
            className="form-control input-settings h-10 w-full rounded-[10px] md:max-w-[420px]"
            placeholder="Search lists…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search rate lists"
          />
        </div>
        <div className="product-table-scroll client-table-scroll">{body}</div>
      </div>
    </div>
  );
}
