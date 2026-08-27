import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumstat, summarize } from '../lib/diff.mjs';

test('parseNumstat com linhas normais e binárias', () => {
  const files = parseNumstat('10\t2\tsrc/a.ts\n-\t-\tsrc/b.bin\n');
  assert.equal(files.length, 2);
  assert.deepEqual(files[0], { path: 'src/a.ts', added: 10, deleted: 2 });
  assert.deepEqual(files[1], { path: 'src/b.bin', added: 0, deleted: 0 });
});

test('parseNumstat ignora linhas inválidas', () => {
  const files = parseNumstat('lixo aqui\n');
  assert.deepEqual(files, []);
});

test('summarize totaliza linhas, arquivos e agrupa por diretório raiz', () => {
  const files = [
    { path: 'src/a.ts', added: 10, deleted: 2 },
    { path: 'src/b.ts', added: 3, deleted: 0 },
    { path: 'supabase/functions/x/index.ts', added: 1, deleted: 1 },
  ];
  const s = summarize(files);
  assert.equal(s.lines, 17);
  assert.equal(s.files, 3);
  assert.deepEqual(s.byDir, [['src', 2], ['supabase', 1]]);
});
