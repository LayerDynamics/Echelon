/**
 * Job Worker
 *
 * Background worker for processing jobs.
 */

import { JobQueue, getJobQueue } from './queue.ts';

export interface WorkerOptions {
  queue?: JobQueue;
  concurrency?: number;
}

/**
 * Job worker for processing background jobs
 *
 * Note: Named JobWorker to avoid shadowing the global Web Worker API
 */
export class JobWorker {
  private queue: JobQueue;
  private running = false;
  private abortController: AbortController;

  constructor(options: WorkerOptions = {}) {
    this.queue = options.queue ?? getJobQueue();
    this.abortController = new AbortController();
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (this.running) {
      console.warn('Worker already running');
      return;
    }

    this.running = true;
    console.log('Job worker started');

    try {
      await this.queue.process();
    } catch (error) {
      if (!this.abortController.signal.aborted) {
        console.error('Worker error:', error);
      }
    }
  }

  /**
   * Stop the worker
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    this.abortController.abort();
    console.log('Job worker stopped');
  }

  /**
   * Check if worker is running
   */
  isRunning(): boolean {
    return this.running;
  }
}

/**
 * Create and start a job worker
 */
export function createJobWorker(options?: WorkerOptions): JobWorker {
  const worker = new JobWorker(options);
  worker.start();
  return worker;
}
