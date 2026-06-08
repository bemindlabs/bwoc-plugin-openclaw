// BWOC memory-slot provider for OpenClaw.
//
// Bridges OpenClaw's single-active memory slot (`plugins.slots.memory`) onto the
// `bwoc memory` deep-memory surface. Every call shells out to the `bwoc` CLI via
// node:child_process execFile with an ARGUMENT ARRAY (never a shell string), so
// entry names / content cannot inject shell metacharacters. No business logic
// lives here — the framework owns memory semantics.
//
// Flags discovered from `bwoc memory <verb> --help` (bwoc 2.26.0):
//   list   : memory list   [--json] [--count] [--names-only] [--sort K] [--workspace P]
//   show   : memory show   [NAME] | --all [--json] [--workspace P]
//            (single-entry `show` prints PLAIN content — no --json)
//   search : memory search <QUERY> [--json] [--workspace P]
//   put    : memory put <NAME> [CONTENT] | --file F | stdin
//                          [--force] [--append] [--workspace P]   (no --json)
//
// JSON shapes observed:
//   list   --json → { count, entries:[...], total_bytes, workspace_memory_dir }
//   search --json → { query, hits:[...] }
//
// This module REUSES the env-var contract of src/bwoc.js (BWOC_BIN /
// BWOC_WORKSPACE) but keeps its own execFile so it stays a self-contained,
// importable bridge.

import { execFile } from 'node:child_process';

const BWOC_BIN = process.env.BWOC_BIN || 'bwoc';
const BWOC_WORKSPACE = process.env.BWOC_WORKSPACE || '';

/**
 * Run `bwoc <args...>` and resolve with a structured result.
 * Never throws on a non-zero exit — the caller inspects `ok`/`code`.
 *
 * @param {string[]} args            argument vector (no shell)
 * @param {object}   [opts]
 * @param {number}   [opts.timeoutMs] hard kill after N ms
 * @param {string}   [opts.input]     stdin payload (used by `put` via stdin)
 * @returns {Promise<{ok:boolean, stdout:string, stderr:string, code:number}>}
 */
function exec(args, opts = {}) {
  const { timeoutMs = 120_000, input } = opts;
  return new Promise((resolve) => {
    const child = execFile(
      BWOC_BIN,
      args,
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout, stderr) => {
        const code = err && typeof err.code === 'number' ? err.code : err ? 1 : 0;
        resolve({
          ok: code === 0,
          stdout: stdout ?? '',
          stderr: stderr ?? (err ? String(err.message ?? err) : ''),
          code,
        });
      }
    );
    if (typeof input === 'string') {
      child.stdin.end(input);
    }
  });
}

/** Append `--workspace <PATH>` when BWOC_WORKSPACE is configured. */
function withWorkspace(args) {
  return BWOC_WORKSPACE ? [...args, '--workspace', BWOC_WORKSPACE] : args;
}

/** Best-effort JSON parse; returns null on failure (caller keeps raw stdout). */
function tryParse(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function badArg(msg) {
  return { ok: false, stdout: '', stderr: `bwoc-plugin: ${msg}`, code: 2 };
}

/* ------------------------------------------------------------- bridge verbs */

/**
 * `bwoc memory list --json` — enumerate workspace memory entries.
 * @returns {Promise<{ok,stdout,stderr,code, json?:object}>} with parsed `json`
 *   ({ count, entries, total_bytes, workspace_memory_dir }) when available.
 */
export async function memoryList() {
  const res = await exec(withWorkspace(['memory', 'list', '--json']));
  const json = res.ok ? tryParse(res.stdout) : null;
  return json ? { ...res, json } : res;
}

/**
 * `bwoc memory show <NAME>` — fetch a single entry's body.
 * Single-entry `show` emits PLAIN content (no `--json`), so `stdout` is the body.
 * @param {string} name  entry name (with or without `.md`)
 */
export function memoryShow(name) {
  if (!name || typeof name !== 'string')
    return Promise.resolve(badArg('memoryShow requires a name'));
  return exec(withWorkspace(['memory', 'show', name]));
}

/**
 * `bwoc memory search <QUERY> --json` — case-insensitive substring search.
 * @param {string} query  substring to look for
 * @returns {Promise<{ok,stdout,stderr,code, json?:{query,hits}}>}
 */
export async function memorySearch(query) {
  if (!query || typeof query !== 'string')
    return Promise.resolve(badArg('memorySearch requires a query'));
  const res = await exec(withWorkspace(['memory', 'search', query, '--json']));
  const json = res.ok ? tryParse(res.stdout) : null;
  return json ? { ...res, json } : res;
}

/**
 * `bwoc memory put <NAME>` — write/overwrite an entry. Content is passed via
 * stdin (no shell, no temp file) and `--force` lets it overwrite an existing
 * entry, which is the natural upsert semantics for a memory slot's write path.
 * @param {string} name     entry name (with or without `.md`)
 * @param {string} content  entry body
 */
export function memoryPut(name, content) {
  if (!name || typeof name !== 'string')
    return Promise.resolve(badArg('memoryPut requires a name'));
  if (typeof content !== 'string')
    return Promise.resolve(badArg('memoryPut requires string content'));
  // Stdin source (precedence: inline > --file > stdin). We omit the inline
  // CONTENT arg and `--file` so the CLI reads our piped body.
  return exec(withWorkspace(['memory', 'put', name, '--force']), { input: content });
}

/* ----------------------------------------------------- OpenClaw descriptor */

// OpenClaw memory-slot provider descriptor.
//
// TODO(openclaw-api): confirm the EXACT field/method names the memory slot
// contract expects against https://docs.openclaw.ai/tools/plugin . The docs
// confirm a `memory` capability slot (`plugins.slots.memory`) but do not pin
// the provider shape. We expose a small, conventional read/write surface plus
// list/search; whichever names the host calls, the underlying bwoc bridge above
// is the real implementation. Adjust the keys here once the contract is pinned.
export const bwocMemoryProvider = {
  id: 'bwoc',
  slot: 'memory',

  /** Read one entry by key → its body (string), or null when missing/error. */
  async read(name) {
    const res = await memoryShow(name);
    return res.ok ? res.stdout : null;
  },

  /** Write/upsert one entry. Returns the raw bwoc result. */
  async write(name, content) {
    return memoryPut(name, content);
  },

  /** List entry names. Returns string[] (empty on error). */
  async list() {
    const res = await memoryList();
    const entries = res.json?.entries;
    if (!Array.isArray(entries)) return [];
    // entries may be strings or objects with a name-ish field — normalize.
    return entries.map((e) =>
      typeof e === 'string' ? e : (e?.name ?? e?.entry ?? e?.file ?? String(e))
    );
  },

  /** Search entries for a substring. Returns the parsed hits array (or []). */
  async search(query) {
    const res = await memorySearch(query);
    return Array.isArray(res.json?.hits) ? res.json.hits : [];
  },
};

export default bwocMemoryProvider;
