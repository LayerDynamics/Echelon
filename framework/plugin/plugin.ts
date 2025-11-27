/**
 * Plugin System
 *
 * Manages plugins and extensions for Echelon.
 */

export interface Plugin {
  name: string;
  version: string;
  description?: string;
  dependencies?: string[];
  install: (context: PluginContext) => void | Promise<void>;
  uninstall?: () => void | Promise<void>;
}

export interface PluginContext {
  // Framework components
  router: unknown;
  middleware: unknown;
  config: unknown;

  // Hooks
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;

  // Extension points
  addRoute: (method: string, path: string, handler: unknown) => void;
  addMiddleware: (middleware: unknown) => void;
  addService: (name: string, service: unknown) => void;

  // Utilities
  log: (message: string, ...args: unknown[]) => void;
}

/**
 * Plugin manager
 */
export class PluginManager {
  private plugins = new Map<string, Plugin>();
  private installedPlugins = new Set<string>();
  private context: PluginContext;

  constructor(context: Partial<PluginContext>) {
    this.context = {
      router: context.router,
      middleware: context.middleware,
      config: context.config,
      on: context.on ?? (() => {}),
      emit: context.emit ?? (() => {}),
      addRoute: context.addRoute ?? (() => {}),
      addMiddleware: context.addMiddleware ?? (() => {}),
      addService: context.addService ?? (() => {}),
      log: context.log ?? console.log,
    };
  }

  /**
   * Register a plugin
   */
  register(plugin: Plugin): this {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin already registered: ${plugin.name}`);
    }

    this.plugins.set(plugin.name, plugin);
    return this;
  }

  /**
   * Install a plugin
   */
  async install(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);

    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    if (this.installedPlugins.has(pluginName)) {
      throw new Error(`Plugin already installed: ${pluginName}`);
    }

    // Install dependencies first
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        if (!this.installedPlugins.has(dep)) {
          await this.install(dep);
        }
      }
    }

    // Install the plugin
    this.context.log(`Installing plugin: ${plugin.name}@${plugin.version}`);
    await plugin.install(this.context);
    this.installedPlugins.add(pluginName);
    this.context.log(`Plugin installed: ${plugin.name}`);
  }

  /**
   * Install all registered plugins
   */
  async installAll(): Promise<void> {
    for (const pluginName of this.plugins.keys()) {
      if (!this.installedPlugins.has(pluginName)) {
        await this.install(pluginName);
      }
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstall(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);

    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    if (!this.installedPlugins.has(pluginName)) {
      throw new Error(`Plugin not installed: ${pluginName}`);
    }

    // Check for dependents
    for (const [name, p] of this.plugins) {
      if (p.dependencies?.includes(pluginName) && this.installedPlugins.has(name)) {
        throw new Error(`Cannot uninstall: ${name} depends on ${pluginName}`);
      }
    }

    // Uninstall
    if (plugin.uninstall) {
      await plugin.uninstall();
    }

    this.installedPlugins.delete(pluginName);
    this.context.log(`Plugin uninstalled: ${plugin.name}`);
  }

  /**
   * Check if a plugin is installed
   */
  isInstalled(pluginName: string): boolean {
    return this.installedPlugins.has(pluginName);
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get installed plugins
   */
  getInstalledPlugins(): Plugin[] {
    return Array.from(this.installedPlugins)
      .map((name) => this.plugins.get(name)!)
      .filter(Boolean);
  }
}

/**
 * Define a plugin
 */
export function definePlugin(plugin: Plugin): Plugin {
  return plugin;
}
