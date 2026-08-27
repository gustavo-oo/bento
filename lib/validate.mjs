import { loadLimits, matchesOverride } from './config.mjs';
import { getDiffStats, summarize } from './diff.mjs';

export function evaluate(limits, files) {
  const global = { lines: 0, files: 0 };
  const groups = new Map();
  for (const f of files) {
    global.lines += f.added + f.deleted;
    global.files += 1;
    for (const o of limits.overrides) {
      if (matchesOverride(f.path, o)) {
        const g = groups.get(o.glob) ?? { lines: 0, files: 0 };
        g.lines += f.added + f.deleted;
        g.files += 1;
        groups.set(o.glob, g);
      }
    }
  }
  const violations = [];
  if (global.lines > limits.maxLines) {
    violations.push(`total de linhas ${global.lines} > ${limits.maxLines}`);
  }
  if (global.files > limits.maxFiles) {
    violations.push(`total de arquivos ${global.files} > ${limits.maxFiles}`);
  }
  for (const [glob, g] of groups) {
    const override = limits.overrides.find((o) => o.glob === glob);
    const max = override?.maxLines ?? limits.maxLines;
    if (g.lines > max) {
      violations.push(`grupo "${glob}": ${g.lines} linhas > ${max}`);
    }
  }
  return { global, groups: [...groups.entries()], violations };
}

export function runCheck({ base, head, cwd }) {
  const limits = loadLimits(cwd);
  const files = getDiffStats(base, head, cwd);
  const summary = summarize(files);
  const result = evaluate(limits, files);
  console.log(`Diff ${base}..${head}: ${summary.lines} linhas, ${summary.files} arquivos`);
  for (const [dir, count] of summary.byDir) {
    console.log(`  ${dir}: ${count} arquivo(s)`);
  }
  if (result.violations.length > 0) {
    console.error('PR GRANDE:');
    for (const v of result.violations) {
      console.error(`  - ${v}`);
    }
    return 1;
  }
  console.log('PR dentro dos limites.');
  return 0;
}

function changeSet(base, head, cwd) {
  return getDiffStats(base, head, cwd)
    .map((f) => `${f.added}\t${f.deleted}\t${f.path}`)
    .sort();
}

export function runEquivalence({ base, head, layers, cwd }) {
  if (!layers.length) {
    console.error('uso: equivalence <base> <head> <camada1> [camada2 …]');
    return 2;
  }
  const full = new Map();
  for (const entry of changeSet(base, head, cwd)) {
    const [a, d, p] = entry.split('\t');
    full.set(p, { added: Number(a), deleted: Number(d) });
  }
  const combined = new Map();
  let prev = base;
  for (const layer of layers) {
    for (const entry of changeSet(prev, layer, cwd)) {
      const [a, d, p] = entry.split('\t');
      const cur = combined.get(p) ?? { added: 0, deleted: 0 };
      cur.added += Number(a);
      cur.deleted += Number(d);
      combined.set(p, cur);
    }
    prev = layer;
  }
  const missing = [...combined.keys()].filter((p) => !full.has(p));
  const extra = [...full.keys()].filter((p) => !combined.has(p));
  const mismatched = [...combined.keys()].filter((p) => {
    const c = combined.get(p);
    const f = full.get(p);
    return !f || c.added !== f.added || c.deleted !== f.deleted;
  });
  if (missing.length === 0 && extra.length === 0 && mismatched.length === 0) {
    console.log('EQUIVALENTE: a soma das camadas == diff original.');
    return 0;
  }
  console.error('DIVERGENTE:');
  for (const p of missing) console.error(`  falta no original: ${p}`);
  for (const p of extra) console.error(`  extra nas camadas: ${p}`);
  for (const p of mismatched) {
    console.error(`  divergência em ${p}: camadas ${JSON.stringify(combined.get(p))} vs original ${JSON.stringify(full.get(p))}`);
  }
  return 1;
}
