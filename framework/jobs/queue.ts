/**
 * Job Queue
 *
 * Queue-based job processing using Deno KV.
 */

import { getKV } from '../orm/kv.ts';
import { withSpan, isOTELEnabled, SpanKind, SpanStatusCode } from '../telemetry/otel.ts';

export interface Job<T = unknown> {
  id: string;
  name: string;
  data: T;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  scheduledAt?: Date;
  failedAt?: Date;
  error?: string;
}

export interface JobOptions {
  maxAttempts?: number;
  delay?: number; // milliseconds
  priority?: number;
}

export type JobHandler<T = unknown> = (job: Job<T>) => Promise<void>;

const DEFAULT_OPTIONS: JobOptions = {
  maxAttempts: 3,
  delay: 0,
  priority: 0,
};

/**
 * Job queue manager
 */
export class JobQueue {
  private handlers = new Map<string, JobHandler>();
  private prefix: string;

  constructor(prefix = 'jobs') {
    this.prefix = prefix;
  }

  /**
   * Register a job handler
   */
  register<T>(name: string, handler: JobHandler<T>): this {
    this.handlers.set(name, handler as JobHandler);
    return this;
  }

  /**
   * Enqueue a job
   */
  async enqueue<T>(name: string, data: T, options: JobOptions = {}): Promise<string> {
    if (!isOTELEnabled()) {
      const opts = { ...DEFAULT_OPTIONS, ...options };

      const job: Job<T> = {
        id: crypto.randomUUID(),
        name,
        data,
        attempts: 0,
        maxAttempts: opts.maxAttempts!,
        createdAt: new Date(),
        scheduledAt: opts.delay ? new Date(Date.now() + opts.delay) : undefined,
      };

      const kv = await getKV();

      // Store job metadata
      await kv.set([this.prefix, 'jobs', job.id], job);

      // Enqueue for processing
      await kv.enqueue(
        { jobId: job.id, name, priority: opts.priority },
        { delay: opts.delay, keysIfUndelivered: [[this.prefix, 'failed', job.id]] }
      );

      return job.id;
    }

    return await withSpan('job.enqueue', async (span) => {
      span?.setAttribute('job.name', name);
      span?.setAttribute('job.queue', this.prefix);

      const opts = { ...DEFAULT_OPTIONS, ...options };

      const job: Job<T> = {
        id: crypto.randomUUID(),
        name,
        data,
        attempts: 0,
        maxAttempts: opts.maxAttempts!,
        createdAt: new Date(),
        scheduledAt: opts.delay ? new Date(Date.now() + opts.delay) : undefined,
      };

      span?.setAttribute('job.id', job.id);
      span?.setAttribute('job.max_attempts', job.maxAttempts);
      if (opts.delay) {
        span?.setAttribute('job.delay_ms', opts.delay);
      }
      if (opts.priority !== undefined) {
        span?.setAttribute('job.priority', opts.priority);
      }

      const kv = await getKV();

      // Store job metadata
      await kv.set([this.prefix, 'jobs', job.id], job);

      // Enqueue for processing
      await kv.enqueue(
        { jobId: job.id, name, priority: opts.priority },
        { delay: opts.delay, keysIfUndelivered: [[this.prefix, 'failed', job.id]] }
      );

      return job.id;
    }, { kind: SpanKind.PRODUCER });
  }

  /**
   * Enqueue multiple jobs
   */
  async enqueueMany<T>(name: string, items: T[], options: JobOptions = {}): Promise<string[]> {
    const ids: string[] = [];

    for (const data of items) {
      const id = await this.enqueue(name, data, options);
      ids.push(id);
    }

    return ids;
  }

  /**
   * Get a job by ID
   */
  async getJob<T>(id: string): Promise<Job<T> | null> {
    const kv = await getKV();
    return await kv.get<Job<T>>([this.prefix, 'jobs', id]);
  }

