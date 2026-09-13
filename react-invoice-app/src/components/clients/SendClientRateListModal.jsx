import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { Can } from "../../auth/guards";
import { useSendClientRateList } from "../../hooks/useSendClientRateList";
import { PERMISSIONS } from "../../lib/permissions";
import {
  copyText,
  formatPrice,
  isRateListSortMode,
  pickSendableRateList,
  productDefaultPrice,
  RATE_LIST_SORT,
  RATE_LIST_SORT_OPTIONS,
  rateListSortHint,
  sortRateListProducts,
  splitCatalogColumns,
  toMoneyNumber,
} from "../../lib/rateLists";
import { getErrorMessage } from "../../lib/rtkBaseQuery";
import {
  useGetClientRateListsQuery,
  useGetRateListQuery,
} from "../../services/invoiceApi";

const EMPTY_LISTS = [];
const SORT_STORAGE_KEY = "rateListSendSort";

function readSortMode() {
  try {
    const stored = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (isRateListSortMode(stored)) return stored;
  } catch {
    /* ignore quota / private mode */
  }
  return RATE_LIST_SORT.BUYS_MOST;
}

function persistSortMode(mode) {
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, mode);
  } catch {
    /* ignore quota / private mode */
  }
}

function itemRate(product) {
  return formatPrice(toMoneyNumber(product?.customPrice) ?? productDefaultPrice(product));
}

function RateColumn({ products, startIndex = 1 }) {
  return (
    <div className="send-rate-col">
      {products.map((product, index) => (
        <div key={`${product.name}-${startIndex + index}`} className="send-rate-row">
          <span className="send-rate-index">{startIndex + index}</span>
          <span className="send-rate-name" title={product.name}>
            {product.name}
          </span>
          <span className="send-rate-unit">{product.unit || "pcs"}</span>
          <span className="send-rate-price">{itemRate(product)}</span>
        </div>
      ))}
    </div>
  );
}

