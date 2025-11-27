/**
 * Layer 6: Authentication & Authorization (AuthN/AuthZ)
 *
 * Identity, access control, and security enforcement.
 *
 * Responsibilities:
 * - Verify user identity (authentication)
 * - Enforce access policies (authorization)
 * - Secure password storage and validation
 * - Manage sessions and tokens
 * - Protect against common attacks (CSRF, brute force)
 * - Provide audit trails
 */

export { Auth, type AuthOptions, type AuthUser } from './auth.ts';
export { Session, type SessionData, type SessionOptions } from './session.ts';
export { RBAC, type Role, type Permission, type RBACOptions } from './rbac.ts';
export { hashPassword, verifyPassword } from './password.ts';
