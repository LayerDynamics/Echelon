/**
 * Project Routes
 *
 * HTTP routes for project management within workspaces.
 *
 * @module
 */

import type { Context } from '@echelon/http/types.ts';
import { getProjectService } from '../application/project_service.ts';
import type { AuthUser } from '@echelon/auth/auth.ts';

/**
 * Register project routes
 */
export async function setupProjectRoutes(app: {
  get: (path: string, handler: (ctx: Context) => Response | Promise<Response>) => void;
  post: (path: string, handler: (ctx: Context) => Response | Promise<Response>) => void;
}) {
  const projectService = await getProjectService();

  // ============================================================================
  // UI Routes
  // ============================================================================

  /**
   * Show create project form
   */
  app.get('/workspaces/:workspaceId/projects/new', (ctx: Context) => {
    const user = ctx.state.get('user') as AuthUser | undefined;

    if (!user) {
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/auth/login' },
      });
    }

    const workspaceId = ctx.params.workspaceId;
    const error = ctx.url.searchParams.get('error') ?? undefined;

    return new Response(renderCreateProjectPage(workspaceId, error), {
      headers: { 'Content-Type': 'text/html' },
    });
  });

  /**
   * Handle create project submission
   */
  app.post('/workspaces/:workspaceId/projects', async (ctx: Context) => {
    const user = ctx.state.get('user') as AuthUser | undefined;

    if (!user) {
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/auth/login' },
      });
    }

    const workspaceId = ctx.params.workspaceId;
    const formData = await ctx.request.formData();
    const name = formData.get('name')?.toString() ?? '';
    const description = formData.get('description')?.toString();
    const dueDateStr = formData.get('dueDate')?.toString();

    const result = await projectService.createProject({
      workspaceId,
      name,
      description,
      userId: user.id,
      dueDate: dueDateStr ? new Date(dueDateStr) : undefined,
    });

    if (!result.success) {
      return new Response(
        renderCreateProjectPage(workspaceId, result.error),
        { headers: { 'Content-Type': 'text/html' }, status: 400 }
      );
    }

    // Redirect back to workspace detail
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `/workspaces/${workspaceId}`,
      },
    });
  });

  /**
   * View project details
   */
  app.get('/workspaces/:workspaceId/projects/:projectId', async (ctx: Context) => {
    const user = ctx.state.get('user') as AuthUser | undefined;

    if (!user) {
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/auth/login' },
      });
    }

    const projectId = ctx.params.projectId;
    const result = await projectService.getProject(projectId, user.id);

    if (!result.success) {
      return new Response(renderErrorPage(result.error!), {
        headers: { 'Content-Type': 'text/html' },
        status: 404,
      });
    }

    return new Response(renderProjectDetailPage(result.project!), {
      headers: { 'Content-Type': 'text/html' },
    });
  });

  // ============================================================================
  // API Routes
  // ============================================================================

  /**
   * API: List projects in workspace
   */
  app.get('/api/workspaces/:workspaceId/projects', async (ctx: Context) => {
    const user = ctx.state.get('user') as AuthUser | undefined;

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = ctx.params.workspaceId;
    const result = await projectService.listProjects(workspaceId, user.id);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    return Response.json({
      projects: result.projects!.map(p => ({
        id: p.getId(),
        name: p.getName(),
        description: p.getDescription(),
        status: p.getStatus(),
        dueDate: p.getDueDate(),
        isOverdue: p.isOverdue(),
        createdAt: p.getCreatedAt(),
      })),
    });
  });

  /**
   * API: Create project
   */
  app.post('/api/workspaces/:workspaceId/projects', async (ctx: Context) => {
    const user = ctx.state.get('user') as AuthUser | undefined;

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = ctx.params.workspaceId;
    const body = await ctx.request.json();
    const { name, description, dueDate } = body;

    const result = await projectService.createProject({
      workspaceId,
      name,
      description,
      userId: user.id,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });

    return Response.json(
      result.success
        ? {
            success: true,
            project: {
              id: result.project!.getId(),
              name: result.project!.getName(),
              description: result.project!.getDescription(),
              status: result.project!.getStatus(),
            },
          }
        : { success: false, error: result.error },
      { status: result.success ? 201 : 400 }
    );
  });

  /**
   * API: Get project details
   */
  app.get('/api/workspaces/:workspaceId/projects/:projectId', async (ctx: Context) => {
    const user = ctx.state.get('user') as AuthUser | undefined;

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const projectId = ctx.params.projectId;
    const result = await projectService.getProject(projectId, user.id);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 404 });
    }

    const project = result.project!;
    return Response.json({
      id: project.getId(),
      workspaceId: project.getWorkspaceId(),
      name: project.getName(),
      description: project.getDescription(),
      status: project.getStatus(),
      ownerId: project.getOwnerId(),
      createdBy: project.getCreatedBy(),
      dueDate: project.getDueDate(),
      isOverdue: project.isOverdue(),
      createdAt: project.getCreatedAt(),
      updatedAt: project.getUpdatedAt(),
    });
  });
}

