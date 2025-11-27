/**
 * View Tests
 *
 * Tests for HTML utilities and safe HTML generation.
 */

import { assertEquals, assert } from 'jsr:@std/assert';
import {
  SafeHtml,
  escape,
  raw,
  html,
  createElement,
  fragment,
  when,
  each,
} from '../../framework/view/html.ts';

// SafeHtml tests

Deno.test('SafeHtml - stores content', () => {
  const safe = new SafeHtml('<div>Hello</div>');
  assertEquals(safe.content, '<div>Hello</div>');
});

Deno.test('SafeHtml - toString returns content', () => {
  const safe = new SafeHtml('<span>Test</span>');
  assertEquals(safe.toString(), '<span>Test</span>');
});

// escape tests

Deno.test('escape - escapes ampersand', () => {
  assertEquals(escape('Tom & Jerry'), 'Tom &amp; Jerry');
});

Deno.test('escape - escapes less than', () => {
  assertEquals(escape('a < b'), 'a &lt; b');
});

Deno.test('escape - escapes greater than', () => {
  assertEquals(escape('a > b'), 'a &gt; b');
});

Deno.test('escape - escapes double quotes', () => {
  assertEquals(escape('say "hello"'), 'say &quot;hello&quot;');
});

Deno.test('escape - escapes single quotes', () => {
  assertEquals(escape("it's fine"), 'it&#39;s fine');
});

