import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runOperation } from '../src/operations.js';

async function tempRoot() {
  return mkdtemp(path.join(tmpdir(), 'vibechat-'));
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

test('writes, reads, appends, stats, moves, copies, and removes files', async () => {
  const cwd = await tempRoot();

  assert.equal((await runOperation({ type: 'mkdir', path: 'src' }, { cwd })).ok, true);
  assert.equal((await runOperation({ type: 'write', path: 'src/a.txt', content: 'alpha' }, { cwd })).ok, true);
  assert.equal((await runOperation({ type: 'append', path: 'src/a.txt', content: '\nbeta' }, { cwd })).ok, true);

  const read = await runOperation({ type: 'read', paths: ['src/a.txt'] }, { cwd });
  assert.equal(read.ok, true);
  assert.equal(read.output.files[0].content, 'alpha\nbeta');

  const stat = await runOperation({ type: 'stat', paths: ['src/a.txt'] }, { cwd });
  assert.equal(stat.output.entries[0].isFile, true);

  assert.equal((await runOperation({ type: 'copy', from: 'src/a.txt', to: 'src/b.txt' }, { cwd })).ok, true);
  assert.equal((await runOperation({ type: 'move', from: 'src/b.txt', to: 'src/c.txt' }, { cwd })).ok, true);
  assert.equal(await readFile(path.join(cwd, 'src/c.txt'), 'utf8'), 'alpha\nbeta');

  assert.equal((await runOperation({ type: 'rm', path: 'src/c.txt' }, { cwd })).ok, true);
});

test('lists, trees, and searches local files', async () => {
  const cwd = await tempRoot();
  await mkdir(path.join(cwd, 'docs'), { recursive: true });
  await writeFile(path.join(cwd, 'docs/readme.md'), 'hello vibe\nsecond line', 'utf8');

  const list = await runOperation({ type: 'list', path: '.' }, { cwd });
  assert.equal(list.ok, true);
  assert.equal(list.output.entries.some((entry) => entry.name === 'docs'), true);

  const tree = await runOperation({ type: 'tree', path: '.', depth: 2 }, { cwd });
  assert.match(tree.output.tree, /docs/);
  assert.match(tree.output.tree, /readme.md/);

  const search = await runOperation({ type: 'search', query: 'vibe', path: '.' }, { cwd });
  assert.equal(search.ok, true);
  assert.equal(search.output.matches[0].path, 'docs/readme.md');
});

test('blocks session path escapes', async () => {
  const cwd = await tempRoot();
  const result = await runOperation({ type: 'write', path: '../escape.txt', content: 'nope' }, { cwd });
  assert.equal(result.ok, false);
  assert.match(result.error, /outside the VibeChat session root/);
});

test('patch refuses to modify files through symlinks outside the session root', async () => {
  const cwd = await tempRoot();
  const external = await tempRoot();
  const externalFile = path.join(external, 'target.txt');
  await writeFile(externalFile, 'safe\n', 'utf8');
  await symlink(externalFile, path.join(cwd, 'link.txt'));

  const result = await runOperation({
    type: 'patch',
    patch: [
      '--- a/link.txt',
      '+++ b/link.txt',
      '@@ -1 +1 @@',
      '-safe',
      '+changed',
      ''
    ].join('\n')
  }, { cwd });

  assert.equal(result.ok, false);
  assert.equal(await readFile(externalFile, 'utf8'), 'safe\n');
});

test('search does not traverse symlinked directories outside the session root', async () => {
  const cwd = await tempRoot();
  const external = await tempRoot();
  await writeFile(path.join(external, 'secret.txt'), 'outside vibe match', 'utf8');
  await symlink(external, path.join(cwd, 'external-link'));

  const result = await runOperation({ type: 'search', query: 'vibe', path: '.' }, { cwd });

  assert.equal(result.ok, true);
  assert.deepEqual(result.output.matches, []);
});

test('read, stat, and list reject symlinked targets outside the session root', async () => {
  const cwd = await tempRoot();
  const external = await tempRoot();
  await writeFile(path.join(external, 'secret.txt'), 'outside data', 'utf8');
  await symlink(path.join(external, 'secret.txt'), path.join(cwd, 'file-link.txt'));
  await symlink(external, path.join(cwd, 'dir-link'));

  const read = await runOperation({ type: 'read', paths: ['file-link.txt'] }, { cwd });
  const stat = await runOperation({ type: 'stat', paths: ['file-link.txt'] }, { cwd });
  const list = await runOperation({ type: 'list', path: 'dir-link' }, { cwd });

  assert.equal(read.ok, false);
  assert.equal(stat.ok, false);
  assert.equal(list.ok, false);
});

test('mkdir, rm, move, and copy reject symlinked destination parents', async () => {
  const cwd = await tempRoot();
  const external = await tempRoot();
  const externalVictim = path.join(external, 'victim.txt');
  await writeFile(path.join(cwd, 'source.txt'), 'inside', 'utf8');
  await writeFile(externalVictim, 'outside', 'utf8');
  await symlink(external, path.join(cwd, 'dir-link'));

  const mkdirResult = await runOperation({ type: 'mkdir', path: 'dir-link/new-dir' }, { cwd });
  const rmResult = await runOperation({ type: 'rm', path: 'dir-link/victim.txt' }, { cwd });
  const moveResult = await runOperation({ type: 'move', from: 'source.txt', to: 'dir-link/moved.txt' }, { cwd });
  const copyResult = await runOperation({ type: 'copy', from: 'source.txt', to: 'dir-link/copied.txt' }, { cwd });

  assert.equal(mkdirResult.ok, false);
  assert.equal(rmResult.ok, false);
  assert.equal(moveResult.ok, false);
  assert.equal(copyResult.ok, false);
  assert.equal(await readFile(externalVictim, 'utf8'), 'outside');
  assert.equal(await exists(path.join(external, 'new-dir')), false);
  assert.equal(await exists(path.join(external, 'moved.txt')), false);
  assert.equal(await exists(path.join(external, 'copied.txt')), false);
});

test('reports session info, simple message operations, clipboard, and unknown types', async () => {
  const cwd = await tempRoot();
  await writeFile(path.join(cwd, 'package.json'), '{"version":"9.8.7"}', 'utf8');
  const writes = [];
  const clipboard = {
    write: async (text) => writes.push(text),
    read: async () => 'clipboard text'
  };

  const session = await runOperation({ type: 'session_info' }, { cwd });
  const clipWrite = await runOperation({ type: 'clipboard', text: 'copy me' }, { cwd, clipboard });
  const clipRead = await runOperation({ type: 'clipboard', action: 'read' }, { cwd, clipboard });
  const note = await runOperation({ type: 'note', message: 'remember this' }, { cwd });
  const finish = await runOperation({ type: 'finish', message: 'all set' }, { cwd });
  const unknown = await runOperation({ type: 'wat' }, { cwd });

  assert.equal(session.ok, true);
  assert.equal(session.output.cwd, cwd);
  assert.equal(session.output.version, '9.8.7');
  assert.equal(session.output.operations.includes('shell'), true);
  assert.equal(clipWrite.ok, true);
  assert.deepEqual(writes, ['copy me']);
  assert.equal(clipRead.output.text, 'clipboard text');
  assert.deepEqual(note, { ok: true, output: { message: 'remember this' } });
  assert.deepEqual(finish, { ok: true, output: { message: 'all set' } });
  assert.deepEqual(unknown, { ok: false, error: 'Unknown operation type: wat' });
});

test('shell reports non-zero exits without failing the operation', async () => {
  const cwd = await tempRoot();
  const result = await runOperation({
    type: 'shell',
    command: 'node -e "console.error(\'bad\'); process.exit(7)"'
  }, { cwd });

  assert.equal(result.ok, true);
  assert.equal(result.output.exitCode, 7);
  assert.match(result.output.stderr, /bad/);
});

test('shell rejects very large inline commands', async () => {
  const cwd = await tempRoot();
  const result = await runOperation({
    type: 'shell',
    command: `node -e "${'x'.repeat(13000)}"`
  }, { cwd });

  assert.equal(result.ok, false);
  assert.match(result.error, /shell.command is too large/);
  assert.match(result.error, /write/);
});

test('read maxBytes, patch, regex search, skip dirs, and rm guard behavior', async () => {
  const cwd = await tempRoot();
  await mkdir(path.join(cwd, 'docs'), { recursive: true });
  await mkdir(path.join(cwd, 'node_modules/pkg'), { recursive: true });
  await mkdir(path.join(cwd, 'build'), { recursive: true });
  await writeFile(path.join(cwd, 'docs/readme.md'), 'hello vibe\nsecond line\n', 'utf8');
  await writeFile(path.join(cwd, 'node_modules/pkg/hidden.txt'), 'vibe in dependency', 'utf8');
  await writeFile(path.join(cwd, 'build/hidden.txt'), 'hidden build file', 'utf8');

  const tooLarge = await runOperation({ type: 'read', paths: ['docs/readme.md'], maxBytes: 3 }, { cwd });
  const patch = await runOperation({
    type: 'patch',
    patch: [
      '--- a/docs/readme.md',
      '+++ b/docs/readme.md',
      '@@ -1,2 +1,2 @@',
      '-hello vibe',
      '+hello patch',
      ' second line',
      ''
    ].join('\n')
  }, { cwd });
  const search = await runOperation({ type: 'search', query: 'hello\\s+patch', regex: true, path: '.' }, { cwd });
  const skippedSearch = await runOperation({ type: 'search', query: 'dependency', path: '.' }, { cwd });
  const tree = await runOperation({ type: 'tree', path: '.', depth: 3 }, { cwd });
  const rmGuard = await runOperation({ type: 'rm', path: 'docs' }, { cwd });

  assert.equal(tooLarge.ok, false);
  assert.match(tooLarge.error, /maxBytes/);
  assert.equal(patch.ok, true);
  assert.deepEqual(patch.output.paths, ['docs/readme.md']);
  assert.equal(search.output.matches[0].path, 'docs/readme.md');
  assert.deepEqual(skippedSearch.output.matches, []);
  assert.doesNotMatch(tree.output.tree, /node_modules/);
  assert.doesNotMatch(tree.output.tree, /build/);
  assert.equal(rmGuard.ok, false);
  assert.match(rmGuard.error, /Directory is not empty/);
});

test('copy rejects directory trees containing symlinks before creating the destination', async () => {
  const cwd = await tempRoot();
  const external = await tempRoot();
  await mkdir(path.join(cwd, 'src/nested'), { recursive: true });
  await writeFile(path.join(cwd, 'src/nested/inside.txt'), 'inside', 'utf8');
  await writeFile(path.join(external, 'outside.txt'), 'outside', 'utf8');
  await symlink(path.join(external, 'outside.txt'), path.join(cwd, 'src/nested/outside-link.txt'));

  const result = await runOperation({ type: 'copy', from: 'src', to: 'copy-of-src' }, { cwd });

  assert.equal(result.ok, false);
  assert.equal(await exists(path.join(cwd, 'copy-of-src')), false);
});

test('copy rejects symlinked source trees before creating destination parents', async () => {
  const cwd = await tempRoot();
  const external = await tempRoot();
  await mkdir(path.join(cwd, 'src/nested'), { recursive: true });
  await writeFile(path.join(cwd, 'src/nested/inside.txt'), 'inside', 'utf8');
  await writeFile(path.join(external, 'outside.txt'), 'outside', 'utf8');
  await symlink(path.join(external, 'outside.txt'), path.join(cwd, 'src/nested/outside-link.txt'));

  const result = await runOperation({ type: 'copy', from: 'src', to: 'new-parent/copy-of-src' }, { cwd });

  assert.equal(result.ok, false);
  assert.equal(await exists(path.join(cwd, 'new-parent/copy-of-src')), false);
  assert.equal(await exists(path.join(cwd, 'new-parent')), false);
});

test('multi-file patch leaves all files unchanged when a later patch fails', async () => {
  const cwd = await tempRoot();
  await writeFile(path.join(cwd, 'a.txt'), 'alpha\n', 'utf8');
  await writeFile(path.join(cwd, 'b.txt'), 'beta\n', 'utf8');

  const result = await runOperation({
    type: 'patch',
    patch: [
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1 +1 @@',
      '-alpha',
      '+changed alpha',
      '--- a/b.txt',
      '+++ b/b.txt',
      '@@ -1 +1 @@',
      '-missing beta',
      '+changed beta',
      ''
    ].join('\n')
  }, { cwd });

  assert.equal(result.ok, false);
  assert.equal(await readFile(path.join(cwd, 'a.txt'), 'utf8'), 'alpha\n');
  assert.equal(await readFile(path.join(cwd, 'b.txt'), 'utf8'), 'beta\n');
});

test('patch composes repeated sections for the same file', async () => {
  const cwd = await tempRoot();
  await writeFile(path.join(cwd, 'a.txt'), 'one\ntwo\nthree\n', 'utf8');

  const result = await runOperation({
    type: 'patch',
    patch: [
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1 +1 @@',
      '-one',
      '+ONE',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -3 +3 @@',
      '-three',
      '+THREE',
      ''
    ].join('\n')
  }, { cwd });

  assert.equal(result.ok, true);
  assert.deepEqual(result.output.paths, ['a.txt']);
  assert.equal(await readFile(path.join(cwd, 'a.txt'), 'utf8'), 'ONE\ntwo\nTHREE\n');
});
