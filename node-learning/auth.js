const crypto = require("crypto");
const { promisify } = require("util");
const {
  OWNER_PERMISSIONS,
  PLATFORM_MANAGE_BUSINESSES,
} = require("./permissions");

const scrypt = promisify(crypto.scrypt);
const PASSWORD_KEY_LENGTH = 64;

class TokenError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TokenError";
    this.code = code;
  }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, PASSWORD_KEY_LENGTH);
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
  if (
    typeof storedHash !== "string" ||
    !storedHash.includes(":") ||
    typeof password !== "string"
  ) {
    return false;
  }

  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const derivedKey = await scrypt(password, salt, PASSWORD_KEY_LENGTH);
  const storedBuffer = Buffer.from(hash, "hex");
  const derivedBuffer = Buffer.from(derivedKey);

  return (
    storedBuffer.length === derivedBuffer.length &&
    crypto.timingSafeEqual(storedBuffer, derivedBuffer)
  );
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signJwt(payload, secret, expiresInSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const encodedPayload = encode({
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  });
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${encodedPayload}`)
    .digest("base64url");

  return `${header}.${encodedPayload}.${signature}`;
}

function verifyJwt(token, secret, expectedType) {
  if (typeof token !== "string") {
    throw new TokenError("INVALID_TOKEN", "Authentication token is invalid");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new TokenError("INVALID_TOKEN", "Authentication token is invalid");
  }

  const [header, payload, signature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest();
  const providedSignature = Buffer.from(signature, "base64url");

  if (
    expectedSignature.length !== providedSignature.length ||
    !crypto.timingSafeEqual(expectedSignature, providedSignature)
  ) {
    throw new TokenError("INVALID_TOKEN", "Authentication token is invalid");
  }

  let decodedHeader;
  let decodedPayload;
  try {
    decodedHeader = JSON.parse(Buffer.from(header, "base64url").toString());
    decodedPayload = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    throw new TokenError("INVALID_TOKEN", "Authentication token is invalid");
  }

  if (decodedHeader.alg !== "HS256" || decodedHeader.typ !== "JWT") {
    throw new TokenError("INVALID_TOKEN", "Authentication token is invalid");
  }

  if (
    decodedPayload.type !== expectedType ||
    !Number.isInteger(decodedPayload.exp) ||
    decodedPayload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new TokenError(
      decodedPayload.exp <= Math.floor(Date.now() / 1000)
        ? "TOKEN_EXPIRED"
        : "INVALID_TOKEN",
      decodedPayload.exp <= Math.floor(Date.now() / 1000)
        ? "Authentication token has expired"
        : "Authentication token is invalid"
    );
  }

  return decodedPayload;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function issueTokens({
  db,
  user,
  activeBusinessId,
  accessSecret,
  refreshSecret,
  session,
}) {
  const accessExpiresIn = Number(process.env.JWT_ACCESS_EXPIRES_SECONDS || 900);
  const refreshExpiresIn = Number(
    process.env.JWT_REFRESH_EXPIRES_SECONDS || 604800
  );
  const basePayload = {
    userId: user.id,
    isPlatformAdmin: user.isPlatformAdmin === true,
    activeBusinessId: activeBusinessId || null,
  };
  const accessToken = signJwt(
    { ...basePayload, type: "access" },
    accessSecret,
    accessExpiresIn
  );
  const jti = crypto.randomUUID();
  const refreshToken = signJwt(
    { ...basePayload, type: "refresh", jti },
    refreshSecret,
    refreshExpiresIn
  );

  await db.collection("refresh_tokens").insertOne(
    {
      id: jti,
      userId: user.id,
      activeBusinessId: activeBusinessId || null,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshExpiresIn * 1000),
      revokedAt: null,
      createdAt: new Date(),
    },
    { session }
  );

  return { accessToken, refreshToken };
}

module.exports = {
  OWNER_PERMISSIONS,
  PLATFORM_MANAGE_BUSINESSES,
  TokenError,
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt,
  hashToken,
  issueTokens,
};
