/**
 * WASM Plugin System Example
 *
 * Demonstrates a complete plugin architecture using WebAssembly modules.
 * Based on Deno 2.1+ best practices and capability-based security patterns.
 *
 * References:
 * - https://docs.deno.com/runtime/reference/wasm/
 * - https://www.secondstate.io/articles/deno-webassembly-rust-wasi/
 */

import { Application } from '../framework/app.ts';
import type { Context } from '../framework/http/types.ts';
import { getTemplateRegistry } from '../framework/runtime/wasm_templates.ts';
import { validateWASM, scanWASM } from '../framework/runtime/wasm_validation.ts';

/**
 * Plugin interface
 */
export interface Plugin {
  id: string;
  name: string;
  version: string;
  wasmModuleId: string;
  capabilities: string[];
  config?: Record<string, unknown>;
}

/**
 * Plugin registry
 */
export class PluginRegistry {
  private plugins: Map<string, Plugin> = new Map();
  private app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  /**
   * Register a plugin from WASM bytes
   */
  async register(plugin: Plugin, wasmBytes: Uint8Array): Promise<void> {
    // Step 1: Security validation
    console.log(`\n📦 Registering plugin: ${plugin.name} v${plugin.version}`);
    console.log('🔒 Running security scan...');

    const scanResult = await scanWASM(wasmBytes);
    console.log(`   Risk Level: ${scanResult.riskLevel}`);
    console.log(`   Issues: ${scanResult.issues.length}`);

    if (!scanResult.safe) {
      throw new Error(`Plugin ${plugin.name} failed security scan: ${scanResult.riskLevel} risk`);
    }

    // Step 2: Validation
    console.log('✓ Validating module...');
    const validationResult = await validateWASM(wasmBytes);

    if (!validationResult.valid) {
      throw new Error(`Plugin ${plugin.name} failed validation`);
    }

    console.log(`   Exports: ${validationResult.metadata.exports}`);
    console.log(`   Functions: ${validationResult.metadata.functions}`);
    console.log(`   Memory: ${validationResult.metadata.memory.initial} pages`);

    // Step 3: Load module with capability-based security
    console.log('🔐 Loading with capabilities:', plugin.capabilities.join(', '));

    const module = await this.app.wasm.loadModule({
      type: 'bytes',
      value: wasmBytes,
      moduleId: plugin.wasmModuleId,
    });

    // Step 4: Create sandbox with specific capabilities
    const sandbox = this.app.wasm.createSandbox({
      memoryLimit: 16 * 1024 * 1024, // 16MB
      timeLimit: 5000, // 5 seconds
      capabilities: plugin.capabilities as any[],
    });

    // Step 5: Instantiate with WASI support
    await this.app.wasm.instantiateModule(plugin.wasmModuleId, {
      sandboxId: sandbox.id,
      enableWASI: true,
      wasiOptions: {
        args: [`--plugin=${plugin.id}`],
        env: {
          PLUGIN_ID: plugin.id,
          PLUGIN_NAME: plugin.name,
          PLUGIN_VERSION: plugin.version,
          ...plugin.config,
        },
        allowRead: plugin.capabilities.includes('file-read'),
        allowWrite: plugin.capabilities.includes('file-write'),
      },
    });

    // Step 6: Store plugin
    this.plugins.set(plugin.id, plugin);

    console.log(`✅ Plugin ${plugin.name} registered successfully\n`);
  }

  /**
   * Execute plugin function
   */
  async execute<T = unknown>(
    pluginId: string,
    functionName: string,
    args: unknown[] = []
  ): Promise<T> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    const result = await this.app.wasm.execute<T>(
      plugin.wasmModuleId,
      functionName,
      args
    );

    if (!result.success) {
      throw new Error(`Plugin execution failed: ${result.error?.message}`);
    }

    return result.value!;
  }

  /**
   * Unload a plugin
   */
  async unload(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    await this.app.wasm.unloadModule(plugin.wasmModuleId);
    this.plugins.delete(pluginId);

    console.log(`Plugin ${plugin.name} unloaded`);
  }

  /**
   * List all plugins
   */
  list(): Plugin[] {
    return Array.from(this.plugins.values());
  }
}

/**
 * Example: Image Processing Plugin
 *
 * This demonstrates a high-performance image processing plugin using WASM.
 */
export async function imageProcessingPluginExample(app: Application) {
  const registry = new PluginRegistry(app);

  // Simulate WASM bytes (in real scenario, load from file or template)
  const templateRegistry = getTemplateRegistry();
  const template = templateRegistry.get('plugin-interface');

  if (!template || !template.typescript) {
    console.log('⚠️  Template not available, using simulated plugin');
    return;
  }

  // For demo purposes, we'll describe what the plugin would do
  console.log('\n🎨 Image Processing Plugin Example\n');
  console.log('This plugin would provide:');
  console.log('  • apply_filter(imagePtr, filterType) - Apply filters');
  console.log('  • resize(imagePtr, width, height) - Resize images');
  console.log('  • convert_format(imagePtr, format) - Convert formats');
  console.log('  • extract_metadata(imagePtr) - Extract EXIF data\n');

  // Plugin configuration
  const plugin: Plugin = {
    id: 'image-processor',
    name: 'Image Processor',
    version: '1.0.0',
    wasmModuleId: 'wasm_image_processor',
    capabilities: ['memory', 'console'],
    config: {
      MAX_IMAGE_SIZE: '10485760', // 10MB
      SUPPORTED_FORMATS: 'jpg,png,webp',
    },
  };

  console.log('Plugin configuration:', JSON.stringify(plugin, null, 2));
}

