/**
 * Debugger Module Tests
 */

import { assertEquals, assertExists, assert } from 'jsr:@std/assert';
import {
  DebugLevel,
  DebugModule,
  DebugLevels,
  isLevelEnabled,
  parseDebugLevel,
  parseDebugModule,
  DEBUG_LEVEL_PRIORITY,
  DEBUG_LEVEL_NAMES,
} from '../../framework/debugger/levels.ts';
import {
  DebugOutput,
  Colors,
  Icons,
  colorize,
  getLevelColor,
  getLevelIcon,
  getModuleColor,
  getModuleIcon,
  getDebugOutput,
  createDebugOutput,
} from '../../framework/debugger/output.ts';
import {
  Debugger,
  getDebugger,
  createDebugger,
  debugLog,
  debugError,
} from '../../framework/debugger/debugger.ts';
import {
  BreakpointManager,
  getBreakpointManager,
  createBreakpointManager,
} from '../../framework/debugger/breakpoint.ts';
import {
  ReportGenerator,
  getReportGenerator,
  createReportGenerator,
} from '../../framework/debugger/report.ts';

// ============================================================================
// Debug Levels Tests
// ============================================================================

Deno.test('DebugLevel enum values', () => {
  assertEquals(DebugLevel.OFF, 0);
  assertEquals(DebugLevel.ERROR, 1);
  assertEquals(DebugLevel.WARN, 2);
  assertEquals(DebugLevel.INFO, 3);
  assertEquals(DebugLevel.DEBUG, 4);
  assertEquals(DebugLevel.TRACE, 5);
});

Deno.test('DebugModule enum values', () => {
  assertEquals(DebugModule.ALL, '*');
  assertEquals(DebugModule.HTTP, 'http');
  assertEquals(DebugModule.ROUTER, 'router');
  assertEquals(DebugModule.ORM, 'orm');
  assertEquals(DebugModule.AUTH, 'auth');
  assertEquals(DebugModule.CACHE, 'cache');
});

Deno.test('DEBUG_LEVEL_PRIORITY', () => {
  assertEquals(DEBUG_LEVEL_PRIORITY[DebugLevel.OFF], 0);
  assertEquals(DEBUG_LEVEL_PRIORITY[DebugLevel.ERROR], 1);
  assertEquals(DEBUG_LEVEL_PRIORITY[DebugLevel.TRACE], 5);
});

Deno.test('DEBUG_LEVEL_NAMES', () => {
  assertEquals(DEBUG_LEVEL_NAMES[DebugLevel.OFF], 'OFF');
  assertEquals(DEBUG_LEVEL_NAMES[DebugLevel.ERROR], 'ERROR');
  assertEquals(DEBUG_LEVEL_NAMES[DebugLevel.DEBUG], 'DEBUG');
});

Deno.test('isLevelEnabled', () => {
  // ERROR level should allow ERROR and below
  assert(isLevelEnabled(DebugLevel.ERROR, DebugLevel.ERROR));
  assert(!isLevelEnabled(DebugLevel.ERROR, DebugLevel.WARN));
  assert(!isLevelEnabled(DebugLevel.ERROR, DebugLevel.INFO));

  // DEBUG level should allow ERROR, WARN, INFO, DEBUG
  assert(isLevelEnabled(DebugLevel.DEBUG, DebugLevel.ERROR));
  assert(isLevelEnabled(DebugLevel.DEBUG, DebugLevel.WARN));
  assert(isLevelEnabled(DebugLevel.DEBUG, DebugLevel.INFO));
  assert(isLevelEnabled(DebugLevel.DEBUG, DebugLevel.DEBUG));
  assert(!isLevelEnabled(DebugLevel.DEBUG, DebugLevel.TRACE));
});

Deno.test('parseDebugLevel', () => {
  assertEquals(parseDebugLevel('OFF'), DebugLevel.OFF);
  assertEquals(parseDebugLevel('error'), DebugLevel.ERROR);
  assertEquals(parseDebugLevel('WARN'), DebugLevel.WARN);
  assertEquals(parseDebugLevel('Info'), DebugLevel.INFO);
  assertEquals(parseDebugLevel('debug'), DebugLevel.DEBUG);
  assertEquals(parseDebugLevel('TRACE'), DebugLevel.TRACE);
  assertEquals(parseDebugLevel('unknown'), DebugLevel.DEBUG); // default
});

