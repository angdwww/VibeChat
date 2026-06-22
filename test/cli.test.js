import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { handleRequestText } from '../src/cli.js';
import { listSessions } from '../src/session-store.js';

async function runVibeWithInput(text, { env = {}, cwd = process.cwd() } = {}) {
  const tempHome = env.VIBECHAT_HOME || env.VIBECHAT_SESSIONS_DIR
    ? null
    : await mkdtemp(path.join(tmpdir(), 'vibechat-cli-'));
  const childEnv = {
    ...process.env,
    ...(tempHome ? { VIBECHAT_HOME: tempHome } : {}),
    ...env
  };

  try {
    const child = spawn(process.execPath, [path.resolve(process.cwd(), 'bin/vibe.js')], {
      cwd,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.stdin.end(text);
    const [code] = await once(child, 'close');
    return { code, stdout, stderr };
  } finally {
    if (tempHome) {
      await rm(tempHome, { recursive: true, force: true });
    }
  }
}

test('handles one request and copies formatted response', async () => {
  const writes = [];
  const output = await handleRequestText(
    '{"version":1,"summary":"Say hello","operations":[{"type":"note","message":"hello"}]}',
    {
      cwd: '/tmp/project',
      clipboard: { write: async (text) => writes.push(text) }
    }
  );

  assert.match(output, /VibeChat Response/);
  assert.match(output, /hello/);
  assert.match(output, /copiedToClipboard: true/);
  assert.equal(writes.length, 1);
  assert.equal(writes[0], output);
});

test('bin exits cleanly when piped input ends after a request', async () => {
  const { code, stdout, stderr } = await runVibeWithInput(
    '{"version":1,"summary":"Pipe smoke","operations":[{"type":"note","message":"hello"}]}\n'
  );

  assert.equal(code, 0);
  assert.match(stdout, /What it did: Pipe smoke/);
  assert.match(stdout, /noted hello/);
  assert.match(stdout, /Pipe smoke/);
  assert.doesNotMatch(stdout, /```vibechat-response/);
  assert.doesNotMatch(stdout, /"results"/);
  assert.doesNotMatch(stderr, /ERR_USE_AFTER_CLOSE/);
});

test('bin waits for complete pretty-printed JSON before executing', async () => {
  const { code, stdout, stderr } = await runVibeWithInput([
    '{',
    '  "version": 1,',
    '  "summary": "Pretty JSON smoke",',
    '  "operations": [',
    '    {',
    '      "type": "note",',
    '      "message": "hello"',
    '    },',
    '    {',
    '      "type": "finish",',
    '      "message": "done"',
    '    }',
    '  ]',
    '}',
    ''
  ].join('\n'));

  assert.equal(code, 0);
  assert.match(stdout, /What it did: Pretty JSON smoke/);
  assert.match(stdout, /Pretty JSON smoke/);
  assert.match(stdout, /finished done/);
  assert.doesNotMatch(stdout, /```vibechat-response/);
  assert.doesNotMatch(stdout, /VibeChat request must include an operations array/);
  assert.equal(stderr, '');
});

test('prints friendly banner, help, status, example, skill, and debug output', async () => {
  const { code, stdout, stderr } = await runVibeWithInput([
    ':help',
    ':status',
    ':example',
    ':skill',
    ':debug',
    '{',
    '  "version": 1,',
    '  "summary": "Debug smoke",',
    '  "operations": [',
    '    { "type": "note", "message": "hello" }',
    '  ]',
    '}',
    ':exit',
    ''
  ].join('\n'));

  assert.equal(code, 0);
  assert.match(stdout, /VibeChat Local Console/);
  assert.match(stdout, /Commands/);
  assert.match(stdout, /Session Status/);
  assert.match(stdout, /Example Request/);
  assert.match(stdout, /SKILLS.md/);
  assert.match(stdout, /Debug mode: on/);
  assert.match(stdout, /Request debug/);
  assert.match(stdout, /Run Summary/);
  assert.match(stdout, /Debug smoke/);
  assert.doesNotMatch(stdout, /```vibechat-response/);
  assert.equal(stderr, '');
});

test('prints friendly parse guidance for invalid complete JSON', async () => {
  const { code, stdout, stderr } = await runVibeWithInput('{"version":1,"operations":}\n');

  assert.equal(code, 0);
  assert.match(stdout, /Could not run request/);
  assert.match(stdout, /JSON/);
  assert.match(stdout, /Tip/);
  assert.equal(stderr, '');
});

test('records requests in a browsable session history', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'vibechat-cli-sessions-'));
  const env = { VIBECHAT_HOME: home };

  try {
    const { code, stdout, stderr } = await runVibeWithInput([
      '{"version":1,"summary":"History smoke","operations":[{"type":"note","message":"saved"}]}',
      ':history',
      ':usage',
      ':last',
      ':sessions',
      ':doctor',
      ':copy-last',
      ':exit',
      ''
    ].join('\n'), { env });

    assert.equal(code, 0);
    assert.match(stdout, /Session id:/);
    assert.match(stdout, /Session History/);
    assert.match(stdout, /What it did/);
    assert.match(stdout, /Usage Dashboard/);
    assert.match(stdout, /Today 1/);
    assert.match(stdout, /History smoke/);
    assert.match(stdout, /Last Run/);
    assert.match(stdout, /Saved Sessions/);
    assert.match(stdout, /VibeChat Doctor/);
    assert.match(stdout, /Last response/);
    assert.equal(stderr, '');

    const sessions = await listSessions({ env });
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].entryCount, 1);
    assert.equal(sessions[0].lastSummary, 'History smoke');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('rejects requests without a human-readable summary', async () => {
  const { code, stdout, stderr } = await runVibeWithInput(
    '{"version":1,"operations":[{"type":"note","message":"hello"}]}\n'
  );

  assert.equal(code, 0);
  assert.match(stdout, /summary/);
  assert.match(stdout, /human-readable/);
  assert.doesNotMatch(stdout, /VibeChat Response/);
  assert.equal(stderr, '');
});

test('resumes an existing session by id prefix', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'vibechat-cli-resume-'));
  const env = { VIBECHAT_HOME: home };

  try {
    await runVibeWithInput([
      '{"version":1,"summary":"Original session","operations":[{"type":"note","message":"saved"}]}',
      ':exit',
      ''
    ].join('\n'), { env });

    const [session] = await listSessions({ env });
    const { code, stdout, stderr } = await runVibeWithInput([
      `:resume ${session.id.slice(0, 10)}`,
      ':history',
      ':exit',
      ''
    ].join('\n'), { env });

    assert.equal(code, 0);
    assert.match(stdout, /Resumed session/);
    assert.match(stdout, /Original session/);
    assert.equal(stderr, '');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('exposes TUI utility commands for limits history favorites trust watch and git', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'vibechat-cli-tools-'));
  const cwd = await mkdtemp(path.join(tmpdir(), 'vibechat-cli-tools-cwd-'));
  const env = { VIBECHAT_HOME: home };

  try {
    const { code, stdout, stderr } = await runVibeWithInput([
      '{"version":1,"summary":"Patch a tracked file","operations":[{"type":"write","path":"tmp-vibechat-cli-tools.txt","content":"hello"}]}',
      ':menu',
      ':limits profile chatgpt-plus',
      ':limits set daily 2',
      ':trust read-only',
      ':trust shell',
      ':favorite',
      ':favorites',
      ':compact',
      ':search-history tracked',
      ':diff-last',
      ':undo-plan',
      ':export-session',
      ':watch npm test',
      ':watch off',
      ':github',
      ':exit',
      ''
    ].join('\n'), { env, cwd });

    assert.equal(code, 0);
    assert.match(stdout, /VibeChat TUI/);
    assert.match(stdout, /Limit profile: chatgpt-plus/);
    assert.match(stdout, /Daily limit set to 2/);
    assert.match(stdout, /Trust mode: read-only/);
    assert.match(stdout, /Trust mode: shell/);
    assert.match(stdout, /Favorite added/);
    assert.match(stdout, /Favorite Sessions/);
    assert.match(stdout, /VibeChat Compact Summary/);
    assert.match(stdout, /History Search/);
    assert.match(stdout, /Changed paths/);
    assert.match(stdout, /Undo Plan/);
    assert.match(stdout, /Exported session/);
    assert.match(stdout, /Watch command set/);
    assert.match(stdout, /Watch disabled/);
    assert.match(stdout, /GitHub Workflow/);
    assert.equal(stderr, '');
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});
