// Thin exec helper over the `bwoc` CLI.
//
// Every call shells out to `bwoc` via node:child_process execFile with an
// ARGUMENT ARRAY (never a shell string) so user-supplied agent names / messages
// cannot inject shell metacharacters. No business logic lives here — flags are
// passed straight through to the framework CLI.
//
// Flags were discovered from `bwoc <verb> --help` (bwoc 2.26.0):
//   list     : [--json] [--status S] [--backend B] [--running] [--names-only] ...
//   status   : status [NAME] [--all] [--json] [--banner]
//   send     : send <TO> <MESSAGE> [--from F] [--reply-to ID] [--no-wakeup]
//   run      : run <AGENT> --task <TASK> [--json] [--timeout N]
//   chat     : chat <NAME>  (interactive — exposed but not auto-run)
//   task     : task add|list|claim|complete <TEAM> ... [--as A] [--deps ...] [--json]
//   team     : team create|list|retire <ID> [--members a,b] [--json]
//   memory   : memory list|show|search [--all] [--json] <NAME|QUERY>

import { execFile } from 'node:child_process';

const BWOC_BIN = process.env.BWOC_BIN || 'bwoc';

// Optional: pin a workspace root so the plugin works regardless of the host's
// cwd. When set, it is appended as `--workspace <PATH>` to every verb that
// accepts it.
const BWOC_WORKSPACE = process.env.BWOC_WORKSPACE || '';

/**
 * Run `bwoc <args...>` and resolve with a structured result.
 * Never throws on a non-zero exit — the caller inspects `ok`/`code`.
 *
 * @param {string[]} args  argument vector (no shell)
 * @param {object}   [opts]
 * @param {number}   [opts.timeoutMs]  hard kill after N ms
 * @returns {Promise<{ok:boolean, stdout:string, stderr:string, code:number}>}
 */
