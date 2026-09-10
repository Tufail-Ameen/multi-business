const assert = require("node:assert/strict");
const { CONTACT_ERROR, parseContact, sanitizeContact } = require("../validation");

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test("accepts 11-digit contacts starting with 03", () => {
  assert.deepEqual(parseContact("03001234567"), { ok: true, value: "03001234567" });
  assert.deepEqual(parseContact("0311-1111111"), { ok: true, value: "03111111111" });
});

test("optional empty contact is allowed", () => {
  assert.deepEqual(parseContact(""), { ok: true, value: null });
  assert.deepEqual(parseContact("   "), { ok: true, value: null });
  assert.deepEqual(parseContact(null), { ok: true, value: null });
});

test("required empty contact is rejected", () => {
  assert.equal(parseContact("", { required: true }).ok, false);
});

test("rejects long, short, or non-03 contacts", () => {
  assert.equal(parseContact("0309876543332232").ok, false);
  assert.equal(parseContact("0309876543332232").error, CONTACT_ERROR);
  assert.equal(parseContact("12345678901").ok, false);
  assert.equal(parseContact("04001234567").ok, false);
  assert.equal(parseContact("0300123456").ok, false);
});

test("sanitizeContact caps input at 11 digits", () => {
  assert.equal(sanitizeContact("0309876543332232"), "03098765433");
});

async function main() {
  let failures = 0;
  for (const current of tests) {
    try {
      await current.run();
      console.log(`✓ ${current.name}`);
    } catch (error) {
      failures += 1;
      console.error(`✗ ${current.name}`);
      console.error(error);
    }
  }
  if (failures) throw new Error(`${failures} validation unit test(s) failed`);
  console.log(`All ${tests.length} validation unit tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
