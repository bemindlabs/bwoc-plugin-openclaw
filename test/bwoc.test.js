// Exercises the real `bwoc list` via the exec helper. Read-only — never runs a
// mutating verb against the live fleet.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bwocList } from '../src/bwoc.js';
import { tools, toolsByName } from '../src/tools.js';
import * as plugin from '../src/index.js';

test('bwocList() returns ok with non-empty stdout', async () => {
  const res = await bwocList({ json: true });
  assert.equal(res.ok, true, `expected ok; got code ${res.code}, stderr: ${res.stderr}`);
  assert.equal(res.code, 0);
  assert.ok(res.stdout.trim().length > 0, 'stdout should be non-empty');
});

test('bwocList() emits parseable JSON with an agents array', async () => {
  const res = await bwocList({ json: true });
  assert.equal(res.ok, true);
  const data = JSON.parse(res.stdout);
  assert.ok(Array.isArray(data.agents), 'expected { agents: [...] }');
  assert.ok(data.agents.length > 0, 'fleet should be non-empty');
});

test('tool descriptors are well-formed and complete', () => {
  const expected = [
    'bwoc_list',
    'bwoc_status',
    'bwoc_send',
    'bwoc_run',
    'bwoc_task',
    'bwoc_team',
    'bwoc_memory',
  ];
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    [...expected].sort()
  );
  for (const t of tools) {
    assert.equal(typeof t.description, 'string');
    assert.equal(typeof t.handler, 'function');
    assert.equal(t.parameters.type, 'object');
    assert.ok(toolsByName[t.name] === t);
  }
});

test('register(api) wires tools through a mock host API', () => {
  const calls = [];
  const events = {};
  const memories = [];
  const mockApi = {
    registerTool: (tool) => calls.push(tool.name),
    registerMemory: (provider) => memories.push(provider),
    on: (ev, fn) => {
      events[ev] = fn;
    },
    log: () => {},
  };
  const result = plugin.register(mockApi);
  assert.equal(calls.length, tools.length, 'all tools should register');
  assert.equal(memories.length, 1, 'the memory provider should register');
  assert.equal(memories[0].slot, 'memory');
  assert.ok('ready' in events, 'a lifecycle hook should be subscribed');
  assert.equal(result.id, 'bwoc');
});
