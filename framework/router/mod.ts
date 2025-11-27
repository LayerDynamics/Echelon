/**
 * Layer 3: Routing Layer
 *
 * Maps incoming request URLs to application code.
 * Supports pattern matching, path parameters, and method binding.
 *
 * Responsibilities:
 * - Map URLs to handlers efficiently
 * - Extract structured data from URLs
 * - Enable clean, RESTful URL design
 * - Support URL generation/reversing
 * - Provide extension points for custom routing logic
 */

export { Router, type RouteDefinition, type RouteMatch } from './router.ts';
export { URLPatternMatcher, type PatternParams } from './patterns.ts';
export { RouteGroup } from './group.ts';

// Aliases for compatibility
export { URLPatternMatcher as RoutePattern } from './patterns.ts';
export type { RouteDefinition as Route } from './router.ts';
