/**
 * Runtime Layer Tests
 *
 * Tests for the new runtime layer features:
 * - RuntimeEvents
 * - StartupTracker
 * - RuntimeMetricsCollector
 * - SignalHandlerManager
 * - WorkerPool
 * - Runtime class integration
 */

import {
  assertEquals,
  assertExists,
  assertThrows,
  assertRejects,
} from 'jsr:@std/assert';

import {
  RuntimeEvents,
  StartupTracker,
  resetStartupTracker,
  RuntimeMetricsCollector,
  resetRuntimeMetrics,
  SignalHandlerManager,
  resetSignalHandler,
  WorkerPool,
  resetWorkerPool,
  Runtime,
  Environment,
} from '../../framework/runtime/mod.ts';

// ============================================================================
// RuntimeEvents Tests
// ============================================================================

Deno.test('RuntimeEvents - has all expected event constants', () => {
  assertExists(RuntimeEvents.GC_START);
  assertExists(RuntimeEvents.GC_END);
  assertExists(RuntimeEvents.MODULE_LOAD);
  assertExists(RuntimeEvents.WORKER_SPAWN);
  assertExists(RuntimeEvents.WORKER_TERMINATE);
  assertExists(RuntimeEvents.STARTUP_PHASE_START);
  assertExists(RuntimeEvents.STARTUP_PHASE_END);
  assertExists(RuntimeEvents.STARTUP_COMPLETE);
  assertExists(RuntimeEvents.CONFIG_RELOAD);
  assertExists(RuntimeEvents.DEBUG_DUMP);
});

Deno.test('RuntimeEvents - events have unique values', () => {
  const values = Object.values(RuntimeEvents);
  const uniqueValues = new Set(values);
  assertEquals(values.length, uniqueValues.size);
});

// ============================================================================
// StartupTracker Tests
// ============================================================================

Deno.test('StartupTracker - track a single phase', () => {
  resetStartupTracker();
  const tracker = new StartupTracker();

  tracker.startPhase('init');
  tracker.endPhase('init');

  const phase = tracker.getPhase('init');
  assertExists(phase);
  assertEquals(phase.phase, 'init');
  assertEquals(phase.success, true);
  assertExists(phase.duration);
});

Deno.test('StartupTracker - track multiple phases', () => {
  resetStartupTracker();
  const tracker = new StartupTracker();

  tracker.startPhase('init');
  tracker.endPhase('init');

  tracker.startPhase('config');
  tracker.endPhase('config');

  tracker.startPhase('ready');
  tracker.endPhase('ready');

  assertEquals(tracker.isPhaseComplete('init'), true);
  assertEquals(tracker.isPhaseComplete('config'), true);
  assertEquals(tracker.isPhaseComplete('ready'), true);
});

Deno.test('StartupTracker - phase() async wrapper', async () => {
  resetStartupTracker();
  const tracker = new StartupTracker();

  let executed = false;
  await tracker.phase('init', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    executed = true;
  });

  assertEquals(executed, true);
  assertEquals(tracker.isPhaseComplete('init'), true);
});

Deno.test('StartupTracker - phase() captures errors', async () => {
  resetStartupTracker();
  const tracker = new StartupTracker();

  await assertRejects(async () => {
    await tracker.phase('init', async () => {
      throw new Error('Phase failed');
    });
  });

  const phase = tracker.getPhase('init');
  assertExists(phase);
  assertEquals(phase.success, false);
  assertExists(phase.error);
});

Deno.test('StartupTracker - getReport returns timing info', () => {
  resetStartupTracker();
  const tracker = new StartupTracker();

  tracker.startPhase('init');
  tracker.endPhase('init');
  tracker.complete();

  const report = tracker.getReport();
  assertExists(report);
  assertEquals(report.success, true);
  assertEquals(report.phases.length, 1);
  assertEquals(report.phases[0].phase, 'init');
  assertExists(report.totalDuration);
});

Deno.test('StartupTracker - throws on duplicate phase start', () => {
  resetStartupTracker();
  const tracker = new StartupTracker();

  tracker.startPhase('init');
  tracker.endPhase('init');

  assertThrows(() => {
    tracker.startPhase('init');
  });
});

Deno.test('StartupTracker - throws on concurrent phases', () => {
  resetStartupTracker();
  const tracker = new StartupTracker();

  tracker.startPhase('init');

  assertThrows(() => {
    tracker.startPhase('config');
  });
});

Deno.test('StartupTracker - event listeners', () => {
  resetStartupTracker();
  const tracker = new StartupTracker();

  let startFired = false;
  let endFired = false;
  let completeFired = false;

  tracker.onPhaseStart(() => {
    startFired = true;
  });

  tracker.onPhaseEnd(() => {
    endFired = true;
  });

  tracker.onComplete(() => {
    completeFired = true;
  });

  tracker.startPhase('init');
  assertEquals(startFired, true);

  tracker.endPhase('init');
  assertEquals(endFired, true);

  tracker.complete();
  assertEquals(completeFired, true);
});

// ============================================================================
// RuntimeMetricsCollector Tests
// ============================================================================