export function bwocExec(args, opts = {}) {
  const { timeoutMs = 120_000 } = opts;
  return new Promise((resolve) => {
    execFile(
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
  });
}

// Append `--workspace <PATH>` when configured (verbs that accept it ignore it
// harmlessly otherwise — but we only attach it where the CLI supports it).
function withWorkspace(args) {
  return BWOC_WORKSPACE ? [...args, '--workspace', BWOC_WORKSPACE] : args;
}

/* ------------------------------------------------------------------ verbs */

/** `bwoc list` — list registered agents. */
export function bwocList({ json = true, status, backend, running, namesOnly } = {}) {
  const args = ['list'];
  if (json) args.push('--json');
  if (status) args.push('--status', status);
  if (backend) args.push('--backend', backend);
  if (running) args.push('--running');
  if (namesOnly) args.push('--names-only');
  return bwocExec(withWorkspace(args));
}

/** `bwoc status [NAME]` — per-agent health snapshot (read-only). */
export function bwocStatus(agent, { json = true, all = false } = {}) {
  const args = ['status'];
  if (all) args.push('--all');
  else if (agent) args.push(agent);
  if (json) args.push('--json');
  return bwocExec(withWorkspace(args));
}

/** `bwoc send <TO> <MESSAGE>` — append a message to an agent's inbox. */
export function bwocSend(agent, message, { from, replyTo, noWakeup = false } = {}) {
  if (!agent) return Promise.resolve(badArg('send requires an agent'));
  if (typeof message !== 'string' || message.length === 0)
    return Promise.resolve(badArg('send requires a non-empty message'));
  const args = ['send', agent, message];
  if (from) args.push('--from', from);
  if (replyTo) args.push('--reply-to', replyTo);
  if (noWakeup) args.push('--no-wakeup');
  return bwocExec(withWorkspace(args));
}

/** `bwoc run <AGENT> --task <TASK>` — headless single-task run. */
export function bwocRun(agent, task, { json = true, timeoutSec } = {}) {
  if (!agent) return Promise.resolve(badArg('run requires an agent'));
  if (typeof task !== 'string' || task.length === 0)
    return Promise.resolve(badArg('run requires a --task prompt'));
  const args = ['run', agent, '--task', task];
  if (json) args.push('--json');
  if (timeoutSec) args.push('--timeout', String(timeoutSec));
  // Generous client-side timeout so a long agent run isn't killed by execFile
  // before the CLI's own --timeout fires.
  const timeoutMs = timeoutSec ? (timeoutSec + 30) * 1000 : 600_000;
  return bwocExec(withWorkspace(args), { timeoutMs });
}

/**
 * `bwoc chat <NAME>` — interactive backend chat. Exposed for completeness but
 * interactive by nature; returns an error if invoked in a non-TTY tool context
 * is left to the CLI. Callers should prefer `bwocRun` for headless work.
 */
export function bwocChat(agent, { team, tui = false } = {}) {
  if (!agent) return Promise.resolve(badArg('chat requires an agent'));
  const args = ['chat', agent];
  if (tui) args.push('--tui');
  if (team) args.push('--team', team);
  return bwocExec(withWorkspace(args));
}

/**
 * `bwoc task <op> ...` — shared team task list.
 * ops: add | list | claim | complete
 */
export function bwocTask(op, params = {}) {
  const { team, title, task, as, deps, json = true } = params;
  switch (op) {
    case 'add': {
      if (!team || !title) return Promise.resolve(badArg('task add requires team + title'));
      const args = ['task', 'add', team, title];
      if (deps) args.push('--deps', deps);
      if (json) args.push('--json');
      return bwocExec(withWorkspace(args));
    }
    case 'list': {
      if (!team) return Promise.resolve(badArg('task list requires a team'));
      const args = ['task', 'list', team];
      if (json) args.push('--json');
      return bwocExec(withWorkspace(args));
    }
    case 'claim': {
      if (!team || !task || !as) return Promise.resolve(badArg('task claim requires team + task + as'));
      const args = ['task', 'claim', team, task, '--as', as];
      if (json) args.push('--json');
      return bwocExec(withWorkspace(args));
    }
    case 'complete': {
      if (!team || !task || !as) return Promise.resolve(badArg('task complete requires team + task + as'));
      const args = ['task', 'complete', team, task, '--as', as];
      if (json) args.push('--json');
      return bwocExec(withWorkspace(args));
    }
    default:
      return Promise.resolve(badArg(`unknown task op: ${op}`));
  }
}

/**
 * `bwoc team <op> ...` — Saṅgha teams.
 * ops: create | list | retire
 */
export function bwocTeam(op, params = {}) {
  const { id, members, json = true } = params;
  switch (op) {
    case 'list': {
      const args = ['team', 'list'];
      if (json) args.push('--json');
      return bwocExec(withWorkspace(args));
    }
    case 'create': {
      if (!id) return Promise.resolve(badArg('team create requires an id'));
      const args = ['team', 'create', id];
      if (members) args.push('--members', members);
      if (json) args.push('--json');
      return bwocExec(withWorkspace(args));
    }
    case 'retire': {
      if (!id) return Promise.resolve(badArg('team retire requires an id'));
      const args = ['team', 'retire', id];
      return bwocExec(withWorkspace(args));
    }
    default:
      return Promise.resolve(badArg(`unknown team op: ${op}`));
  }
}

/**
 * `bwoc memory <op> ...` — workspace-level memory (`.bwoc/memory/`).
 * ops: list | show | search
 */
export function bwocMemory(op, params = {}) {
  const { name, query, all = false, json = true } = params;
  switch (op) {
    case 'list': {
      const args = ['memory', 'list'];
      if (json) args.push('--json');
      return bwocExec(withWorkspace(args));
    }
    case 'show': {
      const args = ['memory', 'show'];
      if (all) {
        args.push('--all');
        if (json) args.push('--json');
      } else {
        if (!name) return Promise.resolve(badArg('memory show requires a name (or all:true)'));
        args.push(name);
      }
      return bwocExec(withWorkspace(args));
    }
    case 'search': {
      if (!query) return Promise.resolve(badArg('memory search requires a query'));
      const args = ['memory', 'search', query];
      if (json) args.push('--json');
      return bwocExec(withWorkspace(args));
    }
    default:
      return Promise.resolve(badArg(`unknown memory op: ${op}`));
  }
}

/* ---------------------------------------------------------------- helpers */

function badArg(msg) {
  return { ok: false, stdout: '', stderr: `bwoc-plugin: ${msg}`, code: 2 };
}
