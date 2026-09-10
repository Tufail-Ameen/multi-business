import { useState } from "react";
import { toast } from "react-toastify";
import { Can } from "../auth/guards";
import { useAuth } from "../auth/AuthContext";
import SupplierFormModal, { toSupplierPayload } from "../components/suppliers/SupplierFormModal";
import SupplierList from "../components/suppliers/SupplierList";
import { useSupplierMutations } from "../hooks/useSuppliers";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";

export default function SuppliersPage() {
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { can } = useAuth();
  const { createSupplier, updateSupplier, deleteSupplier, isSaving } = useSupplierMutations();

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const canOpenForm = editing
    ? can(PERMISSIONS.SUPPLIERS_UPDATE)
    : can(PERMISSIONS.SUPPLIERS_CREATE);

  const onSubmit = async (values, { resetForm }) => {
    try {
      const payload = toSupplierPayload(values);
      if (editing) {
        await updateSupplier({ id: editing.id, ...payload }).unwrap();
        toast.success("Vendor updated");
      } else {
        await createSupplier(payload).unwrap();
        toast.success("Vendor added");
      }
      resetForm();
      closeForm();
    } catch (err) {
      toast.error(getErrorMessage(err, "Save failed"));
    }
  };

  const onDelete = async (supplier) => {
    if (!window.confirm(`Delete ${supplier.name}?`)) return;
    try {
      await deleteSupplier(supplier.id).unwrap();
      toast.success("Deleted");
    } catch (err) {
      toast.error(getErrorMessage(err, "Delete failed"));
    }
  };

  return (
    <div className="clients-page mx-auto w-full max-w-6xl">
      <section className="clients-page-section">
        <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="product-list-heading mb-1 !text-[1.35rem] !font-extrabold">
              Vendors
            </h1>
            <p className="textcklr small mb-0">
              Add and manage vendors for purchases and payments.
            </p>
          </div>
          <Can permission={PERMISSIONS.SUPPLIERS_CREATE}>
            <button
              type="button"
              className="btn save-changes w-full py-2 px-3 sm:w-auto"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              New vendor
            </button>
          </Can>
        </div>

        <SupplierList
          query={query}
          onQueryChange={setQuery}
          onEdit={(supplier) => {
            if (!can(PERMISSIONS.SUPPLIERS_UPDATE)) return;
            setEditing(supplier);
            setFormOpen(true);
          }}
          onDelete={onDelete}
          canEditPermission={PERMISSIONS.SUPPLIERS_UPDATE}
          canDeletePermission={PERMISSIONS.SUPPLIERS_DELETE}
        />
      </section>

      {formOpen && canOpenForm && (
        <SupplierFormModal
          supplier={editing}
          isSaving={isSaving}
          onClose={closeForm}
          onSubmit={onSubmit}
        />
      )}
    </div>
  );
}
