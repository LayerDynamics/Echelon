/**
 * API Routes
 *
 * RESTful API endpoints.
 */

import { Router, EchelonRequest, EchelonResponse, apiResponse, HttpStatus, getMetrics } from '../../framework/mod.ts';

export const apiRoutes = new Router();

/**
 * API health check
 */
apiRoutes.get('/api/health', (_req: EchelonRequest, _res: EchelonResponse) => {
  return Response.json(
    apiResponse({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: performance.now() / 1000,
    }),
    { status: HttpStatus.OK }
  );
});

/**
 * API info
 */
apiRoutes.get('/api/info', (_req: EchelonRequest, _res: EchelonResponse) => {
  return Response.json(
    apiResponse({
      name: 'Echelon',
      version: '0.1.0',
      runtime: 'Deno',
      runtimeVersion: Deno.version.deno,
      typescript: Deno.version.typescript,
      v8: Deno.version.v8,
    }),
    { status: HttpStatus.OK }
  );
});

/**
 * Metrics endpoint (Prometheus format)
 */
apiRoutes.get('/api/metrics', (_req: EchelonRequest, _res: EchelonResponse) => {
  const metrics = getMetrics();
  return new Response(metrics.toPrometheus(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
});

/**
 * Example API endpoint with parameters
 */
apiRoutes.get('/api/echo/:message', (req: EchelonRequest, _res: EchelonResponse) => {
  const { message } = req.params;
  return Response.json(
    apiResponse({
      echo: message,
      timestamp: new Date().toISOString(),
    }),
    { status: HttpStatus.OK }
  );
});

/**
 * Example POST endpoint
 */
apiRoutes.post('/api/echo', async (req: EchelonRequest, _res: EchelonResponse) => {
  try {
    const body = await req.json();
    return Response.json(
      apiResponse({
        received: body,
        timestamp: new Date().toISOString(),
      }),
      { status: HttpStatus.OK }
    );
  } catch {
    return Response.json(
      apiResponse(null, { error: 'Invalid JSON body' }),
      { status: HttpStatus.BAD_REQUEST }
    );
  }
});
