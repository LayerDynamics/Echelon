/**
 * Authentication Routes
 *
 * HTTP routes for user authentication (login, register, logout, verify).
 *
 * @module
 */

import type { Context } from '@echelon/http/types.ts';
import { getAuthService } from '../application/auth_service.ts';
import { Auth } from '@echelon/auth/auth.ts';
import { Session } from '@echelon/auth/session.ts';

/**
 * Register routes
 */
export async function setupAuthRoutes(app: {
  get: (path: string, handler: (ctx: Context) => Response | Promise<Response>) => void;
  post: (path: string, handler: (ctx: Context) => Response | Promise<Response>) => void;
}) {
  const authService = await getAuthService();

  // ============================================================================
  // Registration
  // ============================================================================

  /**
   * Show registration form
   */
  app.get('/auth/register', (ctx: Context) => {
    const error = ctx.url.searchParams.get('error') ?? undefined;
    return new Response(renderRegisterPage(error), {
      headers: { 'Content-Type': 'text/html' },
    });
  });

  /**
   * Handle registration submission
   */
  app.post('/auth/register', async (ctx: Context) => {
    const formData = await ctx.request.formData();
    const email = formData.get('email')?.toString() ?? '';
    const name = formData.get('name')?.toString() ?? '';
    const password = formData.get('password')?.toString() ?? '';

    const result = await authService.register(email, name, password);

    if (!result.success) {
      return new Response(
        renderRegisterPage(result.error),
        { headers: { 'Content-Type': 'text/html' }, status: 400 }
      );
    }

    // Redirect to verification page
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `/auth/verify-pending?email=${encodeURIComponent(email)}`,
      },
    });
  });

  /**
   * API endpoint for registration
   */
  app.post('/api/auth/register', async (ctx: Context) => {
    const body = await ctx.request.json();
    const { email, name, password, role } = body;

    const result = await authService.register(
      email,
      name,
      password,
      role ?? 'member'
    );

    return Response.json(result, {
      status: result.success ? 201 : 400,
    });
  });

  // ============================================================================
  // Login
  // ============================================================================

  /**
   * Show login form
   */
  app.get('/auth/login', (ctx: Context) => {
    const error = ctx.url.searchParams.get('error') ?? undefined;
    return new Response(renderLoginPage(error), {
      headers: { 'Content-Type': 'text/html' },
    });
  });

  /**
   * Handle login submission
   */
  app.post('/auth/login', async (ctx: Context) => {
    const formData = await ctx.request.formData();
    const email = formData.get('email')?.toString() ?? '';
    const password = formData.get('password')?.toString() ?? '';

    const result = await authService.login(email, password);

    if (!result.success) {
      return new Response(
        renderLoginPage(result.error),
        { headers: { 'Content-Type': 'text/html' }, status: 401 }
      );
    }

    // Get session from middleware (always exists due to session middleware)
    const session = ctx.state.get('session') as Session;
    const auth = new Auth(session, {
      userLoader: (id) => authService.loadUser(id),
    });

    // Login user (stores user ID in session)
    await auth.login(result.user!);

    // Session will be saved and cookie will be set by middleware
    // Redirect to dashboard
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/dashboard',
      },
    });
  });

  /**
   * API endpoint for login
   */
  app.post('/api/auth/login', async (ctx: Context) => {
    const body = await ctx.request.json();
    const { email, password } = body;

    const result = await authService.login(email, password);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 401 });
    }

    // Get session from middleware
    const session = ctx.state.get('session') as Session;
    const auth = new Auth(session, {
      userLoader: (id) => authService.loadUser(id),
    });

    // Login user (stores user ID in session)
    await auth.login(result.user!);

    // Session will be saved and cookie will be set by middleware
    return Response.json({ success: true, user: result.user });
  });

  // ============================================================================
  // Logout
  // ============================================================================

  /**
   * Handle logout
   */
  app.post('/auth/logout', async (ctx: Context) => {
    const session = ctx.state.get('session') as Session;
    if (session) {
      const auth = new Auth(session);
      await auth.logout();
      // Session will be saved by middleware
    }

    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/auth/login',
      },
    });
  });

  /**
   * API endpoint for logout
   */
  app.post('/api/auth/logout', async (ctx: Context) => {
    const session = ctx.state.get('session') as Session;
    if (session) {
      const auth = new Auth(session);
      await auth.logout();
    }

    return Response.json({ success: true });
  });

  // ============================================================================
  // Email Verification
  // ============================================================================

  /**
   * Show verification pending page
   */
  app.get('/auth/verify-pending', (ctx: Context) => {
    const email = ctx.url.searchParams.get('email') ?? '';
    return new Response(renderVerifyPendingPage(email), {
      headers: { 'Content-Type': 'text/html' },
    });
  });

  /**
   * Verify email with token
   */
  app.get('/auth/verify', async (ctx: Context) => {
    const token = ctx.url.searchParams.get('token');

    if (!token) {
      return new Response(renderVerifyResultPage(false, 'Invalid verification link'), {
        headers: { 'Content-Type': 'text/html' },
        status: 400,
      });
    }

    const result = await authService.verifyEmail(token);

    return new Response(
      renderVerifyResultPage(result.success, result.error),
      {
        headers: { 'Content-Type': 'text/html' },
        status: result.success ? 200 : 400,
      }
    );
  });

  /**
   * Resend verification email
   */
  app.post('/api/auth/resend-verification', async (ctx: Context) => {
    const body = await ctx.request.json();
    const { userId } = body;

    const token = await authService.resendVerificationEmail(userId);

    if (!token) {
      return Response.json(
        { success: false, error: 'Unable to resend verification email' },
        { status: 400 }
      );
    }

    return Response.json({ success: true, token });
  });
}