Deno.test({
  name: 'RuntimeMetricsCollector - collectNow returns snapshot',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    resetRuntimeMetrics();
    const collector = new RuntimeMetricsCollector({
      measureEventLoopLag: false,
      measureCpu: false,
    });

    const snapshot = await collector.collectNow();

    assertExists(snapshot);
    assertExists(snapshot.memory);
    assertExists(snapshot.memory.heapUsed);
    assertExists(snapshot.memory.heapTotal);
    assertExists(snapshot.uptime);
    assertExists(snapshot.timestamp);
  },
});

Deno.test({
  name: 'RuntimeMetricsCollector - getSnapshot returns memory info',
  sanitizeOps: false,
  sanitizeResources: false,
  fn() {
    resetRuntimeMetrics();
    const collector = new RuntimeMetricsCollector();

    const snapshot = collector.getSnapshot();

    assertExists(snapshot.memory);
    assertEquals(snapshot.memory.heapUsed > 0, true);
    assertEquals(snapshot.memory.heapTotal > 0, true);
  },
});

Deno.test({
  name: 'RuntimeMetricsCollector - start and stop',
  sanitizeOps: false,
  sanitizeResources: false,
  fn() {
    resetRuntimeMetrics();
    const collector = new RuntimeMetricsCollector({
      collectionInterval: 1000,
    });

    assertEquals(collector.isRunning(), false);

    collector.start();
    assertEquals(collector.isRunning(), true);

    collector.stop();
    assertEquals(collector.isRunning(), false);
  },
});

Deno.test({
  name: 'RuntimeMetricsCollector - memory warning listener',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    resetRuntimeMetrics();
    const collector = new RuntimeMetricsCollector({
      memoryWarningThreshold: 0, // Trigger immediately
      measureEventLoopLag: false,
      measureCpu: false,
    });

    let warningFired = false;
    collector.onMemoryWarning(() => {
      warningFired = true;
    });

    await collector.collectNow();

    assertEquals(warningFired, true);
  },
});

// ============================================================================
// SignalHandlerManager Tests
// ============================================================================

Deno.test({
  name: 'SignalHandlerManager - start and stop',
  sanitizeOps: false,
  sanitizeResources: false,
  fn() {
    resetSignalHandler();
    const manager = new SignalHandlerManager({
      enableConfigReload: false,
      enableDebugDump: false,
    });

    assertEquals(manager.isStarted(), false);

    manager.start();
    assertEquals(manager.isStarted(), true);

    manager.stop();
    assertEquals(manager.isStarted(), false);
  },
});

Deno.test({
  name: 'SignalHandlerManager - config reload handler',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    resetSignalHandler();
    let reloadCalled = false;

    const manager = new SignalHandlerManager({
      enableConfigReload: false,
      enableDebugDump: false,
      onConfigReload: () => {
        reloadCalled = true;
      },
    });

    await manager.triggerConfigReload();

    assertEquals(reloadCalled, true);
  },
});

Deno.test({
  name: 'SignalHandlerManager - debug dump handler',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    resetSignalHandler();
    let dumpReceived = false;

    const manager = new SignalHandlerManager({
      enableConfigReload: false,
      enableDebugDump: false,
      onDebugDump: (dump) => {
        dumpReceived = true;
        assertExists(dump.memory);
        assertExists(dump.cpuUsage);
        assertExists(dump.uptime);
      },
    });

    await manager.triggerDebugDump();

    assertEquals(dumpReceived, true);
  },
});

Deno.test('SignalHandlerManager - isSignalAvailable', () => {
  // SIGHUP should be available on non-Windows
  if (Deno.build.os !== 'windows') {
    assertEquals(SignalHandlerManager.isSignalAvailable('SIGHUP'), true);
    assertEquals(SignalHandlerManager.isSignalAvailable('SIGUSR1'), true);
  }
});

// ============================================================================
// WorkerPool Tests
// ============================================================================

Deno.test({
  name: 'WorkerPool - start and shutdown',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await resetWorkerPool();
    const pool = new WorkerPool({
      minWorkers: 1,
      maxWorkers: 2,
    });

    assertEquals(pool.isStarted(), false);

    await pool.start();
    assertEquals(pool.isStarted(), true);

    await pool.shutdown();
    assertEquals(pool.isStarted(), false);
  },
});

Deno.test({
  name: 'WorkerPool - getStats returns statistics',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await resetWorkerPool();
    const pool = new WorkerPool({
      minWorkers: 1,
      maxWorkers: 2,
    });

    await pool.start();

    const stats = pool.getStats();
    assertExists(stats);
    assertEquals(stats.totalWorkers >= 1, true);
    assertEquals(stats.queuedTasks, 0);
    assertEquals(stats.completedTasks, 0);

    await pool.shutdown();
  },
});

Deno.test({
  name: 'WorkerPool - worker spawn listener',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await resetWorkerPool();
    const pool = new WorkerPool({
      minWorkers: 1,
      maxWorkers: 2,
    });

    let spawnFired = false;
    pool.onWorkerSpawn((payload) => {
      spawnFired = true;
      assertExists(payload.workerId);
      assertExists(payload.totalWorkers);
    });

    await pool.start();
    assertEquals(spawnFired, true);

    await pool.shutdown();
  },
});

