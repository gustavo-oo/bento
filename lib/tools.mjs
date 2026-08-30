import { execFileSync } from 'node:child_process';

function run(cmd, args, label) {
  try {
    execFileSync(cmd, args, { stdio: 'ignore', encoding: 'utf8' });
    return true;
  } catch (err) {
    console.error(`aviso: ${label} — ${err.message}`);
    return false;
  }
}

export function ensureCodegraph({ npmBin = 'npm' } = {}) {
  return run(npmBin, ['i', '-g', '@colbymchenry/codegraph'], 'codegraph CLI não pôde ser instalado');
}

export function ensureAgentBrowser({ npmBin = 'npm' } = {}) {
  if (!run(npmBin, ['i', '-g', 'agent-browser'], 'agent-browser CLI não pôde ser instalado')) return false;
  return run('agent-browser', ['install'], 'Chrome do agent-browser não pôde ser instalado');
}

export function initCodegraph(cwd, { codegraphBin = 'codegraph' } = {}) {
  try {
    execFileSync(codegraphBin, ['init'], { cwd, stdio: 'ignore', encoding: 'utf8' });
    return true;
  } catch (err) {
    console.error(`aviso: codegraph init falhou — ${err.message}`);
    return false;
  }
}

export function removeCodegraph({ npmBin = 'npm' } = {}) {
  return run(npmBin, ['uninstall', '-g', '@colbymchenry/codegraph'], 'codegraph CLI não pôde ser desinstalado');
}

export function removeAgentBrowser({ npmBin = 'npm' } = {}) {
  return run(npmBin, ['uninstall', '-g', 'agent-browser'], 'agent-browser CLI não pôde ser desinstalado');
}
