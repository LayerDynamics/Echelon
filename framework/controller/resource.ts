/**
 * Resource Controller
 *
 * Base controller for RESTful resource handling.
 * Provides standard CRUD operations.
 */

import { Controller } from './base.ts';

/**
 * Resource controller with standard CRUD operations
 */
export abstract class ResourceController<T = unknown> extends Controller {
  /**
   * GET /resources - List all resources
   */
  async index(): Promise<Response> {
    const items = await this.findAll();
    return this.json_response({ data: items });
  }

  /**
   * GET /resources/:id - Show a single resource
   */
  async show(): Promise<Response> {
    const id = this.requireParam('id');
    const item = await this.findById(id);

    if (!item) {
      return this.notFound();
    }

    return this.json_response({ data: item });
  }

  /**
   * POST /resources - Create a new resource
   */
  async create(): Promise<Response> {
    const data = await this.json<Partial<T>>();
    const item = await this.createResource(data);
    return this.response.status(201).json({ data: item });
  }

  /**
   * PUT/PATCH /resources/:id - Update a resource
   */
  async update(): Promise<Response> {
    const id = this.requireParam('id');
    const data = await this.json<Partial<T>>();
    const item = await this.updateResource(id, data);

    if (!item) {
      return this.notFound();
    }

    return this.json_response({ data: item });
  }

  /**
   * DELETE /resources/:id - Delete a resource
   */
  async destroy(): Promise<Response> {
    const id = this.requireParam('id');
    const deleted = await this.deleteResource(id);

    if (!deleted) {
      return this.notFound();
    }

    return this.response.noContent();
  }

  /**
   * Find all resources (to be implemented by subclass)
   */
  protected abstract findAll(): Promise<T[]>;

  /**
   * Find a resource by ID (to be implemented by subclass)
   */
  protected abstract findById(id: string): Promise<T | null>;

  /**
   * Create a new resource (to be implemented by subclass)
   */
  protected abstract createResource(data: Partial<T>): Promise<T>;

  /**
   * Update a resource (to be implemented by subclass)
   */
  protected abstract updateResource(id: string, data: Partial<T>): Promise<T | null>;

  /**
   * Delete a resource (to be implemented by subclass)
   */
  protected abstract deleteResource(id: string): Promise<boolean>;
}

/**
 * Register resource routes on a router
 */
export function resourceRoutes(
  router: { get: Function; post: Function; put: Function; patch: Function; delete: Function },
  path: string,
  controller: typeof ResourceController
): void {
  const prefix = path.endsWith('/') ? path.slice(0, -1) : path;

  router.get(`${prefix}`, createAction(controller, 'index'));
  router.get(`${prefix}/:id`, createAction(controller, 'show'));
  router.post(`${prefix}`, createAction(controller, 'create'));
  router.put(`${prefix}/:id`, createAction(controller, 'update'));
  router.patch(`${prefix}/:id`, createAction(controller, 'update'));
  router.delete(`${prefix}/:id`, createAction(controller, 'destroy'));
}

function createAction(
  ControllerClass: typeof ResourceController,
  method: string
) {
  return async (req: unknown, res: unknown): Promise<Response | void> => {
    const controller = new (ControllerClass as unknown as new () => ResourceController)();
    (controller as { setContext: Function }).setContext(req, res);
    const fn = (controller as unknown as Record<string, Function>)[method];
    return await fn.call(controller);
  };
}
