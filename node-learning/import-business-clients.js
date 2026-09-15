/**
 * One-time client seed for a SINGLE existing business.
 * Does not run on migrate / start. Does not create businesses.
 *
 * Usage:
 *   node --env-file=.env import-business-clients.js \
 *     --file=clients-tufail-traders.json \
 *     --business-id=22af2885-7a6e-4ad1-84c4-e0ddeba9cb8c
 *
 * Optional:
 *   --dry-run   print counts, do not write
 */
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const { nextTenantId } = require("./database");

function argValue(flag, fallback = null) {
  const exact = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (exact) return exact.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

async function importClients() {
  const fileArg = argValue("--file", "clients-tufail-traders.json");
  const dryRun = process.argv.includes("--dry-run");
  const catalogPath = path.resolve(process.cwd(), fileArg);
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

  const businessId = argValue("--business-id", catalog.businessId || null);
  if (!businessId) {
    throw new Error(
      "Pass --business-id=<uuid>. Import will only write to that one business."
    );
  }
  if (catalog.businessId && catalog.businessId !== businessId) {
    throw new Error(
      `JSON businessId (${catalog.businessId}) does not match --business-id (${businessId})`
    );
  }

  const rows = Array.isArray(catalog.clients) ? catalog.clients : [];
  if (!rows.length) {
    throw new Error("Clients JSON has no clients");
  }

  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes("<db_password>") || uri.includes("REPLACE_WITH")) {
    throw new Error("Set a valid MONGODB_URI before importing");
  }

  const mongo = new MongoClient(uri);
  const skipped = [];
  const errors = [];
  let created = 0;
  let skippedCount = 0;

  try {
    await mongo.connect();
    const db = mongo.db(process.env.MONGODB_DB || "InvoiceApp");

    const business = await db.collection("businesses").findOne({ id: businessId });
    if (!business) {
      throw new Error(
        `Business not found: ${businessId}. Refusing to create a new business.`
      );
    }
    if (
      catalog.businessName &&
      String(business.name).trim().toLowerCase() !==
        String(catalog.businessName).trim().toLowerCase()
    ) {
      throw new Error(
        `Business name mismatch. DB="${business.name}" JSON="${catalog.businessName}"`
      );
    }

    console.log(
      `${dryRun ? "[dry-run] " : ""}Seeding ${rows.length} clients into "${
        business.name
      }" (${business.id})`
    );

    for (const raw of rows) {
      const name = toOptionalString(raw && raw.name);
      if (!name) {
        errors.push("row missing name");
        continue;
      }

      try {
        const area = raw.area == null ? "" : String(raw.area);
        const existing = await db.collection("clients").findOne({
          businessId,
          name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
          area: { $regex: `^${escapeRegex(area)}$`, $options: "i" },
        });
        if (existing) {
          const phone = raw.phone == null ? "" : String(raw.phone);
          if (!dryRun) {
            await db.collection("clients").updateOne(
              { businessId, id: existing.id },
              {
                $set: {
                  phone,
                  updatedAt: new Date(),
                },
              }
            );
          }
          skippedCount += 1;
          skipped.push(`client already exists in area, phone updated: ${name} (${area})`);
          continue;
        }

        if (!dryRun) {
          const now = new Date();
          await db.collection("clients").insertOne({
            id: await nextTenantId(db, "clients", businessId),
            businessId,
            name,
            phone: raw.phone == null ? "" : String(raw.phone),
            area,
            address: toOptionalString(raw.address),
            city: toOptionalString(raw.city),
            country: toOptionalString(raw.country) || "Pakistan",
            createdAt: now,
            updatedAt: now,
          });
        }
        created += 1;
      } catch (error) {
        skippedCount += 1;
        errors.push(`${name}: ${error.message || error}`);
      }
    }

    console.log(`business id: ${business.id}`);
    console.log(`client count: ${created} created, ${skippedCount} skipped`);
    if (skipped.length) {
      console.log("skipped duplicates:");
      for (const line of skipped) console.log(`  - ${line}`);
    }
    if (errors.length) {
      console.log("errors:");
      for (const line of errors) console.log(`  - ${line}`);
    }
  } finally {
    await mongo.close();
  }
}

importClients().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
