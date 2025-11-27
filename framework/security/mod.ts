/**
 * Layer 17: Security
 *
 * Cross-cutting security concerns.
 *
 * Responsibilities:
 * - Security headers
 * - Input sanitization
 * - XSS protection
 * - Rate limiting (see middleware)
 * - CSRF protection (see middleware)
 */

export {
  securityHeaders,
  type SecurityHeadersOptions,
  type ContentSecurityPolicyOptions,
  type StrictTransportSecurityOptions,
  type PermissionsPolicyOptions,
} from './headers.ts';

export {
  escapeHtml,
  unescapeHtml,
  stripTags,
  stripSpecificTags,
  allowTags,
  sanitizeHtml,
  escapeSql,
  escapeRegex,
  escapeJson,
  sanitizeUrl,
  sanitizeFilename,
  sanitizeObject,
  removeInvisibleChars,
  normalizeUnicode,
} from './sanitize.ts';