Deno.test('parseDebugModule', () => {
  assertEquals(parseDebugModule('http'), DebugModule.HTTP);
  assertEquals(parseDebugModule('router'), DebugModule.ROUTER);
  assertEquals(parseDebugModule('orm'), DebugModule.ORM);
  assertEquals(parseDebugModule('unknown'), DebugModule.ALL); // default
});

// ============================================================================
// DebugLevels Class Tests
// ============================================================================

Deno.test('DebugLevels - constructor and defaults', () => {
  const levels = new DebugLevels();
  assertEquals(levels.getGlobalLevel(), DebugLevel.DEBUG);
});

Deno.test('DebugLevels - setLevel', () => {
  const levels = new DebugLevels();
  levels.setLevel(DebugLevel.ERROR);
  assertEquals(levels.getGlobalLevel(), DebugLevel.ERROR);
});

Deno.test('DebugLevels - setModuleLevel', () => {
  const levels = new DebugLevels({ globalLevel: DebugLevel.ERROR });
  levels.setModuleLevel(DebugModule.ORM, DebugLevel.TRACE);

  assertEquals(levels.getEffectiveLevel(DebugModule.HTTP), DebugLevel.ERROR);
  assertEquals(levels.getEffectiveLevel(DebugModule.ORM), DebugLevel.TRACE);
});

Deno.test('DebugLevels - shouldLog', () => {
  const levels = new DebugLevels({ globalLevel: DebugLevel.INFO });

  assert(levels.shouldLog(DebugModule.HTTP, DebugLevel.ERROR));
  assert(levels.shouldLog(DebugModule.HTTP, DebugLevel.INFO));
  assert(!levels.shouldLog(DebugModule.HTTP, DebugLevel.DEBUG));
  assert(!levels.shouldLog(DebugModule.HTTP, DebugLevel.TRACE));
});

Deno.test('DebugLevels - shouldLog with OFF', () => {
  const levels = new DebugLevels({ globalLevel: DebugLevel.OFF });
  assert(!levels.shouldLog(DebugModule.HTTP, DebugLevel.ERROR));
});

Deno.test('DebugLevels - clearModuleLevel', () => {
  const levels = new DebugLevels({ globalLevel: DebugLevel.ERROR });
  levels.setModuleLevel(DebugModule.ORM, DebugLevel.TRACE);
  levels.clearModuleLevel(DebugModule.ORM);

  assertEquals(levels.getEffectiveLevel(DebugModule.ORM), DebugLevel.ERROR);
});

Deno.test('DebugLevels - presets', () => {
  const httpOnly = DebugLevels.httpOnly();
  assertEquals(httpOnly.getGlobalLevel(), DebugLevel.OFF);
  assertEquals(httpOnly.getEffectiveLevel(DebugModule.HTTP), DebugLevel.TRACE);

  const ormOnly = DebugLevels.ormOnly();
  assertEquals(ormOnly.getEffectiveLevel(DebugModule.ORM), DebugLevel.TRACE);

  const errorsOnly = DebugLevels.errors();
  assertEquals(errorsOnly.getGlobalLevel(), DebugLevel.ERROR);

  const all = DebugLevels.all();
  assertEquals(all.getGlobalLevel(), DebugLevel.TRACE);
});

// ============================================================================
// Debug Output Tests
// ============================================================================

Deno.test('Colors constants', () => {
  assertEquals(Colors.reset, '\x1b[0m');
  assertEquals(Colors.red, '\x1b[31m');
  assertEquals(Colors.green, '\x1b[32m');
  assertEquals(Colors.bold, '\x1b[1m');
});

Deno.test('Icons constants', () => {
  assertExists(Icons.success);
  assertExists(Icons.error);
  assertExists(Icons.warning);
  assertExists(Icons.http);
  assertExists(Icons.router);
});

Deno.test('colorize', () => {
  const result = colorize('test', Colors.red);
  assertEquals(result, '\x1b[31mtest\x1b[0m');
});

Deno.test('getLevelColor', () => {
  assertEquals(getLevelColor(DebugLevel.ERROR), Colors.red);
  assertEquals(getLevelColor(DebugLevel.WARN), Colors.yellow);
  assertEquals(getLevelColor(DebugLevel.INFO), Colors.green);
  assertEquals(getLevelColor(DebugLevel.DEBUG), Colors.cyan);
});

Deno.test('getModuleColor', () => {
  assertEquals(getModuleColor(DebugModule.HTTP), Colors.brightCyan);
  assertEquals(getModuleColor(DebugModule.ROUTER), Colors.brightBlue);
  assertEquals(getModuleColor(DebugModule.AUTH), Colors.brightRed);
});

