import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { faPrint } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { Can } from "../auth/guards";
import { useAuth } from "../auth/AuthContext";
import CatalogRatesCard from "../components/rateLists/CatalogRatesCard";
import SendRateListModal from "../components/rateLists/SendRateListModal";
import { useClients } from "../hooks/useClients";
import { PERMISSIONS } from "../lib/permissions";
import { openRateListPrint } from "../lib/rateListPrint";
import {
  buildRateListItems,
  catalogSelection,
  copyText,
  getRateListShareUrl,
  isLocalhostOrigin,
  mailtoShareHref,
  shareMessage,
  whatsappShareHref,
} from "../lib/rateLists";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useCreateRateListMutation,
  useGetProductsQuery,
  useSendRateListMutation,
} from "../services/invoiceApi";

export default function RateListsPage() {
  const { can, activeBusiness } = useAuth();
  const { clients } = useClients();
  const [sendOpen, setSendOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientError, setClientError] = useState("");
  const [createRateList, createState] = useCreateRateListMutation();
  const [sendRateList, sendState] = useSendRateListMutation();
  const sending = createState.isLoading || sendState.isLoading;

  const { data: productsData, isLoading: catalogLoading } = useGetProductsQuery(
    { status: "active" },
    { skip: !can(PERMISSIONS.PRODUCTS_VIEW) }
  );
  const catalogProducts = productsData?.products || [];
  const savePdf = isLocalhostOrigin();

  const closeSend = () => {
    setSendOpen(false);
    setClientError("");
  };

  const printCatalogPdf = () => {
    if (!catalogProducts.length) {
      toast.error("No products to send");
      return;
    }
    const title = activeBusiness?.name
      ? `${activeBusiness.name} — Rate list`
      : "Rate list";
    const opened = openRateListPrint(catalogProducts, { title });
    if (!opened) {
      toast.error("Print dialog did not open. Try again.");
      return;
    }
    toast.success("Save as PDF, then send it on WhatsApp");
  };

  const sendCatalogLink = async (options) => {
    if (!catalogProducts.length) {
      toast.error("No products to send");
      return;
    }
    if (!clientId) {
      setClientError("Client required");
      toast.error("Choose a client");
      return;
    }
    if (!can(PERMISSIONS.RATE_LISTS_CREATE)) {
      toast.error("You cannot create a rate list");
      return;
    }

    setClientError("");
    try {
      const created = await createRateList({
        clientId: Number(clientId),
        title: activeBusiness?.name ? `${activeBusiness.name} — Rate list` : "Rate list",
        items: buildRateListItems(catalogSelection(catalogProducts)),
      }).unwrap();
      const sent = await sendRateList({
        id: created.id,
        channel: options.channel,
        expiresAt: options.expiresAt,
        rotateToken: options.rotateToken,
      }).unwrap();
      const list = { ...created, ...(sent?.rateList ?? sent) };
      const shareUrl = getRateListShareUrl(list);
      if (!shareUrl) {
        toast.error("Share link missing from server");
        return;
      }

      const copied = await copyText(shareUrl);
      if (options.channel === "whatsapp") {
        window.open(whatsappShareHref(shareMessage(list), shareUrl), "_blank", "noopener,noreferrer");
      }
      if (options.channel === "email") {
        window.open(mailtoShareHref(list, shareUrl), "_blank", "noopener,noreferrer");
      }
      toast.success(copied ? "Share link copied" : shareUrl);
      closeSend();
    } catch (err) {
      toast.error(getErrorMessage(err, "Send failed"));
    }
  };

  return (
    <div className="clients-page mx-auto w-full max-w-6xl">
      <section className="clients-page-section">
        <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="product-list-heading mb-1 !text-[1.35rem] !font-extrabold">
              Rate list
            </h1>
            <p className="textcklr small mb-0">
              These are the rates already set on products. Client lists start from this catalog.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Can permission={PERMISSIONS.RATE_LISTS_SEND}>
              <button
                type="button"
                className="btn save-changes w-full py-2 px-3 sm:w-auto"
                disabled={catalogLoading || !catalogProducts.length}
                onClick={() => {
                  if (savePdf) {
                    printCatalogPdf();
                    return;
                  }
                  setSendOpen(true);
                }}
              >
                <FontAwesomeIcon icon={savePdf ? faPrint : faWhatsapp} className="me-1" />
                {savePdf ? "Save PDF" : "Send rate list"}
              </button>
            </Can>
            <Link to="/rate-lists/clients" className="btn save w-full py-2 px-3 sm:w-auto">
              Client rate lists
            </Link>
            <Can permission={PERMISSIONS.RATE_LISTS_CREATE}>
              <Link to="/rate-lists/new" className="btn save w-full py-2 px-3 sm:w-auto">
                Use for a client
              </Link>
            </Can>
          </div>
        </div>

        <CatalogRatesCard
          products={catalogProducts}
          isLoading={catalogLoading}
          search={search}
          onSearchChange={setSearch}
        />
      </section>

      <SendRateListModal
        open={sendOpen}
        onClose={closeSend}
        onSend={sendCatalogLink}
        sending={sending}
        defaultChannel="whatsapp"
        clients={clients}
        clientId={clientId}
        onClientIdChange={(value) => {
          setClientId(value);
          setClientError("");
        }}
        clientError={clientError}
      />
    </div>
  );
}