/**
 * Example: Data Transformation Plugin
 *
 * Demonstrates string/data transformation at high speed.
 */
export async function dataTransformPluginExample(app: Application) {
  const registry = new PluginRegistry(app);

  console.log('\n⚡ Data Transformation Plugin Example\n');
  console.log('This plugin provides high-speed data transformations:');
  console.log('  • hash(dataPtr, algorithm) - Fast hashing (MD5, SHA-256)');
  console.log('  • compress(dataPtr, method) - Data compression');
  console.log('  • encrypt(dataPtr, key) - AES encryption');
  console.log('  • validate(dataPtr, schema) - JSON schema validation\n');

  const plugin: Plugin = {
    id: 'data-transformer',
    name: 'Data Transformer',
    version: '1.0.0',
    wasmModuleId: 'wasm_data_transformer',
    capabilities: ['memory', 'crypto', 'console'],
    config: {
      DEFAULT_HASH: 'sha256',
      COMPRESSION_LEVEL: '6',
    },
  };

  console.log('Performance benefits:');
  console.log('  • ~2x faster than native JS for hashing');
  console.log('  • ~5x faster for compression algorithms');
  console.log('  • Consistent performance across runtimes\n');
}

/**
 * Example: Custom Business Logic Plugin
 *
 * Shows how to extend application behavior with WASM plugins.
 */
export async function businessLogicPluginExample(app: Application) {
  console.log('\n💼 Business Logic Plugin Example\n');
  console.log('This pattern allows extending application logic without redeployment:');
  console.log('  1. Upload WASM plugin via admin API');
  console.log('  2. Plugin undergoes security validation');
  console.log('  3. Sandbox is created with specified capabilities');
  console.log('  4. Plugin is hot-loaded into running application');
  console.log('  5. Execute plugin functions on demand\n');

  console.log('Use cases:');
  console.log('  • Custom pricing algorithms');
  console.log('  • Specialized validation rules');
  console.log('  • Domain-specific calculations');
  console.log('  • Third-party integrations\n');

  const plugin: Plugin = {
    id: 'pricing-engine',
    name: 'Dynamic Pricing Engine',
    version: '2.1.0',
    wasmModuleId: 'wasm_pricing_engine',
    capabilities: ['memory', 'console', 'time'],
    config: {
      CURRENCY: 'USD',
      TAX_RATE: '0.0825',
      DISCOUNT_ENABLED: 'true',
    },
  };

  console.log('Example plugin:', JSON.stringify(plugin, null, 2));
}

/**
 * HTTP endpoint for plugin management
 */
export function setupPluginRoutes(app: Application, registry: PluginRegistry) {
  // List all plugins
  app.get('/api/plugins', (ctx: Context) => {
    // Log plugin list request
    console.log(`[Plugin API] GET ${ctx.url.pathname}`);

    const plugins = registry.list();
    return Response.json({
      count: plugins.length,
      plugins: plugins.map((p) => ({
        id: p.id,
        name: p.name,
        version: p.version,
        capabilities: p.capabilities,
      })),
    });
  });

  // Upload and register plugin
  app.post('/api/plugins', async (ctx: Context) => {
    // Log plugin upload attempt
    console.log(`[Plugin API] POST ${ctx.url.pathname} - Content-Type: ${ctx.request.headers.get('content-type')}`);

    // In real implementation, parse multipart form data
    // const formData = await ctx.request.formData();
    // const wasmFile = formData.get('wasm');

    return Response.json({ message: 'Plugin upload endpoint (implementation required)' }, { status: 501 });
  });

  // Execute plugin function
  app.post('/api/plugins/:id/execute', async (ctx: Context) => {
    const pluginId = ctx.params.id!;
    console.log(`[Plugin API] POST ${ctx.url.pathname} - Execute plugin: ${pluginId}`);

    // const { function: funcName, args } = await ctx.request.json();
    // const result = await registry.execute(pluginId, funcName, args);

    return Response.json({ message: 'Plugin execution endpoint (implementation required)' }, { status: 501 });
  });

  // Unload plugin
  app.delete('/api/plugins/:id', async (ctx: Context) => {
    const pluginId = ctx.params.id!;
    console.log(`[Plugin API] DELETE ${ctx.url.pathname} - Unload plugin: ${pluginId}`);

    await registry.unload(pluginId);

    return Response.json({ message: `Plugin ${pluginId} unloaded` });
  });
}

/**
 * Main demo function
 */
export async function runPluginSystemDemo() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║        WASM Plugin System Architecture Demo           ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  const app = new Application({
    enableWasm: true,
    wasm: {
      enableSandboxing: true,
      enableWASI: true,
      enableHostFunctionRegistry: true,
    },
  });

  await app.init();

  // Run examples
  await imageProcessingPluginExample(app);
  await dataTransformPluginExample(app);
  await businessLogicPluginExample(app);

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║                  Demo Complete                         ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log('Key Takeaways:');
  console.log('✓ Plugins are validated and scanned before loading');
  console.log('✓ Capability-based security restricts resource access');
  console.log('✓ Sandboxing provides memory and time limits');
  console.log('✓ WASI enables filesystem and environment access');
  console.log('✓ Hot-loading allows dynamic plugin management\n');
}

// Run demo if executed directly
if (import.meta.main) {
  await runPluginSystemDemo();
}
