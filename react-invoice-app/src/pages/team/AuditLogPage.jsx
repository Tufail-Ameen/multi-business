import { useEffect } from "react";
import { toast } from "react-toastify";
import EmptyState from "../../components/ui/EmptyState";
import { getErrorMessage } from "../../lib/rtkBaseQuery";
import { useGetAuditLogsQuery } from "../../services/invoiceApi";

/**
 * Kaun ne kya change kiya — business-scoped audit.
 * Backend: GET /audit-logs
 */
export default function AuditLogPage() {
  const { data, isLoading, isError, error } = useGetAuditLogsQuery();
  const logs = data?.logs || data?.items || [];

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Audit log load nahi hua"));
  }, [isError, error]);

  return (
    <div className="page-wrap">
      <div className="invoices-header">
        <p className="count-invoices-tect mb-0">
          Team actions ka trail — invite, role change, business updates.
        </p>
      </div>

      {isLoading && <p className="textcklr mt-4">Loading…</p>}

      {!isLoading && !logs.length && (
        <EmptyState
          title="No audit events"
          message="Backend /audit-logs se events yahan aayenge."
        />
      )}

      {!!logs.length && (
        <div className="overflow-x-auto data-card mt-3 p-0">
          <table className="table mb-0 rbac-table">
            <thead>
              <tr>
                <th>#</th>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, index) => (
                <tr key={log.id}>
                  <td>{index + 1}</td>
                  <td>{log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}</td>
                  <td>{log.actorName || log.actorId || "—"}</td>
                  <td>
                    <code>{log.action}</code>
                  </td>
                  <td>
                    {log.entity}
                    {log.entityId ? ` · ${log.entityId}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
