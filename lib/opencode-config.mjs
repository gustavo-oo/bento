import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SUPERPOWERS_PLUGIN = 'superpowers@git+https://github.com/obra/superpowers.git';

const ESCAPED = SUPERPOWERS_PLUGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ENTRY_RE = new RegExp(`"[^"]*${ESCAPED}[^"]*"[,\\s]*`);

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
  const raw = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (raw === null || raw.trim() === '') {
    writeFileSync(path, freshObject());
    return { changed: SUPERPOWERS_PLUGIN, path };
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
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
  if (/"(plugin)"\s*:/m.test(raw)) {
    const arrayMatch = /"plugin"\s*:\s*\[([\s\S]*?)\]/m.exec(raw);
    if (!arrayMatch) {
      console.error('aviso: "plugin" em opencode.json não é um array — superpowers pulado.');
      return null;
    }
    const inside = arrayMatch[1];
    if (ENTRY_RE.test(inside)) return null;
    const rebuilt = `"plugin": [${inside.trimEnd()}${inside.trim() ? ',\n    ' : ''}"${SUPERPOWERS_PLUGIN}"]`;
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