import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  defaultConfig,
  loadConfig,
  saveConfig,
  setLimit,
  setLimitProfile,
  toggleFavorite,
  validateTrustForRequest
} from '../src/config.js';

test('loads default config and persists custom limits', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'vibechat-config-'));
  const env = { VIBECHAT_HOME: home };

  try {
    const config = await loadConfig({ env });
    assert.equal(config.trustMode, 'shell');
    assert.equal(config.limits.profile, 'custom');

    const updated = setLimit(config, 'daily', 50);
    await saveConfig(updated, { env });

    const reloaded = await loadConfig({ env });
    assert.equal(reloaded.limits.daily, 50);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('applies named limit profiles and toggles favorite sessions', () => {
  const config = setLimitProfile(defaultConfig(), 'chatgpt-plus');
  assert.equal(config.limits.profile, 'chatgpt-plus');
  assert.equal(config.limits.daily > 0, true);

  const withFavorite = toggleFavorite(config, 'session-1');
  assert.deepEqual(withFavorite.favorites, ['session-1']);

  const withoutFavorite = toggleFavorite(withFavorite, 'session-1');
  assert.deepEqual(withoutFavorite.favorites, []);
});

test('trust modes reject unsafe operation types', () => {
  assert.doesNotThrow(() => validateTrustForRequest(
    { operations: [{ type: 'read', paths: ['a.txt'] }] },
    { trustMode: 'read-only' }
  ));

  assert.throws(() => validateTrustForRequest(
    { operations: [{ type: 'write', path: 'a.txt', content: 'x' }] },
    { trustMode: 'read-only' }
  ), /blocked by read-only/);

  assert.throws(() => validateTrustForRequest(
    { operations: [{ type: 'shell', command: 'npm test' }] },
    { trustMode: 'edit' }
  ), /blocked by edit/);
});
