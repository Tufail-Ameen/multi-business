import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { faCopy, faFilePdf, faListUl, faUserPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMemo, useState } from "react";
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
  openWhatsAppWindow,
  shareMessage,
  sortProductsByCategory,
  storeUrlFromToken,
  whatsappOpenHref,
} from "../lib/rateLists";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useCreateRateListMutation,
  useEnsureStoreLinkMutation,
  useGetCategoriesQuery,
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
  const [ensureStoreLink, storeLinkState] = useEnsureStoreLinkMutation();
  const sending = createState.isLoading || sendState.isLoading;

  const { data: productsData, isLoading: catalogLoading } = useGetProductsQuery(
    { status: "active", per_page: 100 },
    { skip: !can(PERMISSIONS.PRODUCTS_VIEW) }
  );
  const { data: categoriesData } = useGetCategoriesQuery(
    { per_page: 500 },
    { skip: !can(PERMISSIONS.CATEGORIES_VIEW) }
  );
  const catalogProducts = useMemo(
    () => sortProductsByCategory(productsData?.products || [], categoriesData?.categories || []),
    [productsData, categoriesData]
  );
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

  const copyCatalogStoreLink = async ({ openWhatsapp = false } = {}) => {
    try {
      const result = await ensureStoreLink({}).unwrap();
      const url = storeUrlFromToken(result.storeToken);
      if (!url) {
        toast.error("Store link missing from server");
        return;
      }
      const copied = await copyText(url);
      if (openWhatsapp) {
        const href = whatsappOpenHref("Rate list", url);
        openWhatsAppWindow(href);
        const chatCopied = await copyText(href);
        toast.success(
          chatCopied ? "Chat link copied. Paste it in your open WhatsApp tab." : href
        );
        return;
      }
      toast.success(copied ? "Store link copied" : url);
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not create store link"));
    }
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
        const href = whatsappOpenHref(shareMessage(list), shareUrl);
        openWhatsAppWindow(href);
        const chatCopied = await copyText(href);
        toast.success(
          chatCopied ? "Chat link copied. Paste it in your open WhatsApp tab." : href
        );
        closeSend();
        return;
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
        <div className="rl-detail-nav">
          <div>
            <h1 className="product-list-heading mb-1 !text-[1.35rem] !font-extrabold">
              Rate list
            </h1>
            <p className="textcklr small mb-0">
              These are the rates already set on products. Client lists start from this catalog.
            </p>
          </div>
          <div className="rl-detail-actions">
            <Can permission={PERMISSIONS.RATE_LISTS_SEND}>
              <button
                type="button"
                className="btn save-changes"
                disabled={storeLinkState.isLoading}
                onClick={() => copyCatalogStoreLink()}
              >
                <FontAwesomeIcon icon={faCopy} />
                Copy store link
              </button>
            </Can>
            <div className="rl-detail-group">
              <Can permission={PERMISSIONS.RATE_LISTS_SEND}>
                <button
                  type="button"
                  className="btn"
                  disabled={catalogLoading || !catalogProducts.length}
                  onClick={() => {
                    if (savePdf) {
                      printCatalogPdf();
                      return;
                    }
                    setSendOpen(true);
                  }}
                >
                  <FontAwesomeIcon icon={savePdf ? faFilePdf : faWhatsapp} />
                  {savePdf ? "Save PDF" : "Send rate list"}
                </button>
              </Can>
              <Link to="/rate-lists/clients" className="btn">
                <FontAwesomeIcon icon={faListUl} />
                Client rate lists
              </Link>
              <Can permission={PERMISSIONS.RATE_LISTS_CREATE}>
                <Link to="/rate-lists/new" className="btn">
                  <FontAwesomeIcon icon={faUserPlus} />
                  Use for a client
                </Link>
              </Can>
            </div>
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
