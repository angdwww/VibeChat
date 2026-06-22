import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteBeforeCursor,
  insertComposerText,
  getComposerEnterAction,
  moveTranscriptScrollOffset,
  moveComposerCursor
} from '../src/tui-composer.js';

test('submits complete JSON only when Enter is pressed', () => {
  const action = getComposerEnterAction('{"version":1,"summary":"Patch UI","operations":[]}');

  assert.equal(action.action, 'submit');
});

test('keeps editing incomplete JSON after Enter', () => {
  const action = getComposerEnterAction('{"version":1,"summary":"Patch UI"');

  assert.equal(action.action, 'newline');
});

test('runs colon commands from the composer', () => {
  const action = getComposerEnterAction(':sessions');

  assert.deepEqual(action, { action: 'command', command: ':sessions' });
});

test('inserts and deletes text at the visible editor cursor', () => {
  const inserted = insertComposerText('{"summary"}', 2, 'version, ');
  assert.deepEqual(inserted, { value: '{"version, summary"}', cursor: 11 });

  const deleted = deleteBeforeCursor(inserted.value, inserted.cursor);
  assert.deepEqual(deleted, { value: '{"version,summary"}', cursor: 10 });
});

test('moves the editor cursor with left right and vertical arrows', () => {
  const value = 'alpha\nbeta\ngamma';

  assert.equal(moveComposerCursor(value, 2, 'left'), 1);
  assert.equal(moveComposerCursor(value, 2, 'right'), 3);
  assert.equal(moveComposerCursor(value, 2, 'down'), 8);
  assert.equal(moveComposerCursor(value, 8, 'up'), 2);
  assert.equal(moveComposerCursor(value, 8, 'end'), 10);
  assert.equal(moveComposerCursor(value, 8, 'home'), 6);
});

test('moves transcript history a page at a time without going below the latest view', () => {
  assert.equal(moveTranscriptScrollOffset(0, 'pageup', 8), 8);
  assert.equal(moveTranscriptScrollOffset(8, 'pageup', 8), 16);
  assert.equal(moveTranscriptScrollOffset(16, 'pagedown', 8), 8);
  assert.equal(moveTranscriptScrollOffset(8, 'pagedown', 8), 0);
  assert.equal(moveTranscriptScrollOffset(0, 'up', 8), 1);
  assert.equal(moveTranscriptScrollOffset(1, 'down', 8), 0);
});
