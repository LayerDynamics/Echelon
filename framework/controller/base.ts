/**
 * Base Controller
 *
 * Provides common functionality for request handling.
 */

import type { EchelonRequest } from '../http/request.ts';
import type { EchelonResponse } from '../http/response.ts';

export interface ControllerContext {
  request: EchelonRequest;
  response: EchelonResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  state: Map<string, unknown>;
}

/**
 * Base controller class for Echelon
 */
export abstract class Controller {
  protected request!: EchelonRequest;
  protected response!: EchelonResponse;

  /**
   * Set the request/response context
   */
  setContext(req: EchelonRequest, res: EchelonResponse): this {
    this.request = req;
    this.response = res;
    return this;
  }

  /**
   * Get context object
   */
  get context(): ControllerContext {
    return {
      request: this.request,
      response: this.response,
      params: this.request.params,
      query: this.request.query,
      state: this.request.state,
    };
  }

  /**
   * Get route parameters
   */
  get params(): Record<string, string> {
    return this.request.params;
  }

  /**
   * Get query parameters
   */
  get query(): URLSearchParams {
    return this.request.query;
  }

  /**
   * Get a single query parameter
   */
  queryParam(name: string, defaultValue?: string): string | undefined {
    return this.request.query.get(name) ?? defaultValue;
  }

  /**
   * Get a required parameter (throws if missing)
   */
  requireParam(name: string): string {
    const value = this.params[name];
    if (!value) {
      throw new Error(`Required parameter '${name}' is missing`);
    }
    return value;
  }

  /**
   * Parse request body as JSON
   */
  async json<T = unknown>(): Promise<T> {
    return await this.request.json<T>();
  }

  /**
   * Send a JSON response
   */
  json_response(data: unknown, status = 200): Response {
    return this.response.status(status).json(data);
  }

  /**
   * Send an HTML response
   */
  html(content: string, status = 200): Response {
    return this.response.status(status).html(content);
  }

  /**
   * Send a text response
   */
  text(content: string, status = 200): Response {
    return this.response.status(status).text(content);
  }

  /**
   * Redirect to another URL
   */
  redirect(url: string, status: 301 | 302 | 303 | 307 | 308 = 302): Response {
    return this.response.redirect(url, status);
  }

  /**
   * Send a 404 Not Found response
   */
  notFound(message = 'Not Found'): Response {
    return this.response.notFound(message);
  }

  /**
   * Send a 400 Bad Request response
   */
  badRequest(message = 'Bad Request'): Response {
    return this.response.badRequest(message);
  }

  /**
   * Send a 401 Unauthorized response
   */
  unauthorized(message = 'Unauthorized'): Response {
    return this.response.unauthorized(message);
  }

  /**
   * Send a 403 Forbidden response
   */
  forbidden(message = 'Forbidden'): Response {
    return this.response.forbidden(message);
  }

  /**
   * Send a 500 Server Error response
   */
  serverError(message = 'Internal Server Error'): Response {
    return this.response.serverError(message);
  }

  /**
   * Validate request data
   */
  validate<T>(data: unknown, schema: ValidationSchema): T {
    const errors = validateData(data, schema);
    if (errors.length > 0) {
      throw new ValidationError(errors);
    }
    return data as T;
  }
}

/**
 * Create a controller action from a class method
 */
export function action<T extends Controller>(
  ControllerClass: new () => T,
  method: keyof T
) {
  return async (req: EchelonRequest, res: EchelonResponse): Promise<Response | void> => {
    const controller = new ControllerClass();
    controller.setContext(req, res);
    const fn = controller[method] as (...args: unknown[]) => Promise<Response | void>;
    return await fn.call(controller);
  };
}

// Simple validation types
interface ValidationSchema {
  [field: string]: {
    type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required?: boolean;
    min?: number;
    max?: number;
    pattern?: RegExp;
  };
}

interface ValidationError extends Error {
  errors: string[];
}

class ValidationError extends Error {
  errors: string[];

  constructor(errors: string[]) {
    super(`Validation failed: ${errors.join(', ')}`);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

function validateData(data: unknown, schema: ValidationSchema): string[] {
  const errors: string[] = [];
  const obj = data as Record<string, unknown>;

  for (const [field, rules] of Object.entries(schema)) {
    const value = obj[field];

    if (rules.required && (value === undefined || value === null)) {
      errors.push(`${field} is required`);
      continue;
    }

    if (value === undefined || value === null) continue;

    if (rules.type && typeof value !== rules.type) {
      errors.push(`${field} must be a ${rules.type}`);
    }

    if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
      errors.push(`${field} must be at least ${rules.min}`);
    }

    if (rules.max !== undefined && typeof value === 'number' && value > rules.max) {
      errors.push(`${field} must be at most ${rules.max}`);
    }

    if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
      errors.push(`${field} format is invalid`);
    }
  }

  return errors;
}
