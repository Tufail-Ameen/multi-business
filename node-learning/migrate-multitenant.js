const { MongoClient } = require("mongodb");
const { runMigrations } = require("./database");

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes("<db_password>")) {
    throw new Error("Set a valid MONGODB_URI before running migrations");
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || "InvoiceApp");
    await runMigrations(db, client);
    console.log("Multi-tenant database migration completed");
  } finally {
    await client.close();
  }
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
