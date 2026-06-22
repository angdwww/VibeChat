import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequestBlock } from '../src/parser.js';

test('parses a plain JSON request block', () => {
  const request = parseRequestBlock('{"version":1,"operations":[{"type":"session_info"}]}');
  assert.equal(request.version, 1);
  assert.deepEqual(request.operations, [{ type: 'session_info' }]);
});

test('parses a fenced JSON request block', () => {
  const input = [
    '```json',
    '{"version":1,"summary":"Inspect","operations":[{"type":"tree","path":"."}]}',
    '```'
  ].join('\n');
  const request = parseRequestBlock(input);
  assert.equal(request.summary, 'Inspect');
  assert.deepEqual(request.operations, [{ type: 'tree', path: '.' }]);
});

test('parses a labeled VibeChat request fence', () => {
  const input = [
    '```vibechat-request',
    '{"version":1,"summary":"Inspect","operations":[{"type":"tree","path":"."}]}',
    '```'
  ].join('\n');
  const request = parseRequestBlock(input);
  assert.equal(request.summary, 'Inspect');
  assert.deepEqual(request.operations, [{ type: 'tree', path: '.' }]);
});

test('throws a readable error for invalid JSON', () => {
  assert.throws(
    () => parseRequestBlock('```json\n{"version":1,\n```'),
    /Could not parse VibeChat request JSON/
  );
});
