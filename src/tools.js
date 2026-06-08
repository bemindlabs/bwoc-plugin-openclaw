// OpenClaw coordination tool descriptors.
//
// Each descriptor is a plain object: { name, description, parameters (JSON
// schema), handler }. The handler is an async fn (input) => bwoc result. These
// are host-agnostic on purpose so they can be unit-tested without an OpenClaw
// runtime; src/index.js adapts them to whatever registration call the host API
// exposes.

import {
  bwocList,
  bwocStatus,
  bwocSend,
  bwocRun,
  bwocTask,
  bwocTeam,
  bwocMemory,
} from './bwoc.js';

export const tools = [
  {
    name: 'bwoc_list',
    description:
      'List BWOC agents registered in the workspace (id, status, backend, inbox). Read-only.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status, e.g. active|stopped|retired' },
        backend: { type: 'string', description: 'Filter by backend, e.g. claude|codex|ollama' },
        running: { type: 'boolean', description: 'Only agents whose daemon is actually running' },
        namesOnly: { type: 'boolean', description: 'Return bare agent ids only' },
      },
      additionalProperties: false,
    },
    handler: (input = {}) => bwocList(input),
  },
  {
    name: 'bwoc_status',
    description:
      "Show a BWOC agent's health + identity snapshot. Omit `agent` (or set all:true) for the whole fleet. Read-only.",
    parameters: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Agent id or bare name, e.g. agent-luban or luban' },
        all: { type: 'boolean', description: 'Full detail block for every agent' },
      },
      additionalProperties: false,
    },
    handler: (input = {}) => bwocStatus(input.agent, { all: input.all }),
  },
  {
    name: 'bwoc_send',
    description:
      "Append a message to a BWOC agent's inbox (async, fire-and-forget). Mutating.",
    parameters: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Recipient agent id or bare name' },
        message: { type: 'string', description: 'Message body (plain text)' },
        from: { type: 'string', description: 'Sender identity (default "user")' },
        replyTo: { type: 'string', description: 'Prior envelope messageId to thread as a reply' },
        noWakeup: { type: 'boolean', description: 'Skip the tmux wakeup ping' },
      },
      required: ['agent', 'message'],
      additionalProperties: false,
    },
    handler: (input = {}) =>
      bwocSend(input.agent, input.message, {
        from: input.from,
        replyTo: input.replyTo,
        noWakeup: input.noWakeup,
      }),
  },
  {
    name: 'bwoc_run',
    description:
      'Run a single task on a BWOC agent non-interactively and capture the result (headless). Mutating / long-running.',
    parameters: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Agent id or bare name' },
        task: { type: 'string', description: 'Task prompt to deliver to the agent' },
        timeoutSec: { type: 'number', description: 'Kill the agent run after N seconds' },
      },
      required: ['agent', 'task'],
      additionalProperties: false,
    },
    handler: (input = {}) =>
      bwocRun(input.agent, input.task, { timeoutSec: input.timeoutSec }),
  },
  {
    name: 'bwoc_task',
    description:
      "Manage a team's shared task list. op: add | list | claim | complete. `list` is read-only; the others mutate.",
    parameters: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['add', 'list', 'claim', 'complete'] },
        team: { type: 'string', description: 'Team id' },
        title: { type: 'string', description: 'Task title (op=add)' },
        task: { type: 'string', description: 'Task id (op=claim|complete)' },
        as: { type: 'string', description: 'Acting agent id (op=claim|complete)' },
        deps: { type: 'string', description: 'Comma-separated dependency task ids (op=add)' },
      },
      required: ['op'],
      additionalProperties: false,
    },
    handler: (input = {}) => bwocTask(input.op, input),
  },
  {
    name: 'bwoc_team',
    description:
      'Manage Saṅgha teams. op: list | create | retire. `list` is read-only; the others mutate.',
    parameters: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['list', 'create', 'retire'] },
        id: { type: 'string', description: 'Team id (op=create|retire)' },
        members: { type: 'string', description: 'Comma-separated agent ids (op=create)' },
      },
      required: ['op'],
      additionalProperties: false,
    },
    handler: (input = {}) => bwocTeam(input.op, input),
  },
  {
    name: 'bwoc_memory',
    description:
      'Read workspace-level BWOC memory (.bwoc/memory/). op: list | show | search. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['list', 'show', 'search'] },
        name: { type: 'string', description: 'Entry name (op=show)' },
        all: { type: 'boolean', description: 'Concatenate every entry (op=show)' },
        query: { type: 'string', description: 'Substring to search for (op=search)' },
      },
      required: ['op'],
      additionalProperties: false,
    },
    handler: (input = {}) => bwocMemory(input.op, input),
  },
];

/** Lookup table by tool name. */
export const toolsByName = Object.fromEntries(tools.map((t) => [t.name, t]));
