const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const {
  PLATFORM_MANAGE_BUSINESSES,
  TokenError,
  hashPassword,
  verifyPassword,
  verifyJwt,
  hashToken,
  issueTokens,
} = require("./auth");
const { hasBusinessPermission } = require("./permissions");
const {
  newId,
  createUniqueSlug,
  nextTenantId,
  runMigrations,
  seedSystemRolesForBusiness,
  ensureBusinessSettings,
} = require("./database");
const { registerTeamRoutes } = require("./team-routes");
const { registerCatalogRoutes } = require("./catalog-routes");
const { registerPurchaseRoutes } = require("./purchase-routes");
const { registerRateListRoutes } = require("./rate-list-routes");
const { registerInvoiceRoutes } = require("./invoice-routes");
const { parseContact } = require("./validation");

class AppError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function readContact(value, { required = false } = {}) {
  const parsed = parseContact(value, { required });
  if (!parsed.ok) {
    throw new AppError(400, "VALIDATION_ERROR", parsed.error);
  }
  return parsed.value;
}

function getJwtSecrets(overrides = {}) {
  const accessSecret =
    overrides.accessSecret ||
    process.env.JWT_ACCESS_SECRET ||
    process.env.JWT_SECRET;
  const refreshSecret =
    overrides.refreshSecret ||
    process.env.JWT_REFRESH_SECRET ||
    process.env.JWT_SECRET;

  if ((!accessSecret || !refreshSecret) && process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are required in production"
    );
  }

  if (!accessSecret || !refreshSecret) {
    const temporarySecret = crypto.randomBytes(32).toString("hex");
    console.warn(
      "JWT secrets are not set. Tokens will become invalid when the server restarts."
    );
    return {
      accessSecret: accessSecret || temporarySecret,
      refreshSecret: refreshSecret || temporarySecret,
    };
  }

  return { accessSecret, refreshSecret };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function publicBusiness(business, role) {
  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    status: business.status,
    role: role
      ? {
          id: role.id,
          name: role.name,
          slug: role.slug,
        }
      : null,
  };
}

async function getPlatformRole(db, user) {
  if (!user.isPlatformAdmin) return null;

  if (user.platformRoleId) {
    const role = await db.collection("roles").findOne({
      id: user.platformRoleId,
      businessId: null,
    });
    if (role) return role;
  }

  return db.collection("roles").findOne({
    businessId: null,
    permissions: PLATFORM_MANAGE_BUSINESSES,
  });
}

async function getMembershipContext(db, userId, businessId) {
  const membership = await db
    .collection("business_memberships")
    .findOne({ userId, businessId });
  if (!membership) return null;

  const [business, role] = await Promise.all([
    db.collection("businesses").findOne({ id: businessId }),
    db.collection("roles").findOne({
      id: membership.roleId,
      businessId,
    }),
  ]);

  if (!business || !role) return null;
  return { membership, business, role };
}

async function getActiveOwnerContext(db, userId) {
  const memberships = await db
    .collection("business_memberships")
    .find({ userId })
    .toArray();

  for (const membership of memberships) {
    const context = await getMembershipContext(
      db,
      userId,
      membership.businessId
    );
    if (context && context.business.status === "active") return context;
  }

  return null;
}

async function buildUserResponse(db, user, activeBusinessId) {
  if (user.isPlatformAdmin) {
    const role = await getPlatformRole(db, user);
    const business = activeBusinessId
      ? await db.collection("businesses").findOne({ id: activeBusinessId })
      : null;

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email,
      status: user.status,
      isPlatformAdmin: true,
      permissions: role ? role.permissions : [],
      role: role
        ? { id: role.id, name: role.name, slug: role.slug }
        : null,
      activeBusinessId: activeBusinessId || null,
      businesses: business ? [publicBusiness(business, role)] : [],
    };
  }

  const memberships = await db
    .collection("business_memberships")
    .find({ userId: user.id })
    .toArray();
  const businesses = [];
  let activeRole = null;

  for (const membership of memberships) {
    const [business, role] = await Promise.all([
      db.collection("businesses").findOne({ id: membership.businessId }),
      db.collection("roles").findOne({
        id: membership.roleId,
        businessId: membership.businessId,
      }),
    ]);
    if (!business || !role) continue;
    businesses.push(publicBusiness(business, role));
    if (business.id === activeBusinessId) activeRole = role;
  }

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    status: user.status,
    isPlatformAdmin: false,
    permissions: activeRole ? activeRole.permissions : [],
    role: activeRole
      ? {
          id: activeRole.id,
          name: activeRole.name,
          slug: activeRole.slug,
        }
      : null,
    activeBusinessId: activeBusinessId || null,
    businesses,
  };
}