  /**
   * Start processing jobs
   */
  async process(): Promise<void> {
    const kv = await getKV();

    await kv.listenQueue(async (message: unknown) => {
      const { jobId, name } = message as { jobId: string; name: string };

      const job = await this.getJob(jobId);
      if (!job) {
        console.error(`Job not found: ${jobId}`);
        return;
      }

      const handler = this.handlers.get(name);
      if (!handler) {
        console.error(`No handler for job: ${name}`);
        return;
      }

      if (!isOTELEnabled()) {
        try {
          // Increment attempts
          job.attempts++;
          await kv.set([this.prefix, 'jobs', job.id], job);

          // Execute handler
          await handler(job);

          // Mark as completed
          await kv.delete([this.prefix, 'jobs', job.id]);
          console.log(`Job completed: ${job.id} (${name})`);
        } catch (error) {
          console.error(`Job failed: ${job.id} (${name})`, error);

          job.error = (error as Error).message;
          job.failedAt = new Date();

          if (job.attempts < job.maxAttempts) {
            // Retry with exponential backoff
            const delay = Math.pow(2, job.attempts) * 1000;
            await kv.enqueue(
              { jobId: job.id, name },
              { delay, keysIfUndelivered: [[this.prefix, 'failed', job.id]] }
            );
            console.log(`Job retry scheduled: ${job.id} in ${delay}ms`);
          } else {
            // Move to failed jobs
            await kv.set([this.prefix, 'failed', job.id], job);
            await kv.delete([this.prefix, 'jobs', job.id]);
            console.log(`Job permanently failed: ${job.id}`);
          }
        }
        return;
      }

      // With OTEL instrumentation
      await withSpan(`job.process.${name}`, async (span) => {
        span?.setAttribute('job.id', job.id);
        span?.setAttribute('job.name', name);
        span?.setAttribute('job.queue', this.prefix);
        span?.setAttribute('job.attempt', job.attempts + 1);
        span?.setAttribute('job.max_attempts', job.maxAttempts);

        try {
          // Increment attempts
          job.attempts++;
          await kv.set([this.prefix, 'jobs', job.id], job);

          // Execute handler
          await handler(job);

          // Mark as completed
          await kv.delete([this.prefix, 'jobs', job.id]);
          console.log(`Job completed: ${job.id} (${name})`);

          span?.setAttribute('job.status', 'completed');
          span?.setStatus({ code: SpanStatusCode.OK });
        } catch (error) {
          console.error(`Job failed: ${job.id} (${name})`, error);

          job.error = (error as Error).message;
          job.failedAt = new Date();

          span?.recordException(error as Error);
          span?.setAttribute('job.status', 'failed');
          span?.setAttribute('job.error', (error as Error).message);

          if (job.attempts < job.maxAttempts) {
            // Retry with exponential backoff
            const delay = Math.pow(2, job.attempts) * 1000;
            await kv.enqueue(
              { jobId: job.id, name },
              { delay, keysIfUndelivered: [[this.prefix, 'failed', job.id]] }
            );
            console.log(`Job retry scheduled: ${job.id} in ${delay}ms`);

            span?.setAttribute('job.retry', true);
            span?.setAttribute('job.retry_delay_ms', delay);
            span?.setStatus({ code: SpanStatusCode.ERROR, message: 'Job failed, will retry' });
          } else {
            // Move to failed jobs
            await kv.set([this.prefix, 'failed', job.id], job);
            await kv.delete([this.prefix, 'jobs', job.id]);
            console.log(`Job permanently failed: ${job.id}`);

            span?.setAttribute('job.retry', false);
            span?.setStatus({ code: SpanStatusCode.ERROR, message: 'Job permanently failed' });
          }
        }
      }, { kind: SpanKind.CONSUMER });
    });
  }

  /**
   * Get failed jobs
   */
  async getFailedJobs(): Promise<Job[]> {
    const kv = await getKV();
    const entries = await kv.list<Job>([this.prefix, 'failed']);
    return entries.map(({ value }) => value);
  }

  /**
   * Retry a failed job
   */
  async retryFailed(jobId: string): Promise<void> {
    const kv = await getKV();
    const job = await kv.get<Job>([this.prefix, 'failed', jobId]);

    if (!job) {
      throw new Error(`Failed job not found: ${jobId}`);
    }

    // Reset attempts and re-enqueue
    job.attempts = 0;
    job.error = undefined;
    job.failedAt = undefined;

    await kv.set([this.prefix, 'jobs', job.id], job);
    await kv.delete([this.prefix, 'failed', job.id]);
    await kv.enqueue({ jobId: job.id, name: job.name });
  }

  /**
   * Clear all failed jobs
   */
  async clearFailed(): Promise<number> {
    const kv = await getKV();
    const entries = await kv.list([this.prefix, 'failed']);
    let count = 0;

    for (const entry of entries) {
      await kv.delete(entry.key);
      count++;
    }

    return count;
  }
}

// Default queue instance
let defaultQueue: JobQueue | null = null;

/**
 * Get the default job queue
 */
export function getJobQueue(): JobQueue {
  if (!defaultQueue) {
    defaultQueue = new JobQueue();
  }
  return defaultQueue;
}
