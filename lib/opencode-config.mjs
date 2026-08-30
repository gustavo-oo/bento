import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SUPERPOWERS_PLUGIN = 'superpowers@git+https://github.com/obra/superpowers.git';
export const PONYTAIL_PLUGIN = '@dietrichgebert/ponytail';

function pluginLabel(pluginId) {
  if (pluginId.startsWith('@')) return pluginId.slice(pluginId.lastIndexOf('/') + 1);
  const at = pluginId.indexOf('@');
  return at === -1 ? pluginId : pluginId.slice(0, at);
}

function entryRe(pluginId) {
  const escaped = pluginId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`"${escaped}[^"]*"[,\\s]*`);
}

function entryRemoveRe(pluginId) {
  const escaped = pluginId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`"${escaped}[^"]*"[,\\s]*(?:\\s*(?:\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/))?[,\\s]*`, 'g');
}

function configPath(projectRoot) {
  const json = join(projectRoot, 'opencode.json');
  if (existsSync(json)) return json;
  const jsonc = join(projectRoot, 'opencode.jsonc');
  if (existsSync(jsonc)) return jsonc;
  return json;
}

function freshObject(pluginId) {
  return `{\n  "plugin": ["${pluginId}"]\n}\n`;
}

export function addPlugin(projectRoot, pluginId) {
  const label = pluginLabel(pluginId);
  const path = configPath(projectRoot);
  let raw = null;
  if (existsSync(path)) {
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      console.error(`aviso: não foi possível ler ${path} — ${label} pulado.`);
      return null;
    }
  }
  if (raw === null || raw.trim() === '') {
    writeFileSync(path, freshObject(pluginId));
    return { changed: pluginId, path };
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    if (!path.endsWith('.jsonc')) {
      console.error(`aviso: opencode.json não é um objeto JSON válido — ${label} pulado.`);
      return null;
    }
    return addJsoncText(path, raw, pluginId);
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    console.error(`aviso: opencode.json não é um objeto JSON — ${label} pulado.`);
    return null;
  }
  let plugins = obj.plugin;
  if (plugins === undefined) plugins = [];
  else if (typeof plugins === 'string') plugins = [plugins];
  else if (!Array.isArray(plugins)) {
    console.error(`aviso: "plugin" em opencode.json não é um array — ${label} pulado.`);
    return null;
  }
  if (plugins.some((p) => typeof p === 'string' && p.startsWith(pluginId))) return null;
  obj.plugin = [...plugins, pluginId];
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  return { changed: pluginId, path };
}

function addJsoncText(path, raw, pluginId) {
  const label = pluginLabel(pluginId);
  if (/"plugin"\s*:/m.test(raw)) {
    const arrayMatch = /"plugin"\s*:\s*\[([\s\S]*?)\]/m.exec(raw);
    if (!arrayMatch) {
      console.error(`aviso: "plugin" em opencode.json não é um array — ${label} pulado.`);
      return null;
    }
    const inside = arrayMatch[1];
    if (entryRe(pluginId).test(inside)) return null;
    const hasEntries = inside.trim() !== '';
    const rebuilt = `"plugin": [${inside}${hasEntries ? '\n  ,' : ''}\n    "${pluginId}"\n  ]`;
    writeFileSync(path, raw.slice(0, arrayMatch.index) + rebuilt + raw.slice(arrayMatch.index + arrayMatch[0].length));
    return { changed: pluginId, path };
  }
  const brace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (brace === -1 || lastBrace <= brace) {
    console.error(`aviso: opencode.json não parece um objeto JSON — ${label} pulado.`);
    return null;
  }
  const middle = raw.slice(brace + 1, lastBrace);
  const updated = raw.slice(0, brace + 1) + `\n  "plugin": ["${pluginId}"]` + (middle.trim() ? ',' : '\n') + middle + raw.slice(lastBrace);
  writeFileSync(path, updated);
  return { changed: pluginId, path };
}

export function removePlugin(projectRoot, pluginId) {
  const label = pluginLabel(pluginId);
  const path = configPath(projectRoot);
  if (!existsSync(path)) return null;
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`aviso: não foi possível ler ${path} — ${label} ignorado.`);
    return null;
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    if (!path.endsWith('.jsonc')) {
      console.error(`aviso: opencode.json não é um objeto JSON válido — ${label} ignorado.`);
      return null;
    }
    return removeJsoncText(path, raw, pluginId);
  }
  if (obj === null || typeof obj !== 'object') return null;
  const plugins = obj.plugin;
  if (plugins === undefined) return null;
  if (typeof plugins !== 'string' && !Array.isArray(plugins)) {
    console.error(`aviso: "plugin" em opencode.json não é um array — ${label} ignorado.`);
    return null;
  }
  const list = Array.isArray(plugins) ? plugins : [plugins];
  const kept = list.filter((p) => !(typeof p === 'string' && p.startsWith(pluginId)));
  if (kept.length === list.length) return null;
  if (kept.length === 0) {
    delete obj.plugin;
    if (Object.keys(obj).length === 0) {
      if (path.endsWith('.jsonc')) {
        writeFileSync(path, '{}\n');
      } else {
        rmSync(path, { force: true });
      }
      return { removed: pluginId, path };
    }
  } else {
    obj.plugin = kept;
  }
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  return { removed: pluginId, path };
}

function removeJsoncText(path, raw, pluginId) {
  const label = pluginLabel(pluginId);
  if (!/"plugin"\s*:/m.test(raw)) {
    const brace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (brace === -1 || lastBrace <= brace) {
      console.error(`aviso: opencode.json não parece um objeto JSON — ${label} ignorado.`);
    }
    return null;
  }
  const arrayMatch = /"plugin"\s*:\s*\[([\s\S]*?)\]/m.exec(raw);
  if (!arrayMatch) {
    console.error(`aviso: "plugin" em opencode.json não é um array — ${label} ignorado.`);
    return null;
  }
  const inside = arrayMatch[1];
  if (!entryRe(pluginId).test(inside)) return null;
  const newInside = inside.replace(entryRemoveRe(pluginId), '').replace(/,\s*$/, '').trim();
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
    writeFileSync(path, raw.slice(0, arrayMatch.index) + `"plugin": [${newInside}\n  ]` + raw.slice(arrayMatch.index + arrayMatch[0].length));
  }
  return { removed: pluginId, path };
}

export function addSuperpowersPlugin(projectRoot) {
  return addPlugin(projectRoot, SUPERPOWERS_PLUGIN);
}

export function removeSuperpowersPlugin(projectRoot) {
  return removePlugin(projectRoot, SUPERPOWERS_PLUGIN);
}