Deno.test('getLevelIcon', () => {
  assertEquals(getLevelIcon(DebugLevel.ERROR), Icons.error);
  assertEquals(getLevelIcon(DebugLevel.WARN), Icons.warning);
  assertEquals(getLevelIcon(DebugLevel.INFO), Icons.info);
});

Deno.test('getModuleIcon', () => {
  assertEquals(getModuleIcon(DebugModule.HTTP), Icons.http);
  assertEquals(getModuleIcon(DebugModule.ROUTER), Icons.router);
  assertEquals(getModuleIcon(DebugModule.CACHE), Icons.cache);
});

Deno.test('DebugOutput - constructor', () => {
  const output = new DebugOutput();
  assertExists(output);
});

Deno.test('DebugOutput - configure', () => {
  const output = new DebugOutput();
  output.configure({ useColors: false, useIcons: false });
  const options = output.getOptions();
  assertEquals(options.useColors, false);
  assertEquals(options.useIcons, false);
});

Deno.test('DebugOutput - truncate', () => {
  const output = new DebugOutput({ truncateAt: 10 });
  assertEquals(output.truncate('short'), 'short');
  assertEquals(output.truncate('this is a very long string'), 'this is...');
});

Deno.test('DebugOutput - formatTimestamp', () => {
  const output = new DebugOutput({ timestampFormat: 'iso' });
  const timestamp = output.formatTimestamp(new Date('2024-01-15T12:00:00Z'));
  assertEquals(timestamp, '2024-01-15T12:00:00.000Z');
});

Deno.test('DebugOutput - formatValue primitives', () => {
  const output = new DebugOutput({ useColors: false });

  assert(output.formatValue(null).includes('null'));
  assert(output.formatValue(undefined).includes('undefined'));
  assert(output.formatValue('test').includes('"test"'));
  assert(output.formatValue(42).includes('42'));
  assert(output.formatValue(true).includes('true'));
});

Deno.test('DebugOutput - formatValue objects', () => {
  const output = new DebugOutput({ useColors: false });

  const result = output.formatValue({ name: 'test', value: 123 });
  assert(result.includes('name'));
  assert(result.includes('test'));
  assert(result.includes('value'));
  assert(result.includes('123'));
});

Deno.test('DebugOutput - formatValue arrays', () => {
  const output = new DebugOutput({ useColors: false });

  const result = output.formatValue([1, 2, 3]);
  assert(result.includes('1'));
  assert(result.includes('2'));
  assert(result.includes('3'));
});

Deno.test('DebugOutput - formatDuration', () => {
  const output = new DebugOutput({ useColors: false });

  assert(output.formatDuration(0.5).includes('us'));
  assert(output.formatDuration(50).includes('ms'));
  assert(output.formatDuration(500).includes('ms'));
  assert(output.formatDuration(1500).includes('s'));
});

Deno.test('DebugOutput - formatBytes', () => {
  const output = new DebugOutput();

  assertEquals(output.formatBytes(500), '500B');
  assertEquals(output.formatBytes(2048), '2.0KB');
  assertEquals(output.formatBytes(2 * 1024 * 1024), '2.0MB');
});

Deno.test('DebugOutput - formatLogLine', () => {
  const output = new DebugOutput({ useColors: false, useIcons: false });
  const result = output.formatLogLine(DebugLevel.INFO, DebugModule.HTTP, 'Test message');

  assert(result.includes('INFO'));
  assert(result.includes('[http]'));
  assert(result.includes('Test message'));
});

Deno.test('getDebugOutput singleton', () => {
  const output1 = getDebugOutput();
  const output2 = getDebugOutput();
  assertEquals(output1, output2);
});

Deno.test('createDebugOutput factory', () => {
  const output1 = createDebugOutput();
  const output2 = createDebugOutput();
  assert(output1 !== output2);
});

// ============================================================================
// Debugger Tests
// ============================================================================

Deno.test('Debugger - constructor', () => {
  const dbg = new Debugger();
  assert(dbg.isEnabled());
});

Deno.test('Debugger - enable/disable', () => {
  const dbg = new Debugger();

  dbg.disable();
  assert(!dbg.isEnabled());

  dbg.enable();
  assert(dbg.isEnabled());
});

