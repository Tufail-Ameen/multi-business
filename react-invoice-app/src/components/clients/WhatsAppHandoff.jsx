export default function WhatsAppHandoff({ index = 0, total = 1, nextName = "" }) {
  const queued = total > 1;
  const last = index >= total - 1;

  return (
    <div className="send-rate-handoff">
      {queued ? (
        <p className="send-rate-handoff-progress">
          Shop {index + 1} of {total}
        </p>
      ) : null}
      <p className="send-rate-handoff-title">Open this chat in your WhatsApp tab</p>
      <p className="send-rate-handoff-copy">
        A new WhatsApp tab would sign you out of the one that is already open.
        Paste the copied link in that tab&apos;s address bar so the shop chat
        opens there with the list already typed.
      </p>
      <ol className="send-rate-handoff-steps">
        <li>Click the WhatsApp tab that is already open</li>
        <li>
          Press <kbd>⌘L</kbd> (address bar), then <kbd>⌘V</kbd>, then Enter
        </li>
        {queued && !last ? (
          <li>
            Send that chat, then come back here and click Next shop
            {nextName ? ` for ${nextName}` : ""}
          </li>
        ) : null}
      </ol>
    </div>
  );
}
