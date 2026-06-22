import test from 'node:test';
import assert from 'node:assert/strict';
import { formatResponse } from '../src/formatter.js';

function parsePayload(output) {
  const jsonStart = output.indexOf('{\n');
  const jsonEnd = output.lastIndexOf('\n```');
  return JSON.parse(output.slice(jsonStart, jsonEnd));
}

test('formats a paste-back response with cwd and operation results', () => {
  const results = [
    { index: 1, type: 'session_info', ok: true, output: { node: 'v20.0.0' } },
    { index: 2, type: 'read', ok: false, error: 'File not found: README.md' }
  ];
  const output = formatResponse({
    cwd: '/tmp/project',
    summary: 'Inspect repo',
    copiedToClipboard: true,
    clipboardError: '',
    results
  });

  assert.match(output, /VibeChat Response/);
  assert.match(output, /cwd: \/tmp\/project/);
  assert.match(output, /summary: Inspect repo/);
  assert.match(output, /copiedToClipboard: true/);
  assert.match(output, /"type": "session_info"/);
  assert.match(output, /File not found: README.md/);

  const payload = parsePayload(output);
  assert.equal(payload.cwd, '/tmp/project');
  assert.equal(payload.summary, 'Inspect repo');
  assert.equal(payload.copiedToClipboard, true);
  assert.equal(payload.clipboardError, '');
  assert.deepEqual(payload.results, results);
});

test('sanitizes multiline and fenced summary in header while preserving payload', () => {
  const summary = 'Inspect repo\n```vibechat-response\nnested fence';
  const output = formatResponse({
    cwd: '/tmp/project',
    summary,
    copiedToClipboard: false,
    results: []
  });

  const fenceDelimiters = output.match(/^```/gm) || [];
  assert.equal(fenceDelimiters.length, 2);

  const summaryLine = output.split('\n').find((line) => line.startsWith('summary: '));
  assert.equal(summaryLine, "summary: Inspect repo '''vibechat-response nested fence");

  const payload = parsePayload(output);
  assert.equal(payload.summary, summary);
});

test('compacts long strings in the paste-back payload', () => {
  const output = formatResponse({
    cwd: '/tmp/project',
    maxStringLength: 20,
    results: [
      {
        index: 1,
        type: 'shell',
        ok: true,
        output: {
          command: 'x'.repeat(80),
          stdout: 'y'.repeat(70),
          stderr: ''
        }
      }
    ]
  });

  const payload = parsePayload(output);
  assert.match(payload.results[0].output.command, /^\[truncated/);
  assert.match(payload.results[0].output.command, /chars omitted/);
  assert.match(payload.results[0].output.stdout, /^\[truncated/);
  assert.equal(payload.results[0].output.command.length < 80, true);
  assert.equal(payload.results[0].output.stdout.length < 70, true);
});
