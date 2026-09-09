import {
  faAngleLeft,
  faCopy,
  faEnvelope,
  faPrint,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import Swal from "sweetalert2";
import { useAuth } from "../auth/AuthContext";
import { Can } from "../auth/guards";
import RateListStatusBadge from "../components/rateLists/RateListStatusBadge";
import SelectedRatesTable from "../components/rateLists/SelectedRatesTable";
import SendRateListModal from "../components/rateLists/SendRateListModal";
import EmptyState from "../components/ui/EmptyState";
import { PERMISSIONS } from "../lib/permissions";
import { openRateListPrint } from "../lib/rateListPrint";
import {
  copyText,
  getRateListShareUrl,
  isLocalhostOrigin,
  mailtoShareHref,
  rateListStatus,
  shareMessage,
  whatsappShareHref,
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

function ShareActions({ list }) {
  if (isLocalhostOrigin()) {
    return (
      <Can permission={PERMISSIONS.RATE_LISTS_SEND}>
        <button type="button" className="btn edit py-2 px-3" onClick={() => printListPdf(list)}>
          <FontAwesomeIcon icon={faPrint} className="me-1" />
          Save PDF
        </button>
      </Can>
    );
  }

  const shareUrl = getRateListShareUrl(list);
  if (!shareUrl) return null;
  const message = shareMessage(list);

  const copyLink = async () => {
    const ok = await copyText(shareUrl);
    toast.success(ok ? "Share link copied" : shareUrl);
  };

  return (
    <>
      <Can permission={PERMISSIONS.RATE_LISTS_SEND}>
        <button type="button" className="btn edit py-2 px-3" onClick={copyLink}>
          <FontAwesomeIcon icon={faCopy} className="me-1" />
          Copy link
        </button>
        <a
          className="btn edit py-2 px-3"
          href={whatsappShareHref(message, shareUrl)}
          target="_blank"
          rel="noreferrer"
        >
          <FontAwesomeIcon icon={faWhatsapp} className="me-1" />
          WhatsApp
        </a>
        <a className="btn edit py-2 px-3" href={mailtoShareHref(list, shareUrl)}>
          <FontAwesomeIcon icon={faEnvelope} className="me-1" />
          Email
        </a>
      </Can>
    </>
  );
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

  const shareUrl = getRateListShareUrl(list);

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
      const url = getRateListShareUrl(merged) || shareUrl;
      if (options.channel === "whatsapp" && url) {
        window.open(whatsappShareHref(shareMessage(merged), url), "_blank", "noopener,noreferrer");
      } else if (options.channel === "email" && url) {
        window.open(mailtoShareHref(merged, url), "_blank", "noopener,noreferrer");
      } else if (url) {
        const ok = await copyText(url);
        toast.success(ok ? "Share link copied" : url);
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
    <div className="invoice-detail mx-auto w-full max-w-6xl">
      <button
        type="button"
        className="back-link print:hidden"
        onClick={() => navigate("/rate-lists/clients")}
      >
        <FontAwesomeIcon className="icon me-2" icon={faAngleLeft} size="2xs" />
        Go back
      </button>

      {isSent && (
        <div className="mb-4 rounded-xl bg-[var(--color-accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-text)] print:hidden">
          Sent lists cannot be edited. Duplicate to make a new draft.
        </div>
      )}
      {isArchived && (
        <div className="mb-4 rounded-xl bg-[var(--color-draft-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-text-muted)] print:hidden">
          This list is archived. Duplicate it to make a new draft.
        </div>
      )}

      <div className="detail-toolbar print:hidden">
        <div className="flex items-center gap-3">
          <span className="edit-discription mb-0">Status</span>
          <RateListStatusBadge status={status} compact={false} />
        </div>
        <div className="detail-actions">
          {isSent && <ShareActions list={list} />}
          {!isArchived && (
            <Can permission={PERMISSIONS.RATE_LISTS_SEND}>
              <button
                type="button"
                className="btn save-changes py-2 px-3"
                onClick={() => {
                  if (isLocalhostOrigin()) {
                    printListPdf(list);
                    return;
                  }
                  setSendOpen(true);
                }}
              >
                {isSent ? "Resend" : "Send"}
              </button>
            </Can>
          )}
          <Can permission={PERMISSIONS.RATE_LISTS_CREATE}>
            <button
              type="button"
              className="btn edit py-2 px-3"
              disabled={duplicateState.isLoading}
              onClick={onDuplicate}
            >
              Duplicate
            </button>
          </Can>
          <button type="button" className="btn edit py-2 px-3" onClick={() => window.print()}>
            <FontAwesomeIcon icon={faPrint} className="me-1" />
            Print
          </button>
          <Can permission={PERMISSIONS.RATE_LISTS_DELETE}>
            <button
              type="button"
              className="btn delete py-2 px-3"
              disabled={deleteState.isLoading}
              onClick={onArchiveOrDelete}
            >
              {isDraft ? "Delete" : "Archive"}
            </button>
          </Can>
        </div>
      </div>

      <div className="detail-card print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6">
            <p className="edit-id">#{list.number}</p>
            <p className="edit-discription mb-0">{list.title || "Rate list"}</p>
            {list.notes ? <p className="textcklr mt-2 mb-0">{list.notes}</p> : null}
          </div>
          <div className="col-span-12 md:col-span-6 md:text-end">
            <span className="edit-discription block">Client</span>
            <span className="date-bill-email block">{list.clientName || `#${list.clientId}`}</span>
            {list.sentAt && (
              <>
                <span className="edit-discription mt-3 block">Sent</span>
                <span className="date-bill-email block">
                  {new Date(list.sentAt).toLocaleString()}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="mt-4">
          <SelectedRatesTable items={list.items || []} readOnly showDifference />
        </div>
      </div>

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
