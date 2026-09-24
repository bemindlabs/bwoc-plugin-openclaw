// Contract test: every argv the adapter builds is one a real `bwoc` accepts.
//
// Each wrapper is called with every option set, against a stub that forwards
// the argv to the real CLI with `--help` appended. The CLI's parser still
// rejects an unknown subcommand or flag (non-zero exit), but nothing executes
// — so mutating verbs are checked safely, with no workspace.
//
// Runs only when BWOC_CONTRACT_BIN names the `bwoc` to check (CI installs the
// latest release); skipped otherwise.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REAL = process.env.BWOC_CONTRACT_BIN;

// BWOC_BIN is read when the modules load, so point it at the stub first.
let b;
let m;
if (REAL) {
  const dir = mkdtempSync(join(tmpdir(), 'bwoc-contract-'));
  const stub = join(dir, 'bwoc');
  const err = join(dir, 'stderr');
  writeFileSync(
    stub,
    `#!/bin/sh\n"${REAL}" "$@" --help >/dev/null 2>"${err}" || { cat "${err}" >&2; exit 2; }\n`,
  );
  chmodSync(stub, 0o755);
  process.env.BWOC_BIN = stub;
  process.env.BWOC_WORKSPACE = dir;
  b = await import('../src/bwoc.js');
  m = await import('../src/memory.js');
}

const calls = {
  list: () => b.bwocList({ status: 'active', backend: 'claude', running: true, namesOnly: true }),
  status: () => b.bwocStatus('agent-x'),
  'status --all': () => b.bwocStatus(null, { all: true }),
  send: () => b.bwocSend('agent-x', 'hi', { from: 'agent-y', replyTo: 'm1', noWakeup: true }),
  run: () => b.bwocRun('agent-x', 'do', { timeoutSec: 60 }),
  chat: () => b.bwocChat('agent-x', { tui: true, team: 't' }),
  'task add': () => b.bwocTask('add', { team: 't', title: 'T', deps: 'a,b' }),
  'task list': () => b.bwocTask('list', { team: 't' }),
  'task claim': () => b.bwocTask('claim', { team: 't', task: 't1', as: 'agent-x' }),
  'task complete': () => b.bwocTask('complete', { team: 't', task: 't1', as: 'agent-x' }),
  'team list': () => b.bwocTeam('list'),
  'team create': () => b.bwocTeam('create', { id: 't', members: 'a,b' }),
  'team retire': () => b.bwocTeam('retire', { id: 't' }),
  'memory list': () => b.bwocMemory('list'),
  'memory show': () => b.bwocMemory('show', { name: 'n' }),
  'memory show --all': () => b.bwocMemory('show', { all: true }),
  'memory search': () => b.bwocMemory('search', { query: 'q' }),
  'provider list': () => m.memoryList(),
  'provider show': () => m.memoryShow('n'),
  'provider search': () => m.memorySearch('q'),
  'provider put': () => m.memoryPut('n', 'c'),
};

for (const [name, call] of Object.entries(calls)) {
  test(`${name}: argv is accepted by bwoc`, { skip: !REAL && 'set BWOC_CONTRACT_BIN to run' }, async () => {
    const res = await call();
    assert.notEqual(res?.ok, false, `\`${name}\` built an argv bwoc rejects: ${res?.stderr ?? JSON.stringify(res)}`);
  });
}

test('a rejected argv fails (negative control)', { skip: !REAL && 'set BWOC_CONTRACT_BIN to run' }, async () => {
  const res = await b.bwocExec(['fleet', '--json']);
  assert.equal(res.ok, false);
});