Deno.test('Debugger - setLevel', () => {
  const dbg = new Debugger();
  dbg.setLevel(DebugLevel.ERROR);
  assertEquals(dbg.getLevels().getGlobalLevel(), DebugLevel.ERROR);
});

Deno.test('Debugger - setModuleLevel', () => {
  const dbg = new Debugger();
  dbg.setModuleLevel(DebugModule.ORM, DebugLevel.TRACE);
  assertEquals(dbg.getLevels().getEffectiveLevel(DebugModule.ORM), DebugLevel.TRACE);
});

Deno.test('Debugger - listeners', () => {
  const dbg = new Debugger({ console: false });
  const events: unknown[] = [];

  const listener = (event: unknown) => events.push(event);

  dbg.addListener(listener);
  dbg.info(DebugModule.HTTP, 'Test message');

  assertEquals(events.length, 1);

  dbg.removeListener(listener);
  dbg.info(DebugModule.HTTP, 'Test message 2');

  assertEquals(events.length, 1);
});

Deno.test('Debugger - clearListeners', () => {
  const dbg = new Debugger({ console: false });
  const events: unknown[] = [];

  dbg.addListener(() => events.push(1));
  dbg.addListener(() => events.push(2));

  dbg.info(DebugModule.HTTP, 'Test');
  assertEquals(events.length, 2);

  dbg.clearListeners();
  dbg.info(DebugModule.HTTP, 'Test 2');
  assertEquals(events.length, 2);
});

Deno.test('Debugger - request tracking', () => {
  const dbg = new Debugger({ console: false, autoFlush: false });

  const ctx = dbg.startRequest('req-1', 'GET', '/test');
  assertEquals(ctx.id, 'req-1');
  assertEquals(ctx.method, 'GET');
  assertEquals(ctx.url, '/test');

  const endedCtx = dbg.endRequest('req-1', 200);
  assertExists(endedCtx);
  assertEquals(endedCtx.id, 'req-1');
});

Deno.test('Debugger - timing', () => {
  const dbg = new Debugger({ console: false });

  const timing = dbg.startTiming('test-op', DebugModule.ORM);
  assertExists(timing);
  assertEquals(timing.name, 'test-op');
  assertEquals(timing.module, DebugModule.ORM);

  const duration = dbg.endTiming(timing);
  assert(duration >= 0);
  assertExists(timing.duration);
});

Deno.test('Debugger - presets', () => {
  const dbg = new Debugger({ console: false });

  dbg.httpOnly();
  assertEquals(dbg.getLevels().getGlobalLevel(), DebugLevel.OFF);
  assertEquals(dbg.getLevels().getEffectiveLevel(DebugModule.HTTP), DebugLevel.TRACE);

  dbg.ormOnly();
  assertEquals(dbg.getLevels().getEffectiveLevel(DebugModule.ORM), DebugLevel.TRACE);

  dbg.errorsOnly();
  assertEquals(dbg.getLevels().getGlobalLevel(), DebugLevel.ERROR);

  dbg.all();
  assertEquals(dbg.getLevels().getGlobalLevel(), DebugLevel.TRACE);
});

Deno.test('Debugger - module helpers', () => {
  const dbg = new Debugger({ console: false });
  const events: unknown[] = [];
  dbg.addListener((e) => events.push(e));

  dbg.http(DebugLevel.INFO, 'HTTP test');
  dbg.router(DebugLevel.INFO, 'Router test');
  dbg.middleware(DebugLevel.INFO, 'Middleware test');
  dbg.controller(DebugLevel.INFO, 'Controller test');
  dbg.orm(DebugLevel.INFO, 'ORM test');
  dbg.auth(DebugLevel.INFO, 'Auth test');
  dbg.cache(DebugLevel.INFO, 'Cache test');

  assertEquals(events.length, 7);
});

Deno.test('Debugger - global events history', () => {
  const dbg = new Debugger({ console: false });

  dbg.info(DebugModule.HTTP, 'Test 1');
  dbg.info(DebugModule.HTTP, 'Test 2');
  dbg.info(DebugModule.HTTP, 'Test 3');

  const events = dbg.getGlobalEvents();
  assert(events.length >= 3);

  const limited = dbg.getGlobalEvents(2);
  assertEquals(limited.length, 2);
});

Deno.test('getDebugger singleton', () => {
  const dbg1 = getDebugger();
  const dbg2 = getDebugger();
  assertEquals(dbg1, dbg2);
});

