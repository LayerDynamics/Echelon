/**
 * Worker Pool
 *
 * Manages a pool of Web Workers for CPU-bound tasks.
 * Provides task queuing, load balancing, and worker lifecycle management.
 */

import type {
  WorkerSpawnEventPayload,
  WorkerTerminateEventPayload,
} from './events.ts';
import { RuntimeEvents } from './events.ts';

// ============================================================================
// Types
// ============================================================================

/**
 * Task to be executed by a worker
 */
export interface WorkerTask<T = unknown, R = unknown> {
  id: string;
  type: string;
  data: T;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
  timeout?: number;
  priority?: number;
  createdAt: number;
}

/**
 * Worker pool configuration
 */
export interface WorkerPoolConfig {
  /** Minimum number of workers to maintain (default: 1) */
  minWorkers?: number;
  /** Maximum number of workers to spawn (default: navigator.hardwareConcurrency or 4) */
  maxWorkers?: number;
  /** Idle timeout before terminating excess workers in ms (default: 60000) */
  idleTimeout?: number;
  /** Default task timeout in ms (default: 30000) */
  taskTimeout?: number;
  /**
   * Worker script URL or module specifier.
   *
   * IMPORTANT: Must be an absolute URL or use import.meta.resolve().
   * Relative paths are not supported in Deno without --location flag.
   *
   * Custom worker scripts MUST register self.onmessage BEFORE any top-level await
   * to avoid losing messages.
   *
   * @example
   * ```typescript
   * // Using import.meta.resolve for relative paths
   * workerScript: import.meta.resolve("./my-worker.ts")
   *
   * // Using absolute URL
   * workerScript: "https://example.com/worker.ts"
   * ```
   */
  workerScript?: string;
  /**
   * Deno-specific permission options for worker sandboxing.
   * If not specified, workers inherit all permissions from parent.
   *
   * @example
   * ```typescript
   * permissions: {
   *   net: false,
   *   read: ["./data/"],
   *   write: false,
   * }
   * ```
   */
  permissions?: Deno.PermissionOptions;
}

/**
 * Worker state
 */
export interface WorkerState {
  id: string;
  worker: Worker;
  busy: boolean;
  currentTask: string | null;
  tasksCompleted: number;
  tasksErrored: number;
  createdAt: number;
  lastActiveAt: number;
}

/**
 * Pool statistics
 */
export interface PoolStats {
  totalWorkers: number;
  activeWorkers: number;
  idleWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  erroredTasks: number;
  averageTaskTime: number;
}

/**
 * Task result
 */
export interface TaskResult<R = unknown> {
  success: boolean;
  result?: R;
  error?: Error;
  duration: number;
  workerId: string;
}

/**
 * Event listeners
 */
export type WorkerEventListener = (
  payload: WorkerSpawnEventPayload | WorkerTerminateEventPayload
) => void;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<Omit<WorkerPoolConfig, 'permissions'>> & { permissions: Deno.PermissionOptions | undefined } = {
  minWorkers: 1,
  maxWorkers: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4,
  idleTimeout: 60000,
  taskTimeout: 30000,
  workerScript: '',
  permissions: undefined, // Workers inherit parent permissions by default
};

// ============================================================================
// Default Worker Script
// ============================================================================

/**
 * Default inline worker script for simple tasks.
 *
 * Note: This script is embedded as a data URL. Data URL workers cannot
 * use relative imports - all dependencies must be inlined or use absolute URLs.
 */
const DEFAULT_WORKER_SCRIPT = `
self.onmessage = async (event) => {
  const { taskId, type, data } = event.data;

  try {
    let result;

    switch (type) {
      case 'compute':
        // Generic computation - data should contain the operation
        result = data;
        break;

      case 'ping':
        result = { pong: true, timestamp: Date.now() };
        break;

      default:
        throw new Error('Unknown task type: ' + type);
    }

    self.postMessage({ taskId, success: true, result });
  } catch (error) {
    self.postMessage({
      taskId,
      success: false,
      error: error.message || String(error)
    });
  }
};
`;

// ============================================================================
// Worker Pool
// ============================================================================

