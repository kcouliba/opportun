import { prisma } from "./prisma";
import { createHash } from "crypto";

export interface AuthResult {
  authenticated: boolean;
  profileId?: string;
  error?: string;
}

/**
 * Validates an API key from the Authorization header.
 * Expected format: "Bearer opp_xxxxx..."
 *
 * @param authHeader - The Authorization header value
 * @returns AuthResult with authentication status and profileId if valid
 */
export async function validateApiKey(
  authHeader: string | null
): Promise<AuthResult> {
  if (!authHeader) {
    return { authenticated: false, error: "Missing Authorization header" };
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return {
      authenticated: false,
      error: "Invalid Authorization format. Expected: Bearer <api_key>",
    };
  }

  const apiKey = parts[1];
  if (!apiKey.startsWith("opp_")) {
    return { authenticated: false, error: "Invalid API key format" };
  }

  // Hash the provided key
  const keyHash = createHash("sha256").update(apiKey).digest("hex");

  // Find matching key
  const storedKey = await prisma.apiKey.findUnique({
    where: { keyHash },
  });

  if (!storedKey) {
    return { authenticated: false, error: "Invalid API key" };
  }

  if (storedKey.revoked) {
    return { authenticated: false, error: "API key has been revoked" };
  }

  if (storedKey.expiresAt && storedKey.expiresAt < new Date()) {
    return { authenticated: false, error: "API key has expired" };
  }

  // Update last used timestamp
  await prisma.apiKey.update({
    where: { id: storedKey.id },
    data: { lastUsedAt: new Date() },
  });

  return { authenticated: true, profileId: storedKey.profileId };
}

/**
 * Generates a new API key.
 * Returns both the raw key (to show user once) and the hash (to store).
 */
export function generateApiKey(): { key: string; keyHash: string; keyPrefix: string } {
  const randomBytes = createHash("sha256")
    .update(Math.random().toString() + Date.now().toString())
    .digest("hex")
    .slice(0, 32);

  const key = `opp_${randomBytes}`;
  const keyHash = createHash("sha256").update(key).digest("hex");
  const keyPrefix = key.slice(0, 12);

  return { key, keyHash, keyPrefix };
}

/**
 * Optional authentication middleware helper.
 * If an API key is provided, it must be valid.
 * If no key is provided, allows the request (for browser/frontend access).
 */
export async function optionalAuth(
  authHeader: string | null
): Promise<AuthResult> {
  // No auth header = allow (for frontend)
  if (!authHeader) {
    return { authenticated: true };
  }

  // Auth header provided = must be valid
  return validateApiKey(authHeader);
}
