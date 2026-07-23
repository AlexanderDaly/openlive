/**
 * Upsert labels from .github/labels.yml using the GitHub CLI.
 * Usage: node scripts/sync-labels.mjs
 * Requires: gh auth, repo remote, js-yaml not required (minimal parser).
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(root, '.github/labels.yml'), 'utf8');

/** @type {{ name: string, color: string, description: string }[]} */
const labels = [];
let cur = null;
for (const line of raw.split(/\r?\n/)) {
  const name = line.match(/^- name:\s*["']?(.+?)["']?\s*$/);
  if (name) {
    cur = { name: name[1], color: 'ededed', description: '' };
    labels.push(cur);
    continue;
  }
  if (!cur) continue;
  const color = line.match(/^\s+color:\s*["']?([0-9a-fA-F]+)["']?\s*$/);
  if (color) cur.color = color[1];
  const desc = line.match(/^\s+description:\s*["']?(.*?)["']?\s*$/);
  if (desc) cur.description = desc[1];
}

for (const l of labels) {
  const desc = l.description.replace(/"/g, '\\"');
  try {
    execSync(
      `gh label create "${l.name}" --color "${l.color}" --description "${desc}" --force`,
      { stdio: 'inherit', cwd: root },
    );
  } catch (e) {
    console.error('Failed', l.name, e.message);
    process.exitCode = 1;
  }
}

console.log(`Synced ${labels.length} labels`);
