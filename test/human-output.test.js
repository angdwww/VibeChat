import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityItemsFromResponse,
  activityItemsFromSessionEntries,
  describeOperationResult,
  renderHumanRun
} from '../src/human-output.js';

test('describes operation results in readable human language', () => {
  assert.equal(describeOperationResult({
    type: 'read',
    ok: true,
    output: { files: [{ path: 'index.html', bytes: 120 }] }
  }), 'read index.html (120 bytes)');

  assert.equal(describeOperationResult({
    type: 'write',
    ok: true,
    output: { path: 'index.html', bytes: 105 }
  }), 'wrote 105 bytes to index.html');

  assert.equal(describeOperationResult({
    type: 'patch',
    ok: true,
    output: { paths: ['src/app.js'] }
  }), 'patched src/app.js');

  assert.equal(describeOperationResult({
    type: 'shell',
    ok: true,
    output: { command: 'npm test', exitCode: 0 }
  }), 'ran npm test (exit 0)');

  const multilineShell = describeOperationResult({
    type: 'shell',
    ok: true,
    output: { command: "cd /tmp && python3 - <<'PY'\nfrom pathlib import Path\nPY", exitCode: 0 }
  });
  assert.doesNotMatch(multilineShell, /\n/);
  assert.match(multilineShell, /ran cd \/tmp && python3/);
});

test('marks the clipboard completion item for distinct TUI rendering', () => {
  const response = [
    '```vibechat-response',
    JSON.stringify({ summary: 'Inspect', copiedToClipboard: true, results: [] }, null, 2),
    '```'
  ].join('\n');

  const items = activityItemsFromResponse(response);
  assert.equal(items.at(-1).kind, 'clipboard');
  assert.match(items.at(-1).text, /full response copied/);
});

test('rebuilds a readable transcript from saved session entries', () => {
  const response = [
    '```vibechat-response',
    JSON.stringify({
      summary: 'Inspect project',
      copiedToClipboard: true,
      results: [{ index: 1, type: 'read', ok: true, output: { files: [{ path: 'package.json', bytes: 120 }] } }]
    }, null, 2),
    '```'
  ].join('\n');

  const transcript = activityItemsFromSessionEntries([{ summary: 'Inspect project', responseText: response }]);

  assert.deepEqual(transcript[0], { role: 'user', text: 'Inspect project' });
  assert.equal(transcript[1].role, 'assistant');
  assert.match(transcript[1].lines[0].text, /read package\.json/);
  assert.equal(transcript[1].lines.at(-1).kind, 'clipboard');
});

test('renders a human-readable run without raw response JSON', () => {
  const output = renderHumanRun({
    summary: 'Patch landing page',
    copiedToClipboard: true,
    results: [
      {
        index: 1,
        type: 'read',
        ok: true,
        output: { files: [{ path: 'index.html', bytes: 120 }] }
      },
      {
        index: 2,
        type: 'write',
        ok: true,
        output: { path: 'index.html', bytes: 105 }
      }
    ]
  });

  assert.match(output, /What it did: Patch landing page/);
  assert.match(output, /read index\.html/);
  assert.match(output, /wrote 105 bytes to index\.html/);
  assert.match(output, /Copied full response to clipboard/);
  assert.doesNotMatch(output, /```vibechat-response/);
  assert.doesNotMatch(output, /"results"/);
});