// ============================================================================
// View Templates
// ============================================================================

function renderRegisterPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Register - TaskForge</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
    .container { max-width: 400px; margin: 100px auto; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { margin-bottom: 10px; color: #333; }
    .subtitle { color: #666; margin-bottom: 30px; font-size: 14px; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 5px; color: #333; font-size: 14px; font-weight: 500; }
    input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
    input:focus { outline: none; border-color: #4CAF50; }
    .error { background: #ffebee; color: #c62828; padding: 12px; border-radius: 4px; margin-bottom: 20px; font-size: 14px; }
    button { width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 4px; font-size: 16px; font-weight: 500; cursor: pointer; }
    button:hover { background: #45a049; }
    .link { text-align: center; margin-top: 20px; font-size: 14px; }
    .link a { color: #4CAF50; text-decoration: none; }
    .link a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Create Account</h1>
    <p class="subtitle">Get started with TaskForge</p>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/auth/register">
      <div class="form-group">
        <label for="name">Full Name</label>
        <input type="text" id="name" name="name" required minlength="2">
      </div>
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required>
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required minlength="8">
      </div>
      <button type="submit">Create Account</button>
    </form>
    <div class="link">
      Already have an account? <a href="/auth/login">Sign in</a>
    </div>
  </div>
</body>
</html>`;
}

function renderLoginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - TaskForge</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
    .container { max-width: 400px; margin: 100px auto; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { margin-bottom: 10px; color: #333; }
    .subtitle { color: #666; margin-bottom: 30px; font-size: 14px; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 5px; color: #333; font-size: 14px; font-weight: 500; }
    input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
    input:focus { outline: none; border-color: #4CAF50; }
    .error { background: #ffebee; color: #c62828; padding: 12px; border-radius: 4px; margin-bottom: 20px; font-size: 14px; }
    button { width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 4px; font-size: 16px; font-weight: 500; cursor: pointer; }
    button:hover { background: #45a049; }
    .link { text-align: center; margin-top: 20px; font-size: 14px; }
    .link a { color: #4CAF50; text-decoration: none; }
    .link a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Welcome Back</h1>
    <p class="subtitle">Sign in to your TaskForge account</p>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/auth/login">
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required>
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required>
      </div>
      <button type="submit">Sign In</button>
    </form>
    <div class="link">
      Don't have an account? <a href="/auth/register">Create one</a>
    </div>
  </div>
</body>
</html>`;
}

function renderVerifyPendingPage(email: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Email - TaskForge</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
    .container { max-width: 500px; margin: 100px auto; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
    h1 { margin-bottom: 20px; color: #333; }
    p { color: #666; line-height: 1.6; margin-bottom: 15px; }
    .email { color: #4CAF50; font-weight: 500; }
    .icon { font-size: 64px; margin-bottom: 20px; }
    .link { margin-top: 30px; }
    .link a { color: #4CAF50; text-decoration: none; }
    .link a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✉️</div>
    <h1>Check Your Email</h1>
    <p>We've sent a verification link to:</p>
    <p class="email">${email}</p>
    <p>Click the link in the email to verify your account.</p>
    <div class="link">
      <a href="/auth/login">Return to login</a>
    </div>
  </div>
</body>
</html>`;
}

function renderVerifyResultPage(success: boolean, error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${success ? 'Email Verified' : 'Verification Failed'} - TaskForge</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
    .container { max-width: 500px; margin: 100px auto; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
    h1 { margin-bottom: 20px; color: ${success ? '#4CAF50' : '#c62828'}; }
    p { color: #666; line-height: 1.6; margin-bottom: 15px; }
    .icon { font-size: 64px; margin-bottom: 20px; }
    button { padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 4px; font-size: 16px; font-weight: 500; cursor: pointer; margin-top: 20px; }
    button:hover { background: #45a049; }
    a { text-decoration: none; color: inherit; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${success ? '✅' : '❌'}</div>
    <h1>${success ? 'Email Verified!' : 'Verification Failed'}</h1>
    <p>${success ? 'Your email has been successfully verified. You can now sign in to your account.' : error ?? 'Something went wrong.'}</p>
    <a href="/auth/login"><button>Go to Login</button></a>
  </div>
</body>
</html>`;
}