/**
 * Manages a pool of Web Workers for CPU-bound tasks.
 *
 * ## Deno Web Worker Constraints
 *
 * - **Module workers only**: Deno only supports `type: "module"` workers.
 *   Classic workers are not supported.
 *
 * - **Path resolution**: Worker script paths must be absolute URLs or use
 *   `import.meta.resolve()`. Relative paths require `--location` flag.
 *
 * - **Data URL limitations**: When using the default inline worker (no workerScript),
 *   the worker is created via data URL and cannot use relative imports.
 *
 * - **Message handler timing**: Custom worker scripts must register `self.onmessage`
 *   BEFORE any top-level `await` to avoid losing messages.
 *
 * - **Permission sandboxing**: Use the `permissions` config option to restrict
 *   worker capabilities. By default, workers inherit all parent permissions.
 *
 * @example
 * ```typescript
 * const pool = new WorkerPool({
 *   maxWorkers: 4,
 *   workerScript: import.meta.resolve("./my-worker.ts"),
 *   permissions: { net: false, write: false }
 * });
 * await pool.start();
 *
 * // Submit a task
 * const result = await pool.submit('compute', { value: 42 });
 *
 * // Shutdown pool
 * await pool.shutdown();
 * ```
 */
export class WorkerPool {
  private config: Required<Omit<WorkerPoolConfig, 'permissions'>> & { permissions: Deno.PermissionOptions | undefined };
  private workers: Map<string, WorkerState> = new Map();
  private taskQueue: WorkerTask[] = [];
  private taskTimings: number[] = [];
  private completedTasks = 0;
  private erroredTasks = 0;
  private started = false;
  private shuttingDown = false;
  private idleCheckInterval: number | null = null;
  private workerIdCounter = 0;

  // Event listeners
  private spawnListeners: ((payload: WorkerSpawnEventPayload) => void)[] = [];
  private terminateListeners: ((payload: WorkerTerminateEventPayload) => void)[] = [];

