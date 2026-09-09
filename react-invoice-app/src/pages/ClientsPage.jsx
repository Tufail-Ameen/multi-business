import { useState } from "react";
import { toast } from "react-toastify";
import { Can } from "../auth/guards";
import { useAuth } from "../auth/AuthContext";
import ClientFormModal, { toClientPayload } from "../components/clients/ClientFormModal";
import ClientList from "../components/clients/ClientList";
import { useClientMutations } from "../hooks/useClients";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";

export default function ClientsPage() {
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { can } = useAuth();
  const { createClient, updateClient, deleteClient, isSaving } = useClientMutations();

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const canOpenForm = editing
    ? can(PERMISSIONS.CLIENTS_UPDATE)
    : can(PERMISSIONS.CLIENTS_CREATE);

  const onSubmit = async (values, { resetForm }) => {
    try {
      const payload = toClientPayload(values);
      if (editing) {
        await updateClient({ id: editing.id, ...payload }).unwrap();
        toast.success("Client updated");
      } else {
        await createClient(payload).unwrap();
        toast.success("Client added");
      }
      resetForm();
      closeForm();
    } catch (err) {
      toast.error(getErrorMessage(err, "Save failed"));
    }
  };

  const onDelete = async (client) => {
    if (!window.confirm(`Delete ${client.name}?`)) return;
    try {
      await deleteClient(client.id).unwrap();
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
              Clients
            </h1>
            <p className="textcklr small mb-0">
              Add and manage billing clients for invoices and rate lists.
            </p>
          </div>
          <Can permission={PERMISSIONS.CLIENTS_CREATE}>
            <button
              type="button"
              className="btn save-changes w-full py-2 px-3 sm:w-auto"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              New client
            </button>
          </Can>
        </div>

        <ClientList
          query={query}
          onQueryChange={setQuery}
          onEdit={(client) => {
            if (!can(PERMISSIONS.CLIENTS_UPDATE)) return;
            setEditing(client);
            setFormOpen(true);
          }}
          onDelete={onDelete}
          canEditPermission={PERMISSIONS.CLIENTS_UPDATE}
          canDeletePermission={PERMISSIONS.CLIENTS_DELETE}
        />
      </section>

      {formOpen && canOpenForm && (
        <ClientFormModal
          client={editing}
          isSaving={isSaving}
          onClose={closeForm}
          onSubmit={onSubmit}
        />
      )}
    </div>
  );
}