Deno.test('createDebugger factory', () => {
  const dbg1 = createDebugger();
  const dbg2 = createDebugger();
  assert(dbg1 !== dbg2);
});

// ============================================================================
// Breakpoint Manager Tests
// ============================================================================

Deno.test('BreakpointManager - constructor', () => {
  const bp = new BreakpointManager();
  assertExists(bp);
});

Deno.test('BreakpointManager - add/remove', () => {
  const bp = new BreakpointManager();

  const id = bp.add({
    id: 'test-bp',
    name: 'Test Breakpoint',
    enabled: true,
    condition: () => true,
    action: 'log',
  });

  assertEquals(id, 'test-bp');
  assertEquals(bp.getAll().length, 1);

  bp.remove(id);
  assertEquals(bp.getAll().length, 0);
});

Deno.test('BreakpointManager - enable/disable', () => {
  const bp = new BreakpointManager();

  bp.add({
    id: 'test-bp',
    name: 'Test',
    enabled: true,
    condition: () => true,
    action: 'log',
  });

  bp.disable('test-bp');
  assertEquals(bp.get('test-bp')?.enabled, false);

  bp.enable('test-bp');
  assertEquals(bp.get('test-bp')?.enabled, true);

  bp.toggle('test-bp');
  assertEquals(bp.get('test-bp')?.enabled, false);
});

Deno.test('BreakpointManager - clear', () => {
  const bp = new BreakpointManager();

  bp.add({ id: 'bp-1', name: 'BP 1', enabled: true, condition: () => true, action: 'log' });
  bp.add({ id: 'bp-2', name: 'BP 2', enabled: true, condition: () => true, action: 'log' });

  assertEquals(bp.getAll().length, 2);

  bp.clear();
  assertEquals(bp.getAll().length, 0);
});

Deno.test('BreakpointManager - presets', () => {
  const bp = new BreakpointManager();

  bp.breakOnError();
  bp.breakOnModule(DebugModule.ORM);
  bp.breakOnPattern(/test/);
  bp.breakOnSlow(100);
  bp.breakOnAuthFailure();
  bp.breakOnCacheMiss();

  assertEquals(bp.getAll().length, 6);
});

Deno.test('BreakpointManager - pause/resume', () => {
  const bp = new BreakpointManager();

  assert(!bp.isPaused());

  // Note: We can't easily test the actual pause/resume behavior
  // since it involves promises, but we can verify the state methods
});

Deno.test('getBreakpointManager singleton', () => {
  const bp1 = getBreakpointManager();
  const bp2 = getBreakpointManager();
  assertEquals(bp1, bp2);
});

Deno.test('createBreakpointManager factory', () => {
  const bp1 = createBreakpointManager();
  const bp2 = createBreakpointManager();
  assert(bp1 !== bp2);
});

// ============================================================================
// Report Generator Tests
// ============================================================================

Deno.test('ReportGenerator - constructor', () => {
  const rpt = new ReportGenerator();
  assertExists(rpt);
});

Deno.test('ReportGenerator - generateRequestReport', () => {
  const rpt = new ReportGenerator();
  const ctx = {
    id: 'req-1',
    method: 'GET',
    url: '/test',
    startTime: Date.now() - 100,
    events: [],
    timings: [],
    metadata: new Map(),
  };

  const report = rpt.generateRequestReport(ctx, 200);

  assertEquals(report.id, 'req-1');
  assertEquals(report.method, 'GET');
  assertEquals(report.url, '/test');
  assertEquals(report.status, 200);
  assert(report.duration >= 0);
  assertExists(report.summary);
});

Deno.test('ReportGenerator - generatePerformanceReport', () => {
  const rpt = new ReportGenerator();

  // Generate some request reports first
  for (let i = 0; i < 5; i++) {
    rpt.generateRequestReport(
      {
        id: `req-${i}`,
        method: 'GET',
        url: `/test/${i}`,
        startTime: Date.now() - 100,
        events: [],
        timings: [],
        metadata: new Map(),
      },
      200,
    );
  }

  const perfReport = rpt.generatePerformanceReport();

  assertEquals(perfReport.totalRequests, 5);
  assert(perfReport.averageDuration >= 0);
  assertExists(perfReport.p50Duration);
  assertExists(perfReport.p95Duration);
  assertExists(perfReport.p99Duration);
});

