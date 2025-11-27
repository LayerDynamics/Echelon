/**
 * Home Routes
 *
 * Public-facing pages and views.
 */

import { Router, EchelonRequest, EchelonResponse, html } from '../../framework/mod.ts';

export const homeRoutes = new Router();

/**
 * Home page
 */
homeRoutes.get('/', (_req: EchelonRequest, _res: EchelonResponse) => {
  return new Response(
    html`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Echelon</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: system-ui, -apple-system, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
            }
            .container {
              text-align: center;
              padding: 2rem;
            }
            h1 {
              font-size: 4rem;
              font-weight: 700;
              margin-bottom: 1rem;
            }
            p {
              font-size: 1.25rem;
              opacity: 0.9;
              margin-bottom: 2rem;
            }
            .links {
              display: flex;
              gap: 1rem;
              justify-content: center;
            }
            a {
              color: white;
              text-decoration: none;
              padding: 0.75rem 1.5rem;
              border: 2px solid white;
              border-radius: 0.5rem;
              transition: all 0.2s;
            }
            a:hover {
              background: white;
              color: #667eea;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Echelon</h1>
            <p>A full-stack web framework built on Deno</p>
            <div class="links">
              <a href="/api/health">Health Check</a>
              <a href="/api/info">API Info</a>
            </div>
          </div>
        </body>
      </html>
    `.toString(),
    {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
});

/**
 * About page
 */
homeRoutes.get('/about', (_req: EchelonRequest, _res: EchelonResponse) => {
  return new Response(
    html`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>About - Echelon</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              max-width: 800px;
              margin: 0 auto;
              padding: 2rem;
              line-height: 1.6;
            }
            h1 {
              color: #667eea;
            }
            a {
              color: #667eea;
            }
          </style>
        </head>
        <body>
          <h1>About Echelon</h1>
          <p>
            Echelon is a full-stack web framework built on Deno, implementing the Application
            Operating System pattern.
          </p>
          <h2>Features</h2>
          <ul>
            <li>TypeScript-first with full type safety</li>
            <li>Zero external dependencies (uses Deno built-ins)</li>
            <li>Secure by default with Deno's permission system</li>
            <li>Built-in ORM with Deno KV</li>
            <li>Authentication and authorization</li>
            <li>Background jobs and scheduling</li>
            <li>Full-text search</li>
            <li>Telemetry and observability</li>
          </ul>
          <p><a href="/">← Back to Home</a></p>
        </body>
      </html>
    `.toString(),
    {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
});
