/**
 * Security Tests
 */

import { assertEquals } from 'jsr:@std/assert';
import {
  escapeHtml,
  unescapeHtml,
  stripTags,
  sanitizeHtml,
  sanitizeUrl,
  sanitizeFilename,
  escapeRegex,
} from '../../framework/security/sanitize.ts';

Deno.test('escapeHtml - escapes special characters', () => {
  assertEquals(escapeHtml('<script>'), '&lt;script&gt;');
  assertEquals(escapeHtml('"test"'), '&quot;test&quot;');
  assertEquals(escapeHtml("'test'"), '&#x27;test&#x27;');
  assertEquals(escapeHtml('a & b'), 'a &amp; b');
});

Deno.test('escapeHtml - handles empty string', () => {
  assertEquals(escapeHtml(''), '');
});

Deno.test('escapeHtml - handles normal text', () => {
  assertEquals(escapeHtml('Hello World'), 'Hello World');
});

Deno.test('unescapeHtml - unescapes entities', () => {
  assertEquals(unescapeHtml('&lt;script&gt;'), '<script>');
  assertEquals(unescapeHtml('&quot;test&quot;'), '"test"');
  assertEquals(unescapeHtml('a &amp; b'), 'a & b');
});

Deno.test('stripTags - removes all HTML tags', () => {
  assertEquals(stripTags('<p>Hello</p>'), 'Hello');
  assertEquals(stripTags('<div><span>Nested</span></div>'), 'Nested');
  assertEquals(stripTags('<script>alert("xss")</script>'), 'alert("xss")');
});

Deno.test('stripTags - handles self-closing tags', () => {
  assertEquals(stripTags('Line1<br/>Line2'), 'Line1Line2');
  assertEquals(stripTags('<img src="test.jpg" />'), '');
});

Deno.test('sanitizeHtml - removes dangerous tags', () => {
  const result = sanitizeHtml('<p>Safe</p><script>alert("xss")</script>');
  assertEquals(result.includes('<script>'), false);
  assertEquals(result.includes('Safe'), true);
});

Deno.test('sanitizeHtml - removes event handlers', () => {
  const result = sanitizeHtml('<div onclick="alert(1)">Test</div>');
  assertEquals(result.includes('onclick'), false);
});

Deno.test('sanitizeHtml - removes javascript: URLs', () => {
  const result = sanitizeHtml('<a href="javascript:alert(1)">Click</a>');
  assertEquals(result.includes('javascript:'), false);
});

Deno.test('sanitizeUrl - allows valid URLs', () => {
  assertEquals(sanitizeUrl('https://example.com'), 'https://example.com/');
  assertEquals(sanitizeUrl('http://example.com/path'), 'http://example.com/path');
});

Deno.test('sanitizeUrl - blocks dangerous protocols', () => {
  assertEquals(sanitizeUrl('javascript:alert(1)'), '');
  assertEquals(sanitizeUrl('data:text/html,<script>'), '');
});

Deno.test('sanitizeUrl - returns empty for invalid URLs', () => {
  assertEquals(sanitizeUrl('not a url'), '');
  assertEquals(sanitizeUrl(''), '');
});

Deno.test('sanitizeFilename - removes path traversal', () => {
  assertEquals(sanitizeFilename('../../../etc/passwd'), 'etcpasswd');
  assertEquals(sanitizeFilename('file/../secret.txt'), 'filesecret.txt');
});

Deno.test('sanitizeFilename - removes path separators', () => {
  assertEquals(sanitizeFilename('path/to/file.txt'), 'pathtofile.txt');
  assertEquals(sanitizeFilename('path\\to\\file.txt'), 'pathtofile.txt');
});

Deno.test('sanitizeFilename - handles normal filenames', () => {
  assertEquals(sanitizeFilename('document.pdf'), 'document.pdf');
  assertEquals(sanitizeFilename('my-file_2024.txt'), 'my-file_2024.txt');
});

Deno.test('escapeRegex - escapes regex special characters', () => {
  assertEquals(escapeRegex('test.txt'), 'test\\.txt');
  assertEquals(escapeRegex('a*b+c?'), 'a\\*b\\+c\\?');
  assertEquals(escapeRegex('[a-z]'), '\\[a-z\\]');
  assertEquals(escapeRegex('a|b'), 'a\\|b');
});

Deno.test('escapeRegex - handles normal text', () => {
  assertEquals(escapeRegex('hello'), 'hello');
  assertEquals(escapeRegex('test123'), 'test123');
});