Deno.test('escape - escapes multiple characters', () => {
  assertEquals(escape('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
});

Deno.test('escape - does not escape SafeHtml', () => {
  const safe = new SafeHtml('<b>bold</b>');
  assertEquals(escape(safe), '<b>bold</b>');
});

Deno.test('escape - handles null and undefined', () => {
  assertEquals(escape(null), '');
  assertEquals(escape(undefined), '');
});

Deno.test('escape - converts numbers to string', () => {
  assertEquals(escape(42), '42');
});

// raw tests

Deno.test('raw - creates SafeHtml instance', () => {
  const result = raw('<div>Trusted</div>');
  assert(result instanceof SafeHtml);
  assertEquals(result.content, '<div>Trusted</div>');
});

// html tagged template tests

Deno.test('html - creates SafeHtml from template', () => {
  const result = html`<div>Hello</div>`;
  assert(result instanceof SafeHtml);
  assertEquals(result.content, '<div>Hello</div>');
});

Deno.test('html - escapes interpolated values', () => {
  const userInput = '<script>alert("xss")</script>';
  const result = html`<div>${userInput}</div>`;
  assertEquals(result.content, '<div>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</div>');
});

Deno.test('html - does not escape SafeHtml values', () => {
  const trusted = raw('<b>bold</b>');
  const result = html`<div>${trusted}</div>`;
  assertEquals(result.content, '<div><b>bold</b></div>');
});

Deno.test('html - handles multiple interpolations', () => {
  const name = 'Alice';
  const age = 30;
  const result = html`<p>Name: ${name}, Age: ${age}</p>`;
  assertEquals(result.content, '<p>Name: Alice, Age: 30</p>');
});

Deno.test('html - handles nested html calls', () => {
  const inner = html`<span>nested</span>`;
  const result = html`<div>${inner}</div>`;
  assertEquals(result.content, '<div><span>nested</span></div>');
});

// createElement tests

Deno.test('createElement - creates element with no attributes', () => {
  const result = createElement('div');
  assertEquals(result.content, '<div></div>');
});

Deno.test('createElement - creates element with attributes', () => {
  const result = createElement('a', { href: '/test', target: '_blank' });
  assertEquals(result.content, '<a href="/test" target="_blank"></a>');
});

Deno.test('createElement - handles boolean true attributes', () => {
  const result = createElement('input', { disabled: true, type: 'text' });
  assert(result.content.includes('disabled'));
  assert(result.content.includes('type="text"'));
});

Deno.test('createElement - omits false/null/undefined attributes', () => {
  const result = createElement('input', { disabled: false, placeholder: null, value: undefined });
  assertEquals(result.content, '<input />');
});

Deno.test('createElement - creates element with children', () => {
  const result = createElement('div', {}, ['Hello', ' ', 'World']);
  assertEquals(result.content, '<div>Hello World</div>');
});

Deno.test('createElement - escapes child strings', () => {
  const result = createElement('div', {}, ['<script>bad</script>']);
  assertEquals(result.content, '<div>&lt;script&gt;bad&lt;/script&gt;</div>');
});

Deno.test('createElement - does not escape SafeHtml children', () => {
  const child = raw('<b>bold</b>');
  const result = createElement('div', {}, [child]);
  assertEquals(result.content, '<div><b>bold</b></div>');
});

Deno.test('createElement - creates self-closing tags', () => {
  const img = createElement('img', { src: '/test.jpg', alt: 'Test' });
  assertEquals(img.content, '<img src="/test.jpg" alt="Test" />');
});

Deno.test('createElement - handles br as self-closing', () => {
  const br = createElement('br');
  assertEquals(br.content, '<br />');
});

Deno.test('createElement - handles input as self-closing', () => {
  const input = createElement('input', { type: 'text' });
  assertEquals(input.content, '<input type="text" />');
});

Deno.test('createElement - escapes attribute values', () => {
  const result = createElement('div', { 'data-value': '"test"' });
  assertEquals(result.content, '<div data-value="&quot;test&quot;"></div>');
});

// fragment tests

Deno.test('fragment - combines multiple strings', () => {
  const result = fragment('Hello', ' ', 'World');
  assertEquals(result.content, 'Hello World');
});

Deno.test('fragment - escapes string children', () => {
  const result = fragment('<b>', 'text', '</b>');
  assertEquals(result.content, '&lt;b&gt;text&lt;/b&gt;');
});

Deno.test('fragment - does not escape SafeHtml children', () => {
  const result = fragment(raw('<b>'), 'text', raw('</b>'));
  assertEquals(result.content, '<b>text</b>');
});

Deno.test('fragment - handles empty fragment', () => {
  const result = fragment();
  assertEquals(result.content, '');
});

// when tests

Deno.test('when - returns content when condition is true', () => {
  const result = when(true, 'Visible');
  assertEquals(result.content, 'Visible');
});

Deno.test('when - returns empty when condition is false', () => {
  const result = when(false, 'Hidden');
  assertEquals(result.content, '');
});

Deno.test('when - handles SafeHtml content', () => {
  const content = raw('<b>Bold</b>');
  const result = when(true, content);
  assertEquals(result.content, '<b>Bold</b>');
});

Deno.test('when - escapes string content', () => {
  const result = when(true, '<script>');
  assertEquals(result.content, '&lt;script&gt;');
});

// each tests

Deno.test('each - maps over array', () => {
  const items = ['a', 'b', 'c'];
  const result = each(items, (item) => html`<li>${item}</li>`);
  assertEquals(result.content, '<li>a</li><li>b</li><li>c</li>');
});

Deno.test('each - provides index', () => {
  const items = ['x', 'y'];
  const result = each(items, (item, index) => html`<li>${index}: ${item}</li>`);
  assertEquals(result.content, '<li>0: x</li><li>1: y</li>');
});

Deno.test('each - handles empty array', () => {
  const result = each([], (item) => html`<li>${item}</li>`);
  assertEquals(result.content, '');
});

Deno.test('each - escapes string returns', () => {
  const items = ['<b>'];
  const result = each(items, (item) => item);
  assertEquals(result.content, '&lt;b&gt;');
});

Deno.test('each - does not escape SafeHtml returns', () => {
  const items = ['bold'];
  const result = each(items, (item) => raw(`<b>${item}</b>`));
  assertEquals(result.content, '<b>bold</b>');
});
