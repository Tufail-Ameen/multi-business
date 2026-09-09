import { useEffect, useRef, useState } from "react";

export default function FilterMenu({
  label = "Filter by status",
  options,
  value,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selected = options.find((option) => option.value === value);
  const buttonLabel =
    selected && selected.value !== "" ? selected.label : label;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="btn filter px-2"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {buttonLabel}
      </button>
      {open ? (
        <ul
          className="absolute right-0 z-30 mt-3 w-[200px] rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] py-2"
          role="listbox"
        >
          {options.map((option) => (
            <li key={option.value || "all"}>
              <button
                type="button"
                className="block w-full px-4 py-2 text-left text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
                role="option"
                aria-selected={value === option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
                {value === option.value ? " ✓" : ""}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
