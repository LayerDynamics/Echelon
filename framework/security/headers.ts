/**
 * Security Headers
 *
 * Apply security headers to HTTP responses.
 */

import type { Middleware, Context, Next } from '../http/types.ts';

export interface SecurityHeadersOptions {
  contentSecurityPolicy?: ContentSecurityPolicyOptions | false;
  strictTransportSecurity?: StrictTransportSecurityOptions | false;
  xContentTypeOptions?: boolean;
  xFrameOptions?: 'DENY' | 'SAMEORIGIN' | false;
  xXssProtection?: boolean;
  referrerPolicy?: ReferrerPolicy | false;
  permissionsPolicy?: PermissionsPolicyOptions | false;
}

export interface ContentSecurityPolicyOptions {
  defaultSrc?: string[];
  scriptSrc?: string[];
  styleSrc?: string[];
  imgSrc?: string[];
  fontSrc?: string[];
  connectSrc?: string[];
  mediaSrc?: string[];
  objectSrc?: string[];
  frameSrc?: string[];
  childSrc?: string[];
  workerSrc?: string[];
  frameAncestors?: string[];
  formAction?: string[];
  baseUri?: string[];
  upgradeInsecureRequests?: boolean;
  reportUri?: string;
}

export interface StrictTransportSecurityOptions {
  maxAge?: number;
  includeSubDomains?: boolean;
  preload?: boolean;
}

export interface PermissionsPolicyOptions {
  accelerometer?: string[];
  camera?: string[];
  geolocation?: string[];
  gyroscope?: string[];
  magnetometer?: string[];
  microphone?: string[];
  payment?: string[];
  usb?: string[];
}

type ReferrerPolicy =
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'origin'
  | 'origin-when-cross-origin'
  | 'same-origin'
  | 'strict-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url';

const DEFAULT_OPTIONS: SecurityHeadersOptions = {
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
  },
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: false,
  },
  xContentTypeOptions: true,
  xFrameOptions: 'DENY',
  xXssProtection: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy: {
    accelerometer: [],
    camera: [],
    geolocation: [],
    gyroscope: [],
    magnetometer: [],
    microphone: [],
    payment: [],
    usb: [],
  },
};

/**
 * Build Content-Security-Policy header value
 */
function buildCSP(options: ContentSecurityPolicyOptions): string {
  const directives: string[] = [];

  if (options.defaultSrc) {
    directives.push(`default-src ${options.defaultSrc.join(' ')}`);
  }
  if (options.scriptSrc) {
    directives.push(`script-src ${options.scriptSrc.join(' ')}`);
  }
  if (options.styleSrc) {
    directives.push(`style-src ${options.styleSrc.join(' ')}`);
  }
  if (options.imgSrc) {
    directives.push(`img-src ${options.imgSrc.join(' ')}`);
  }
  if (options.fontSrc) {
    directives.push(`font-src ${options.fontSrc.join(' ')}`);
  }
  if (options.connectSrc) {
    directives.push(`connect-src ${options.connectSrc.join(' ')}`);
  }
  if (options.mediaSrc) {
    directives.push(`media-src ${options.mediaSrc.join(' ')}`);
  }
  if (options.objectSrc) {
    directives.push(`object-src ${options.objectSrc.join(' ')}`);
  }
  if (options.frameSrc) {
    directives.push(`frame-src ${options.frameSrc.join(' ')}`);
  }
  if (options.childSrc) {
    directives.push(`child-src ${options.childSrc.join(' ')}`);
  }
  if (options.workerSrc) {
    directives.push(`worker-src ${options.workerSrc.join(' ')}`);
  }
  if (options.frameAncestors) {
    directives.push(`frame-ancestors ${options.frameAncestors.join(' ')}`);
  }
  if (options.formAction) {
    directives.push(`form-action ${options.formAction.join(' ')}`);
  }
  if (options.baseUri) {
    directives.push(`base-uri ${options.baseUri.join(' ')}`);
  }
  if (options.upgradeInsecureRequests) {
    directives.push('upgrade-insecure-requests');
  }
  if (options.reportUri) {
    directives.push(`report-uri ${options.reportUri}`);
  }

  return directives.join('; ');
}

/**
 * Build Strict-Transport-Security header value
 */
function buildHSTS(options: StrictTransportSecurityOptions): string {
  let value = `max-age=${options.maxAge ?? 31536000}`;
  if (options.includeSubDomains) {
    value += '; includeSubDomains';
  }
  if (options.preload) {
    value += '; preload';
  }
  return value;
}

/**
 * Build Permissions-Policy header value
 */
function buildPermissionsPolicy(options: PermissionsPolicyOptions): string {
  const policies: string[] = [];

  for (const [key, value] of Object.entries(options)) {
    const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    if (value.length === 0) {
      policies.push(`${kebabKey}=()`);
    } else {
      policies.push(`${kebabKey}=(${value.join(' ')})`);
    }
  }

  return policies.join(', ');
}

/**
 * Security headers middleware
 */
export function securityHeaders(options: SecurityHeadersOptions = {}): Middleware {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return async (ctx: Context, next: Next): Promise<Response> => {
    const response = await next();

    const headers = new Headers(response.headers);

    // Content-Security-Policy
    if (config.contentSecurityPolicy) {
      headers.set('Content-Security-Policy', buildCSP(config.contentSecurityPolicy));
    }

    // Strict-Transport-Security
    if (config.strictTransportSecurity) {
      headers.set('Strict-Transport-Security', buildHSTS(config.strictTransportSecurity));
    }

    // X-Content-Type-Options
    if (config.xContentTypeOptions) {
      headers.set('X-Content-Type-Options', 'nosniff');
    }

    // X-Frame-Options
    if (config.xFrameOptions) {
      headers.set('X-Frame-Options', config.xFrameOptions);
    }

    // X-XSS-Protection (legacy but still useful)
    if (config.xXssProtection) {
      headers.set('X-XSS-Protection', '1; mode=block');
    }

    // Referrer-Policy
    if (config.referrerPolicy) {
      headers.set('Referrer-Policy', config.referrerPolicy);
    }

    // Permissions-Policy
    if (config.permissionsPolicy) {
      headers.set('Permissions-Policy', buildPermissionsPolicy(config.permissionsPolicy));
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
