import {
  faAngleLeft,
  faBoxArchive,
  faClone,
  faCopy,
  faEnvelope,
  faFilePdf,
  faPaperPlane,
  faPrint,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import Swal from "sweetalert2";
import { useAuth } from "../auth/AuthContext";
import { Can } from "../auth/guards";
import RateListStatusBadge from "../components/rateLists/RateListStatusBadge";
import CatalogRatesCard from "../components/rateLists/CatalogRatesCard";
import SendRateListModal from "../components/rateLists/SendRateListModal";
import EmptyState from "../components/ui/EmptyState";
import { PERMISSIONS } from "../lib/permissions";
import { openRateListPrint } from "../lib/rateListPrint";
import {
  copyText,
  getRateListShareUrl,
  getStoreShareUrl,
  isLocalhostOrigin,
  mailtoShareHref,
  openWhatsAppWindow,
  rateListStatus,
  shareMessage,
  whatsappOpenHref,
} from "../lib/rateLists";
import { getErrorCode, getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useDeleteRateListMutation,
  useDuplicateRateListMutation,
  useGetRateListQuery,
  useSendRateListMutation,
} from "../services/invoiceApi";
import RateListEditorPage from "./RateListEditorPage";

function printListPdf(list) {
  const opened = openRateListPrint(list?.items || [], {
    title: list?.title || "Rate list",
  });
  if (!opened) {
    toast.error("Print dialog did not open. Try again.");
    return;
  }
  toast.success("Save as PDF, then send it on WhatsApp");
}

export default function RateListDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [sendOpen, setSendOpen] = useState(false);

  const { data: list, isLoading, isError, error } = useGetRateListQuery(id);
  const [sendRateList, sendState] = useSendRateListMutation();
  const [duplicateRateList, duplicateState] = useDuplicateRateListMutation();
  const [deleteRateList, deleteState] = useDeleteRateListMutation();
  const [search, setSearch] = useState("");
  const catalogProducts = useMemo(
    () =>
      (list?.items || []).map((item) => ({
        id: item.productId,
        name: item.productName,
        sku: item.sku,
        barcode: item.barcode,
        unit: item.unit,
        salePrice: item.customPrice ?? item.price ?? item.defaultPrice,
      })),
    [list?.items]
  );

  const status = rateListStatus(list);
  const isDraft = status === "DRAFT";
  const isSent = status === "SENT";
  const isArchived = status === "ARCHIVED";
  const canEditDraft = isDraft && can(PERMISSIONS.RATE_LISTS_UPDATE);

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Rate list not found"));
  }, [isError, error]);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <p className="textcklr">Loading…</p>
      </div>
    );
  }

  if (!list) {
    return (
      <EmptyState title="Rate list not found" message="This rate list does not exist or was deleted." />
    );
  }

  if (canEditDraft) {
    return <RateListEditorPage />;
  }

  const storeUrl = getStoreShareUrl(list);
  const shareUrl = storeUrl || getRateListShareUrl(list);
  const localOrigin = isLocalhostOrigin();
  const shareMessageText = shareMessage(list);

  const copyStoreLink = async () => {
    const url = storeUrl || shareUrl;
    if (!url) return;
    const ok = await copyText(url);
    toast.success(ok ? "Store link copied" : url);
  };

  const onSend = async (options) => {
    const confirmed = await Swal.fire({
      title: isSent ? "Resend this rate list?" : "Send this rate list?",
      text: "The client will receive a share link.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Send",
      confirmButtonColor: "#2d6a56",
    });
    if (!confirmed.isConfirmed) return;
    try {
      const sent = await sendRateList({
        id,
        channel: options.channel,
        expiresAt: options.expiresAt,
        rotateToken: options.rotateToken,
      }).unwrap();
      const merged = { ...list, ...sent };
      toast.success(isSent ? "Link resent" : "Rate list sent");
      setSendOpen(false);
      const url = getStoreShareUrl(merged) || getRateListShareUrl(merged) || shareUrl;
      if (options.channel === "whatsapp" && url) {
        const href = whatsappOpenHref(shareMessage(merged), url);
        openWhatsAppWindow(href);
        const chatCopied = await copyText(href);
        toast.success(
          chatCopied ? "Chat link copied. Paste it in your open WhatsApp tab." : href
        );
      } else if (options.channel === "email" && url) {
        window.open(mailtoShareHref(merged, url), "_blank", "noopener,noreferrer");
      } else if (url) {
        const ok = await copyText(url);
        toast.success(ok ? "Store link copied" : url);
      }
    } catch (err) {
      const code = getErrorCode(err);
      if (code === "RATE_LIST_NOT_SENDABLE") {
        toast.error("Archived lists cannot be sent.");
        return;
      }
      toast.error(getErrorMessage(err, "Send failed"));
    }
  };

  const onDuplicate = async () => {
    try {
      const copy = await duplicateRateList(id).unwrap();
      toast.success("Duplicated as a new draft");
      if (copy?.id) navigate(`/rate-lists/${copy.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Duplicate failed"));
    }
  };

  const onArchiveOrDelete = async () => {
    const isHardDelete = isDraft;
    const result = await Swal.fire({
      title: isHardDelete ? "Delete this draft?" : "Archive this rate list?",
      text: isHardDelete ? "This cannot be undone." : "Sent lists are archived, not permanently deleted.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: isHardDelete ? "Delete" : "Archive",
      confirmButtonColor: "#c23b3b",
    });
    if (!result.isConfirmed) return;
    try {
      await deleteRateList(id).unwrap();
      toast.success(isHardDelete ? "Draft deleted" : "Archived");
      navigate("/rate-lists/clients");
    } catch (err) {
      toast.error(getErrorMessage(err, "Delete failed"));
    }
  };

  return (
    <div className="clients-page mx-auto w-full max-w-6xl">
      <section className="clients-page-section">
        <div className="rl-detail-nav print:hidden">
          <button
            type="button"
            className="back-link"
            onClick={() => navigate("/rate-lists/clients")}
          >
            <FontAwesomeIcon className="icon me-2" icon={faAngleLeft} size="2xs" />
            Go back
          </button>
          <div className="rl-detail-actions">
            {isSent ? (
              <Can permission={PERMISSIONS.RATE_LISTS_SEND}>
                {storeUrl || shareUrl ? (
                  <button
                    type="button"
                    className="btn save-changes"
                    onClick={copyStoreLink}
                  >
                    <FontAwesomeIcon icon={faCopy} />
                    Copy store link
                  </button>
                ) : null}
              </Can>
            ) : null}

            <div className="rl-detail-group">
              {isSent && localOrigin ? (
                <Can permission={PERMISSIONS.RATE_LISTS_SEND}>
                  <button type="button" className="btn" onClick={() => printListPdf(list)}>
                    <FontAwesomeIcon icon={faFilePdf} />
                    Save PDF
                  </button>
                </Can>
              ) : null}
              {isSent && !localOrigin && shareUrl ? (
                <Can permission={PERMISSIONS.RATE_LISTS_SEND}>
                  <a
                    className="btn"
                    href={whatsappOpenHref(shareMessageText, shareUrl)}
                    onClick={async (event) => {
                      event.preventDefault();
                      const href = whatsappOpenHref(shareMessageText, shareUrl);
                      openWhatsAppWindow(href);
                      const chatCopied = await copyText(href);
                      toast.success(
                        chatCopied
                          ? "Chat link copied. Paste it in your open WhatsApp tab."
                          : href
                      );
                    }}
                  >
                    <FontAwesomeIcon icon={faWhatsapp} />
                    WhatsApp
                  </a>
                  <a className="btn" href={mailtoShareHref(list, shareUrl)}>
                    <FontAwesomeIcon icon={faEnvelope} />
                    Email
                  </a>
                </Can>
              ) : null}
              {!isArchived ? (
                <Can permission={PERMISSIONS.RATE_LISTS_SEND}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setSendOpen(true)}
                  >
                    <FontAwesomeIcon icon={faPaperPlane} />
                    {isSent ? "Resend" : "Send"}
                  </button>
                </Can>
              ) : null}
              <Can permission={PERMISSIONS.RATE_LISTS_CREATE}>
                <button
                  type="button"
                  className="btn"
                  disabled={duplicateState.isLoading}
                  onClick={onDuplicate}
                >
                  <FontAwesomeIcon icon={faClone} />
                  Duplicate
                </button>
              </Can>
              <button type="button" className="btn" onClick={() => window.print()}>
                <FontAwesomeIcon icon={faPrint} />
                Print
              </button>
            </div>

            <Can permission={PERMISSIONS.RATE_LISTS_DELETE}>
              <button
                type="button"
                className="btn rl-detail-archive"
                disabled={deleteState.isLoading}
                onClick={onArchiveOrDelete}
              >
                <FontAwesomeIcon icon={isDraft ? faTrash : faBoxArchive} />
                {isDraft ? "Delete" : "Archive"}
              </button>
            </Can>
          </div>
        </div>

        {isSent ? (
          <p className="rl-detail-note print:hidden">
            Sent lists cannot be edited. Duplicate to make a new draft.
          </p>
        ) : null}
        {isArchived ? (
          <p className="rl-detail-note print:hidden">
            This list is archived. Duplicate it to make a new draft.
          </p>
        ) : null}

        <CatalogRatesCard
          products={catalogProducts}
          search={search}
          onSearchChange={setSearch}
          emptyTitle="No products"
          emptyMessage="This rate list has no products."
          topSlot={
            <div className="rl-detail-meta">
              <div>
                <div className="rl-detail-id-row">
                  <p className="edit-id mb-0">#{list.number}</p>
                  <RateListStatusBadge status={status} compact />
                </div>
                <p className="edit-discription mb-0 mt-1">{list.title || "Rate list"}</p>
                {list.notes ? <p className="textcklr mt-2 mb-0">{list.notes}</p> : null}
              </div>
              <div className="rl-detail-meta-side">
                <span className="edit-discription block">Client</span>
                <span className="date-bill-email block">{list.clientName || `#${list.clientId}`}</span>
                {list.sentAt ? (
                  <span className="textcklr small mt-1 block">
                    Sent {new Date(list.sentAt).toLocaleString()}
                  </span>
                ) : null}
              </div>
            </div>
          }
        />
      </section>

      <SendRateListModal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        onSend={onSend}
        sending={sendState.isLoading}
        showRotate={isSent}
      />
    </div>
  );
}