  constructor(config: WorkerPoolConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config } as typeof this.config;
  }

  /**
   * Start the worker pool
   */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    this.shuttingDown = false;

    // Spawn minimum workers
    for (let i = 0; i < this.config.minWorkers; i++) {
      await this.spawnWorker();
    }

    // Start idle worker check
    this.startIdleCheck();
  }

  /**
   * Shutdown the worker pool gracefully
   */
  async shutdown(): Promise<void> {
    if (!this.started || this.shuttingDown) {
      return;
    }

    this.shuttingDown = true;

    // Stop idle check
    if (this.idleCheckInterval !== null) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }

    // Reject all queued tasks
    for (const task of this.taskQueue) {
      task.reject(new Error('Worker pool shutting down'));
    }
    this.taskQueue = [];

    // Terminate all workers
    const terminatePromises = Array.from(this.workers.keys()).map((id) =>
      this.terminateWorker(id, 'shutdown')
    );
    await Promise.all(terminatePromises);

    this.started = false;
    this.shuttingDown = false;
  }

  /**
   * Check if pool is started
   */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Submit a task to the pool
   */
  submit<T = unknown, R = unknown>(
    type: string,
    data: T,
    options: { timeout?: number; priority?: number } = {}
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      if (!this.started) {
        reject(new Error('Worker pool not started'));
        return;
      }

      if (this.shuttingDown) {
        reject(new Error('Worker pool shutting down'));
        return;
      }

      const task: WorkerTask<T, R> = {
        id: this.generateTaskId(),
        type,
        data,
        resolve,
        reject,
        timeout: options.timeout ?? this.config.taskTimeout,
        priority: options.priority ?? 0,
        createdAt: Date.now(),
      };

      // Add to queue (sorted by priority, higher first)
      // Use type assertion since generics are erased at runtime
      this.insertTask(task as unknown as WorkerTask);

      // Try to process queue
      this.processQueue();
    });
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    const workers = Array.from(this.workers.values());
    const activeWorkers = workers.filter((w) => w.busy).length;

    return {
      totalWorkers: workers.length,
      activeWorkers,
      idleWorkers: workers.length - activeWorkers,
      queuedTasks: this.taskQueue.length,
      completedTasks: this.completedTasks,
      erroredTasks: this.erroredTasks,
      averageTaskTime: this.calculateAverageTaskTime(),
    };
  }

  /**
   * Get number of active workers
   */
  getActiveWorkerCount(): number {
    return Array.from(this.workers.values()).filter((w) => w.busy).length;
  }

  /**
   * Get number of queued tasks
   */
  getQueueLength(): number {
    return this.taskQueue.length;
  }

  /**
   * Register spawn event listener
   */
  onWorkerSpawn(listener: (payload: WorkerSpawnEventPayload) => void): () => void {
    this.spawnListeners.push(listener);
    return () => {
      const idx = this.spawnListeners.indexOf(listener);
      if (idx >= 0) this.spawnListeners.splice(idx, 1);
    };
  }

  /**
   * Register terminate event listener
   */
  onWorkerTerminate(
    listener: (payload: WorkerTerminateEventPayload) => void
  ): () => void {
    this.terminateListeners.push(listener);
    return () => {
      const idx = this.terminateListeners.indexOf(listener);
      if (idx >= 0) this.terminateListeners.splice(idx, 1);
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async spawnWorker(): Promise<WorkerState> {
    const id = `worker-${++this.workerIdCounter}`;

    // Create worker from script or use default inline script
    // Deno only supports module workers (type: 'module')
    let worker: Worker;

    // Build worker options with Deno-specific permissions if configured
    const workerOptions: WorkerOptions & { deno?: { permissions?: Deno.PermissionOptions } } = {
      type: 'module',
    };

    if (this.config.permissions) {
      workerOptions.deno = { permissions: this.config.permissions };
    }

    if (this.config.workerScript) {
      worker = new Worker(this.config.workerScript, workerOptions);
    } else {
      // Create worker from inline script using data URL
      // Note: Data URL workers cannot use relative imports
      const moduleScript = `
        self.onmessage = async (event) => {
          const { taskId, type, data } = event.data;
          try {
            let result;
            switch (type) {
              case 'ping':
                result = { pong: true, timestamp: Date.now() };
                break;
              case 'compute':
                result = data;
                break;
              default:
                throw new Error('Unknown task type: ' + type);
            }
            self.postMessage({ taskId, success: true, result });
          } catch (error) {
            self.postMessage({ taskId, success: false, error: error.message || String(error) });
          }
        };
      `;
      const dataUrl = `data:application/javascript;base64,${btoa(moduleScript)}`;
      worker = new Worker(dataUrl, workerOptions);
    }

    const state: WorkerState = {
      id,
      worker,
      busy: false,
      currentTask: null,
      tasksCompleted: 0,
      tasksErrored: 0,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    // Set up message handler
    worker.onmessage = (event) => {
      this.handleWorkerMessage(id, event.data);
    };

    worker.onerror = (error) => {
      this.handleWorkerError(id, error);
    };

    this.workers.set(id, state);

    // Emit spawn event
    this.emitSpawnEvent(id);

    return state;
  }

  private async terminateWorker(id: string, reason: string): Promise<void> {
    const state = this.workers.get(id);
    if (!state) {
      return;
    }

    // Terminate the worker
    state.worker.terminate();
    this.workers.delete(id);

    // Emit terminate event
    this.emitTerminateEvent(id, reason, state.tasksCompleted);
  }

  private handleWorkerMessage(
    workerId: string,
    message: { taskId: string; success: boolean; result?: unknown; error?: string }
  ): void {
    const state = this.workers.get(workerId);
    if (!state) {
      return;
    }

    const taskId = state.currentTask;
    if (!taskId || taskId !== message.taskId) {
      return;
    }

    // Find the original task (should have been removed from queue)
    // The resolve/reject functions are stored in the task object
    // We need to track active tasks separately

    state.busy = false;
    state.currentTask = null;
    state.lastActiveAt = Date.now();

    if (message.success) {
      state.tasksCompleted++;
      this.completedTasks++;
    } else {
      state.tasksErrored++;
      this.erroredTasks++;
    }

    // Process next task in queue
    this.processQueue();
  }

  private handleWorkerError(workerId: string, error: ErrorEvent): void {
    const state = this.workers.get(workerId);
    if (!state) {
      return;
    }

    console.error(`Worker ${workerId} error:`, error.message);

    state.busy = false;
    state.currentTask = null;
    state.tasksErrored++;
    this.erroredTasks++;

    // Process next task
    this.processQueue();
  }

  private processQueue(): void {
    if (this.taskQueue.length === 0) {
      return;
    }

    // Find an idle worker
    let idleWorker: WorkerState | undefined;
    for (const state of this.workers.values()) {
      if (!state.busy) {
        idleWorker = state;
        break;
      }
    }

    // If no idle worker and we can spawn more, do so
    if (!idleWorker && this.workers.size < this.config.maxWorkers) {
      this.spawnWorker().then((state) => {
        this.assignTaskToWorker(state);
      });
      return;
    }

    if (idleWorker) {
      this.assignTaskToWorker(idleWorker);
    }
  }

  private assignTaskToWorker(state: WorkerState): void {
    const task = this.taskQueue.shift();
    if (!task) {
      return;
    }

    state.busy = true;
    state.currentTask = task.id;
    state.lastActiveAt = Date.now();

    const startTime = Date.now();

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (state.currentTask === task.id) {
        state.busy = false;
        state.currentTask = null;
        task.reject(new Error(`Task ${task.id} timed out after ${task.timeout}ms`));
        this.erroredTasks++;
        this.processQueue();
      }
    }, task.timeout);

    // Store original resolve/reject to wrap them
    const originalResolve = task.resolve;
    const originalReject = task.reject;

    // Create wrapped handlers that track timing
    const wrappedResolve = (result: unknown) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      this.taskTimings.push(duration);
      if (this.taskTimings.length > 100) {
        this.taskTimings.shift();
      }
      originalResolve(result as never);
    };

    const wrappedReject = (error: Error) => {
      clearTimeout(timeoutId);
      originalReject(error);
    };

    // Update task handlers
    task.resolve = wrappedResolve;
    task.reject = wrappedReject;

    // Listen for response
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;
      if (message.taskId === task.id) {
        state.worker.removeEventListener('message', messageHandler);
        if (message.success) {
          wrappedResolve(message.result);
        } else {
          wrappedReject(new Error(message.error || 'Task failed'));
        }
      }
    };

    state.worker.addEventListener('message', messageHandler);

    // Send task to worker
    state.worker.postMessage({
      taskId: task.id,
      type: task.type,
      data: task.data,
    });
  }

  private insertTask(task: WorkerTask): void {
    // Insert sorted by priority (higher first)
    let insertIdx = this.taskQueue.length;
    for (let i = 0; i < this.taskQueue.length; i++) {
      if ((task.priority ?? 0) > (this.taskQueue[i].priority ?? 0)) {
        insertIdx = i;
        break;
      }
    }
    this.taskQueue.splice(insertIdx, 0, task);
  }

  private startIdleCheck(): void {
    this.idleCheckInterval = setInterval(() => {
      this.checkIdleWorkers();
    }, 10000); // Check every 10 seconds

    // Prevent interval from keeping process alive
    if (typeof Deno !== 'undefined' && 'unrefTimer' in Deno) {
      (Deno as unknown as { unrefTimer: (id: number) => void }).unrefTimer(
        this.idleCheckInterval
      );
    }
  }

  private checkIdleWorkers(): void {
    const now = Date.now();

    for (const [id, state] of this.workers) {
      // Don't terminate if we're at minimum workers
      if (this.workers.size <= this.config.minWorkers) {
        break;
      }

      // Check if worker has been idle too long
      if (!state.busy && now - state.lastActiveAt > this.config.idleTimeout) {
        this.terminateWorker(id, 'idle timeout');
      }
    }
  }

  private calculateAverageTaskTime(): number {
    if (this.taskTimings.length === 0) {
      return 0;
    }
    const sum = this.taskTimings.reduce((a, b) => a + b, 0);
    return sum / this.taskTimings.length;
  }

  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private emitSpawnEvent(workerId: string): void {
    const payload: WorkerSpawnEventPayload = {
      workerId,
      totalWorkers: this.workers.size,
      timestamp: new Date(),
    };

    for (const listener of this.spawnListeners) {
      try {
        listener(payload);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private emitTerminateEvent(
    workerId: string,
    reason: string,
    tasksCompleted: number
  ): void {
    const payload: WorkerTerminateEventPayload = {
      workerId,
      reason,
      tasksCompleted,
      timestamp: new Date(),
    };

    for (const listener of this.terminateListeners) {
      try {
        listener(payload);
      } catch {
        // Ignore listener errors
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: WorkerPool | null = null;

/**
 * Get the global worker pool instance
 */
export function getWorkerPool(): WorkerPool {
  if (!instance) {
    instance = new WorkerPool();
  }
  return instance;
}

/**
 * Reset the global worker pool
 * Primarily used for testing
 */
export async function resetWorkerPool(): Promise<void> {
  if (instance) {
    await instance.shutdown();
  }
  instance = null;
}
