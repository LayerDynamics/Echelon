/**
 * Admin Router
 *
 * Provides administrative routes and functionality.
 */

import { Router } from '../router/router.ts';
import { EchelonRequest } from '../http/request.ts';
import { EchelonResponse } from '../http/response.ts';
import { getKV } from '../orm/kv.ts';

export interface AdminConfig {
  prefix?: string;
  auth?: (req: EchelonRequest) => boolean | Promise<boolean>;
}

/**
 * Admin router for Echelon
 */
export class AdminRouter {
  private router: Router;
  private config: AdminConfig;

  constructor(config: AdminConfig = {}) {
    this.config = {
      prefix: config.prefix ?? '/admin',
      auth: config.auth,
    };
    this.router = new Router(this.config.prefix);
    this.setupRoutes();
  }

  /**
   * Get the underlying router
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Setup admin routes
   */
  private setupRoutes(): void {
    // Dashboard
    this.router.get('/', this.dashboard.bind(this));

    // System info
    this.router.get('/system', this.systemInfo.bind(this));

    // KV browser
    this.router.get('/kv', this.kvBrowser.bind(this));
    this.router.get('/kv/:prefix', this.kvList.bind(this));
    this.router.delete('/kv/:key', this.kvDelete.bind(this));

    // Routes list
    this.router.get('/routes', this.listRoutes.bind(this));
  }

  /**
   * Admin dashboard
   */
  private async dashboard(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
    const authCheck = await this.checkAuth(req);
    if (!authCheck) {
      return res.unauthorized('Admin access required');
    }

    return res.json({
      name: 'Echelon Admin',
      version: '0.1.0',
      endpoints: [
        { path: `${this.config.prefix}/system`, description: 'System information' },
        { path: `${this.config.prefix}/kv`, description: 'KV store browser' },
        { path: `${this.config.prefix}/routes`, description: 'Routes list' },
      ],
    });
  }

  /**
   * System information
   */
  private async systemInfo(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
    const authCheck = await this.checkAuth(req);
    if (!authCheck) {
      return res.unauthorized('Admin access required');
    }

    const memory = Deno.memoryUsage();

    return res.json({
      runtime: {
        deno: Deno.version.deno,
        v8: Deno.version.v8,
        typescript: Deno.version.typescript,
      },
      system: {
        os: Deno.build.os,
        arch: Deno.build.arch,
        hostname: Deno.hostname(),
        pid: Deno.pid,
      },
      memory: {
        rss: formatBytes(memory.rss),
        heapTotal: formatBytes(memory.heapTotal),
        heapUsed: formatBytes(memory.heapUsed),
        external: formatBytes(memory.external),
      },
      uptime: process.uptime?.() ?? 'N/A',
    });
  }

  /**
   * KV store browser
   */
  private async kvBrowser(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
    const authCheck = await this.checkAuth(req);
    if (!authCheck) {
      return res.unauthorized('Admin access required');
    }

    const kv = await getKV();
    const entries = await kv.list([]);

    // Group by first key part
    const prefixes = new Set<string>();
    for (const { key } of entries) {
      if (key.length > 0) {
        prefixes.add(String(key[0]));
      }
    }

    return res.json({
      prefixes: Array.from(prefixes),
      totalEntries: entries.length,
    });
  }

  /**
   * List KV entries by prefix
   */
  private async kvList(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
    const authCheck = await this.checkAuth(req);
    if (!authCheck) {
      return res.unauthorized('Admin access required');
    }

    const prefix = req.params.prefix;
    const kv = await getKV();
    const entries = await kv.list([prefix]);

    return res.json({
      prefix,
      entries: entries.map(({ key, value }) => ({
        key: key.join('/'),
        value,
      })),
    });
  }

  /**
   * Delete KV entry
   */
  private async kvDelete(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
    const authCheck = await this.checkAuth(req);
    if (!authCheck) {
      return res.unauthorized('Admin access required');
    }

    const keyStr = req.params.key;
    const key = keyStr.split('/');

    const kv = await getKV();
    await kv.delete(key);

    return res.json({ deleted: keyStr });
  }

  /**
   * List registered routes
   */
  private async listRoutes(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
    const authCheck = await this.checkAuth(req);
    if (!authCheck) {
      return res.unauthorized('Admin access required');
    }

    const routes = this.router.getRoutes();

    return res.json({
      routes: routes.map((r) => ({
        method: r.method,
        path: r.pattern.pathname,
        name: r.name,
      })),
    });
  }

  /**
   * Check authentication
   */
  private async checkAuth(req: EchelonRequest): Promise<boolean> {
    if (!this.config.auth) {
      return true;
    }
    return await this.config.auth(req);
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(2)} ${units[i]}`;
}

// Process polyfill for uptime
const process = {
  uptime: () => {
    // Would need to track start time
    return undefined;
  },
};
