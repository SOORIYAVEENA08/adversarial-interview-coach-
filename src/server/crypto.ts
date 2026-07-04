import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "adversarial-interview-coach-super-secret-key-13579";

/**
 * Generate a salt and hash password using PBKDF2
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, hash] = storedHash.split(":");
    if (!salt || !hash) return false;
    const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(verifyHash, "hex"));
  } catch (e) {
    return false;
  }
}

/**
 * Create a simple, secure HMAC-SHA256 JWT
 */
export function createToken(payload: object, expiresInSeconds = 86400): string {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  
  const base64Header = Buffer.from(JSON.stringify(header))
    .toString("base64url");
  const base64Payload = Buffer.from(JSON.stringify({ ...payload, exp }))
    .toString("base64url");
  
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${base64Header}.${base64Payload}`)
    .digest("base64url");
  
  return `${base64Header}.${base64Payload}.${signature}`;
}

/**
 * Verify simple JWT and return payload
 */
export function verifyToken(token: string): any {
  try {
    const [base64Header, base64Payload, signature] = token.split(".");
    if (!base64Header || !base64Payload || !signature) return null;
    
    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${base64Header}.${base64Payload}`)
      .digest("base64url");
    
    if (signature !== expectedSignature) return null;
    
    const payload = JSON.parse(Buffer.from(base64Payload, "base64url").toString());
    
    // Check expiration
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null;
    }
    
    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Verify simple JWT signature while ignoring its expiration (for silent refresh)
 */
export function verifyTokenIgnoreExp(token: string): any {
  try {
    const [base64Header, base64Payload, signature] = token.split(".");
    if (!base64Header || !base64Payload || !signature) return null;
    
    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${base64Header}.${base64Payload}`)
      .digest("base64url");
    
    if (signature !== expectedSignature) return null;
    
    return JSON.parse(Buffer.from(base64Payload, "base64url").toString());
  } catch (e) {
    return null;
  }
}
