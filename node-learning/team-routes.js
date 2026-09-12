const {
  sanitizeBusinessPermissions,
  slugifyRoleName,
} = require("./permissions");
const { writeAuditLog, actorDisplayName } = require("./audit");
const { hashPassword } = require("./auth");
const { newId } = require("./database");
const { parseListPagination, paginateArray, paginateFind } = require("./pagination");

function publicRole(role) {
  return {
    id: role.id,
    businessId: role.businessId,
    name: role.name,
    slug: role.slug,
    description: role.description || "",
    isSystem: role.isSystem === true,
    permissions: Array.isArray(role.permissions) ? role.permissions : [],
  };
}

function publicMember(user, role, membership) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
    email: user.email,
    status: user.status,
    role: role
      ? { id: role.id, name: role.name, slug: role.slug }
      : null,
    membershipId: membership?.id || null,
    createdAt: membership?.createdAt || user.createdAt,
  };
}

function registerTeamRoutes({
  app,
  db,
  AppError,
  tenantRoute,
  requirePermission,
  normalizeEmail,
  validateEmail,
}) {
  async function countOwners(businessId) {
    const ownerRole = await db.collection("roles").findOne({
      businessId,
      slug: "business_owner",
    });
    if (!ownerRole) return 0;
    return db.collection("business_memberships").countDocuments({
      businessId,
      roleId: ownerRole.id,
    });
  }

  async function loadMember(businessId, userId) {
    const membership = await db.collection("business_memberships").findOne({
      businessId,
      userId,
    });
    if (!membership) return null;
    const [user, role] = await Promise.all([
      db.collection("users").findOne({ id: userId }),
      db.collection("roles").findOne({
        id: membership.roleId,
        businessId,
      }),
    ]);
    if (!user || !role) return null;
    return { membership, user, role };
  }

  app.get(
    "/users",
    ...tenantRoute,
    requirePermission("users.view"),
    async (req, res, next) => {
      try {
        const memberships = await db
          .collection("business_memberships")
          .find({ businessId: req.tenant.businessId })
          .toArray();

        const users = [];
        for (const membership of memberships) {
          const user = await db.collection("users").findOne({
            id: membership.userId,
          });
          const role = await db.collection("roles").findOne({
            id: membership.roleId,
            businessId: req.tenant.businessId,
          });
          if (!user || !role) continue;

          const q = String(req.query.q || "")
            .trim()
            .toLowerCase();
          if (q) {
            const hay = `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase();
            if (!hay.includes(q)) continue;
          }

          users.push(publicMember(user, role, membership));
        }

        const paging = parseListPagination(req.query);
        const { rows, pagination } = paginateArray(users, paging);
        res.json({ data: { users: rows, pagination } });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/users",
    ...tenantRoute,
    requirePermission("users.invite"),
    async (req, res, next) => {
      try {
        const firstName =
          typeof req.body.firstName === "string" ? req.body.firstName.trim() : "";
        const lastName =
          typeof req.body.lastName === "string" ? req.body.lastName.trim() : "";
        const email = normalizeEmail(req.body.email);
        const password = req.body.password;
        const roleId = req.body.roleId;

        if (!firstName || !lastName || !email || !roleId) {
          throw new AppError(
            400,
            "VALIDATION_ERROR",
            "firstName, lastName, email, and roleId are required"
          );
        }
        if (!validateEmail(email)) {
          throw new AppError(400, "INVALID_EMAIL", "A valid email is required");
        }
        if (typeof password !== "string" || password.length < 8) {
          throw new AppError(
            400,
            "WEAK_PASSWORD",
            "Password must be at least 8 characters long"
          );
        }

        const role = await db.collection("roles").findOne({
          id: roleId,
          businessId: req.tenant.businessId,
        });
        if (!role) {
          throw new AppError(404, "ROLE_NOT_FOUND", "Role not found");
        }

        let user = await db.collection("users").findOne({ email });
        if (user?.isPlatformAdmin) {
          throw new AppError(
            400,
            "INVALID_USER",
            "Platform administrators cannot be invited into a business"
          );
        }

        if (user) {
          const existingMembership = await db
            .collection("business_memberships")
            .findOne({
              userId: user.id,
              businessId: req.tenant.businessId,
            });
          if (existingMembership) {
            throw new AppError(
              409,
              "ALREADY_MEMBER",
              "User is already a member of this business"
            );
          }
        } else {
          user = {
            id: newId(),
            firstName,
            lastName,
            email,
            passwordHash: await hashPassword(password),
            isPlatformAdmin: false,
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await db.collection("users").insertOne(user);
        }

        const membership = {
          id: newId(),
          userId: user.id,
          businessId: req.tenant.businessId,
          roleId: role.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await db.collection("business_memberships").insertOne(membership);

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "users.invite",
          entity: "user",
          entityId: user.id,
          newValues: { email: user.email, roleId: role.id, roleSlug: role.slug },
        });

        res.status(201).json({
          data: { user: publicMember(user, role, membership) },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch(
    "/users/:id",
    ...tenantRoute,
    requirePermission("users.update"),
    async (req, res, next) => {
      try {
        const member = await loadMember(req.tenant.businessId, req.params.id);
        if (!member) {
          throw new AppError(404, "USER_NOT_FOUND", "User not found in this business");
        }

        const { user, role, membership } = member;
        const changes = {};
        const membershipChanges = {};
        const oldValues = {
          firstName: user.firstName,
          lastName: user.lastName,
          status: user.status,
          roleId: role.id,
        };

        if (typeof req.body.firstName === "string" && req.body.firstName.trim()) {
          changes.firstName = req.body.firstName.trim();
        }
        if (typeof req.body.lastName === "string" && req.body.lastName.trim()) {
          changes.lastName = req.body.lastName.trim();
        }
        if (req.body.status !== undefined) {
          if (!["active", "suspended"].includes(req.body.status)) {
            throw new AppError(
              400,
              "INVALID_STATUS",
              "status must be active or suspended"
            );
          }
          if (
            user.id === req.auth.user.id &&
            req.body.status === "suspended"
          ) {
            throw new AppError(
              400,
              "CANNOT_SUSPEND_SELF",
              "You cannot suspend your own account"
            );
          }
          changes.status = req.body.status;
        }
        if (typeof req.body.password === "string" && req.body.password) {
          if (req.body.password.length < 8) {
            throw new AppError(
              400,
              "WEAK_PASSWORD",
              "Password must be at least 8 characters long"
            );
          }
          changes.passwordHash = await hashPassword(req.body.password);
        }

        let nextRole = role;
        if (req.body.roleId !== undefined) {
          nextRole = await db.collection("roles").findOne({
            id: req.body.roleId,
            businessId: req.tenant.businessId,
          });
          if (!nextRole) {
            throw new AppError(404, "ROLE_NOT_FOUND", "Role not found");
          }

          if (
            role.slug === "business_owner" &&
            nextRole.slug !== "business_owner"
          ) {
            const owners = await countOwners(req.tenant.businessId);
            if (owners <= 1) {
              throw new AppError(
                409,
                "LAST_OWNER",
                "Cannot demote the last business owner"
              );
            }
          }
          membershipChanges.roleId = nextRole.id;
        }

        if (Object.keys(changes).length) {
          changes.updatedAt = new Date();
          await db
            .collection("users")
            .updateOne({ id: user.id }, { $set: changes });
        }
        if (Object.keys(membershipChanges).length) {
          membershipChanges.updatedAt = new Date();
          await db
            .collection("business_memberships")
            .updateOne({ id: membership.id }, { $set: membershipChanges });
        }

        const updatedUser = { ...user, ...changes };
        const updatedMembership = { ...membership, ...membershipChanges };

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "users.update",
          entity: "user",
          entityId: user.id,
          oldValues,
          newValues: {
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            status: updatedUser.status,
            roleId: nextRole.id,
          },
        });

        res.json({
          data: {
            user: publicMember(updatedUser, nextRole, updatedMembership),
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.delete(
    "/users/:id",
    ...tenantRoute,
    requirePermission("users.delete"),
    async (req, res, next) => {
      try {
        if (req.params.id === req.auth.user.id) {
          throw new AppError(
            400,
            "CANNOT_REMOVE_SELF",
            "You cannot remove yourself from the business"
          );
        }

        const member = await loadMember(req.tenant.businessId, req.params.id);
        if (!member) {
          throw new AppError(404, "USER_NOT_FOUND", "User not found in this business");
        }

        if (member.role.slug === "business_owner") {
          const owners = await countOwners(req.tenant.businessId);
          if (owners <= 1) {
            throw new AppError(
              409,
              "LAST_OWNER",
              "Cannot remove the last business owner"
            );
          }
        }

        await db.collection("business_memberships").deleteOne({
          id: member.membership.id,
        });

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "users.remove",
          entity: "user",
          entityId: member.user.id,
          oldValues: {
            email: member.user.email,
            roleSlug: member.role.slug,
          },
        });

        res.status(204).end();
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/roles",
    ...tenantRoute,
    requirePermission("roles.view"),
    async (req, res, next) => {
      try {
        const roles = await db
          .collection("roles")
          .find({ businessId: req.tenant.businessId })
          .sort({ isSystem: -1, name: 1 })
          .toArray();
        res.json({ data: { roles: roles.map(publicRole) } });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/roles",
    ...tenantRoute,
    requirePermission("roles.manage"),
    async (req, res, next) => {
      try {
        const name =
          typeof req.body.name === "string" ? req.body.name.trim() : "";
        if (!name) {
          throw new AppError(400, "VALIDATION_ERROR", "Role name is required");
        }

        const baseSlug = slugifyRoleName(name) || `role_${Date.now()}`;
        let slug = baseSlug;
        let suffix = 1;
        while (
          await db.collection("roles").findOne({
            businessId: req.tenant.businessId,
            slug,
          })
        ) {
          suffix += 1;
          slug = `${baseSlug}_${suffix}`;
        }

        const permissions = sanitizeBusinessPermissions(req.body.permissions, {
          allowWildcard: false,
        });

        const role = {
          id: newId(),
          businessId: req.tenant.businessId,
          name,
          slug,
          description:
            typeof req.body.description === "string"
              ? req.body.description.trim()
              : "",
          permissions,
          isSystem: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await db.collection("roles").insertOne(role);

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "roles.create",
          entity: "role",
          entityId: role.id,
          newValues: { name: role.name, permissions: role.permissions },
        });

        res.status(201).json({ data: { role: publicRole(role) } });
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch(
    "/roles/:id",
    ...tenantRoute,
    requirePermission("roles.manage"),
    async (req, res, next) => {
      try {
        const role = await db.collection("roles").findOne({
          id: req.params.id,
          businessId: req.tenant.businessId,
        });
        if (!role) {
          throw new AppError(404, "ROLE_NOT_FOUND", "Role not found");
        }

        const changes = { updatedAt: new Date() };
        const oldValues = {
          name: role.name,
          description: role.description || "",
          permissions: role.permissions,
        };

        if (typeof req.body.name === "string" && req.body.name.trim()) {
          if (role.isSystem && role.slug === "business_owner") {
            throw new AppError(
              409,
              "SYSTEM_ROLE_LOCKED",
              "Business Owner role name cannot be changed"
            );
          }
          changes.name = req.body.name.trim();
        }
        if (typeof req.body.description === "string") {
          changes.description = req.body.description.trim();
        }
        if (req.body.permissions !== undefined) {
          if (role.slug === "business_owner") {
            throw new AppError(
              409,
              "SYSTEM_ROLE_LOCKED",
              "Business Owner permissions cannot be changed"
            );
          }
          changes.permissions = sanitizeBusinessPermissions(
            req.body.permissions,
            { allowWildcard: false }
          );
        }

        await db
          .collection("roles")
          .updateOne({ id: role.id }, { $set: changes });
        const updated = { ...role, ...changes };

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "roles.update",
          entity: "role",
          entityId: role.id,
          oldValues,
          newValues: {
            name: updated.name,
            description: updated.description || "",
            permissions: updated.permissions,
          },
        });

        res.json({ data: { role: publicRole(updated) } });
      } catch (error) {
        next(error);
      }
    }
  );

  app.delete(
    "/roles/:id",
    ...tenantRoute,
    requirePermission("roles.manage"),
    async (req, res, next) => {
      try {
        const role = await db.collection("roles").findOne({
          id: req.params.id,
          businessId: req.tenant.businessId,
        });
        if (!role) {
          throw new AppError(404, "ROLE_NOT_FOUND", "Role not found");
        }
        if (role.isSystem) {
          throw new AppError(
            409,
            "SYSTEM_ROLE_LOCKED",
            "System roles cannot be deleted"
          );
        }

        const inUse = await db.collection("business_memberships").countDocuments({
          businessId: req.tenant.businessId,
          roleId: role.id,
        });
        if (inUse > 0) {
          throw new AppError(
            409,
            "ROLE_IN_USE",
            "Role is assigned to one or more users"
          );
        }

        await db.collection("roles").deleteOne({ id: role.id });

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "roles.delete",
          entity: "role",
          entityId: role.id,
          oldValues: { name: role.name, slug: role.slug },
        });

        res.status(204).end();
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/audit-logs",
    ...tenantRoute,
    requirePermission("audit.view"),
    async (req, res, next) => {
      try {
        const paging = parseListPagination(req.query, {
          defaultLimit: 100,
          maxLimit: 200,
        });
        const { rows, pagination } = await paginateFind(
          db.collection("audit_logs"),
          { businessId: req.tenant.businessId },
          { ...paging, sort: { createdAt: -1 } }
        );
        res.json({ data: { logs: rows, pagination } });
      } catch (error) {
        next(error);
      }
    }
  );
}

module.exports = {
  registerTeamRoutes,
  publicRole,
  publicMember,
};
