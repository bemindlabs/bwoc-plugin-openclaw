#!/usr/bin/env node
// Skill re-export (bundle) generator.
//
// Re-exports BWOC framework skills as Claude/Codex-compatible "skill bundles":
// for each `bwoc skill list` entry, write `skills/fw-<name>/SKILL.md` with YAML
// frontmatter (name/description) + a lean body. OpenClaw natively maps such a
// `skills/<name>/SKILL.md` tree, so no host wiring is needed.
//
// GENERIC + NEUTRAL: this is the GENERATOR only. The generated `skills/fw-*/`
// tree is gitignored — never committed.
//
// Requires BWOC_WORKSPACE (no hardcoded default). Shells out to the `bwoc` CLI
// via execFileSync with an argument array (no shell).

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BWOC_BIN = process.env.BWOC_BIN || 'bwoc';
const WORKSPACE = process.env.BWOC_WORKSPACE;

if (!WORKSPACE) {
  console.error(
    'error: BWOC_WORKSPACE is required (no default). ' +
      'Set it to a BWOC workspace/framework root, e.g.\n' +
      '  BWOC_WORKSPACE=/path/to/bwoc-framework npm run sync-skills'
  );
  process.exit(1);
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_ROOT = join(REPO_ROOT, 'skills');

/** Run `bwoc <args...> --workspace <WS>` and parse JSON stdout. */
function bwocJson(args) {
  const out = execFileSync(BWOC_BIN, [...args, '--json', '--workspace', WORKSPACE], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(out);
}

/** Minimal YAML scalar escaping for a single-line value. */
function yamlScalar(v) {
  const s = String(v ?? '');
  if (s === '' || /[:#\-?\[\]{}&*!|>'"%@`,]/.test(s) || /^\s|\s$/.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

function renderSkill(skill) {
  const { name, description, exposes, spec_path: specPath } = skill;
  const exposesList = Array.isArray(exposes) ? exposes : [];

  const fm = [
    '---',
    `name: bwoc-fw-${name}`,
    `description: ${yamlScalar(description)}`,
    '---',
  ].join('\n');

  const lines = [
    fm,
    '',
    `# bwoc-fw-${name}`,
    '',
    `Re-export of the BWOC framework skill **${name}**.`,
    '',
    '## Purpose',
    '',
    description || `(no description provided by \`bwoc skill show ${name}\`)`,
    '',
    '## Reference',
    '',
    `Authoritative spec: \`modules/skills/${name}/SPEC.md\`` +
      (specPath ? ` (\`${specPath}\`)` : ''),
    '',
    `Driven through the \`bwoc\` CLI; run \`bwoc skill show ${name}\` for full detail.`,
  ];

  if (exposesList.length > 0) {
    lines.push('', '## Exposes', '');
    for (const op of exposesList) lines.push(`- \`${op}\``);
  }

  lines.push('');
  return lines.join('\n');
}

function main() {
  const listed = bwocJson(['skill', 'list']);
  const skills = Array.isArray(listed?.skills) ? listed.skills : [];

  // Clean stale generated output so removed skills don't linger.
  rmSync(OUT_ROOT, { recursive: true, force: true });

  let written = 0;
  for (const entry of skills) {
    const name = entry?.name;
    if (!name) continue;
    // Pull full detail (description/exposes/spec_path) via `skill show`.
    const shown = bwocJson(['skill', 'show', name]);
    const skill = shown?.skill ?? entry;

    const dir = join(OUT_ROOT, `fw-${name}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), renderSkill(skill), 'utf8');
    written += 1;
  }

  console.log(
    `sync-skills: wrote ${written} skill bundle${written === 1 ? '' : 's'} ` +
      `to ${OUT_ROOT}/fw-*/SKILL.md (gitignored)`
  );
}

main();
