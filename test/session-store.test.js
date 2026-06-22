import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  appendSessionEntry,
  createSession,
  deleteSession,
  getSessionStoreRoot,
  listSessions,
  loadSession,
  resolveSessionId
} from '../src/session-store.js';

test('creates, loads, lists, and appends resumable sessions', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'vibechat-session-store-'));
  const env = { VIBECHAT_HOME: home };

  try {
    const session = await createSession({ cwd: '/tmp/project', env });
    assert.match(session.id, /^\d{8}-\d{6}-[a-f0-9]{6}$/);
    assert.equal(session.cwd, '/tmp/project');
    assert.deepEqual(session.entries, []);

    const updated = await appendSessionEntry(session.id, {
      cwd: '/tmp/project',
      summary: 'Inspect files',
      requestText: '{"operations":[]}',
      responseText: '```vibechat-response\n{}\n```',
      copiedToClipboard: true,
      operationCount: 2,
      failedCount: 0
    }, { env });

    assert.equal(updated.entries.length, 1);
    assert.equal(updated.entries[0].summary, 'Inspect files');
    assert.equal(updated.entries[0].operationCount, 2);

    const loaded = await loadSession(session.id, { env });
    assert.equal(loaded.entries.length, 1);

    const listed = await listSessions({ env });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, session.id);
    assert.equal(listed[0].entryCount, 1);
    assert.equal(listed[0].lastSummary, 'Inspect files');

    const resolved = await resolveSessionId(session.id.slice(0, 10), { env });
    assert.equal(resolved, session.id);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('session store root can be redirected for tests and portable installs', () => {
  const root = getSessionStoreRoot({ VIBECHAT_HOME: '/tmp/vibechat-home' });
  assert.equal(root, path.join('/tmp/vibechat-home', 'sessions'));
});

test('deletes sessions by unique id prefix', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'vibechat-session-delete-'));
  const env = { VIBECHAT_HOME: home };

  try {
    const session = await createSession({ cwd: '/tmp/project', env });
    await deleteSession(session.id.slice(0, 20), { env });
    assert.deepEqual(await listSessions({ env }), []);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
