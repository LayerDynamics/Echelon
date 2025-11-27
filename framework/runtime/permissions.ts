/**
 * Permission System
 *
 * Leverages Deno's secure-by-default permission model.
 * Echelon checks permissions on startup to ensure all required
 * permissions are granted before the application runs.
 */

export interface PermissionDescriptor {
  name: 'read' | 'write' | 'net' | 'env' | 'run' | 'ffi' | 'sys';
  path?: string;
  host?: string;
  variable?: string;
  command?: string;
}

/**
 * Default required permissions for Echelon applications
 */
const DEFAULT_REQUIRED_PERMISSIONS: PermissionDescriptor[] = [
  { name: 'net', host: '0.0.0.0:8000' },
  { name: 'read', path: './config' },
  { name: 'read', path: './public' },
  { name: 'read', path: './views' },
];

/**
 * Check if all required permissions are granted
 */
export async function checkPermissions(
  required: PermissionDescriptor[] = DEFAULT_REQUIRED_PERMISSIONS
): Promise<void> {
  const missingPermissions: PermissionDescriptor[] = [];

  for (const perm of required) {
    const descriptor = buildDenoPermissionDescriptor(perm);
    const status = await Deno.permissions.query(descriptor);

    if (status.state !== 'granted') {
      missingPermissions.push(perm);
    }
  }

  if (missingPermissions.length > 0) {
    const missing = missingPermissions
      .map((p) => formatPermission(p))
      .join(', ');
    throw new Error(`Missing required permissions: ${missing}`);
  }
}

/**
 * Request a specific permission at runtime
 */
export async function requestPermission(
  perm: PermissionDescriptor
): Promise<boolean> {
  const descriptor = buildDenoPermissionDescriptor(perm);
  const status = await Deno.permissions.request(descriptor);
  return status.state === 'granted';
}

/**
 * Query the current state of a permission
 */
export async function queryPermission(
  perm: PermissionDescriptor
): Promise<Deno.PermissionState> {
  const descriptor = buildDenoPermissionDescriptor(perm);
  const status = await Deno.permissions.query(descriptor);
  return status.state;
}

/**
 * Build a Deno permission descriptor from our simplified format
 */
function buildDenoPermissionDescriptor(
  perm: PermissionDescriptor
): Deno.PermissionDescriptor {
  switch (perm.name) {
    case 'read':
      return { name: 'read', path: perm.path };
    case 'write':
      return { name: 'write', path: perm.path };
    case 'net':
      return { name: 'net', host: perm.host };
    case 'env':
      return { name: 'env', variable: perm.variable };
    case 'run':
      return { name: 'run', command: perm.command };
    case 'ffi':
      return { name: 'ffi' };
    case 'sys':
      return { name: 'sys' };
    default:
      throw new Error(`Unknown permission type: ${perm.name}`);
  }
}

/**
 * Format a permission descriptor for display
 */
function formatPermission(perm: PermissionDescriptor): string {
  const parts: string[] = [perm.name];
  if (perm.path) parts.push(`path=${perm.path}`);
  if (perm.host) parts.push(`host=${perm.host}`);
  if (perm.variable) parts.push(`variable=${perm.variable}`);
  if (perm.command) parts.push(`command=${perm.command}`);
  return parts.join(':');
}
