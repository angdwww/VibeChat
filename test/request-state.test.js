import test from 'node:test';
import assert from 'node:assert/strict';
import { getRequestState } from '../src/request-state.js';

test('detects complete pretty-printed JSON with nested operations', () => {
  const state = getRequestState([
    '{',
    '  "version": 1,',
    '  "operations": [',
    '    { "type": "note", "message": "hello" }',
    '  ]',
    '}'
  ].join('\n'));

  assert.equal(state.complete, true);
  assert.equal(state.kind, 'json');
  assert.equal(state.depth, 0);
});

test('detects incomplete JSON and reports current depth', () => {
  const state = getRequestState([
    '{',
    '  "version": 1,',
    '  "operations": [',
    '    { "type": "note" }'
  ].join('\n'));

  assert.equal(state.complete, false);
  assert.equal(state.kind, 'json');
  assert.equal(state.depth > 0, true);
});

test('ignores braces inside JSON strings', () => {
  const state = getRequestState('{"operations":[{"type":"note","message":"} still text"}]}');

  assert.equal(state.complete, true);
  assert.equal(state.depth, 0);
});

test('detects fenced request blocks', () => {
  const state = getRequestState([
    '```json',
    '{"operations":[{"type":"note","message":"hello"}]}',
    '```'
  ].join('\n'));

  assert.equal(state.complete, true);
  assert.equal(state.kind, 'fence');
});
