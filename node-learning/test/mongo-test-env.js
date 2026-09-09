/**
 * Integration-test Mongo resolution.
 *
 * Priority:
 * 1. TEST_MONGODB_URI (preferred for CI / Atlas test cluster)
 * 2. MONGODB_URI (when explicitly provided and not a placeholder)
 * 3. mongodb-memory-server replica set (download) when no URI is configured
 *
 * When a URI is configured, binaries are never downloaded.
 * Tests always use an isolated database name containing "test".
 * Destructive cleanup (dropDatabase) only runs against that isolated name.
 */

const path = require("node:path");
const os = require("node:os");
const { MongoClient } = require("mongodb");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const PLACEHOLDER_RE = /REPLACE_|YOUR_MONGODB|<|>/i;
const FORBIDDEN_DB_NAMES = new Set([
  "invoiceapp",
  "production",
  "prod",
  "main",
  "admin",
  "local",
  "config",
]);

const DEFAULT_MEMORY_VERSION = "6.0.16";

function isPlaceholderUri(uri) {
  if (!uri || typeof uri !== "string") return true;
  const trimmed = uri.trim();
  if (!trimmed) return true;
  if (PLACEHOLDER_RE.test(trimmed)) return true;
  if (!/^mongodb(\+srv)?:\/\//i.test(trimmed)) return true;
  return false;
}

function resolveConfiguredUri() {
  const candidates = [
    { source: "TEST_MONGODB_URI", uri: process.env.TEST_MONGODB_URI },
    { source: "MONGODB_URI", uri: process.env.MONGODB_URI },
  ];

  for (const candidate of candidates) {
    if (!isPlaceholderUri(candidate.uri)) {
      return { source: candidate.source, uri: candidate.uri.trim() };
    }
  }
  return null;
}

function resolveTestDatabaseName() {
  const configured = (process.env.TEST_MONGODB_DB || "").trim();
  const dbName =
    configured || `business_erp_test_${Date.now()}_${process.pid}`;

  if (!/test/i.test(dbName)) {
    throw new Error(
      `TEST_MONGODB_DB must include "test" for isolation (got "${dbName}"). Example: business_erp_test`
    );
  }

  if (FORBIDDEN_DB_NAMES.has(dbName.toLowerCase())) {
    throw new Error(
      `Refusing to run integration tests against database "${dbName}"`
    );
  }

  // Never honor app MONGODB_DB (e.g. InvoiceApp) for destructive test cleanup.
  const appDb = (process.env.MONGODB_DB || "").trim();
  if (appDb && dbName.toLowerCase() === appDb.toLowerCase()) {
    throw new Error(
      `Refusing to use application database "${appDb}" for integration tests. Set TEST_MONGODB_DB to a dedicated name like business_erp_test.`
    );
  }

  return dbName;
}

async function assertUriReachable(uri, source) {
  const probe = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });
  try {
    await probe.connect();
    await probe.db("admin").command({ ping: 1 });
  } catch (error) {
    const detail = error && error.message ? error.message : String(error);
    throw new Error(
      `${source} is set but not reachable (${detail}). ` +
        "Fix the URI, start MongoDB, set TEST_MONGODB_URI to a reachable test cluster, " +
        "or unset MONGODB_URI/TEST_MONGODB_URI (e.g. npm run test:integration:memory) " +
        "to allow mongodb-memory-server fallback."
    );
  } finally {
    try {
      await probe.close(true);
    } catch {
      // ignore
    }
  }
}

function resolveMemoryBinaryOptions() {
  const version =
    (process.env.MONGOMS_VERSION || "").trim() || DEFAULT_MEMORY_VERSION;
  const downloadDir =
    (process.env.MONGOMS_DOWNLOAD_DIR || "").trim() ||
    path.join(os.homedir(), ".cache", "mongodb-binaries");

  return { version, downloadDir };
}

/**
 * @returns {Promise<{
 *   client: import('mongodb').MongoClient,
 *   db: import('mongodb').Db,
 *   memoryReplSet: import('mongodb-memory-server').MongoMemoryReplSet | null,
 *   mode: 'external' | 'memory',
 *   source: string,
 *   dbName: string,
 *   uri: string
 * }>}
 */
async function createTestMongo() {
  const configured = resolveConfiguredUri();
  let uri;
  let mode;
  let source;
  let memoryReplSet = null;

  if (configured) {
    await assertUriReachable(configured.uri, configured.source);
    uri = configured.uri;
    mode = "external";
    source = configured.source;
    console.log(
      `[mongo-test-env] Using external MongoDB from ${source} (no binary download)`
    );
  } else {
    const binary = resolveMemoryBinaryOptions();
    try {
      console.log(
        `[mongo-test-env] No MONGODB_URI/TEST_MONGODB_URI — using mongodb-memory-server ${binary.version}`
      );
      memoryReplSet = await MongoMemoryReplSet.create({
        binary: {
          version: binary.version,
          downloadDir: binary.downloadDir,
        },
        replSet: { count: 1, storageEngine: "wiredTiger" },
      });
      uri = memoryReplSet.getUri();
      mode = "memory";
      source = "mongodb-memory-server";
    } catch (error) {
      const detail = error && error.message ? error.message : String(error);
      throw new Error(
        "Integration tests require a reachable MongoDB URI " +
          "(TEST_MONGODB_URI or MONGODB_URI) or mongodb-memory-server binaries. " +
          `Memory-server failed: ${detail}`
      );
    }
  }

  const dbName = resolveTestDatabaseName();
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  await client.connect();
  const db = client.db(dbName);
  console.log(`[mongo-test-env] Isolated test database: ${dbName}`);

  return { client, db, memoryReplSet, mode, source, dbName, uri };
}

async function cleanupTestMongo({ client, db, memoryReplSet, dbName }) {
  if (db && client && dbName && /test/i.test(dbName)) {
    try {
      await db.dropDatabase();
      console.log(`[mongo-test-env] Dropped isolated database: ${dbName}`);
    } catch (error) {
      console.warn(
        `[mongo-test-env] Could not drop test database ${dbName}:`,
        error && error.message ? error.message : error
      );
    }
  }

  if (client) {
    try {
      await client.close(true);
    } catch {
      // ignore
    }
  }

  if (memoryReplSet) {
    await memoryReplSet.stop();
  }
}

module.exports = {
  createTestMongo,
  cleanupTestMongo,
  resolveConfiguredUri,
  resolveTestDatabaseName,
  isPlaceholderUri,
};