function createApp({ db, mongoClient, jwtSecrets } = {}) {
  if (!db || !mongoClient) {
    throw new Error("createApp requires db and mongoClient");
  }

  const secrets = getJwtSecrets(jwtSecrets);
  const app = express();
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || "http://localhost:3000",
      allowedHeaders: ["Content-Type", "Authorization", "X-Business-Id"],
    })
  );
  app.use(express.json({ limit: "100kb" }));

  const authenticate = async (req, _res, next) => {
    try {
      const authorization = req.headers.authorization;
      if (!authorization || !authorization.startsWith("Bearer ")) {
        throw new AppError(
          401,
          "AUTHENTICATION_REQUIRED",
          "A valid Bearer access token is required"
        );
      }

      const payload = verifyJwt(
        authorization.slice(7),
        secrets.accessSecret,
        "access"
      );
      const user = await db
        .collection("users")
        .findOne({ id: payload.userId });

      if (!user) {
        throw new AppError(401, "INVALID_TOKEN", "Authentication token is invalid");
      }
      if (user.status !== "active") {
        throw new AppError(403, "USER_SUSPENDED", "User account is suspended");
      }
      if (user.isPlatformAdmin !== (payload.isPlatformAdmin === true)) {
        throw new AppError(401, "INVALID_TOKEN", "Authentication token is invalid");
      }

      req.auth = {
        user,
        activeBusinessId: payload.activeBusinessId || null,
        token: payload,
      };
      next();
    } catch (error) {
      next(error);
    }
  };

  const resolveTenant = async (req, _res, next) => {
    try {
      const requestedBusinessId =
        req.headers["x-business-id"] || req.auth.activeBusinessId;

      if (!requestedBusinessId) {
        throw new AppError(
          400,
          "BUSINESS_CONTEXT_REQUIRED",
          "X-Business-Id is required"
        );
      }
      if (requestedBusinessId !== req.auth.activeBusinessId) {
        throw new AppError(
          403,
          "BUSINESS_ACCESS_DENIED",
          "Switch to this business before accessing its data"
        );
      }

      const business = await db
        .collection("businesses")
        .findOne({ id: requestedBusinessId });
      if (!business) {
        throw new AppError(404, "BUSINESS_NOT_FOUND", "Business not found");
      }
      if (business.status !== "active") {
        throw new AppError(403, "BUSINESS_SUSPENDED", "Business is suspended");
      }

      let role = null;
      if (req.auth.user.isPlatformAdmin) {
        const platformRole = await getPlatformRole(db, req.auth.user);
        if (
          !platformRole ||
          !platformRole.permissions.includes(PLATFORM_MANAGE_BUSINESSES)
        ) {
          throw new AppError(
            403,
            "PLATFORM_ACCESS_DENIED",
            "Explicit platform.manage_businesses permission is required"
          );
        }
      } else {
        const context = await getMembershipContext(
          db,
          req.auth.user.id,
          requestedBusinessId
        );
        if (!context) {
          throw new AppError(
            403,
            "BUSINESS_ACCESS_DENIED",
            "You do not have access to this business"
          );
        }
        role = context.role;
      }

      req.tenant = { business, businessId: business.id, role };
      next();
    } catch (error) {
      next(error);
    }
  };

  const requirePermission = (permission) => (req, _res, next) => {
    if (permission === PLATFORM_MANAGE_BUSINESSES) {
      next(
        new AppError(
          403,
          "PLATFORM_ACCESS_DENIED",
          "Platform administrator access is required"
        )
      );
      return;
    }

    // Platform admins may read tenant data after switch; writes still need membership role.
    if (req.auth.user.isPlatformAdmin && permission.endsWith(".view")) {
      next();
      return;
    }

    const permissions = req.tenant.role ? req.tenant.role.permissions : [];
    if (!hasBusinessPermission(permissions, permission)) {
      next(
        new AppError(
          403,
          "PERMISSION_DENIED",
          `Permission '${permission}' is required`
        )
      );
      return;
    }
    next();
  };

  /** Always scope tenant queries to the verified business — never trust body.businessId. */
  const tenantScope = (req) => ({ businessId: req.tenant.businessId });

  const requirePlatformAdmin = async (req, _res, next) => {
    try {
      if (!req.auth.user.isPlatformAdmin) {
        throw new AppError(
          403,
          "PLATFORM_ACCESS_DENIED",
          "Platform administrator access is required"
        );
      }

      const role = await getPlatformRole(db, req.auth.user);
      if (
        !role ||
        !Array.isArray(role.permissions) ||
        !role.permissions.includes(PLATFORM_MANAGE_BUSINESSES)
      ) {
        throw new AppError(
          403,
          "PLATFORM_ACCESS_DENIED",
          "Explicit platform.manage_businesses permission is required"
        );
      }

      req.auth.platformRole = role;
      next();
    } catch (error) {
      next(error);
    }
  };

  app.post("/register", async (req, res, next) => {
    const session = mongoClient.startSession();
    try {
      const { firstName, lastName, businessName, password } = req.body;
      const email = normalizeEmail(req.body.email);
      const missingFields = ["firstName", "lastName", "businessName", "password"]
        .filter(
          (field) =>
            typeof req.body[field] !== "string" || !req.body[field].trim()
        );
      if (!email) missingFields.push("email");

      if (missingFields.length) {
        throw new AppError(400, "VALIDATION_ERROR", "All fields are required", {
          missingFields,
        });
      }
      if (!validateEmail(email)) {
        throw new AppError(
          400,
          "INVALID_EMAIL",
          "A valid email address is required"
        );
      }
      if (password.length < 8) {
        throw new AppError(
          400,
          "WEAK_PASSWORD",
          "Password must be at least 8 characters long"
        );
      }

      let user;
      let business;
      let role;
      let tokens;

      await session.withTransaction(async () => {
        const existingUser = await db
          .collection("users")
          .findOne({ email }, { session });
        if (existingUser) {
          throw new AppError(
            409,
            "EMAIL_ALREADY_REGISTERED",
            "Email is already registered"
          );
        }

        user = {
          id: newId(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email,
          passwordHash: await hashPassword(password),
          isPlatformAdmin: false,
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        business = {
          id: newId(),
          name: businessName.trim(),
          slug: await createUniqueSlug(db, businessName, { session }),
          status: "active",
          ownerUserId: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await db.collection("users").insertOne(user, { session });
        await db.collection("businesses").insertOne(business, { session });
        const rolesBySlug = await seedSystemRolesForBusiness(db, business.id, {
          session,
        });
        role = rolesBySlug.business_owner;
        const membership = {
          id: newId(),
          userId: user.id,
          businessId: business.id,
          roleId: role.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await db
          .collection("business_memberships")
          .insertOne(membership, { session });
        await ensureBusinessSettings(db, business.id, { session });
        tokens = await issueTokens({
          db,
          user,
          activeBusinessId: business.id,
          accessSecret: secrets.accessSecret,
          refreshSecret: secrets.refreshSecret,
          session,
        });
      });

      const responseUser = await buildUserResponse(db, user, business.id);
      res.status(201).json({ data: { user: responseUser, tokens } });
    } catch (error) {
      if (error.code === 11000) {
        next(
          new AppError(
            409,
            "DUPLICATE_VALUE",
            "Email or business slug is already in use"
          )
        );
      } else {
        next(error);
      }
    } finally {
      await session.endSession();
    }
  });

  app.post("/login", async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body.email);
      const password = req.body.password;
      if (!email || typeof password !== "string" || !password) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Email and password are required"
        );
      }

      const user = await db.collection("users").findOne({ email });
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        throw new AppError(
          401,
          "INVALID_CREDENTIALS",
          "Invalid email or password"
        );
      }
      if (user.status !== "active") {
        throw new AppError(403, "USER_SUSPENDED", "User account is suspended");
      }

      let activeBusinessId = null;
      if (!user.isPlatformAdmin) {
        const context = await getActiveOwnerContext(db, user.id);
        if (!context) {
          throw new AppError(
            403,
            "BUSINESS_SUSPENDED",
            "No active business is available for this user"
          );
        }
        activeBusinessId = context.business.id;
      } else {
        const platformRole = await getPlatformRole(db, user);
        if (
          !platformRole ||
          !platformRole.permissions.includes(PLATFORM_MANAGE_BUSINESSES)
        ) {
          throw new AppError(
            403,
            "PLATFORM_ACCESS_DENIED",
            "Platform administrator permission is missing"
          );
        }
      }

      const tokens = await issueTokens({
        db,
        user,
        activeBusinessId,
        accessSecret: secrets.accessSecret,
        refreshSecret: secrets.refreshSecret,
      });
      const responseUser = await buildUserResponse(db, user, activeBusinessId);
      res.json({ data: { user: responseUser, tokens } });
    } catch (error) {
      next(error);
    }
  });

  app.get("/auth/me", authenticate, async (req, res, next) => {
    try {
      if (req.auth.activeBusinessId) {
        const business = await db
          .collection("businesses")
          .findOne({ id: req.auth.activeBusinessId });
        if (!business || business.status !== "active") {
          throw new AppError(
            403,
            "BUSINESS_SUSPENDED",
            "Active business is unavailable"
          );
        }
      }

      const user = await buildUserResponse(
        db,
        req.auth.user,
        req.auth.activeBusinessId
      );
      res.json({ data: { user } });
    } catch (error) {
      next(error);
    }
  });

  app.post("/auth/refresh", async (req, res, next) => {
    const session = mongoClient.startSession();
    try {
      const refreshToken = req.body.refreshToken;
      if (!refreshToken) {
        throw new AppError(
          400,
          "REFRESH_TOKEN_REQUIRED",
          "refreshToken is required"
        );
      }

      const payload = verifyJwt(
        refreshToken,
        secrets.refreshSecret,
        "refresh"
      );
      let user;
      let tokens;

      await session.withTransaction(async () => {
        const storedToken = await db.collection("refresh_tokens").findOne(
          {
            id: payload.jti,
            userId: payload.userId,
            tokenHash: hashToken(refreshToken),
            revokedAt: null,
            expiresAt: { $gt: new Date() },
          },
          { session }
        );
        if (!storedToken) {
          throw new AppError(
            401,
            "INVALID_REFRESH_TOKEN",
            "Refresh token is invalid or has been revoked"
          );
        }

        user = await db
          .collection("users")
          .findOne({ id: payload.userId }, { session });
        if (!user || user.status !== "active") {
          throw new AppError(
            403,
            "USER_SUSPENDED",
            "User account is unavailable"
          );
        }

        if (payload.activeBusinessId) {
          const business = await db.collection("businesses").findOne(
            { id: payload.activeBusinessId, status: "active" },
            { session }
          );
          if (!business) {
            throw new AppError(
              403,
              "BUSINESS_SUSPENDED",
              "Active business is unavailable"
            );
          }
          if (
            !user.isPlatformAdmin &&
            !(await db.collection("business_memberships").findOne(
              { userId: user.id, businessId: business.id },
              { session }
            ))
          ) {
            throw new AppError(
              403,
              "BUSINESS_ACCESS_DENIED",
              "Business membership is required"
            );
          }
        }

        await db
          .collection("refresh_tokens")
          .updateOne(
            { id: storedToken.id, revokedAt: null },
            { $set: { revokedAt: new Date() } },
            { session }
          );
        tokens = await issueTokens({
          db,
          user,
          activeBusinessId: payload.activeBusinessId,
          accessSecret: secrets.accessSecret,
          refreshSecret: secrets.refreshSecret,
          session,
        });
      });

      const responseUser = await buildUserResponse(
        db,
        user,
        payload.activeBusinessId
      );
      res.json({ data: { user: responseUser, tokens } });
    } catch (error) {
      next(error);
    } finally {
      await session.endSession();
    }
  });

  app.post("/auth/logout", authenticate, async (req, res, next) => {
    try {
      const refreshToken = req.body.refreshToken;
      if (refreshToken) {
        const payload = verifyJwt(
          refreshToken,
          secrets.refreshSecret,
          "refresh"
        );
        if (payload.userId !== req.auth.user.id) {
          throw new AppError(
            403,
            "TOKEN_OWNER_MISMATCH",
            "Refresh token belongs to another user"
          );
        }
        await db.collection("refresh_tokens").updateOne(
          {
            id: payload.jti,
            userId: req.auth.user.id,
            tokenHash: hashToken(refreshToken),
          },
          { $set: { revokedAt: new Date() } }
        );
      } else {
        await db.collection("refresh_tokens").updateMany(
          { userId: req.auth.user.id, revokedAt: null },
          { $set: { revokedAt: new Date() } }
        );
      }

      res.json({ data: { message: "Logged out successfully" } });
    } catch (error) {
      next(error);
    }
  });

  app.post("/auth/switch-business", authenticate, async (req, res, next) => {
    try {
      const businessId = req.body.businessId;
      if (typeof businessId !== "string" || !businessId) {
        throw new AppError(
          400,
          "BUSINESS_ID_REQUIRED",
          "businessId is required"
        );
      }

      const business = await db
        .collection("businesses")
        .findOne({ id: businessId });
      if (!business) {
        throw new AppError(404, "BUSINESS_NOT_FOUND", "Business not found");
      }
      if (business.status !== "active") {
        throw new AppError(403, "BUSINESS_SUSPENDED", "Business is suspended");
      }
      if (
        !req.auth.user.isPlatformAdmin &&
        !(await getMembershipContext(db, req.auth.user.id, businessId))
      ) {
        throw new AppError(
          403,
          "BUSINESS_ACCESS_DENIED",
          "You do not have access to this business"
        );
      }
      if (req.auth.user.isPlatformAdmin) {
        const platformRole = await getPlatformRole(db, req.auth.user);
        if (
          !platformRole ||
          !platformRole.permissions.includes(PLATFORM_MANAGE_BUSINESSES)
        ) {
          throw new AppError(
            403,
            "PLATFORM_ACCESS_DENIED",
            "Explicit platform.manage_businesses permission is required"
          );
        }
      }

      const tokens = await issueTokens({
        db,
        user: req.auth.user,
        activeBusinessId: businessId,
        accessSecret: secrets.accessSecret,
        refreshSecret: secrets.refreshSecret,
      });
      const user = await buildUserResponse(db, req.auth.user, businessId);
      res.json({ data: { user, tokens } });
    } catch (error) {
      next(error);
    }
  });

  app.get(
    "/platform/businesses",
    authenticate,
    requirePlatformAdmin,
    async (_req, res, next) => {
      try {
        const businesses = await db
          .collection("businesses")
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.json({
          data: {
            businesses: businesses.map((business) =>
              publicBusiness(business, null)
            ),
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/platform/businesses",
    authenticate,
    requirePlatformAdmin,
    async (req, res, next) => {
      const session = mongoClient.startSession();
      try {
        if (typeof req.body.name !== "string" || !req.body.name.trim()) {
          throw new AppError(
            400,
            "VALIDATION_ERROR",
            "Business name is required"
          );
        }

        let business;
        await session.withTransaction(async () => {
          let owner = null;
          if (req.body.ownerUserId) {
            owner = await db.collection("users").findOne(
              {
                id: req.body.ownerUserId,
                isPlatformAdmin: false,
                status: "active",
              },
              { session }
            );
            if (!owner) {
              throw new AppError(
                400,
                "INVALID_OWNER",
                "Active non-platform owner user was not found"
              );
            }
          } else if (req.body.ownerEmail) {
            const ownerEmail = normalizeEmail(req.body.ownerEmail);
            const ownerFirstName =
              typeof req.body.ownerFirstName === "string"
                ? req.body.ownerFirstName.trim()
                : "";
            const ownerLastName =
              typeof req.body.ownerLastName === "string"
                ? req.body.ownerLastName.trim()
                : "";
            const ownerPassword = req.body.ownerPassword;

            if (!validateEmail(ownerEmail) || !ownerFirstName || !ownerLastName) {
              throw new AppError(
                400,
                "VALIDATION_ERROR",
                "ownerEmail, ownerFirstName, and ownerLastName are required"
              );
            }
            if (typeof ownerPassword !== "string" || ownerPassword.length < 8) {
              throw new AppError(
                400,
                "WEAK_PASSWORD",
                "Owner password must be at least 8 characters long"
              );
            }

            owner = await db
              .collection("users")
              .findOne({ email: ownerEmail }, { session });
            if (owner?.isPlatformAdmin) {
              throw new AppError(
                400,
                "INVALID_OWNER",
                "Platform administrators cannot own a business"
              );
            }
            if (!owner) {
              owner = {
                id: newId(),
                firstName: ownerFirstName,
                lastName: ownerLastName,
                email: ownerEmail,
                passwordHash: await hashPassword(ownerPassword),
                isPlatformAdmin: false,
                status: "active",
                createdAt: new Date(),
                updatedAt: new Date(),
              };
              await db.collection("users").insertOne(owner, { session });
            }
          }

          business = {
            id: newId(),
            name: req.body.name.trim(),
            slug: await createUniqueSlug(db, req.body.name, { session }),
            status: "active",
            ownerUserId: owner ? owner.id : null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await db.collection("businesses").insertOne(business, { session });
          const rolesBySlug = await seedSystemRolesForBusiness(
            db,
            business.id,
            { session }
          );
          await ensureBusinessSettings(db, business.id, { session });
          if (owner) {
            const existingMembership = await db
              .collection("business_memberships")
              .findOne(
                { userId: owner.id, businessId: business.id },
                { session }
              );
            if (!existingMembership) {
              await db.collection("business_memberships").insertOne(
                {
                  id: newId(),
                  userId: owner.id,
                  businessId: business.id,
                  roleId: rolesBySlug.business_owner.id,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
                { session }
              );
            }
          }
        });

        res.status(201).json({ data: { business: publicBusiness(business) } });
      } catch (error) {
        next(error);
      } finally {
        await session.endSession();
      }
    }
  );

  app.patch(
    "/platform/businesses/:id",
    authenticate,
    requirePlatformAdmin,
    async (req, res, next) => {
      const session = mongoClient.startSession();
      try {
        const allowedStatuses = ["active", "suspended"];
        if (
          req.body.status !== undefined &&
          !allowedStatuses.includes(req.body.status)
        ) {
          throw new AppError(
            400,
            "INVALID_STATUS",
            `status must be one of: ${allowedStatuses.join(", ")}`
          );
        }

        let business;
        await session.withTransaction(async () => {
          business = await db
            .collection("businesses")
            .findOne({ id: req.params.id }, { session });
          if (!business) {
            throw new AppError(404, "BUSINESS_NOT_FOUND", "Business not found");
          }

          const changes = { updatedAt: new Date() };
          if (typeof req.body.name === "string" && req.body.name.trim()) {
            changes.name = req.body.name.trim();
            changes.slug = await createUniqueSlug(db, changes.name, {
              session,
              excludeId: business.id,
            });
          }
          if (req.body.status !== undefined) changes.status = req.body.status;

          if (req.body.ownerUserId !== undefined) {
            const owner = await db.collection("users").findOne(
              {
                id: req.body.ownerUserId,
                isPlatformAdmin: false,
                status: "active",
              },
              { session }
            );
            if (!owner) {
              throw new AppError(
                400,
                "INVALID_OWNER",
                "Active non-platform owner user was not found"
              );
            }
            const role = await db
              .collection("roles")
              .findOne(
                { businessId: business.id, slug: "business_owner" },
                { session }
              );
            await db.collection("business_memberships").updateOne(
              { userId: owner.id, businessId: business.id },
              {
                $setOnInsert: {
                  id: newId(),
                  userId: owner.id,
                  businessId: business.id,
                  roleId: role.id,
                  createdAt: new Date(),
                },
                $set: { roleId: role.id, updatedAt: new Date() },
              },
              { upsert: true, session }
            );
            changes.ownerUserId = owner.id;
          }

          await db
            .collection("businesses")
            .updateOne({ id: business.id }, { $set: changes }, { session });
          business = { ...business, ...changes };
        });

        res.json({ data: { business: publicBusiness(business) } });
      } catch (error) {
        next(error);
      } finally {
        await session.endSession();
      }
    }
  );

  const tenantRoute = [authenticate, resolveTenant];

  app.get(
    "/clients",
    ...tenantRoute,
    requirePermission("clients.view"),
    async (req, res, next) => {
      try {
        const clients = await db
          .collection("clients")
          .find(tenantScope(req))
          .toArray();
        res.json(clients);
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/clients/:id",
    ...tenantRoute,
    requirePermission("clients.view"),
    async (req, res, next) => {
      try {
        const client = await db.collection("clients").findOne({
          id: Number(req.params.id),
          ...tenantScope(req),
        });
        if (!client) {
          throw new AppError(404, "CLIENT_NOT_FOUND", "Client not found");
        }
        res.json(client);
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/clients",
    ...tenantRoute,
    requirePermission("clients.create"),
    async (req, res, next) => {
      try {
        const client = {
          id: await nextTenantId(db, "clients", req.tenant.businessId),
          ...tenantScope(req),
          name: req.body.name,
          phone: readContact(req.body.phone) ?? "",
          area: req.body.area ?? "",
          address: req.body.address,
          city: req.body.city,
          country: req.body.country,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await db.collection("clients").insertOne(client);
        res.status(201).json(client);
      } catch (error) {
        next(error);
      }
    }
  );

  app.put(
    "/clients/:id",
    ...tenantRoute,
    requirePermission("clients.update"),
    async (req, res, next) => {
      try {
        const filter = {
          id: Number(req.params.id),
          ...tenantScope(req),
        };
        const result = await db.collection("clients").updateOne(filter, {
          $set: {
            name: req.body.name,
            phone: readContact(req.body.phone) ?? "",
            area: req.body.area ?? "",
            address: req.body.address,
            city: req.body.city,
            country: req.body.country,
            updatedAt: new Date(),
          },
          $unset: { email: "", code: "" },
        });
        if (!result.matchedCount) {
          throw new AppError(404, "CLIENT_NOT_FOUND", "Client not found");
        }
        res.json(await db.collection("clients").findOne(filter));
      } catch (error) {
        next(error);
      }
    }
  );

  app.delete(
    "/clients/:id",
    ...tenantRoute,
    requirePermission("clients.delete"),
    async (req, res, next) => {
      try {
        const result = await db.collection("clients").deleteOne({
          id: Number(req.params.id),
          ...tenantScope(req),
        });
        if (!result.deletedCount) {
          throw new AppError(404, "CLIENT_NOT_FOUND", "Client not found");
        }
        res.json({ message: "Client deleted", id: Number(req.params.id) });
      } catch (error) {
        next(error);
      }
    }
  );

  registerCatalogRoutes({
    app,
    db,
    mongoClient,
    AppError,
    tenantRoute,
    requirePermission,
    tenantScope,
  });

  registerPurchaseRoutes({
    app,
    db,
    mongoClient,
    AppError,
    tenantRoute,
    requirePermission,
    tenantScope,
  });

  registerInvoiceRoutes({
    app,
    db,
    mongoClient,
    AppError,
    tenantRoute,
    requirePermission,
    tenantScope,
  });

  registerRateListRoutes({
    app,
    db,
    AppError,
    tenantRoute,
    requirePermission,
    tenantScope,
  });

  registerTeamRoutes({
    app,
    db,
    AppError,
    tenantRoute,
    requirePermission,
    normalizeEmail,
    validateEmail,
  });

  app.use((_req, _res, next) => {
    next(new AppError(404, "ROUTE_NOT_FOUND", "Route not found"));
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof TokenError) {
      res.status(401).json({
        error: { code: error.code, message: error.message, details: {} },
      });
      return;
    }
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      res.status(400).json({
        error: {
          code: "INVALID_JSON",
          message: "Request body contains invalid JSON",
          details: {},
        },
      });
      return;
    }

    const status = error.status || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({
      error: {
        code: error.code || "INTERNAL_SERVER_ERROR",
        message:
          status >= 500 ? "An unexpected server error occurred" : error.message,
        details: error.details || {},
      },
    });
  });

  return app;
}

async function start() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes("<db_password>")) {
    throw new Error("Set a valid MONGODB_URI in .env");
  }

  const mongoClient = new MongoClient(uri);
  console.log("Connecting to MongoDB...");
  await mongoClient.connect();
  const db = mongoClient.db(process.env.MONGODB_DB || "InvoiceApp");
  await runMigrations(db, mongoClient);

  const app = createApp({ db, mongoClient });
  const port = Number(process.env.PORT || 3000);
  app.listen(port, "127.0.0.1", () => {
    console.log(`Secure multi-tenant server running on http://127.0.0.1:${port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  AppError,
  createApp,
  buildUserResponse,
  getMembershipContext,
  start,
};
