import { faCirclePlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Swal from "sweetalert2";
import { useAuth } from "../../auth/AuthContext";
import { Can } from "../../auth/guards";
import EmptyState from "../../components/ui/EmptyState";
import { PERMISSION_GROUPS, PERMISSIONS } from "../../lib/permissions";
import { getErrorMessage } from "../../lib/rtkBaseQuery";
import {
  useCreateRoleMutation,
  useDeleteRoleMutation,
  useGetRolesQuery,
  useUpdateRoleMutation,
} from "../../services/invoiceApi";

/**
 * Roles = permissions ka bundle.
 * Backend: GET/POST/PATCH/DELETE /roles
 */
export default function TeamRolesPage() {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.ROLES_MANAGE);
  const { data, isLoading, isError, error, refetch } = useGetRolesQuery();
  const [createRole] = useCreateRoleMutation();
  const [updateRole] = useUpdateRoleMutation();
  const [deleteRole] = useDeleteRoleMutation();

  const roles = data?.roles || data?.items || [];
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const selected = roles.find((r) => r.id === selectedId) || roles[0] || null;

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Roles load nahi hue"));
  }, [isError, error]);

  useEffect(() => {
    if (selected) {
      setSelectedId(selected.id);
      setDraft([...(selected.permissions || [])]);
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isWildcard = selected?.permissions?.includes("*");
  const dirty =
    selected &&
    !isWildcard &&
    (draft.length !== (selected.permissions?.length || 0) ||
      draft.some((p) => !selected.permissions.includes(p)));

  const toggle = (key) => {
    if (!canManage) return;
    setDraft((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const save = async () => {
    try {
      await updateRole({ id: selected.id, permissions: draft }).unwrap();
      toast.success("Permissions saved");
      refetch();
    } catch (err) {
      toast.error(getErrorMessage(err, "Save fail"));
    }
  };

  const onCreate = async () => {
    if (!newName.trim()) return;
    try {
      const result = await createRole({
        name: newName.trim(),
        description: newDesc.trim(),
        permissions: [],
      }).unwrap();
      toast.success("Role created");
      setCreating(false);
      setNewName("");
      setNewDesc("");
      setSelectedId(result.role?.id);
      refetch();
    } catch (err) {
      toast.error(getErrorMessage(err, "Create fail"));
    }
  };

  const onDelete = async () => {
    if (!selected || selected.isSystem) return;
    const result = await Swal.fire({
      title: "Delete role?",
      icon: "warning",
      showCancelButton: true,
    });
    if (!result.isConfirmed) return;
    try {
      await deleteRole(selected.id).unwrap();
      toast.success("Deleted");
      setSelectedId(null);
      refetch();
    } catch (err) {
      toast.error(getErrorMessage(err, "Delete fail"));
    }
  };

  return (
    <div className="page-wrap">
      <div className="invoices-header">
        <p className="count-invoices-tect mb-0">
          Role = job title. Permissions = us role ki ijazatain.
        </p>
        <Can permission={PERMISSIONS.ROLES_MANAGE}>
          <button type="button" className="btn new-invoice" onClick={() => setCreating(true)}>
            <span className="circle-plus me-2">
              <FontAwesomeIcon icon={faCirclePlus} />
            </span>
            New role
          </button>
        </Can>
      </div>

      {isLoading && <p className="textcklr mt-4">Loading…</p>}

      {!isLoading && !roles.length && (
        <EmptyState
          title="Roles nahi mile"
          message="Backend /roles seed (business_owner, invoice_clerk, …) ke baad yahan list aayegi."
        />
      )}

      {!!roles.length && (
        <div className="rbac-roles-layout mt-3">
          <aside className="data-card rbac-roles-list">
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                className={`rbac-role-item ${selected?.id === role.id ? "active" : ""}`}
                onClick={() => setSelectedId(role.id)}
              >
                <strong>{role.name}</strong>
                <span className="textcklr small block">
                  {role.isSystem ? "System" : "Custom"} ·{" "}
                  {role.permissions?.includes("*")
                    ? "All access"
                    : `${role.permissions?.length || 0} perms`}
                </span>
              </button>
            ))}
          </aside>

          <section className="data-card rbac-roles-detail">
            {!selected ? (
              <p className="textcklr mb-0">Role select karein</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h2 className="rbac-entity-title mb-1">{selected.name}</h2>
                    <p className="textcklr mb-0">{selected.description || "—"}</p>
                  </div>
                  <Can permission={PERMISSIONS.ROLES_MANAGE}>
                    {!selected.isSystem && (
                      <button type="button" className="btn text-sm text-red-600" onClick={onDelete}>
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    )}
                  </Can>
                </div>

                {isWildcard ? (
                  <div className="empty-state py-4">
                    <p className="mb-0 textcklr">
                      Is role ke paas wildcard <code>*</code> hai — har permission auto milti hai.
                    </p>
                  </div>
                ) : (
                  PERMISSION_GROUPS.filter((g) => g.key !== "platform").map((group) => (
                    <div key={group.key} className="rbac-perm-group">
                      <h3 className="rbac-perm-group-title">{group.label}</h3>
                      <p className="textcklr small">{group.description}</p>
                      <div className="rbac-perm-checks">
                        {group.permissions.map((perm) => (
                          <label key={perm.key} className="rbac-perm-check">
                            <input
                              type="checkbox"
                              checked={draft.includes(perm.key)}
                              disabled={!canManage}
                              onChange={() => toggle(perm.key)}
                            />
                            <span>{perm.label}</span>
                            <code className="rbac-perm-key">{perm.key}</code>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))
                )}

                <Can permission={PERMISSIONS.ROLES_MANAGE}>
                  {!isWildcard && (
                    <button
                      type="button"
                      className="btn new-invoice mt-3"
                      disabled={!dirty}
                      onClick={save}
                    >
                      Save permissions
                    </button>
                  )}
                </Can>
              </>
            )}
          </section>
        </div>
      )}

      {creating && (
        <div className="rbac-modal-backdrop" onClick={() => setCreating(false)}>
          <div className="form-card rbac-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="page-title mb-3" style={{ fontSize: "1.35rem" }}>
              Create role
            </h2>
            <div className="mb-3">
              <label className="form-label input-clr">Name</label>
              <input
                className="form-control input-settings"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="mb-3">
              <label className="form-label input-clr">Description</label>
              <textarea
                className="form-control input-settings"
                rows={2}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn filter" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="button" className="btn new-invoice" onClick={onCreate}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
