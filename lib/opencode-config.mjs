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

function maskComments(raw) {
  const out = raw.split('');
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '"') {
      i += 1;
      while (i < raw.length) {
        if (raw[i] === '\\') {
          i += 2;
        } else if (raw[i] === '"') {
          i += 1;
          break;
        } else {
          i += 1;
        }
      }
      continue;
    }
    if (raw[i] === '/' && raw[i + 1] === '/') {
      while (i < raw.length && raw[i] !== '\n') {
        out[i] = ' ';
        i += 1;
      }
      continue;
    }
    if (raw[i] === '/' && raw[i + 1] === '*') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) {
        if (raw[i] !== '\n') out[i] = ' ';
        i += 1;
      }
      if (i < raw.length) {
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 2;
      }
      continue;
    }
    i += 1;
  }
  return out.join('');
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

function pluginArrayMatch(raw, masked) {
  const arrayRe = /"plugin"\s*:\s*\[([\s\S]*?)\]/m;
  const maskedMatch = arrayRe.exec(masked);
  if (maskedMatch) return maskedMatch;
  if (!/"plugin"\s*:\s*\[/m.test(masked)) return null;
  return arrayRe.exec(raw);
}

function addJsoncText(path, raw, pluginId) {
  const label = pluginLabel(pluginId);
  const masked = maskComments(raw);
  if (/"plugin"\s*:/m.test(masked)) {
    const arrayMatch = pluginArrayMatch(raw, masked);
    if (!arrayMatch) {
      console.error(`aviso: "plugin" em opencode.json não é um array — ${label} pulado.`);
      return null;
    }
    const open = arrayMatch[0].indexOf('[');
    const inside = raw.slice(arrayMatch.index + open + 1, arrayMatch.index + arrayMatch[0].length - 1);
    if (entryRe(pluginId).test(inside)) return null;
    const hasEntries = inside.trim() !== '';
    const rebuilt = `"plugin": [${inside}${hasEntries ? '\n  ,' : ''}\n    "${pluginId}"\n  ]`;
    writeFileSync(path, raw.slice(0, arrayMatch.index) + rebuilt + raw.slice(arrayMatch.index + arrayMatch[0].length));
    return { changed: pluginId, path };
  }
  const brace = masked.indexOf('{');
  const lastBrace = masked.lastIndexOf('}');
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
  const masked = maskComments(raw);
  if (!/"plugin"\s*:/m.test(masked)) {
    const brace = masked.indexOf('{');
    const lastBrace = masked.lastIndexOf('}');
    if (brace === -1 || lastBrace <= brace) {
      console.error(`aviso: opencode.json não parece um objeto JSON — ${label} ignorado.`);
    }
    return null;
  }
  const arrayMatch = pluginArrayMatch(raw, masked);
  if (!arrayMatch) {
    console.error(`aviso: "plugin" em opencode.json não é um array — ${label} ignorado.`);
    return null;
  }
  const open = arrayMatch[0].indexOf('[');
  const inside = raw.slice(arrayMatch.index + open + 1, arrayMatch.index + arrayMatch[0].length - 1);
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

export function addPonytailPlugin(projectRoot) {
  return addPlugin(projectRoot, PONYTAIL_PLUGIN);
}

export function removePonytailPlugin(projectRoot) {
  return removePlugin(projectRoot, PONYTAIL_PLUGIN);
}

export const BENTO_DEFAULT_AGENT = 'flash';

export function setDefaultAgentIfAbsent(projectRoot, name = BENTO_DEFAULT_AGENT) {
  const path = configPath(projectRoot);
  let raw = null;
  if (existsSync(path)) {
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      console.error(`aviso: não foi possível ler ${path} — default_agent pulado.`);
      return null;
    }
  }
  if (raw === null || raw.trim() === '') {
    writeFileSync(path, `{\n  "default_agent": "${name}"\n}\n`);
    return { changed: 'default_agent', path };
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    if (!path.endsWith('.jsonc')) {
      console.error(`aviso: opencode.json não é um objeto JSON válido — default_agent pulado.`);
      return null;
    }
    return setJsoncDefaultAgent(path, raw, name);
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    console.error(`aviso: opencode.json não é um objeto JSON — default_agent pulado.`);
    return null;
  }
  if (typeof obj.default_agent === 'string') {
    console.error(`aviso: default_agent já definido ("${obj.default_agent}"); preservado.`);
    return { skipped: true, value: obj.default_agent };
  }
  if (obj.default_agent !== undefined) {
    console.error(`aviso: "default_agent" em opencode.json não é uma string — default_agent pulado.`);
    return null;
  }
  obj.default_agent = name;
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  return { changed: 'default_agent', path };
}

function setJsoncDefaultAgent(path, raw, name) {
  const masked = maskComments(raw);
  if (/"default_agent"\s*:/m.test(masked)) {
    const m = /"default_agent"\s*:\s*"([^"]*)"/m.exec(masked);
    const value = m ? m[1] : '';
    console.error(`aviso: default_agent já definido ("${value}"); preservado.`);
    return { skipped: true, value };
  }
  const brace = masked.indexOf('{');
  const lastBrace = masked.lastIndexOf('}');
  if (brace === -1 || lastBrace <= brace) {
    console.error('aviso: opencode.json não parece um objeto JSON — default_agent pulado.');
    return null;
  }
  const middle = raw.slice(brace + 1, lastBrace);
  const updated = raw.slice(0, brace + 1) + `\n  "default_agent": "${name}"` + (middle.trim() ? ',' : '\n') + middle + raw.slice(lastBrace);
  writeFileSync(path, updated);
  return { changed: 'default_agent', path };
}

export function removeDefaultAgentIf(projectRoot, name = BENTO_DEFAULT_AGENT) {
  const path = configPath(projectRoot);
  if (!existsSync(path)) return null;
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`aviso: não foi possível ler ${path} — default_agent ignorado.`);
    return null;
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    if (!path.endsWith('.jsonc')) {
      console.error(`aviso: opencode.json não é um objeto JSON válido — default_agent ignorado.`);
      return null;
    }
    return removeJsoncDefaultAgent(path, raw, name);
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return null;
  if (obj.default_agent !== name) return null;
  delete obj.default_agent;
  if (Object.keys(obj).length === 0) {
    if (path.endsWith('.jsonc')) {
      writeFileSync(path, '{}\n');
    } else {
      rmSync(path, { force: true });
    }
    return { removed: 'default_agent', path };
  }
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  return { removed: 'default_agent', path };
}

function removeJsoncDefaultAgent(path, raw, name) {
  const m = /"default_agent"\s*:\s*"([^"]*)"/m.exec(maskComments(raw));
  if (!m || m[1] !== name) return null;
  const start = m.index;
  const end = m.index + m[0].length;
  const after = raw.slice(end);
  const commaAfter = /^\s*,/.exec(after);
  let before = raw.slice(0, start);
  let rest = raw.slice(end);
  if (commaAfter) {
    rest = after.slice(commaAfter[0].length);
  } else {
    before = before.replace(/,\s*$/, '\n');
  }
  const out = before + rest;
  const withoutContent = maskComments(out).replace(/[{}\s]/g, '');
  writeFileSync(path, withoutContent === '' ? '{}\n' : out);
  return { removed: 'default_agent', path };
}
