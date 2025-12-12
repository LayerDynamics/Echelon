/**
 * Workspace Routes
 *
 * HTTP routes for workspace management (create, list, view, manage members).
 *
 * @module
 */

import type { Context } from '@echelon/http/types.ts';
import { getWorkspaceService } from '../application/workspace_service.ts';
import { getProjectService } from '../application/project_service.ts';
import type { AuthUser } from '@echelon/auth/auth.ts';

/**
 * Register workspace routes
 */
export async function setupWorkspaceRoutes(app: {
  get: (path: string, handler: (ctx: Context) => Response | Promise<Response>) => void;
  post: (path: string, handler: (ctx: Context) => Response | Promise<Response>) => void;
}) {
  const workspaceService = await getWorkspaceService();
  const projectService = await getProjectService();

  // ============================================================================
  // UI Routes
  // ============================================================================

  /**
   * List all workspaces for the current user
   */
  app.get('/workspaces', async (ctx: Context) => {
    const user = ctx.state.get('user') as AuthUser | undefined;

    if (!user) {
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/auth/login' },
      });
    }

    const result = await workspaceService.listWorkspaces(user.id);

    if (!result.success) {
      return new Response(renderWorkspacesPage([], result.error), {
        headers: { 'Content-Type': 'text/html' },
        status: 500,
      });
    }

    return new Response(renderWorkspacesPage(result.workspaces!), {
      headers: { 'Content-Type': 'text/html' },
    });
  });

  /**
   * Show create workspace form
   */
  app.get('/workspaces/new', (ctx: Context) => {
    const user = ctx.state.get('user') as AuthUser | undefined;

    if (!user) {
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/auth/login' },
      });
    }

    const error = ctx.url.searchParams.get('error') ?? undefined;
    return new Response(renderCreateWorkspacePage(error), {
      headers: { 'Content-Type': 'text/html' },
    });
  });

  /**
   * Handle create workspace submission
   */
  app.post('/workspaces', async (ctx: Context) => {
    const user = ctx.state.get('user') as AuthUser | undefined;

    if (!user) {
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/auth/login' },
      });
    }

    const formData = await ctx.request.formData();
    const name = formData.get('name')?.toString() ?? '';
    const description = formData.get('description')?.toString();

    const result = await workspaceService.createWorkspace({
      name,
      description,
      owner: user,
    });

    if (!result.success) {
      return new Response(
        renderCreateWorkspacePage(result.error),
        { headers: { 'Content-Type': 'text/html' }, status: 400 }
      );
    }

    // Redirect to workspace list
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/workspaces',
      },
    });
  });

  /**
   * View workspace details
   */
  app.get('/workspaces/:id', async (ctx: Context) => {
    const user = ctx.state.get('user') as AuthUser | undefined;

    if (!user) {
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/auth/login' },
      });
    }

    const workspaceId = ctx.params.id;
    const result = await workspaceService.getWorkspace(workspaceId, user.id);

    if (!result.success) {
      return new Response(renderErrorPage(result.error!), {
        headers: { 'Content-Type': 'text/html' },
        status: 404,
      });
    }

    // Fetch projects for this workspace
    const projectsResult = await projectService.listProjects(workspaceId, user.id);
    const projects = projectsResult.success ? projectsResult.projects! : [];

    return new Response(renderWorkspaceDetailPage(result.workspace!, user, projects), {
      headers: { 'Content-Type': 'text/html' },
    });
  });

  // ============================================================================
  // API Routes
  // ============================================================================

  /**
   * API: List workspaces
   */
  app.get('/api/workspaces', async (ctx: Context) => {
    const user = ctx.state.get('user') as AuthUser | undefined;

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await workspaceService.listWorkspaces(user.id);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    return Response.json({
      workspaces: result.workspaces!.map(ws => ({
        id: ws.getId(),
        name: ws.getName(),
        description: ws.getDescription(),
        memberCount: ws.getMemberCount(),
        isOwner: ws.isOwner(user.id),
        createdAt: ws.getCreatedAt(),
      })),
    });
  });

  /**
   * API: Create workspace
   */
  app.post('/api/workspaces', async (ctx: Context) => {
    const user = ctx.state.get('user') as AuthUser | undefined;

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await ctx.request.json();
    const { name, description } = body;

    const result = await workspaceService.createWorkspace({
      name,
      description,
      owner: user,
    });

    return Response.json(
      result.success
        ? {
            success: true,
            workspace: {
              id: result.workspace!.getId(),
              name: result.workspace!.getName(),
              description: result.workspace!.getDescription(),
            },
          }
        : { success: false, error: result.error },
      { status: result.success ? 201 : 400 }
    );
  });

  /**
   * API: Get workspace details
   */
  app.get('/api/workspaces/:id', async (ctx: Context) => {
    const user = ctx.state.get('user') as AuthUser | undefined;

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = ctx.params.id;
    const result = await workspaceService.getWorkspace(workspaceId, user.id);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 404 });
    }

    const workspace = result.workspace!;
    return Response.json({
      id: workspace.getId(),
      name: workspace.getName(),
      description: workspace.getDescription(),
      ownerId: workspace.getOwnerId(),
      members: workspace.getMembers().map(m => ({
        userId: m.userId,
        email: m.email,
        name: m.name,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      memberCount: workspace.getMemberCount(),
      isOwner: workspace.isOwner(user.id),
      canManage: workspace.canManage(user.id),
      createdAt: workspace.getCreatedAt(),
    });
  });
}

