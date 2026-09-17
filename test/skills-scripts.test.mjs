import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

function skillFile(rel) {
  return fileURLToPath(new URL(`../skills/${rel}`, import.meta.url));
}

function startFakeServer(dir, id) {
  const state = join(dir, 'state');
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, 'server-instance-id'), `${id}\n`);
  const pidFile = join(dir, 'helper.pid');
  const helper = spawn(
    'sh',
    ['-c', '"$0" -e "setTimeout(() => {}, 60000)" -- "--brainstorm-server-id=' + id + '" & echo $! > "$1"; wait', process.execPath, pidFile],
    { stdio: 'ignore' },
  );
  execFileSync('sh', ['-c', `while [ ! -s "${pidFile}" ]; do sleep 0.02; done`]);
  const pid = readFileSync(pidFile, 'utf8').trim();
  writeFileSync(join(state, 'server.pid'), `${pid}\n`);
  return { helper, pid };
}

function stopFakeServer({ helper, pid }) {
  try {
    process.kill(Number(pid), 'SIGKILL');
  } catch {}
  helper.kill('SIGKILL');
}

test('stop-server.sh não apaga diretório fora de /tmp via ..', () => {
  const stop = skillFile('brainstorming/scripts/stop-server.sh');
  const victim = mkdtempSync('/var/tmp/bento-stop-');
  const server = startFakeServer(victim, 'a'.repeat(64));
  writeFileSync(join(victim, 'morrer.txt'), 'x\n');
  const raw = `/tmp/../../var/tmp/${basename(victim)}`;
  try {
    const r = spawnSync('bash', [stop, raw], { encoding: 'utf8' });
    assert.ok(existsSync(join(victim, 'morrer.txt')), `vítima preservada (status=${r.status}, stderr=${r.stderr})`);
  } finally {
    stopFakeServer(server);
    rmSync(victim, { recursive: true, force: true });
  }
});

test('stop-server.sh remove sessão genuína em /tmp', () => {
  const stop = skillFile('brainstorming/scripts/stop-server.sh');
  const session = mkdtempSync('/tmp/bento-stop-');
  const server = startFakeServer(session, 'b'.repeat(64));
  try {
    const r = spawnSync('bash', [stop, session], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('"stopped"'));
    assert.ok(!existsSync(session));
  } finally {
    stopFakeServer(server);
  }
});

test('find-polluter.sh usa TEST_CMD para rodar um arquivo por vez', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-polluter-'));
  writeFileSync(join(dir, 'a.test.js'), '');
  writeFileSync(join(dir, 'b.test.js'), '');
  const log = join(dir, 'calls.log');
  const pollution = join(dir, 'pollution');
  const recorder = join(dir, 'run-test.sh');
  writeFileSync(recorder, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$LOG"\ntouch "$POLLUTION"\n');
  chmodSync(recorder, 0o755);
  const r = spawnSync('bash', [skillFile('systematic-debugging/find-polluter.sh'), pollution, '*.test.js'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, TEST_CMD: recorder, LOG: log, POLLUTION: pollution },
  });
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes('FOUND POLLUTER'));
  const calls = readFileSync(log, 'utf8').trim().split('\n');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith('a.test.js'));
});

test('render-graphs.cjs roda em contexto ESM', () => {
  const script = skillFile('writing-skills/render-graphs.cjs');
  assert.ok(existsSync(script));
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes('Usage'));
  assert.ok(!r.stderr.includes('require is not defined'));
});

test('writing-skills/SKILL.md referencia render-graphs.cjs', () => {
  const md = readFileSync(skillFile('writing-skills/SKILL.md'), 'utf8');
  assert.ok(md.includes('render-graphs.cjs'));
  assert.ok(!md.includes('render-graphs.js'));
});
