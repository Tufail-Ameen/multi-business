import { useCallback } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  clientOutreachMessage,
  copyText,
  getRateListShareUrl,
  getStoreShareUrl,
  isLocalhostOrigin,
  openWhatsAppWindow,
  rateListItemsForMessage,
  whatsappDigits,
  whatsappPrefillHref,
} from "../lib/rateLists";

export function useSendClientRateList() {
  const { activeBusiness } = useAuth();
  const businessName = activeBusiness?.name || "";
  const isLocal = isLocalhostOrigin();

  const buildMessage = useCallback(
    (client, { shareUrl = "", products = [] } = {}) =>
      clientOutreachMessage({
        clientName: client?.name,
        businessName,
        shareUrl: isLocal ? "" : shareUrl,
        products,
      }),
    [businessName, isLocal]
  );

  const productsFromList = useCallback(
    (list) => rateListItemsForMessage(list?.items),
    []
  );

  const shareUrlFromList = useCallback(
    (list) => {
      if (isLocal || !list) return "";
      return getStoreShareUrl(list) || getRateListShareUrl(list) || "";
    },
    [isLocal]
  );

  const openWhatsApp = useCallback(async (client, message) => {
    const { href, mode } = whatsappPrefillHref(message, client?.phone);
    const opened = openWhatsAppWindow(href);
    const copied = await copyText(href);
    return { mode, copied, href, opened: Boolean(opened) };
  }, []);

  return {
    businessName,
    isLocal,
    buildMessage,
    productsFromList,
    shareUrlFromList,
    openWhatsApp,
    hasPhone: (client) => Boolean(whatsappDigits(client?.phone)),
  };
}
