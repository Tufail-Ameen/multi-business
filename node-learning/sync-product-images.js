const { MongoClient } = require("mongodb");
const { syncDiskProductImagesToMongo } = require("./product-image");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes("<db_password>")) {
    throw new Error("Set a valid MONGODB_URI");
  }

  const mongoClient = new MongoClient(uri);
  await mongoClient.connect();
  const db = mongoClient.db(process.env.MONGODB_DB || "InvoiceApp");
  const synced = await syncDiskProductImagesToMongo(db);
  console.log(`Synced ${synced} product image(s) from disk into MongoDB`);
  await mongoClient.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
