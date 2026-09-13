import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useAuth } from "../../auth/AuthContext";
import {
  buildWhatsAppQueue,
  copyText,
  formatPrice,
  openWhatsAppWindow,
  productDefaultPrice,
  rateListItemsForMessage,
  splitCatalogColumns,
  toMoneyNumber,
} from "../../lib/rateLists";
import { getErrorMessage } from "../../lib/rtkBaseQuery";
import { useBulkRateListOutreachMutation } from "../../services/invoiceApi";
import WhatsAppHandoff from "./WhatsAppHandoff";

const SKIP_LABEL = {
  no_list: "No assigned products",
  no_phone: "No phone number",
  no_items: "Empty list",
  not_found: "Shop not found",
};

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

function GroupPreview({ group }) {
  const products = useMemo(
    () => rateListItemsForMessage(group.items),
    [group.items]
  );
  const { left, right } =
    products.length > 1 ? splitCatalogColumns(products) : { left: products, right: [] };
  const oneShop = group.recipients.length === 1;
  const sampleName = group.recipients[0]?.name || "shop";

  return (
    <div className="send-rate-group">
      <div className="send-rate-meta-list">
        {group.recipients.map((row) => (
          <div key={row.clientId} className="send-rate-meta-pair">
            <div>
              <span className="form-label input-clr">Shop</span>
              <p className="mb-0 font-semibold text-[var(--color-text)]">{row.name}</p>
            </div>
            <div>
              <span className="form-label input-clr">WhatsApp</span>
              <p className="mb-0 font-semibold text-[var(--color-text)]">
                {row.phone || "No phone number"}
              </p>
            </div>
          </div>
        ))}
      </div>

      {products.length ? (
        <div className="send-rate-sheet">
          <p className="send-rate-greeting">
            Assalamualaikum {oneShop ? sampleName : "[shop name]"},
          </p>
          <div className={`send-rate-grid${right.length ? "" : " send-rate-grid-single"}`}>
            <RateColumn products={left} />
            {right.length ? (
              <RateColumn products={right} startIndex={left.length + 1} />
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mb-0 text-red-600 small">This list has no products yet.</p>
      )}
    </div>
  );
}

async function copyQueueJob(job) {
  const opened = openWhatsAppWindow(job.href);
  const copied = await copyText(job.href);
  return { copied, opened: Boolean(opened) };
}

export default function BulkSendRateListModal({ clientIds, onClose }) {
  const { activeBusiness } = useAuth();
  const businessName = activeBusiness?.name || "";
  const idsKey = (clientIds || []).join(",");
  const [handoff, setHandoff] = useState(null);
  const [prepare, { data, isLoading, isError, error }] =
    useBulkRateListOutreachMutation();

  useEffect(() => {
    if (!idsKey) return undefined;
    prepare({ clientIds: idsKey.split(",").filter(Boolean) });
    return undefined;
  }, [idsKey, prepare]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const groups = useMemo(() => data?.groups || [], [data]);
  const skipped = data?.skipped || [];
  const jobs = useMemo(
    () =>
      groups.flatMap((group) =>
        buildWhatsAppQueue(group.recipients, {
          businessName,
          products: rateListItemsForMessage(group.items),
        })
      ),
    [groups, businessName]
  );
  const current = handoff ? handoff.jobs[handoff.index] : null;
  const nextJob = handoff ? handoff.jobs[handoff.index + 1] : null;
  const isLast = Boolean(handoff && handoff.index >= handoff.jobs.length - 1);

  const activateJob = async (queue, index) => {
    const job = queue[index];
    if (!job) return;
    const result = await copyQueueJob(job);
    if (result.opened && queue.length === 1) {
      toast.success(`WhatsApp opened for ${job.name}`);
      onClose?.();
      return;
    }
    setHandoff({ jobs: queue, index, copied: result.copied });
    toast.success(
      result.copied
        ? `Chat link copied for ${job.name}. Paste it in your open WhatsApp tab.`
        : `Copy the chat link for ${job.name}, then paste it in your open WhatsApp tab.`
    );
  };

  const sendWhatsApp = async () => {
    if (!jobs.length) {
      toast.error("None of these shops have a list to send.");
      return;
    }
    await activateJob(jobs, 0);
  };

  const sendNext = async () => {
    if (!handoff || isLast) return;
    await activateJob(handoff.jobs, handoff.index + 1);
  };

  const readyCount = jobs.length;
  const itemLabel = current
    ? `${current.itemCount} item${current.itemCount === 1 ? "" : "s"} for WhatsApp`
    : readyCount
      ? `${readyCount} shop${readyCount === 1 ? "" : "s"} · paste each chat in your open WhatsApp tab`
      : "None of these shops have a list to send.";

  return (
    <div className="rbac-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="form-card send-rate-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="bulk-send-title"
      >
        {isLoading ? (
          <>
            <div className="send-rate-modal-head">
              <h2 id="bulk-send-title" className="page-title mb-1 !text-[1.35rem]">
                Send rate list
              </h2>
              <p className="textcklr small mb-0">Loading these shops&apos; items…</p>
            </div>
            <div className="send-rate-modal-foot">
              <button type="button" className="btn cancel py-2 px-3" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : null}

        {isError ? (
          <>
            <div className="send-rate-modal-head">
              <h2 className="page-title mb-1 !text-[1.35rem]">Send rate list</h2>
              <p className="mb-0 text-red-600 small">
                {getErrorMessage(error, "Could not prepare these shops")}
              </p>
            </div>
            <div className="send-rate-modal-foot">
              <button type="button" className="btn cancel py-2 px-3" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : null}

        {!isLoading && !isError ? (
          <>
            <div className="send-rate-modal-head">
              <div>
                <h2 id="bulk-send-title" className="page-title mb-1 !text-[1.35rem]">
                  Send rate list
                </h2>
                <p className="textcklr small mb-0">{itemLabel}</p>
              </div>
              {current ? (
                <div className="send-rate-meta">
                  <div>
                    <span className="form-label input-clr">Shop</span>
                    <p className="mb-0 font-semibold text-[var(--color-text)]">{current.name}</p>
                  </div>
                  <div>
                    <span className="form-label input-clr">WhatsApp</span>
                    <p className="mb-0 font-semibold text-[var(--color-text)]">
                      {current.phone || "No phone number"}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="send-rate-modal-body">
              {handoff ? (
                <WhatsAppHandoff
                  index={handoff.index}
                  total={handoff.jobs.length}
                  nextName={nextJob?.name || ""}
                />
              ) : (
                <>
                  {groups.map((group) => (
                    <GroupPreview key={group.fingerprint} group={group} />
                  ))}
                  {skipped.length ? (
                    <p className="textcklr small mb-0">
                      Skipped:{" "}
                      {skipped
                        .map(
                          (row) =>
                            `${row.name || `Shop #${row.clientId}`} (${SKIP_LABEL[row.reason] || row.reason})`
                        )
                        .join(" · ")}
                    </p>
                  ) : null}
                  {!groups.length ? (
                    <p className="textcklr small mb-0">None of these shops have a list to send.</p>
                  ) : null}
                </>
              )}
            </div>

            <div className="send-rate-modal-foot">
              {handoff ? (
                <>
                  <button type="button" className="btn cancel py-2 px-3" onClick={onClose}>
                    Done
                  </button>
                  <button
                    type="button"
                    className={isLast ? "btn save-changes py-2 px-4" : "btn cancel py-2 px-3"}
                    onClick={async () => {
                      const ok = await copyText(current.href);
                      toast.success(ok ? "Chat link copied" : current.href);
                    }}
                  >
                    <FontAwesomeIcon icon={faCopy} />
                    Copy chat link again
                  </button>
                  {isLast ? null : (
                    <button type="button" className="btn save-changes py-2 px-4" onClick={sendNext}>
                      Next shop
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button type="button" className="btn cancel py-2 px-3" onClick={onClose}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn save-changes py-2 px-4"
                    onClick={sendWhatsApp}
                    disabled={!jobs.length}
                  >
                    <FontAwesomeIcon icon={faWhatsapp} />
                    Send on WhatsApp
                  </button>
                </>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
