const CONTACT_LENGTH = 11;
const CONTACT_PREFIX = "03";
const CONTACT_PATTERN = /^03\d{9}$/;
const CONTACT_ERROR = "Phone must be 11 digits and start with 03";

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function sanitizeContact(value) {
  return digitsOnly(value).slice(0, CONTACT_LENGTH);
}

function parseContact(value, { required = false } = {}) {
  const digits = digitsOnly(value);
  if (!digits) {
    if (required) {
      return { ok: false, error: "Phone is required" };
    }
    return { ok: true, value: null };
  }
  if (!CONTACT_PATTERN.test(digits)) {
    return { ok: false, error: CONTACT_ERROR };
  }
  return { ok: true, value: digits };
}

module.exports = {
  CONTACT_ERROR,
  CONTACT_LENGTH,
  CONTACT_PATTERN,
  CONTACT_PREFIX,
  digitsOnly,
  parseContact,
  sanitizeContact,
};
