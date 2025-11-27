/**
 * Enhanced Request Object
 *
 * Wraps the native Request with additional utilities and properties
 * commonly needed in web applications.
 */

export interface RequestContext {
  params: Record<string, string>;
  query: URLSearchParams;
  state: Map<string, unknown>;
  startTime: number;
}

/**
 * Enhanced Request class for Echelon
 */
export class EchelonRequest {
  private _request: Request;
  private _url: URL;
  private _context: RequestContext;
  private _body: unknown | null = null;
  private _bodyParsed = false;

  constructor(request: Request, context?: Partial<RequestContext>) {
    this._request = request;
    this._url = new URL(request.url);
    this._context = {
      params: context?.params ?? {},
      query: this._url.searchParams,
      state: context?.state ?? new Map(),
      startTime: context?.startTime ?? performance.now(),
    };
  }

  /**
   * The underlying native Request
   */
  get raw(): Request {
    return this._request;
  }

  /**
   * HTTP method (GET, POST, etc.)
   */
  get method(): string {
    return this._request.method;
  }

  /**
   * Full URL
   */
  get url(): string {
    return this._request.url;
  }

  /**
   * URL path (without query string)
   */
  get path(): string {
    return this._url.pathname;
  }

  /**
   * Query parameters as URLSearchParams
   */
  get query(): URLSearchParams {
    return this._context.query;
  }

  /**
   * Route parameters extracted from path
   */
  get params(): Record<string, string> {
    return this._context.params;
  }

  /**
   * Request headers
   */
  get headers(): Headers {
    return this._request.headers;
  }

  /**
   * Get a specific header value
   */
  header(name: string): string | null {
    return this._request.headers.get(name);
  }

  /**
   * Request state for passing data between middleware
   */
  get state(): Map<string, unknown> {
    return this._context.state;
  }

  /**
   * Request start time for timing
   */
  get startTime(): number {
    return this._context.startTime;
  }

  /**
   * Check if request is HTTPS
   */
  get isSecure(): boolean {
    return this._url.protocol === 'https:';
  }

  /**
   * Check if request accepts JSON
   */
  get acceptsJson(): boolean {
    const accept = this.header('Accept') ?? '';
    return accept.includes('application/json') || accept.includes('*/*');
  }

  /**
   * Check if request is AJAX/XHR
   */
  get isAjax(): boolean {
    return this.header('X-Requested-With')?.toLowerCase() === 'xmlhttprequest';
  }

  /**
   * Content-Type header
   */
  get contentType(): string | null {
    return this.header('Content-Type');
  }

  /**
   * Get the hostname
   */
  get hostname(): string {
    return this._url.hostname;
  }

  /**
   * Get the client IP address (accounting for proxies)
   */
  get ip(): string {
    return (
      this.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
      this.header('X-Real-IP') ??
      'unknown'
    );
  }

  /**
   * Parse and return the request body as JSON
   */
  async json<T = unknown>(): Promise<T> {
    if (!this._bodyParsed) {
      this._body = await this._request.json();
      this._bodyParsed = true;
    }
    return this._body as T;
  }

  /**
   * Parse and return the request body as text
   */
  async text(): Promise<string> {
    if (!this._bodyParsed) {
      this._body = await this._request.text();
      this._bodyParsed = true;
    }
    return this._body as string;
  }

  /**
   * Parse and return the request body as FormData
   */
  async formData(): Promise<FormData> {
    if (!this._bodyParsed) {
      this._body = await this._request.formData();
      this._bodyParsed = true;
    }
    return this._body as FormData;
  }

  /**
   * Parse and return the request body as ArrayBuffer
   */
  async arrayBuffer(): Promise<ArrayBuffer> {
    if (!this._bodyParsed) {
      this._body = await this._request.arrayBuffer();
      this._bodyParsed = true;
    }
    return this._body as ArrayBuffer;
  }

  /**
   * Get cookies from the request
   */
  get cookies(): Map<string, string> {
    const cookieHeader = this.header('Cookie') ?? '';
    const cookies = new Map<string, string>();

    for (const cookie of cookieHeader.split(';')) {
      const [name, ...rest] = cookie.split('=');
      if (name) {
        cookies.set(name.trim(), rest.join('=').trim());
      }
    }

    return cookies;
  }

  /**
   * Get a specific cookie value
   */
  cookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  /**
   * Set route parameters (used by router)
   */
  setParams(params: Record<string, string>): void {
    this._context.params = params;
  }

  /**
   * Clone the request with optional modifications
   */
  clone(overrides?: Partial<RequestContext>): EchelonRequest {
    return new EchelonRequest(this._request.clone(), {
      ...this._context,
      ...overrides,
    });
  }
}
