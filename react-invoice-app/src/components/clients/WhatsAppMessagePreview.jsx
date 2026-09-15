function renderWhatsAppText(text) {
  return String(text || "")
    .split(/(\*[^*\n]+\*)/g)
    .map((part, index) => {
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return <strong key={index}>{part.slice(1, -1)}</strong>;
      }
      return part;
    });
}

export default function WhatsAppMessagePreview({ message }) {
  const lines = String(message || "").split("\n");
  return (
    <div className="wa-preview" aria-label="WhatsApp message preview">
      <div className="wa-preview-bubble">
        {lines.map((line, index) => (
          <p key={index} className={line ? "wa-preview-line" : "wa-preview-break"}>
            {line ? renderWhatsAppText(line) : "\u00A0"}
          </p>
        ))}
      </div>
    </div>
  );
}
