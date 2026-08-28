import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SUPERPOWERS_PLUGIN = 'superpowers@git+https://github.com/obra/superpowers.git';

const ESCAPED = SUPERPOWERS_PLUGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ENTRY_RE = new RegExp(`"${ESCAPED}[^"]*"[,\\s]*`);
const ENTRY_REMOVE_RE = new RegExp(`"${ESCAPED}[^"]*"[,\\s]*(?:\\s*(?:\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/))?[,\\s]*`, 'g');

function configPath(projectRoot) {
  const json = join(projectRoot, 'opencode.json');
  if (existsSync(json)) return json;
  const jsonc = join(projectRoot, 'opencode.jsonc');
  if (existsSync(jsonc)) return jsonc;
  return json;
}

function freshObject() {
  return `{\n  "plugin": ["${SUPERPOWERS_PLUGIN}"]\n}\n`;
}

export function addSuperpowersPlugin(projectRoot) {
  const path = configPath(projectRoot);
  let raw = null;
  if (existsSync(path)) {
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      console.error(`aviso: não foi possível ler ${path} — superpowers pulado.`);
      return null;
    }
  }
  if (raw === null || raw.trim() === '') {
    writeFileSync(path, freshObject());
    return { changed: SUPERPOWERS_PLUGIN, path };
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    if (!path.endsWith('.jsonc')) {
      console.error('aviso: opencode.json não é um objeto JSON válido — superpowers pulado.');
      return null;
    }
    return addJsoncText(path, raw);
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    console.error('aviso: opencode.json não é um objeto JSON — superpowers pulado.');
    return null;
  }
  let plugins = obj.plugin;
  if (plugins === undefined) plugins = [];
  else if (typeof plugins === 'string') plugins = [plugins];
  else if (!Array.isArray(plugins)) {
    console.error('aviso: "plugin" em opencode.json não é um array — superpowers pulado.');
    return null;
  }
  if (plugins.some((p) => typeof p === 'string' && p.startsWith(SUPERPOWERS_PLUGIN))) return null;
  obj.plugin = [...plugins, SUPERPOWERS_PLUGIN];
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  return { changed: SUPERPOWERS_PLUGIN, path };
}

function addJsoncText(path, raw) {
  if (/"plugin"\s*:/m.test(raw)) {
    const arrayMatch = /"plugin"\s*:\s*\[([\s\S]*?)\]/m.exec(raw);
    if (!arrayMatch) {
      console.error('aviso: "plugin" em opencode.json não é um array — superpowers pulado.');
      return null;
    }
    const inside = arrayMatch[1];
    if (ENTRY_RE.test(inside)) return null;
    const hasEntries = inside.trim() !== '';
    const rebuilt = `"plugin": [${inside}${hasEntries ? ',' : ''}\n    "${SUPERPOWERS_PLUGIN}"\n  ]`;
    writeFileSync(path, raw.slice(0, arrayMatch.index) + rebuilt + raw.slice(arrayMatch.index + arrayMatch[0].length));
    return { changed: SUPERPOWERS_PLUGIN, path };
  }
  const brace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (brace === -1 || lastBrace <= brace) {
    console.error('aviso: opencode.json não parece um objeto JSON — superpowers pulado.');
    return null;
  }
  const middle = raw.slice(brace + 1, lastBrace);
  const updated = raw.slice(0, brace + 1) + `\n  "plugin": ["${SUPERPOWERS_PLUGIN}"]` + (middle.trim() ? ',' : '\n') + middle + raw.slice(lastBrace);
  writeFileSync(path, updated);
  return { changed: SUPERPOWERS_PLUGIN, path };
}

export function removeSuperpowersPlugin(projectRoot) {
  const path = configPath(projectRoot);
  if (!existsSync(path)) return null;
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`aviso: não foi possível ler ${path} — superpowers ignorado.`);
    return null;
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    if (!path.endsWith('.jsonc')) {
      console.error('aviso: opencode.json não é um objeto JSON válido — superpowers ignorado.');
      return null;
    }
    return removeJsoncText(path, raw);
  }
  if (obj === null || typeof obj !== 'object') return null;
  const plugins = obj.plugin;
  if (plugins === undefined) return null;
  if (typeof plugins !== 'string' && !Array.isArray(plugins)) {
    console.error('aviso: "plugin" em opencode.json não é um array — superpowers ignorado.');
    return null;
  }
  const list = Array.isArray(plugins) ? plugins : [plugins];
  const kept = list.filter((p) => !(typeof p === 'string' && p.startsWith(SUPERPOWERS_PLUGIN)));
  if (kept.length === list.length) return null;
  if (kept.length === 0) {
    delete obj.plugin;
    if (Object.keys(obj).length === 0) {
      if (path.endsWith('.jsonc')) {
        writeFileSync(path, '{}\n');
      } else {
        rmSync(path, { force: true });
      }
      return { removed: SUPERPOWERS_PLUGIN, path };
    }
  } else {
    obj.plugin = kept;
  }
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  return { removed: SUPERPOWERS_PLUGIN, path };
}

function removeJsoncText(path, raw) {
  if (!/"plugin"\s*:/m.test(raw)) {
    const brace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (brace === -1 || lastBrace <= brace) {
      console.error('aviso: opencode.json não parece um objeto JSON — superpowers ignorado.');
    }
    return null;
  }
  const arrayMatch = /"plugin"\s*:\s*\[([\s\S]*?)\]/m.exec(raw);
  if (!arrayMatch) {
    console.error('aviso: "plugin" em opencode.json não é um array — superpowers ignorado.');
    return null;
  }
  const inside = arrayMatch[1];
  if (!ENTRY_RE.test(inside)) return null;
  const newInside = inside.replace(ENTRY_REMOVE_RE, '').replace(/,\s*$/, '').trim();
  if (newInside === '') {
    const prefix = raw.slice(0, arrayMatch.index);
    const suffix = raw.slice(arrayMatch.index + arrayMatch[0].length);
    const suffixHadComma = /^,/.test(suffix);
    const after = suffix.replace(/^,\s*/, '');
    const prefixClean = suffixHadComma
      ? prefix
      : prefix.replace(/,\s*(\/\/[^\n]*|\/\*[\s\S]*?\*\/)?\s*$/, (_m, comment) => (comment ? ` ${comment}` : ''));
    writeFileSync(path, prefixClean + after);
  } else {
    writeFileSync(path, raw.slice(0, arrayMatch.index) + `"plugin": [${newInside}]` + raw.slice(arrayMatch.index + arrayMatch[0].length));
  }
  return { removed: SUPERPOWERS_PLUGIN, path };
}
