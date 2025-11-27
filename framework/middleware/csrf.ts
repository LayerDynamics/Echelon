/**
 * CSRF Middleware
 *
 * Cross-Site Request Forgery protection.
 * Generates and validates CSRF tokens for form submissions.
 */

import type { LegacyMiddleware } from '../http/types.ts';

export interface CsrfOptions {
  tokenKey?: string;
  headerName?: string;
  cookieName?: string;
  cookieOptions?: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    path?: string;
  };
  ignoreMethods?: string[];
  ignorePaths?: string[];
}

const DEFAULT_OPTIONS: CsrfOptions = {
  tokenKey: '_csrf',
  headerName: 'X-CSRF-Token',
  cookieName: 'csrf_token',
  cookieOptions: {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
  ignorePaths: [],
};

/**
 * Create CSRF protection middleware
 */
export function csrfMiddleware(options: CsrfOptions = {}): LegacyMiddleware {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (req, res, next) => {
    // Skip CSRF check for safe methods
    if (opts.ignoreMethods!.includes(req.method)) {
      // Generate token for the response if needed
      ensureCsrfToken(req, res, opts);
      return await next();
    }

    // Skip CSRF check for ignored paths
    if (opts.ignorePaths!.some((path) => req.path.startsWith(path))) {
      return await next();
    }

    // Get the expected token from cookie
    const cookieToken = req.cookie(opts.cookieName!);

    // Get the submitted token from header or body
    const submittedToken =
      req.header(opts.headerName!) ??
      (await getTokenFromBody(req, opts.tokenKey!));

    // Validate the token
    if (!cookieToken || !submittedToken || cookieToken !== submittedToken) {
      return res.status(403).json({
        error: 'CSRF token validation failed',
        code: 'CSRF_INVALID',
      });
    }

    return await next();
  };
}

/**
 * Generate a CSRF token
 */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Ensure a CSRF token exists for the request
 */
function ensureCsrfToken(
  req: { cookie: (name: string) => string | undefined; state: Map<string, unknown> },
  res: { cookie: (name: string, value: string, options?: object) => void },
  opts: CsrfOptions
): void {
  let token = req.cookie(opts.cookieName!);

  if (!token) {
    token = generateCsrfToken();
    res.cookie(opts.cookieName!, token, opts.cookieOptions);
  }

  // Store token in request state for templates
  req.state.set('csrfToken', token);
}

/**
 * Get CSRF token from request body
 */
async function getTokenFromBody(
  req: { contentType: string | null; formData: () => Promise<FormData>; json: <T>() => Promise<T> },
  tokenKey: string
): Promise<string | null> {
  try {
    const contentType = req.contentType ?? '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      return formData.get(tokenKey) as string | null;
    }

    if (contentType.includes('application/json')) {
      const body = await req.json<Record<string, unknown>>();
      return (body[tokenKey] as string) ?? null;
    }
  } catch {
    // Ignore body parsing errors
  }

  return null;
}

// Alias for convenience
export const csrf = csrfMiddleware;
