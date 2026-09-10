import { Field } from "formik";
import { contactInputProps, sanitizeContact } from "../../lib/validation";

export default function ContactField({ name, id, className, disabled }) {
  return (
    <Field name={name}>
      {({ field, form }) => (
        <input
          {...field}
          {...contactInputProps}
          id={id}
          className={className}
          disabled={disabled}
          value={field.value ?? ""}
          onChange={(event) => {
            form.setFieldValue(name, sanitizeContact(event.target.value));
          }}
        />
      )}
    </Field>
  );
}