export default function SendClientRateListModal({ client, onClose }) {
  const { buildMessage, productsFromList, shareUrlFromList, openWhatsApp, hasPhone } =
    useSendClientRateList();
  const {
    data: listsData,
    isLoading: listsLoading,
    isError: listsError,
    error: listsErr,
  } = useGetClientRateListsQuery(
    { id: client?.id, per_page: 100 },
    { skip: !client?.id }
  );
  const lists = listsData?.rateLists || EMPTY_LISTS;
  const sendable = useMemo(
    () =>
      lists.filter((list) => String(list.status || "").toUpperCase() !== "ARCHIVED"),
    [lists]
  );
  const [listId, setListId] = useState("");
  const [sortMode, setSortMode] = useState(readSortMode);
  const {
    data: list,
    isLoading: listLoading,
    isError: listError,
    error: listErr,
  } = useGetRateListQuery(listId, { skip: !listId });
  const [message, setMessage] = useState("");
  const phoneOk = hasPhone(client);
  const waiting = listsLoading || Boolean(listId && listLoading);
  const assignPath = client?.id
    ? `/rate-lists/new?clientId=${encodeURIComponent(client.id)}`
    : "/rate-lists/new";
  const products = useMemo(
    () => sortRateListProducts(productsFromList(list), sortMode),
    [list, productsFromList, sortMode]
  );
  const hasItems = products.length > 0;
  const { left, right } =
    products.length > 1 ? splitCatalogColumns(products) : { left: products, right: [] };

  const onSortMode = (next) => {
    setSortMode(next);
    persistSortMode(next);
  };

  useEffect(() => {
    if (!client) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [client, onClose]);

  useEffect(() => {
    setListId((current) => {
      if (current && sendable.some((row) => String(row.id) === current)) return current;
      const picked = pickSendableRateList(sendable);
      return picked ? String(picked.id) : "";
    });
  }, [client?.id, sendable]);

  useEffect(() => {
    if (!client || waiting) return;
    if (!listId) {
      setMessage("");
      return;
    }
    if (!list) return;
    setMessage(
      buildMessage(client, {
        products,
        shareUrl: shareUrlFromList(list),
      })
    );
  }, [
    client,
    waiting,
    listId,
    list,
    products,
    buildMessage,
    shareUrlFromList,
  ]);

  if (!client) return null;

  const loadFailed = listsError || listError;
  const loadError = loadFailed
    ? getErrorMessage(listsErr || listErr, "Could not load this shop's items")
    : !listsLoading && !sendable.length
      ? "Assign products this shop uses, then send."
      : listId && !waiting && !hasItems
        ? "This list has no products yet."
        : "";

  const sendWhatsApp = async () => {
    if (!phoneOk) {
      toast.error("Add a phone number first");
      return;
    }
    if (!hasItems) {
      toast.error("Assign products this shop uses first");
      return;
    }
    if (!message.trim()) {
      toast.error("Message is empty");
      return;
    }
    const result = await openWhatsApp(client, message.trim());
    if (result.mode === "paste") {
      toast.success(
        result.copied
          ? "List copied. Paste it in the WhatsApp chat."
          : "WhatsApp opened. Paste the copied list if it is empty."
      );
    } else {
      toast.success(`WhatsApp opened for ${client.name}`);
    }
    onClose?.();
  };

  const copyMessage = async () => {
    const ok = await copyText(message.trim());
    toast.success(ok ? "Message copied" : message.trim());
  };

  return (
    <div className="rbac-modal-backdrop" onClick={onClose} role="presentation">
      <form
        className="form-card send-rate-modal"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          sendWhatsApp();
        }}
      >
        <div className="send-rate-modal-head">
          <div>
            <h2 className="page-title mb-1 !text-[1.35rem]">Send rate list</h2>
            <p className="textcklr small mb-0">
              {waiting
                ? "Loading this shop's items…"
                : hasItems
                  ? `${products.length} item${products.length === 1 ? "" : "s"} for WhatsApp`
                  : "Only assigned products go in the message."}
            </p>
          </div>
          <div className="send-rate-meta">
            <div>
              <span className="form-label input-clr">Shop</span>
              <p className="mb-0 font-semibold text-[var(--color-text)]">{client.name}</p>
            </div>
            <div>
              <span className="form-label input-clr">WhatsApp</span>
              <p className="mb-0 font-semibold text-[var(--color-text)]">
                {client.phone || "No phone number"}
              </p>
            </div>
          </div>
          {!phoneOk ? (
            <p className="mb-0 mt-2 text-red-600 small">
              Edit this client and add a valid 03 phone number.
            </p>
          ) : null}
        </div>

        {sendable.length > 1 || hasItems ? (
          <div className="send-rate-modal-toolbar">
            {sendable.length > 1 ? (
              <div className="send-rate-modal-select">
                <label className="form-label input-clr" htmlFor="client-send-list">
                  Item list
                </label>
                <select
                  id="client-send-list"
                  className="form-select input-settings"
                  value={listId}
                  onChange={(event) => setListId(event.target.value)}
                >
                  {sendable.map((row) => (
                    <option key={row.id} value={String(row.id)}>
                      {row.title || row.number || `List #${row.id}`}
                      {row.itemCount != null ? ` (${row.itemCount})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {hasItems ? (
              <div className="send-rate-modal-select">
                <label className="form-label input-clr" htmlFor="client-send-sort">
                  Show first
                </label>
                <select
                  id="client-send-sort"
                  className="form-select input-settings"
                  value={sortMode}
                  onChange={(event) => onSortMode(event.target.value)}
                >
                  {RATE_LIST_SORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="send-rate-sort-hint">{rateListSortHint(sortMode)}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="send-rate-modal-body">
          {!waiting && !sendable.length ? (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3">
              <p className="mb-2 text-sm text-[var(--color-text)]">
                This shop has no assigned products yet. Tick the items they buy, then send.
              </p>
              <Can permission={PERMISSIONS.RATE_LISTS_CREATE}>
                <Link to={assignPath} className="btn save-changes py-2 px-3" onClick={onClose}>
                  Assign items
                </Link>
              </Can>
            </div>
          ) : null}

          {hasItems ? (
            <div className="send-rate-sheet">
              <p className="send-rate-greeting">
                Assalamualaikum {client.name},
              </p>
              <div className={`send-rate-grid${right.length ? "" : " send-rate-grid-single"}`}>
                <RateColumn products={left} />
                {right.length ? <RateColumn products={right} startIndex={left.length + 1} /> : null}
              </div>
            </div>
          ) : null}

          {loadError ? <p className="mb-0 mt-3 text-red-600 small">{loadError}</p> : null}
        </div>

        <div className="send-rate-modal-foot">
          <button type="button" className="btn cancel py-2 px-3" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn cancel py-2 px-3"
            onClick={copyMessage}
            disabled={waiting || !message.trim()}
          >
            <FontAwesomeIcon icon={faCopy} />
            Copy text
          </button>
          <button
            type="submit"
            className="btn save-changes py-2 px-4"
            disabled={waiting || !phoneOk || !hasItems || !message.trim()}
          >
            <FontAwesomeIcon icon={faWhatsapp} />
            {waiting ? "Preparing…" : "Send on WhatsApp"}
          </button>
        </div>
      </form>
    </div>
  );
}
