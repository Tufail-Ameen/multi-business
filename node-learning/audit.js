const crypto = require("crypto");

/**
 * Append-only audit foundation for Phase 1+.
 * Callers pass businessId explicitly (never from untrusted body alone).
 */
async function writeAuditLog(
  db,
  {
    businessId,
    actorId,
    actorName,
    action,
    entity,
    entityId = null,
    oldValues = null,
    newValues = null,
    meta = null,
    session = null,
  }
) {
  if (!businessId || !action || !entity) {
    throw new Error("writeAuditLog requires businessId, action, and entity");
  }

  const entry = {
    id: crypto.randomUUID(),
    businessId,
    actorId: actorId || null,
    actorName: actorName || null,
    action,
    entity,
    entityId: entityId == null ? null : String(entityId),
    oldValues: oldValues || null,
    newValues: newValues || null,
    meta: meta || null,
    createdAt: new Date(),
  };

  await db.collection("audit_logs").insertOne(entry, session ? { session } : undefined);
  return entry;
}

function actorDisplayName(user) {
  if (!user) return null;
  const full = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  return full || user.email || user.id;
}

module.exports = {
  writeAuditLog,
  actorDisplayName,
};