// ============================================================================
// Environment Tests (new feature flags)
// ============================================================================

Deno.test('Environment - has new feature flags', () => {
  const features = Environment.instance.features;

  // New feature flags should exist
  assertExists(features.kv);
  assertExists(features.cron);
  assertExists(features.ffi);
  assertExists(features.websocket);
  assertExists(features.workers);
  assertExists(features.wasm);
  assertExists(features.signals);
  assertExists(features.signalsExtended);

  // Legacy flags should still work
  assertExists(features.hasKV);
  assertExists(features.hasCron);
  assertExists(features.hasFFI);

  // New and legacy should match
  assertEquals(features.kv, features.hasKV);
  assertEquals(features.cron, features.hasCron);
  assertEquals(features.ffi, features.hasFFI);
});

Deno.test('Environment - workers and wasm are available', () => {
  const features = Environment.instance.features;

  // Workers should be available in Deno
  assertEquals(features.workers, true);

  // WASM should be available in Deno
  assertEquals(features.wasm, true);
});

// ============================================================================
// Runtime Integration Tests
// ============================================================================

Deno.test({
  name: 'Runtime - has startup tracker',
  sanitizeOps: false,
  sanitizeResources: false,
  fn() {
    const runtime = Runtime.instance;

    assertExists(runtime.startup);
    assertEquals(typeof runtime.startup.startPhase, 'function');
    assertEquals(typeof runtime.startup.endPhase, 'function');
  },
});

Deno.test({
  name: 'Runtime - has metrics collector',
  sanitizeOps: false,
  sanitizeResources: false,
  fn() {
    const runtime = Runtime.instance;

    assertExists(runtime.metrics);
    assertEquals(typeof runtime.metrics.collectNow, 'function');
    assertEquals(typeof runtime.metrics.start, 'function');
    assertEquals(typeof runtime.metrics.stop, 'function');
  },
});

Deno.test({
  name: 'Runtime - has signal handler',
  sanitizeOps: false,
  sanitizeResources: false,
  fn() {
    const runtime = Runtime.instance;

    assertExists(runtime.signals);
    assertEquals(typeof runtime.signals.start, 'function');
    assertEquals(typeof runtime.signals.stop, 'function');
  },
});

Deno.test({
  name: 'Runtime - has worker pool',
  sanitizeOps: false,
  sanitizeResources: false,
  fn() {
    const runtime = Runtime.instance;

    assertExists(runtime.workerPool);
    assertEquals(typeof runtime.workerPool.start, 'function');
    assertEquals(typeof runtime.workerPool.shutdown, 'function');
    assertEquals(typeof runtime.workerPool.submit, 'function');
  },
});

Deno.test({
  name: 'Runtime - hasFeature method',
  sanitizeOps: false,
  sanitizeResources: false,
  fn() {
    const runtime = Runtime.instance;

    // Known features
    assertEquals(typeof runtime.hasFeature('kv'), 'boolean');
    assertEquals(typeof runtime.hasFeature('wasm'), 'boolean');
    assertEquals(typeof runtime.hasFeature('workers'), 'boolean');

    // WASM should always be true
    assertEquals(runtime.hasFeature('wasm'), true);

    // Unknown feature should be false
    assertEquals(runtime.hasFeature('unknown-feature'), false);
  },
});

Deno.test({
  name: 'Runtime - cpuUsage method',
  sanitizeOps: false,
  sanitizeResources: false,
  fn() {
    const runtime = Runtime.instance;

    const cpu = runtime.cpuUsage();

    assertExists(cpu);
    assertEquals(typeof cpu.user, 'number');
    assertEquals(typeof cpu.system, 'number');
    assertEquals(typeof cpu.percentage, 'number');
  },
});

Deno.test({
  name: 'Runtime - uptime method',
  sanitizeOps: false,
  sanitizeResources: false,
  fn() {
    const runtime = Runtime.instance;

    const uptime = runtime.uptime();

    assertEquals(typeof uptime, 'number');
    assertEquals(uptime >= 0, true);
  },
});

Deno.test({
  name: 'Runtime - createWorker method',
  sanitizeOps: false,
  sanitizeResources: false,
  fn() {
    const runtime = Runtime.instance;

    const worker = runtime.createWorker();

    assertExists(worker);
    assertEquals(typeof worker.postMessage, 'function');
    assertEquals(typeof worker.terminate, 'function');

    // Clean up
    worker.terminate();
  },
});

Deno.test({
  name: 'Runtime - onRestart callback registration',
  sanitizeOps: false,
  sanitizeResources: false,
  fn() {
    const runtime = Runtime.instance;

    let callbackRegistered = false;
    const unsubscribe = runtime.onRestart(() => {
      callbackRegistered = true;
    });

    assertEquals(typeof unsubscribe, 'function');

    // Unsubscribe should work without errors
    unsubscribe();
  },
});
