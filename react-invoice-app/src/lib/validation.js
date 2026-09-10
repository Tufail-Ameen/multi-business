import * as Yup from "yup";

export const CONTACT_LENGTH = 11;
export const CONTACT_PREFIX = "03";
export const CONTACT_PATTERN = /^03\d{9}$/;
export const CONTACT_PLACEHOLDER = "03xxxxxxxxx";
export const CONTACT_ERROR = "Phone must be 11 digits and start with 03";

export function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function sanitizeContact(value) {
  return digitsOnly(value).slice(0, CONTACT_LENGTH);
}

export function isValidContact(value, { required = false } = {}) {
  const digits = digitsOnly(value);
  if (!digits) return !required;
  return CONTACT_PATTERN.test(digits);
}

export function contactSchema({ required = false, label = "Phone" } = {}) {
  const schema = required
    ? Yup.string().trim().required(`${label} is required`)
    : Yup.string().trim();

  return schema.test("contact", CONTACT_ERROR, (value) =>
    isValidContact(value, { required: false })
  );
}

export const contactInputProps = {
  type: "tel",
  inputMode: "numeric",
  maxLength: CONTACT_LENGTH,
  placeholder: CONTACT_PLACEHOLDER,
  autoComplete: "tel",
};