// ============================================================================
// View Templates
// ============================================================================

function renderWorkspacesPage(workspaces: any[], error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workspaces - TaskForge</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
    .header { background: white; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header-content { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { color: #333; }
    .nav { display: flex; gap: 20px; }
    .nav a { color: #4CAF50; text-decoration: none; font-weight: 500; }
    .nav a:hover { text-decoration: underline; }
    .container { max-width: 1200px; margin: 40px auto; padding: 0 20px; }
    .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
    .btn-primary { padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 4px; font-size: 16px; font-weight: 500; cursor: pointer; text-decoration: none; display: inline-block; }
    .btn-primary:hover { background: #45a049; }
    .workspace-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
    .workspace-card { background: white; padding: 24px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: transform 0.2s; }
    .workspace-card:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.15); }
    .workspace-card h3 { color: #333; margin-bottom: 10px; }
    .workspace-card p { color: #666; font-size: 14px; margin-bottom: 15px; }
    .workspace-card .meta { display: flex; justify-content: space-between; align-items: center; color: #999; font-size: 12px; }
    .workspace-card a { color: #4CAF50; text-decoration: none; font-weight: 500; }
    .workspace-card a:hover { text-decoration: underline; }
    .empty { text-align: center; padding: 60px 20px; }
    .empty h2 { color: #666; margin-bottom: 20px; }
    .error { background: #ffebee; color: #c62828; padding: 12px; border-radius: 4px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-content">
      <h1>TaskForge</h1>
      <nav class="nav">
        <a href="/dashboard">Dashboard</a>
        <a href="/workspaces">Workspaces</a>
        <form method="POST" action="/auth/logout" style="display: inline;">
          <button type="submit" style="background: none; border: none; color: #4CAF50; cursor: pointer; font: inherit; font-weight: 500;">Logout</button>
        </form>
      </nav>
    </div>
  </div>

  <div class="container">
    ${error ? `<div class="error">${error}</div>` : ''}

    <div class="top-bar">
      <h2 style="color: #333;">Your Workspaces</h2>
      <a href="/workspaces/new" class="btn-primary">+ Create Workspace</a>
    </div>

    ${workspaces.length === 0 ? `
      <div class="empty">
        <h2>No workspaces yet</h2>
        <p style="color: #999; margin-bottom: 20px;">Create your first workspace to get started</p>
        <a href="/workspaces/new" class="btn-primary">Create Workspace</a>
      </div>
    ` : `
      <div class="workspace-grid">
        ${workspaces.map(ws => `
          <div class="workspace-card">
            <h3>${ws.getName()}</h3>
            <p>${ws.getDescription() || 'No description'}</p>
            <div class="meta">
              <span>${ws.getMemberCount()} member${ws.getMemberCount() !== 1 ? 's' : ''}</span>
              <a href="/workspaces/${ws.getId()}">View →</a>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  </div>
</body>
</html>`;
}

function renderCreateWorkspacePage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Create Workspace - TaskForge</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
    .header { background: white; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header-content { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { color: #333; }
    .nav { display: flex; gap: 20px; }
    .nav a { color: #4CAF50; text-decoration: none; font-weight: 500; }
    .nav a:hover { text-decoration: underline; }
    .container { max-width: 600px; margin: 40px auto; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h2 { margin-bottom: 30px; color: #333; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 5px; color: #333; font-size: 14px; font-weight: 500; }
    input, textarea { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; font-family: inherit; }
    input:focus, textarea:focus { outline: none; border-color: #4CAF50; }
    textarea { resize: vertical; min-height: 100px; }
    .error { background: #ffebee; color: #c62828; padding: 12px; border-radius: 4px; margin-bottom: 20px; font-size: 14px; }
    .button-group { display: flex; gap: 10px; margin-top: 30px; }
    button, .btn { padding: 12px 24px; border: none; border-radius: 4px; font-size: 16px; font-weight: 500; cursor: pointer; text-decoration: none; display: inline-block; text-align: center; }
    button[type="submit"] { background: #4CAF50; color: white; flex: 1; }
    button[type="submit"]:hover { background: #45a049; }
    .btn-secondary { background: #e0e0e0; color: #333; }
    .btn-secondary:hover { background: #d5d5d5; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-content">
      <h1>TaskForge</h1>
      <nav class="nav">
        <a href="/dashboard">Dashboard</a>
        <a href="/workspaces">Workspaces</a>
      </nav>
    </div>
  </div>

  <div class="container">
    <h2>Create Workspace</h2>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/workspaces">
      <div class="form-group">
        <label for="name">Workspace Name</label>
        <input type="text" id="name" name="name" required maxlength="100" placeholder="My Awesome Team">
      </div>
      <div class="form-group">
        <label for="description">Description (optional)</label>
        <textarea id="description" name="description" placeholder="What's this workspace for?"></textarea>
      </div>
      <div class="button-group">
        <a href="/workspaces" class="btn btn-secondary">Cancel</a>
        <button type="submit">Create Workspace</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}

function renderWorkspaceDetailPage(workspace: any, user: AuthUser, projects: any[]): string {
  const isOwner = workspace.isOwner(user.id);
  const canManage = workspace.canManage(user.id);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${workspace.getName()} - TaskForge</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
    .header { background: white; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header-content { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { color: #333; }
    .nav { display: flex; gap: 20px; }
    .nav a { color: #4CAF50; text-decoration: none; font-weight: 500; }
    .nav a:hover { text-decoration: underline; }
    .container { max-width: 1200px; margin: 40px auto; padding: 0 20px; }
    .workspace-header { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 30px; }
    .workspace-header h2 { color: #333; margin-bottom: 10px; }
    .workspace-header p { color: #666; margin-bottom: 20px; }
    .badge { display: inline-block; padding: 4px 12px; background: #4CAF50; color: white; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .section { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
    .section h3 { color: #333; margin-bottom: 20px; }
    .members-list { list-style: none; }
    .member-item { display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #f0f0f0; }
    .member-item:last-child { border-bottom: none; }
    .member-info { flex: 1; }
    .member-info strong { color: #333; display: block; margin-bottom: 4px; }
    .member-info span { color: #999; font-size: 14px; }
    .role-badge { padding: 4px 8px; background: #e3f2fd; color: #1976d2; border-radius: 4px; font-size: 12px; font-weight: 500; text-transform: uppercase; }
    .btn { padding: 8px 16px; border: none; border-radius: 4px; font-size: 14px; font-weight: 500; cursor: pointer; text-decoration: none; display: inline-block; }
    .btn-primary { background: #4CAF50; color: white; }
    .btn-primary:hover { background: #45a049; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-content">
      <h1>TaskForge</h1>
      <nav class="nav">
        <a href="/dashboard">Dashboard</a>
        <a href="/workspaces">Workspaces</a>
      </nav>
    </div>
  </div>

  <div class="container">
    <div class="workspace-header">
      <h2>${workspace.getName()} ${isOwner ? '<span class="badge">Owner</span>' : ''}</h2>
      <p>${workspace.getDescription() || 'No description'}</p>
      ${canManage ? '<a href="#" class="btn btn-primary">Settings</a>' : ''}
    </div>

    <div class="section">
      <h3>Members (${workspace.getMemberCount()})</h3>
      <ul class="members-list">
        ${workspace.getMembers().map((m: any) => `
          <li class="member-item">
            <div class="member-info">
              <strong>${m.name}</strong>
              <span>${m.email}</span>
            </div>
            <span class="role-badge">${m.role}</span>
          </li>
        `).join('')}
      </ul>
    </div>

    <div class="section">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0;">Projects (${projects.length})</h3>
        <a href="/workspaces/${workspace.getId()}/projects/new" class="btn btn-primary">+ New Project</a>
      </div>
      ${projects.length === 0 ? `
        <p style="color: #999;">No projects yet. Create your first project to get started.</p>
      ` : `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">
          ${projects.map((p: any) => {
            const statusColors: Record<string, string> = {
              planning: '#2196F3',
              active: '#4CAF50',
              'on-hold': '#FF9800',
              completed: '#9C27B0',
              archived: '#757575',
            };
            const statusColor = statusColors[p.getStatus()] || '#757575';

            return `
              <div style="background: #f9f9f9; padding: 20px; border-radius: 4px; border-left: 4px solid ${statusColor};">
                <h4 style="margin-bottom: 10px; color: #333;">
                  <a href="/workspaces/${workspace.getId()}/projects/${p.getId()}" style="color: inherit; text-decoration: none;">
                    ${p.getName()}
                  </a>
                </h4>
                <p style="color: #666; font-size: 14px; margin-bottom: 15px;">${p.getDescription() || 'No description'}</p>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 11px; text-transform: uppercase; color: ${statusColor}; font-weight: 600;">
                    ${p.getStatus()}
                  </span>
                  ${p.getDueDate() ? `
                    <span style="font-size: 12px; color: ${p.isOverdue() ? '#f44336' : '#999'};">
                      Due: ${new Date(p.getDueDate()).toLocaleDateString()}
                    </span>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  </div>
</body>
</html>`;
}

function renderErrorPage(error: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - TaskForge</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .error-container { text-align: center; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; }
    .error-container h1 { color: #c62828; margin-bottom: 20px; }
    .error-container p { color: #666; margin-bottom: 30px; }
    .btn { padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 4px; font-size: 16px; font-weight: 500; cursor: pointer; text-decoration: none; display: inline-block; }
    .btn:hover { background: #45a049; }
  </style>
</head>
<body>
  <div class="error-container">
    <h1>Error</h1>
    <p>${error}</p>
    <a href="/workspaces" class="btn">Back to Workspaces</a>
  </div>
</body>
</html>`;
}
