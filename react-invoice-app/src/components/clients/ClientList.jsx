import { faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Can } from "../../auth/guards";
import { useClients } from "../../hooks/useClients";
import EmptyState from "../ui/EmptyState";

function formatCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function matchesQuery(client, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [client.name, client.phone, client.area, client.address, client.city, client.country]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

/**
 * Clients list — data GET /clients se aati hai (useClients hook).
 */
export default function ClientList({
  query = "",
  onQueryChange,
  onEdit,
  onDelete,
  canEditPermission,
  canDeletePermission,
}) {
  const { clients, isLoading } = useClients();

  const visibleClients = useMemo(
    () => clients.filter((client) => matchesQuery(client, query)),
    [clients, query]
  );

  const editButton = (client) => (
    <button
      type="button"
      className="btn btn-table-edit"
      onClick={() => onEdit?.(client)}
      title="Edit client"
    >
      <FontAwesomeIcon icon={faPen} />
      Edit
    </button>
  );

  const deleteButton = (client) => (
    <button
      type="button"
      className="btn btn-table-remove"
      onClick={() => onDelete?.(client)}
      title="Remove client"
    >
      <FontAwesomeIcon icon={faTrash} />
      Remove
    </button>
  );

  let body = null;
  if (isLoading) {
    body = <p className="textcklr m-0 px-4 py-5">Loading…</p>;
  } else if (!clients.length) {
    body = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title="No clients yet"
        message="Add a client to bill invoices."
      />
    );
  } else if (!visibleClients.length) {
    body = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title="No matching clients"
        message="Try a different shop name, phone, area, or city."
      />
    );
  } else {
    body = (
      <table className="product-table w-full min-w-[48rem] md:min-w-full">
        <thead>
          <tr>
            <th className="col-index text-left">#</th>
            <th className="text-left">Shop name</th>
            <th className="text-left">Phone</th>
            <th className="text-left">Area</th>
            <th className="text-left">Address</th>
            <th className="text-left">City</th>
            <th className="text-left">Country</th>
            <th className="w-[1%] whitespace-nowrap text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleClients.map((client, index) => (
            <tr key={client.key || client._id || client.id}>
              <td className="col-index text-left">{index + 1}</td>
              <td className="table-text-size text-left">
                {client.id != null ? (
                  <Link
                    to={`/clients/${client.id}`}
                    className="font-bold text-[var(--color-primary)] no-underline hover:underline"
                  >
                    {formatCell(client.name)}
                  </Link>
                ) : (
                  formatCell(client.name)
                )}
              </td>
              <td className="cell-muted text-left">{formatCell(client.phone)}</td>
              <td className="cell-muted text-left">{formatCell(client.area)}</td>
              <td className="cell-muted text-left">{formatCell(client.address)}</td>
              <td className="cell-muted text-left">{formatCell(client.city)}</td>
              <td className="cell-muted text-left">{formatCell(client.country)}</td>
              <td className="w-[1%] whitespace-nowrap pl-2 text-right">
                <div className="table-actions inline-flex justify-end">
                  {canEditPermission ? (
                    <Can permission={canEditPermission}>{editButton(client)}</Can>
                  ) : (
                    editButton(client)
                  )}
                  {canDeletePermission ? (
                    <Can permission={canDeletePermission}>{deleteButton(client)}</Can>
                  ) : (
                    deleteButton(client)
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="form-card product-list-card client-list-card">
      <div className="client-list-toolbar flex items-center border-b border-[var(--color-border)] px-3 py-3">
        <input
          type="search"
          className="form-control input-settings h-10 w-full rounded-[10px] md:max-w-[420px]"
          placeholder="Search shop name, phone, area, or city…"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          aria-label="Search clients"
        />
      </div>
      <div className="product-table-scroll client-table-scroll">{body}</div>
    </div>
  );
}
