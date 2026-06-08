// Exercises the BWOC memory-slot bridge. Read-only — only ever runs
// `bwoc memory list` / `search` against the live workspace; NEVER a mutating
// `put`/`rm`. Mutating paths (memoryPut / provider.write) are validated through
// argument-guard assertions only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  memoryList,
  memorySearch,
  memoryShow,
  memoryPut,
  bwocMemoryProvider,
} from '../src/memory.js';

test('memoryList() returns ok and a parseable list shape', async () => {
  const res = await memoryList();
  assert.equal(res.ok, true, `expected ok; got code ${res.code}, stderr: ${res.stderr}`);
  assert.equal(res.code, 0);
  // `--json` shape: { count, entries:[...], total_bytes, workspace_memory_dir }
  assert.ok(res.json && typeof res.json === 'object', 'expected parsed json');
  assert.equal(typeof res.json.count, 'number');
  assert.ok(Array.isArray(res.json.entries), 'expected { entries: [...] }');
});

test('memorySearch() returns ok with a hits array', async () => {
  // A query that is read-only and safe regardless of workspace contents.
  const res = await memorySearch('bwoc');
  assert.equal(res.ok, true, `expected ok; got code ${res.code}, stderr: ${res.stderr}`);
  assert.ok(res.json && Array.isArray(res.json.hits), 'expected { hits: [...] }');
});

test('bwocMemoryProvider exposes read/write/list/search', () => {
  assert.equal(typeof bwocMemoryProvider.read, 'function');
  assert.equal(typeof bwocMemoryProvider.write, 'function');
  assert.equal(typeof bwocMemoryProvider.list, 'function');
  assert.equal(typeof bwocMemoryProvider.search, 'function');
  assert.equal(bwocMemoryProvider.slot, 'memory');
});

test('provider.list() returns a string array', async () => {
  const names = await bwocMemoryProvider.list();
  assert.ok(Array.isArray(names), 'list() should return an array');
  for (const n of names) assert.equal(typeof n, 'string');
});

test('argument guards reject bad input without shelling out', async () => {
  const noName = await memoryShow('');
  assert.equal(noName.ok, false);
  assert.equal(noName.code, 2);

  const noQuery = await memorySearch('');
  assert.equal(noQuery.ok, false);
  assert.equal(noQuery.code, 2);

  // memoryPut guards — these return synchronously without invoking bwoc.
  const putNoName = await memoryPut('', 'body');
  assert.equal(putNoName.ok, false);
  assert.equal(putNoName.code, 2);

  const putNoContent = await memoryPut('name', 42);
  assert.equal(putNoContent.ok, false);
  assert.equal(putNoContent.code, 2);
});