// ============================================================================
// View Templates
// ============================================================================

function renderCreateProjectPage(workspaceId: string, error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Create Project - TaskForge</title>
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
    <h2>Create Project</h2>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/workspaces/${workspaceId}/projects">
      <div class="form-group">
        <label for="name">Project Name</label>
        <input type="text" id="name" name="name" required maxlength="200" placeholder="Website Redesign">
      </div>
      <div class="form-group">
        <label for="description">Description (optional)</label>
        <textarea id="description" name="description" placeholder="What's this project about?"></textarea>
      </div>
      <div class="form-group">
        <label for="dueDate">Due Date (optional)</label>
        <input type="date" id="dueDate" name="dueDate">
      </div>
      <div class="button-group">
        <a href="/workspaces/${workspaceId}" class="btn btn-secondary">Cancel</a>
        <button type="submit">Create Project</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}

function renderProjectDetailPage(project: any): string {
  const statusColors: Record<string, string> = {
    planning: '#2196F3',
    active: '#4CAF50',
    'on-hold': '#FF9800',
    completed: '#9C27B0',
    archived: '#757575',
  };

  const statusColor = statusColors[project.getStatus()] || '#757575';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${project.getName()} - TaskForge</title>
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
    .project-header { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 30px; }
    .project-header h2 { color: #333; margin-bottom: 10px; }
    .project-header p { color: #666; margin-bottom: 20px; }
    .status-badge { display: inline-block; padding: 6px 12px; color: white; border-radius: 4px; font-size: 12px; font-weight: 500; text-transform: uppercase; }
    .section { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
    .section h3 { color: #333; margin-bottom: 20px; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 20px; }
    .meta-item { }
    .meta-item label { display: block; color: #999; font-size: 12px; text-transform: uppercase; margin-bottom: 5px; }
    .meta-item span { color: #333; font-size: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-content">
      <h1>TaskForge</h1>
      <nav class="nav">
        <a href="/dashboard">Dashboard</a>
        <a href="/workspaces">Workspaces</a>
        <a href="/workspaces/${project.getWorkspaceId()}">Back to Workspace</a>
      </nav>
    </div>
  </div>

  <div class="container">
    <div class="project-header">
      <h2>${project.getName()}</h2>
      <p>${project.getDescription() || 'No description'}</p>
      <span class="status-badge" style="background: ${statusColor}">${project.getStatus()}</span>
      ${project.isOverdue() ? '<span class="status-badge" style="background: #f44336; margin-left: 10px;">OVERDUE</span>' : ''}
    </div>

    <div class="section">
      <h3>Project Details</h3>
      <div class="meta-grid">
        <div class="meta-item">
          <label>Status</label>
          <span style="text-transform: capitalize;">${project.getStatus()}</span>
        </div>
        <div class="meta-item">
          <label>Created</label>
          <span>${new Date(project.getCreatedAt()).toLocaleDateString()}</span>
        </div>
        ${project.getDueDate() ? `
          <div class="meta-item">
            <label>Due Date</label>
            <span>${new Date(project.getDueDate()).toLocaleDateString()}</span>
          </div>
        ` : ''}
      </div>
    </div>

    <div class="section">
      <h3>Tasks</h3>
      <p style="color: #999;">No tasks yet. Start by creating your first task.</p>
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
