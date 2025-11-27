/**
 * Layer 8: Presentation Layer (View/Template)
 *
 * Transforms domain data into user-facing formats (HTML, JSON, XML).
 *
 * Responsibilities:
 * - Separate presentation from business logic
 * - Enable designer/developer collaboration
 * - Provide security (auto-escaping)
 * - Support template reuse and inheritance
 * - Manage static and media assets
 * - Enable internationalization
 */

export { TemplateEngine, type TemplateOptions, type TemplateContext } from './template.ts';
export { html, escape, raw } from './html.ts';
