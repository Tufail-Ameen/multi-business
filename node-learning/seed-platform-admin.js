const { MongoClient } = require("mongodb");
const {
  PLATFORM_MANAGE_BUSINESSES,
  hashPassword,
} = require("./auth");
const { newId, runMigrations } = require("./database");

async function seedPlatformAdmin() {
  const uri = process.env.MONGODB_URI;
  const email = String(process.env.PLATFORM_ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const firstName = String(
    process.env.PLATFORM_ADMIN_FIRST_NAME || "Platform"
  ).trim();
  const lastName = String(
    process.env.PLATFORM_ADMIN_LAST_NAME || "Admin"
  ).trim();

  if (!uri || uri.includes("<db_password>")) {
    throw new Error("Set a valid MONGODB_URI before seeding");
  }
  if (!email || !password || password.length < 12) {
    throw new Error(
      "PLATFORM_ADMIN_EMAIL and a PLATFORM_ADMIN_PASSWORD of at least 12 characters are required"
    );
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || "InvoiceApp");
    await runMigrations(db, client);

    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        let role = await db
          .collection("roles")
          .findOne(
            { businessId: null, slug: "platform_super_admin" },
            { session }
          );
        if (!role) {
          role = {
            id: newId(),
            businessId: null,
            name: "Platform Super Admin",
            slug: "platform_super_admin",
            permissions: [PLATFORM_MANAGE_BUSINESSES],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await db.collection("roles").insertOne(role, { session });
        } else {
          await db.collection("roles").updateOne(
            { id: role.id },
            {
              $set: {
                permissions: [PLATFORM_MANAGE_BUSINESSES],
                updatedAt: new Date(),
              },
            },
            { session }
          );
        }

        const existingUser = await db
          .collection("users")
          .findOne({ email }, { session });
        if (existingUser && !existingUser.isPlatformAdmin) {
          throw new Error(
            "Refusing to promote an existing business user through the seed"
          );
        }

        const passwordHash = await hashPassword(password);
        if (existingUser) {
          await db.collection("users").updateOne(
            { id: existingUser.id },
            {
              $set: {
                firstName,
                lastName,
                passwordHash,
                isPlatformAdmin: true,
                platformRoleId: role.id,
                status: "active",
                updatedAt: new Date(),
              },
            },
            { session }
          );
        } else {
          await db.collection("users").insertOne(
            {
              id: newId(),
              firstName,
              lastName,
              email,
              passwordHash,
              isPlatformAdmin: true,
              platformRoleId: role.id,
              status: "active",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            { session }
          );
        }
      });
    } finally {
      await session.endSession();
    }

    console.log(`Platform Super Admin provisioned: ${email}`);
  } finally {
    await client.close();
  }
}

seedPlatformAdmin().catch((error) => {
  console.error(error);
  process.exit(1);
});
