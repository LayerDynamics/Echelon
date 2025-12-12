/**
 * Dashboard Routes
 *
 * Main application dashboard after login.
 */

import type { Context } from '../../framework/http/types.ts';
import { getWorkspaceService } from '../contexts/workspace/application/workspace_service.ts';
import { getProjectRepository } from '../contexts/workspace/infrastructure/project_repository.ts';

/**
 * Dashboard home page
 */
export async function dashboardHandler(ctx: Context): Promise<Response> {
  // Get user from context (set by auth middleware)
  const user = ctx.state.get('user');

  if (!user) {
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/auth/login' },
    });
  }

  // Fetch user's workspaces
  const workspaceService = await getWorkspaceService();
  const workspacesResult = await workspaceService.listWorkspaces(user.id);
  const workspaces = workspacesResult.success ? workspacesResult.workspaces! : [];

  // Count projects across all workspaces
  const projectRepository = await getProjectRepository();
  let totalProjects = 0;
  let activeProjects = 0;

  for (const workspace of workspaces) {
    const projects = await projectRepository.findByWorkspaceId(workspace.getId());
    totalProjects += projects.length;
    activeProjects += projects.filter(p => p.getStatus() === 'active').length;
  }

  return new Response(renderDashboard(user, {
    workspaceCount: workspaces.length,
    projectCount: totalProjects,
    activeProjectCount: activeProjects,
    recentWorkspaces: workspaces.slice(0, 3),
  }), {
    headers: { 'Content-Type': 'text/html' },
  });
}

interface DashboardStats {
  workspaceCount: number;
  projectCount: number;
  activeProjectCount: number;
  recentWorkspaces: any[];
}

function renderDashboard(user: { email?: string; metadata?: { name?: string } }, stats: DashboardStats): string {
  const name = user.metadata?.name || user.email || 'User';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard - TaskForge</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
    header { background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 20px 40px; }
    .header-content { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
    h1 { color: #4CAF50; font-size: 24px; }
    .nav { display: flex; gap: 20px; align-items: center; }
    .nav a { color: #4CAF50; text-decoration: none; font-weight: 500; font-size: 14px; }
    .nav a:hover { text-decoration: underline; }
    .user-info { display: flex; align-items: center; gap: 20px; }
    .user-name { color: #666; font-size: 14px; }
    .logout-btn { padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; font-size: 14px; }
    .logout-btn:hover { background: #da190b; }
    .container { max-width: 1200px; margin: 40px auto; padding: 0 40px; }
    .welcome { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 30px; }
    .welcome h2 { color: #333; margin-bottom: 10px; }
    .welcome p { color: #666; line-height: 1.6; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .stat-card { background: white; padding: 24px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .stat-card h3 { color: #999; font-size: 12px; text-transform: uppercase; margin-bottom: 10px; font-weight: 500; }
    .stat-card .number { color: #333; font-size: 36px; font-weight: 600; }
    .section { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
    .section h3 { color: #333; margin-bottom: 20px; font-size: 18px; }
    .workspace-list { list-style: none; }
    .workspace-item { padding: 15px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; }
    .workspace-item:last-child { border-bottom: none; }
    .workspace-item strong { color: #333; display: block; margin-bottom: 4px; }
    .workspace-item span { color: #999; font-size: 14px; }
    .workspace-item a { color: #4CAF50; text-decoration: none; font-weight: 500; }
    .workspace-item a:hover { text-decoration: underline; }
    .btn-primary { padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 4px; font-size: 16px; font-weight: 500; cursor: pointer; text-decoration: none; display: inline-block; }
    .btn-primary:hover { background: #45a049; }
    .empty { text-align: center; padding: 40px; color: #999; }
    .empty h4 { color: #666; margin-bottom: 10px; }
    .empty p { margin-bottom: 20px; }
  </style>
</head>
<body>
  <header>
    <div class="header-content">
      <h1>TaskForge</h1>
      <div class="user-info">
        <nav class="nav">
          <a href="/dashboard">Dashboard</a>
          <a href="/workspaces">Workspaces</a>
        </nav>
        <span class="user-name">Welcome, ${name}</span>
        <form method="POST" action="/auth/logout" style="margin: 0;">
          <button type="submit" class="logout-btn">Logout</button>
        </form>
      </div>
    </div>
  </header>

  <div class="container">
    <div class="welcome">
      <h2>Welcome to TaskForge</h2>
      <p>Your collaborative workspace and project management platform powered by Echelon framework.</p>
    </div>

    <div class="stats">
      <div class="stat-card">
        <h3>Workspaces</h3>
        <div class="number">${stats.workspaceCount}</div>
      </div>

      <div class="stat-card">
        <h3>Total Projects</h3>
        <div class="number">${stats.projectCount}</div>
      </div>

      <div class="stat-card">
        <h3>Active Projects</h3>
        <div class="number">${stats.activeProjectCount}</div>
      </div>
    </div>

    <div class="section">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0;">Your Workspaces</h3>
        <a href="/workspaces" class="btn-primary">View All Workspaces</a>
      </div>

      ${stats.workspaceCount === 0 ? `
        <div class="empty">
          <h4>No workspaces yet</h4>
          <p>Create your first workspace to start collaborating with your team.</p>
          <a href="/workspaces/new" class="btn-primary">Create Workspace</a>
        </div>
      ` : `
        <ul class="workspace-list">
          ${stats.recentWorkspaces.map((ws: any) => `
            <li class="workspace-item">
              <div>
                <strong>${ws.getName()}</strong>
                <span>${ws.getMemberCount()} member${ws.getMemberCount() !== 1 ? 's' : ''}</span>
              </div>
              <a href="/workspaces/${ws.getId()}">View →</a>
            </li>
          `).join('')}
        </ul>
        ${stats.workspaceCount > 3 ? `
          <div style="text-align: center; margin-top: 20px;">
            <a href="/workspaces" style="color: #4CAF50; text-decoration: none; font-weight: 500;">
              View all ${stats.workspaceCount} workspaces →
            </a>
          </div>
        ` : ''}
      `}
    </div>

    <div class="section">
      <h3>Quick Actions</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
        <a href="/workspaces/new" style="display: block; padding: 20px; background: #f5f5f5; border-radius: 4px; text-decoration: none; color: inherit; border: 2px dashed #ddd;">
          <strong style="display: block; color: #333; margin-bottom: 5px;">+ New Workspace</strong>
          <span style="color: #666; font-size: 14px;">Create a workspace for your team</span>
        </a>
        ${stats.workspaceCount > 0 ? `
          <a href="/workspaces" style="display: block; padding: 20px; background: #f5f5f5; border-radius: 4px; text-decoration: none; color: inherit; border: 2px dashed #ddd;">
            <strong style="display: block; color: #333; margin-bottom: 5px;">+ New Project</strong>
            <span style="color: #666; font-size: 14px;">Start a new project in a workspace</span>
          </a>
        ` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
}
