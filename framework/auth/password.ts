/**
 * Password Hashing
 *
 * Secure password hashing using Web Crypto API.
 * Uses PBKDF2 with SHA-256 for password hashing.
 */

const ALGORITHM = 'PBKDF2';
const HASH_ALGORITHM = 'SHA-256';
const ITERATIONS = 100000;
const KEY_LENGTH = 256;
const SALT_LENGTH = 16;

/**
 * Hash a password
 */
export async function hashPassword(password: string): Promise<string> {
  // Generate random salt
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  // Encode password
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  // Import password as key
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    ALGORITHM,
    false,
    ['deriveBits']
  );

  // Derive key
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: ALGORITHM,
      salt,
      iterations: ITERATIONS,
      hash: HASH_ALGORITHM,
    },
    passwordKey,
    KEY_LENGTH
  );

  // Combine salt and hash
  const hash = new Uint8Array(derivedBits);
  const combined = new Uint8Array(salt.length + hash.length);
  combined.set(salt, 0);
  combined.set(hash, salt.length);

  // Encode as base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  try {
    // Decode stored hash
    const combined = Uint8Array.from(atob(storedHash), (c) => c.charCodeAt(0));

    // Extract salt and hash
    const salt = combined.slice(0, SALT_LENGTH);
    const storedDerivedBits = combined.slice(SALT_LENGTH);

    // Encode password
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    // Import password as key
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      ALGORITHM,
      false,
      ['deriveBits']
    );

    // Derive key with same salt
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: ALGORITHM,
        salt,
        iterations: ITERATIONS,
        hash: HASH_ALGORITHM,
      },
      passwordKey,
      KEY_LENGTH
    );

    // Compare hashes
    const newHash = new Uint8Array(derivedBits);
    return timingSafeEqual(newHash, storedDerivedBits);
  } catch {
    return false;
  }
}

/**
 * Timing-safe comparison of two byte arrays
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}

/**
 * Generate a secure random token
 */
export function generateToken(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a secure random string (alphanumeric)
 */
export function generateRandomString(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join('');
}
