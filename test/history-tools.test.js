import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCompactSummary,
  buildUndoPlan,
  collectChangedPathsFromResults,
  renderExportMarkdown,
  renderHistorySearch,
  searchHistory
} from '../src/history-tools.js';

const session = {
  id: '20260619-120000-abc123',
  cwd: '/tmp/project',
  createdAt: '2026-06-19T12:00:00.000Z',
  updatedAt: '2026-06-19T12:30:00.000Z',
  entries: [
    {
      id: '1',
      createdAt: '2026-06-19T12:01:00.000Z',
      summary: 'Inspect project',
      operationsLabel: '1 tree, 1 read',
      operationCount: 2,
      failedCount: 0,
      changedPaths: [],
      requestText: '{"summary":"Inspect project"}'
    },
    {
      id: '2',
      createdAt: '2026-06-19T12:02:00.000Z',
      summary: 'Patch CLI session picker',
      operationsLabel: '1 patch, 1 shell',
      operationCount: 2,
      failedCount: 0,
      changedPaths: ['src/cli.js'],
      requestText: '{"summary":"Patch CLI session picker"}'
    }
  ]
};

test('searches saved history by summary operation label and path', () => {
  const matches = searchHistory([session], 'picker');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].sessionId, session.id);
  assert.equal(matches[0].entry.summary, 'Patch CLI session picker');

  assert.match(renderHistorySearch(matches), /Patch CLI session picker/);
});

test('builds compact and exportable markdown summaries', () => {
  const compact = buildCompactSummary(session);
  assert.match(compact, /VibeChat Compact Summary/);
  assert.match(compact, /Patch CLI session picker/);

  const exported = renderExportMarkdown(session);
  assert.match(exported, /# VibeChat Session/);
  assert.match(exported, /## Request 2/);
});

test('collects changed paths and builds an undo plan', () => {
  const changedPaths = collectChangedPathsFromResults([
    { output: { path: 'a.txt' } },
    { output: { paths: ['b.txt', 'c.txt'] } }
  ]);

  assert.deepEqual(changedPaths, ['a.txt', 'b.txt', 'c.txt']);

  const undo = buildUndoPlan(session);
  assert.match(undo, /Undo Plan/);
  assert.match(undo, /src\/cli.js/);
  assert.match(undo, /git diff/);
});
