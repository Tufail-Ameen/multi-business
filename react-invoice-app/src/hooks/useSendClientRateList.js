import { useCallback } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  clientOutreachMessage,
  copyText,
  getRateListShareUrl,
  getStoreShareUrl,
  isLocalhostOrigin,
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
    if (mode === "paste") {
      const copied = await copyText(message);
      window.open(href, "_blank", "noopener,noreferrer");
      return { mode, copied };
    }
    window.open(href, "_blank", "noopener,noreferrer");
    return { mode, copied: false };
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
