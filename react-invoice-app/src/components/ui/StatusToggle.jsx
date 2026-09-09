import { useField } from "formik";

const OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export default function StatusToggle({ name = "status", id }) {
  const [field, , helpers] = useField(name);

  return (
    <div className="stock-tab-nav !bg-[var(--color-surface-2)]" id={id} role="group" aria-label="Status">
      {OPTIONS.map((option) => {
        const selected = field.value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={`stock-tab-btn ${selected ? "active" : ""}`}
            aria-pressed={selected}
            onClick={() => helpers.setValue(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
