import {
  CONTACT_ERROR,
  contactSchema,
  digitsOnly,
  isValidContact,
  sanitizeContact,
} from "./validation";

describe("contact validation", () => {
  test("accepts 11-digit numbers starting with 03", () => {
    expect(isValidContact("03001234567")).toBe(true);
    expect(isValidContact("03111111111", { required: true })).toBe(true);
    expect(isValidContact("0300-1234567")).toBe(true);
  });

  test("rejects empty when required", () => {
    expect(isValidContact("", { required: true })).toBe(false);
    expect(isValidContact("   ", { required: true })).toBe(false);
  });

  test("allows empty when optional", () => {
    expect(isValidContact("")).toBe(true);
    expect(isValidContact(null)).toBe(true);
  });

  test("rejects wrong length or prefix", () => {
    expect(isValidContact("0309876543332232")).toBe(false);
    expect(isValidContact("12345678901")).toBe(false);
    expect(isValidContact("04001234567")).toBe(false);
    expect(isValidContact("0300123456")).toBe(false);
    expect(isValidContact("030012345678")).toBe(false);
  });

  test("sanitizes to 11 digits max", () => {
    expect(digitsOnly("0300-123-4567")).toBe("03001234567");
    expect(sanitizeContact("0309876543332232")).toBe("03098765433");
    expect(sanitizeContact("ab03cd001234567")).toBe("03001234567");
  });

  test("yup schema blocks invalid contact", async () => {
    await expect(contactSchema({ required: true }).validate("03001234567")).resolves.toBe(
      "03001234567"
    );
    await expect(contactSchema({ required: false }).validate("")).resolves.toBe("");
    await expect(contactSchema({ required: true }).validate("")).rejects.toThrow("Phone is required");
    await expect(contactSchema().validate("0309876543332232")).rejects.toThrow(CONTACT_ERROR);
  });
});
