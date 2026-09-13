import { faAngleLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuth } from "../auth/AuthContext";
import { Can } from "../auth/guards";
import ProductPicker from "../components/rateLists/ProductPicker";
import EmptyState from "../components/ui/EmptyState";
import { useClients } from "../hooks/useClients";
import { PERMISSIONS } from "../lib/permissions";
import {
  buildRateListItems,
  itemFromProduct,
  itemsFromRateList,
} from "../lib/rateLists";
import { getErrorCode, getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useCreateRateListMutation,
  useGetCategoriesQuery,
  useGetProductsQuery,
  useGetRateListQuery,
  useUpdateRateListMutation,
} from "../services/invoiceApi";

export default function RateListEditorPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { can } = useAuth();
  const { clients } = useClients();

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [clientId, setClientId] = useState(searchParams.get("clientId") || "");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState({});
  const [clientError, setClientError] = useState("");

  const { data: productsData, isLoading: productsLoading } = useGetProductsQuery({
    status: "active",
    per_page: 100,
  });
  const { data: categoriesData } = useGetCategoriesQuery(
    { per_page: 100 },
    {
      skip: !can(PERMISSIONS.CATEGORIES_VIEW),
    }
  );
  const {
    data: existing,
    isLoading: existingLoading,
    isError,
    error,
  } = useGetRateListQuery(id, { skip: !isEdit });

  const [createRateList, createState] = useCreateRateListMutation();
  const [updateRateList, updateState] = useUpdateRateListMutation();

  const products = useMemo(() => productsData?.products || [], [productsData]);
  const categories = categoriesData?.categories || [];
  const selectedItems = useMemo(() => Object.values(selected), [selected]);
  const selectedCount = selectedItems.length;
  const saving = createState.isLoading || updateState.isLoading;

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Rate list not found"));
  }, [isError, error]);

  useEffect(() => {
    if (!existing) return;
    setClientId(existing.clientId != null ? String(existing.clientId) : "");
    setTitle(existing.title || "");
    setNotes(existing.notes || "");
    setSelected(itemsFromRateList(existing));
    // Hydrate once per list so a refetch does not wipe in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);

  const toggleProduct = (product) => {
    const key = String(product.id);
    setSelected((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: itemFromProduct(product) };
    });
  };

  const toggleVisible = (visibleProducts, shouldSelect) => {
    setSelected((prev) => {
      if (!shouldSelect) {
        const next = { ...prev };
        for (const product of visibleProducts) {
          delete next[String(product.id)];
        }
        return next;
      }
      const next = { ...prev };
      for (const product of visibleProducts) {
        const key = String(product.id);
        if (!next[key]) next[key] = itemFromProduct(product);
      }
      return next;
    });
  };

  const setRate = (product, customPrice) => {
    setSelected((prev) => {
      const key = String(product.id);
      const item = prev[key] || itemFromProduct(product);
      return { ...prev, [key]: { ...item, customPrice } };
    });
  };

  const removeItem = (productId) => {
    setSelected((prev) => {
      const next = { ...prev };
      delete next[String(productId)];
      return next;
    });
  };

  const handleApiError = (err, fallback) => {
    const code = getErrorCode(err);
    if (code === "CLIENT_NOT_FOUND") {
      setClientError("Client not found");
      toast.error("Client not found");
      return;
    }
    if (code === "INVALID_PRODUCT") {
      const badId = err?.data?.details?.productId;
      if (badId != null) removeItem(badId);
      toast.error("A product is not available and was removed.");
      return;
    }
    if (code === "DUPLICATE_PRODUCT") {
      toast.error("Duplicate product in the list. Remove extras and try again.");
      return;
    }
    if (code === "RATE_LIST_LOCKED") {
      toast.error("Sent lists cannot be edited.");
      if (id) navigate(`/rate-lists/${id}`, { replace: true });
      return;
    }
    if (code === "VALIDATION_ERROR") {
      toast.error(getErrorMessage(err, "Check the form and try again."));
      return;
    }
    toast.error(getErrorMessage(err, fallback));
  };

  const validate = () => {
    if (!clientId) {
      setClientError("Client required");
      toast.error("Choose a client");
      return false;
    }
    setClientError("");
    if (!selectedCount) {
      toast.error("Select at least one product");
      return false;
    }
    const negative = selectedItems.some((item) => Number(item.customPrice) < 0);
    if (negative) {
      toast.error("Custom rate cannot be negative");
      return false;
    }
    return true;
  };

  const payload = () => ({
    clientId: Number(clientId),
    title: title.trim() || null,
    notes: notes.trim() || null,
    items: buildRateListItems(selected),
  });

  const persist = async () => {
    if (isEdit) {
      return updateRateList({ id, ...payload() }).unwrap();
    }
    return createRateList(payload()).unwrap();
  };

  const saveDraft = async () => {
    if (!validate()) return null;
    try {
      await persist();
      toast.success("Saved");
      const shop =
        clients.find((row) => String(row.id) === String(clientId)) || {
          id: Number(clientId),
          name: existing?.clientName || "",
        };
      navigate("/clients", { state: { sendClient: shop } });
      return shop;
    } catch (err) {
      handleApiError(err, "Save failed");
      return null;
    }
  };

  if (isEdit && existingLoading) {
    return (
      <div className="clients-page mx-auto w-full max-w-6xl">
        <p className="textcklr">Loading…</p>
      </div>
    );
  }

  if (isEdit && !existing) {
    return (
      <EmptyState title="Rate list not found" message="This rate list does not exist or was deleted." />
    );
  }

  return (
    <div className="clients-page mx-auto w-full max-w-6xl">
      <section className="clients-page-section">
        <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <button
              type="button"
              className="back-link"
              onClick={() => navigate(isEdit ? "/rate-lists/clients" : "/rate-lists")}
            >
              <FontAwesomeIcon className="icon me-2" icon={faAngleLeft} size="2xs" />
              Go back
            </button>
            <h1 className="product-list-heading mb-1 !text-[1.35rem] !font-extrabold">
              {isEdit ? existing?.number || "Draft" : "New rate list"}
            </h1>
            <p className="mb-0 textcklr small">
              Tick only the products this shop buys. Custom rates stay on this client.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className="textcklr small">
              {selectedCount} product{selectedCount === 1 ? "" : "s"} selected
            </span>
            <Can permission={isEdit ? PERMISSIONS.RATE_LISTS_UPDATE : PERMISSIONS.RATE_LISTS_CREATE}>
              <button
                type="button"
                className="btn save-changes px-3 py-2"
                disabled={saving || !selectedCount}
                onClick={saveDraft}
              >
                Save
              </button>
            </Can>
          </div>
        </div>

        <ProductPicker
          products={products}
          isLoading={productsLoading}
          search={search}
          categoryId={categoryId}
          categories={categories}
          selected={selected}
          onSearch={setSearch}
          onCategory={setCategoryId}
          onToggle={toggleProduct}
          onToggleVisible={toggleVisible}
          onSetRate={setRate}
          topSlot={
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-4">
                <label className="form-label input-clr" htmlFor="rate-list-client">
                  Client
                </label>
                <select
                  id="rate-list-client"
                  className="form-select input-settings"
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    setClientError("");
                  }}
                >
                  <option value="">Select client…</option>
                  {clients.map((client) => (
                    <option key={client.key || client.id} value={String(client.id)}>
                      {client.name}
                    </option>
                  ))}
                </select>
                {clientError ? <div className="text-red-600 small">{clientError}</div> : null}
              </div>
              <div className="col-span-12 md:col-span-4">
                <label className="form-label input-clr" htmlFor="rate-list-title">
                  Title (optional)
                </label>
                <input
                  id="rate-list-title"
                  className="form-control input-settings"
                  placeholder="Rate list for this client"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="col-span-12 md:col-span-4">
                <label className="form-label input-clr" htmlFor="rate-list-notes">
                  Notes (optional)
                </label>
                <input
                  id="rate-list-notes"
                  className="form-control input-settings"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          }
        />
      </section>
    </div>
  );
}
