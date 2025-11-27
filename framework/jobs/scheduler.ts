/**
 * Job Scheduler
 *
 * Cron-based job scheduling using Deno.cron.
 */

import { getJobQueue, type JobOptions } from './queue.ts';

export interface CronSchedule {
  minute?: string;
  hour?: string;
  dayOfMonth?: string;
  month?: string;
  dayOfWeek?: string;
}

export interface ScheduledJob {
  name: string;
  schedule: string | CronSchedule;
  handler: () => Promise<void> | void;
  options?: JobOptions;
}

/**
 * Job scheduler
 */
export class Scheduler {
  private jobs: ScheduledJob[] = [];

  /**
   * Add a scheduled job
   */
  schedule(
    name: string,
    schedule: string | CronSchedule,
    handler: () => Promise<void> | void,
    options?: JobOptions
  ): this {
    this.jobs.push({ name, schedule, handler, options });
    return this;
  }

  /**
   * Schedule a job to run every N minutes
   */
  everyMinutes(
    name: string,
    minutes: number,
    handler: () => Promise<void> | void
  ): this {
    return this.schedule(name, `*/${minutes} * * * *`, handler);
  }

  /**
   * Schedule a job to run every N hours
   */
  everyHours(
    name: string,
    hours: number,
    handler: () => Promise<void> | void
  ): this {
    return this.schedule(name, `0 */${hours} * * *`, handler);
  }

  /**
   * Schedule a daily job
   */
  daily(
    name: string,
    hour: number,
    minute: number,
    handler: () => Promise<void> | void
  ): this {
    return this.schedule(name, `${minute} ${hour} * * *`, handler);
  }

  /**
   * Schedule a weekly job
   */
  weekly(
    name: string,
    dayOfWeek: number,
    hour: number,
    minute: number,
    handler: () => Promise<void> | void
  ): this {
    return this.schedule(name, `${minute} ${hour} * * ${dayOfWeek}`, handler);
  }

  /**
   * Schedule a monthly job
   */
  monthly(
    name: string,
    dayOfMonth: number,
    hour: number,
    minute: number,
    handler: () => Promise<void> | void
  ): this {
    return this.schedule(name, `${minute} ${hour} ${dayOfMonth} * *`, handler);
  }

  /**
   * Start all scheduled jobs
   */
  start(): void {
    for (const job of this.jobs) {
      const schedule = typeof job.schedule === 'string'
        ? job.schedule
        : this.buildCronString(job.schedule);

      // Use Deno.cron for scheduling
      Deno.cron(job.name, schedule, async () => {
        console.log(`Running scheduled job: ${job.name}`);
        try {
          await job.handler();
          console.log(`Scheduled job completed: ${job.name}`);
        } catch (error) {
          console.error(`Scheduled job failed: ${job.name}`, error);
        }
      });

      console.log(`Scheduled: ${job.name} (${schedule})`);
    }
  }

  /**
   * Build cron string from schedule object
   */
  private buildCronString(schedule: CronSchedule): string {
    return [
      schedule.minute ?? '*',
      schedule.hour ?? '*',
      schedule.dayOfMonth ?? '*',
      schedule.month ?? '*',
      schedule.dayOfWeek ?? '*',
    ].join(' ');
  }

  /**
   * Get all scheduled jobs
   */
  getJobs(): ScheduledJob[] {
    return [...this.jobs];
  }
}

// Default scheduler instance
let defaultScheduler: Scheduler | null = null;

/**
 * Get the default scheduler
 */
export function getScheduler(): Scheduler {
  if (!defaultScheduler) {
    defaultScheduler = new Scheduler();
  }
  return defaultScheduler;
}
