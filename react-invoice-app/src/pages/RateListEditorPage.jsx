import { faAngleLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import Swal from "sweetalert2";
import { useAuth } from "../auth/AuthContext";
import { Can } from "../auth/guards";
import ProductPicker from "../components/rateLists/ProductPicker";
import SendRateListModal from "../components/rateLists/SendRateListModal";
import EmptyState from "../components/ui/EmptyState";
import { useClients } from "../hooks/useClients";
import { PERMISSIONS } from "../lib/permissions";
import { openRateListPrint } from "../lib/rateListPrint";
import {
  buildRateListItems,
  catalogSelection,
  copyText,
  getRateListShareUrl,
  isLocalhostOrigin,
  itemFromProduct,
  itemsFromRateList,
  mailtoShareHref,
  shareMessage,
  whatsappShareHref,
} from "../lib/rateLists";
import { getErrorCode, getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useCreateRateListMutation,
  useDeleteRateListMutation,
  useGetCategoriesQuery,
  useGetProductsQuery,
  useGetRateListQuery,
  useSendRateListMutation,
  useUpdateRateListMutation,
} from "../services/invoiceApi";

export default function RateListEditorPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { can } = useAuth();
  const { clients } = useClients();
  const seededCatalog = useRef(false);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [clientId, setClientId] = useState(searchParams.get("clientId") || "");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState({});
  const [clientError, setClientError] = useState("");
  const [sendOpen, setSendOpen] = useState(false);

  const productParams = useMemo(() => {
    const params = { status: "active" };
    if (search.trim()) params.q = search.trim();
    if (categoryId) params.categoryId = categoryId;
    return params;
  }, [search, categoryId]);

  const { data: productsData, isLoading: productsLoading } = useGetProductsQuery(productParams);
  const { data: categoriesData } = useGetCategoriesQuery(undefined, {
    skip: !can(PERMISSIONS.CATEGORIES_VIEW),
  });
  const {
    data: existing,
    isLoading: existingLoading,
    isError,
    error,
  } = useGetRateListQuery(id, { skip: !isEdit });

  const [createRateList, createState] = useCreateRateListMutation();
  const [updateRateList, updateState] = useUpdateRateListMutation();
  const [sendRateList, sendState] = useSendRateListMutation();
  const [deleteRateList, deleteState] = useDeleteRateListMutation();

  const products = useMemo(() => productsData?.products || [], [productsData]);
  const categories = categoriesData?.categories || [];
  const selectedItems = useMemo(() => Object.values(selected), [selected]);
  const selectedCount = selectedItems.length;
  const saving = createState.isLoading || updateState.isLoading || sendState.isLoading;

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

  useEffect(() => {
    if (isEdit || seededCatalog.current || !products.length) return;
    seededCatalog.current = true;
    setSelected((prev) => (Object.keys(prev).length ? prev : catalogSelection(products)));
  }, [isEdit, products]);

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
      const result = await persist();
      toast.success(isEdit ? "Draft updated" : "Draft saved");
      const nextId = result?.id ?? id;
      if (!isEdit && nextId) navigate(`/rate-lists/${nextId}`);
      return result;
    } catch (err) {
      handleApiError(err, "Save failed");
      return null;
    }
  };

  const openShare = (channel, list) => {
    const shareUrl = getRateListShareUrl(list);
    if (!shareUrl) return;
    const message = shareMessage(list);
    if (channel === "whatsapp") {
      window.open(whatsappShareHref(message, shareUrl), "_blank", "noopener,noreferrer");
    }
    if (channel === "email") {
      window.open(mailtoShareHref(list, shareUrl), "_blank", "noopener,noreferrer");
    }
    if (channel === "link") {
      copyText(shareUrl).then((ok) => {
        toast.success(ok ? "Share link copied" : shareUrl);
      });
    }
  };

  const confirmAndSend = async (options) => {
    const confirmed = await Swal.fire({
      title: "Send this rate list?",
      text: "The client will receive a share link.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Send",
      confirmButtonColor: "#2d6a56",
    });
    if (!confirmed.isConfirmed) return;

    if (!validate()) return;

    try {
      const saved = await persist();
      const listId = saved?.id ?? id;
      const sent = await sendRateList({
        id: listId,
        channel: options.channel,
        expiresAt: options.expiresAt,
        rotateToken: options.rotateToken,
      }).unwrap();
      const merged = { ...saved, ...sent };
      toast.success("Rate list sent");
      setSendOpen(false);
      openShare(options.channel, merged);
      navigate(`/rate-lists/${listId}`);
    } catch (err) {
      handleApiError(err, "Send failed");
    }
  };

  const onDelete = async () => {
    const result = await Swal.fire({
      title: "Delete this draft?",
      text: "This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#c23b3b",
    });
    if (!result.isConfirmed) return;
    try {
      await deleteRateList(id).unwrap();
      toast.success("Draft deleted");
      navigate("/rate-lists/clients");
    } catch (err) {
      toast.error(getErrorMessage(err, "Delete failed"));
    }
  };

  if (isEdit && existingLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl">
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
    <div className="mx-auto w-full max-w-6xl">
      <button
        type="button"
        className="back-link"
        onClick={() => navigate(isEdit ? "/rate-lists/clients" : "/rate-lists")}
      >
        <FontAwesomeIcon className="icon me-2" icon={faAngleLeft} size="2xs" />
        Go back
      </button>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="product-list-heading mb-1 !text-[1.35rem] !font-extrabold">
            {isEdit ? existing?.number || "Draft" : "New rate list"}
          </h1>
          <p className="mb-0 textcklr small">
            Default rates come from Products. Change a custom rate for this client only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="textcklr small">
            {selectedCount} product{selectedCount === 1 ? "" : "s"} selected
          </span>
          <Can permission={isEdit ? PERMISSIONS.RATE_LISTS_UPDATE : PERMISSIONS.RATE_LISTS_CREATE}>
            <button
              type="button"
              className="btn save px-3 py-2"
              disabled={saving || !selectedCount}
              onClick={saveDraft}
            >
              Save draft
            </button>
          </Can>
          <Can permission={PERMISSIONS.RATE_LISTS_SEND}>
            <button
              type="button"
              className="btn save-changes px-3 py-2"
              disabled={saving || !selectedCount}
              onClick={() => {
                if (isLocalhostOrigin()) {
                  if (!selectedCount) {
                    toast.error("Select at least one product");
                    return;
                  }
                  const opened = openRateListPrint(selectedItems, {
                    title: title.trim() || "Rate list",
                  });
                  if (!opened) {
                    toast.error("Print dialog did not open. Try again.");
                    return;
                  }
                  toast.success("Save as PDF, then send it on WhatsApp");
                  return;
                }
                if (!validate()) return;
                setSendOpen(true);
              }}
            >
              Save & send
            </button>
          </Can>
          {isEdit && (
            <Can permission={PERMISSIONS.RATE_LISTS_DELETE}>
              <button
                type="button"
                className="btn delete px-3 py-2"
                disabled={deleteState.isLoading}
                onClick={onDelete}
              >
                Delete
              </button>
            </Can>
          )}
        </div>
      </div>

      <div className="form-card form-card-compact mb-3">
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
      />

      <SendRateListModal
        open={sendOpen}
        onClose={() => {
          setSendOpen(false);
        }}
        onSend={confirmAndSend}
        sending={saving}
        showRotate={false}
      />
    </div>
  );
}