Deno.test('ReportGenerator - history management', () => {
  const rpt = new ReportGenerator();

  rpt.generateRequestReport(
    { id: 'r1', method: 'GET', url: '/a', startTime: Date.now(), events: [], timings: [], metadata: new Map() },
    200,
  );
  rpt.generateRequestReport(
    { id: 'r2', method: 'POST', url: '/b', startTime: Date.now(), events: [], timings: [], metadata: new Map() },
    201,
  );
  rpt.generateRequestReport(
    { id: 'r3', method: 'GET', url: '/c', startTime: Date.now(), events: [], timings: [], metadata: new Map() },
    404,
  );

  assertEquals(rpt.getHistory().length, 3);
  assertEquals(rpt.getRecentRequests(2).length, 2);
  assertEquals(rpt.getErrorRequests().length, 1);

  rpt.clearHistory();
  assertEquals(rpt.getHistory().length, 0);
});

Deno.test('ReportGenerator - formatRequestReport', () => {
  const rpt = new ReportGenerator();
  const report = rpt.generateRequestReport(
    { id: 'r1', method: 'GET', url: '/test', startTime: Date.now(), events: [], timings: [], metadata: new Map() },
    200,
  );

  const formatted = rpt.formatRequestReport(report);
  assert(formatted.includes('GET'));
  assert(formatted.includes('/test'));
  assert(formatted.includes('200'));
});

Deno.test('ReportGenerator - export JSON', () => {
  const rpt = new ReportGenerator();
  rpt.generateRequestReport(
    { id: 'r1', method: 'GET', url: '/test', startTime: Date.now(), events: [], timings: [], metadata: new Map() },
    200,
  );

  const json = rpt.exportHistoryJson();
  const parsed = JSON.parse(json);
  assert(Array.isArray(parsed));
  assertEquals(parsed.length, 1);
});

Deno.test('getReportGenerator singleton', () => {
  const rpt1 = getReportGenerator();
  const rpt2 = getReportGenerator();
  assertEquals(rpt1, rpt2);
});

Deno.test('createReportGenerator factory', () => {
  const rpt1 = createReportGenerator();
  const rpt2 = createReportGenerator();
  assert(rpt1 !== rpt2);
});

// ============================================================================
// Integration Tests
// ============================================================================

Deno.test('Integration - debugger with breakpoints', async () => {
  const dbg = createDebugger({ console: false });
  const bp = createBreakpointManager();

  let breakpointHit = false;

  bp.add({
    id: 'test-bp',
    name: 'Test',
    enabled: true,
    modules: [DebugModule.HTTP],
    condition: (ctx) => ctx.message.includes('test'),
    action: 'callback',
  });

  bp.setCallback('test-bp', () => {
    breakpointHit = true;
  });

  // Manually check breakpoint
  await bp.check({
    module: DebugModule.HTTP,
    level: DebugLevel.INFO,
    message: 'This is a test message',
    timestamp: Date.now(),
  });

  assert(breakpointHit);
});

Deno.test('Integration - request lifecycle', () => {
  const dbg = createDebugger({ console: false, autoFlush: false });
  const rpt = createReportGenerator();

  // Start a request
  const ctx = dbg.startRequest('int-req-1', 'POST', '/api/users');

  // Add some events
  dbg.emit('route:match', DebugModule.ROUTER, DebugLevel.DEBUG, 'Matched /api/users', { requestId: 'int-req-1' });
  dbg.emit('controller:enter', DebugModule.CONTROLLER, DebugLevel.DEBUG, 'UserController#create', {
    requestId: 'int-req-1',
  });

  // End request
  const endedCtx = dbg.endRequest('int-req-1', 201);

  // Generate report
  if (endedCtx) {
    const report = rpt.generateRequestReport(endedCtx, 201);
    assertEquals(report.status, 201);
    assertEquals(report.method, 'POST');
  }
});

Deno.test('Integration - timing waterfall', () => {
  const dbg = createDebugger({ console: false });

  const ctx = dbg.startRequest('time-req', 'GET', '/slow');

  const timing1 = dbg.startTiming('middleware', DebugModule.MIDDLEWARE, 'time-req');
  dbg.endTiming(timing1);

  const timing2 = dbg.startTiming('database', DebugModule.ORM, 'time-req');
  dbg.endTiming(timing2);

  const timing3 = dbg.startTiming('render', DebugModule.VIEW, 'time-req');
  dbg.endTiming(timing3);

  const reqCtx = dbg.getRequestContext('time-req');
  assertExists(reqCtx);
  assertEquals(reqCtx.timings.length, 3);

  dbg.endRequest('time-req', 200);
});
