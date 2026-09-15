import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_NAMES = ['flash', 'superpowers', 'explorer', 'verify', 'browser'];

export const AGENT_MARKER = /^#\s*bento:\s*agent\b/m;

export function isBentoAgent(filePath) {
  try {
    return AGENT_MARKER.test(readFileSync(filePath, 'utf8'));
  } catch {
    return false;
  }
}

function wantedAgents({ profile = true, superpowers = true, codegraph = true, agentBrowser = true } = {}) {
  const wanted = [];
  if (profile) wanted.push('flash', 'verify');
  if (superpowers) wanted.push('superpowers');
  if (profile && codegraph) wanted.push('explorer');
  if (profile && agentBrowser) wanted.push('browser');
  return wanted;
}

export function installAgents(projectRoot, opts = {}) {
  const created = [];
  const skipped = [];
  for (const name of wantedAgents(opts)) {
    const dir = join(projectRoot, '.opencode', 'agents');
    const dest = join(dir, `${name}.md`);
    if (existsSync(dest)) {
      if (!isBentoAgent(dest)) {
        console.error(`aviso: ${name}.md já existe e não é do bento; pulado.`);
        skipped.push(name);
      }
      continue;
    }
    mkdirSync(dir, { recursive: true });
    cpSync(join(PKG_ROOT, 'templates', 'agents', `${name}.md`), dest);
    created.push(name);
  }
  return { created, skipped };
}

export function removeAgents(projectRoot, names = AGENT_NAMES) {
  const removed = [];
  for (const name of names) {
    const dest = join(projectRoot, '.opencode', 'agents', `${name}.md`);
    if (existsSync(dest) && isBentoAgent(dest)) {
      rmSync(dest, { force: true });
      removed.push(`.opencode/agents/${name}.md`);
    }
  }
  return { removed };
}
