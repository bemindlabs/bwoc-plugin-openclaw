// BWOC → OpenClaw plugin entry.
//
// Registers the BWOC coordination tools into the OpenClaw Gateway. Every tool
// shells out to the `bwoc` CLI (see ./bwoc.js); no business logic lives in the
// host — logic belongs to the framework.
//
// The OpenClaw plugin API (https://docs.openclaw.ai/tools/plugin) exposes:
//   - api.on(event, handler)        typed lifecycle hooks
//   - api.registerHook(name, fn)    coarse internal hooks
//   - capability slots: tools, agent harnesses, skills, a memory slot
//
// Skill bundle: `scripts/sync-skills.mjs` re-exports BWOC framework skills as
// `skills/fw-<name>/SKILL.md` (Claude/Codex-compatible; gitignored). OpenClaw
// maps that `skills/` tree natively — no registration code is needed here.
//
// The EXACT tool-registration call name is not pinned by the docs we have, so
// below we attempt the most likely surfaces in order and fall back to a
// lifecycle hook, leaving a TODO where the host contract is unconfirmed. The
// tool descriptors + bwoc helpers are fully importable/testable regardless.

import { tools, toolsByName } from './tools.js';
import { bwocList } from './bwoc.js';

const PLUGIN_ID = 'bwoc';

/**
 * OpenClaw entrypoint.
 * @param {object} api  host-provided plugin API surface
 */
export function register(api) {
  const log = pickLogger(api);

  // --- 1. Register coordination tools ------------------------------------
  // TODO(openclaw-api): confirm the canonical tool-registration call against
  // https://docs.openclaw.ai/tools/plugin . The docs confirm a `tools`
  // capability slot but do not pin the method name. We try the most likely
  // shapes; whichever the host provides wins. All are no-ops-safe.
  let registered = 0;
  for (const tool of tools) {
    if (tryRegisterTool(api, tool)) registered += 1;
  }
  if (registered === 0) {
    log(
      `[${PLUGIN_ID}] no tool-registration API found on \`api\`; tools are defined but not wired. ` +
        'See TODO in src/index.js (https://docs.openclaw.ai/tools/plugin).'
    );
  } else {
    log(`[${PLUGIN_ID}] registered ${registered}/${tools.length} coordination tools.`);
  }

  // --- 2. Lifecycle hook: log fleet availability on startup --------------
  // Documented hook surface: api.on(<lifecycle event>, handler).
  const onReady = async () => {
    const res = await bwocList({ json: true });
    if (res.ok) {
      const count = countAgents(res.stdout);
      log(
        `[${PLUGIN_ID}] fleet available: ${count ?? '?'} BWOC agents reachable via \`bwoc\`.`
      );
    } else {
      log(
        `[${PLUGIN_ID}] WARNING: \`bwoc list\` failed (code ${res.code}). ` +
          `Is the bwoc CLI on PATH and a workspace reachable? stderr: ${res.stderr.trim()}`
      );
    }
  };

  if (typeof api?.on === 'function') {
    // TODO(openclaw-api): confirm the exact lifecycle event name (e.g.
    // 'ready' | 'start' | 'gateway:ready') per https://docs.openclaw.ai/tools/plugin.
    // We subscribe to the common candidates; unknown events are harmless.
    for (const ev of ['ready', 'start', 'startup', 'gateway:ready']) {
      try {
        api.on(ev, onReady);
      } catch {
        /* unknown event name — ignore */
      }
    }
  } else {
    // No lifecycle bus: run the availability probe immediately, best-effort.
    void onReady();
  }

  return {
    id: PLUGIN_ID,
    tools: toolsByName,
  };
}

/* ---------------------------------------------------------------- helpers */

/**
 * Attempt to register a single tool through whichever host API is present.
 * Returns true on the first surface that accepts it.
 */
function tryRegisterTool(api, tool) {
  if (!api) return false;

  // Candidate A: dedicated tool registrar.
  if (typeof api.registerTool === 'function') {
    api.registerTool(tool);
    return true;
  }
  // Candidate B: a `tools` namespace with .register / .add.
  if (api.tools && typeof api.tools.register === 'function') {
    api.tools.register(tool);
    return true;
  }
  if (api.tools && typeof api.tools.add === 'function') {
    api.tools.add(tool);
    return true;
  }
  // Candidate C: coarse internal hook bus.
  if (typeof api.registerHook === 'function') {
    api.registerHook(`tool:${tool.name}`, tool.handler);
    return true;
  }
  // Candidate D: generic event registrar used as a tool sink.
  if (typeof api.on === 'function' && typeof api.registerTool !== 'function') {
    // Only as a last resort — many hosts treat api.on as lifecycle-only, so we
    // do NOT count this as a real tool registration.
    return false;
  }
  return false;
}

/** Best-effort logger that degrades to console. */
function pickLogger(api) {
  if (api && typeof api.log === 'function') return (...a) => api.log(...a);
  if (api && api.logger && typeof api.logger.info === 'function')
    return (...a) => api.logger.info(...a);
  return (...a) => console.log(...a);
}

/** Count agents from `bwoc list --json` output, tolerant of shape. */
function countAgents(stdout) {
  try {
    const data = JSON.parse(stdout);
    if (Array.isArray(data)) return data.length;
    if (Array.isArray(data?.agents)) return data.agents.length;
    if (typeof data?.count === 'number') return data.count;
  } catch {
    /* not JSON — fall through */
  }
  return null;
}

export { tools, toolsByName };
export default { register };
