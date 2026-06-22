import test from 'node:test';
import assert from 'node:assert/strict';
import {
  moveSelection,
  renderSelectionMenu
} from '../src/interactive.js';

test('moves selection with wraparound for arrow-key menus', () => {
  assert.equal(moveSelection(0, 1, 3), 1);
  assert.equal(moveSelection(2, 1, 3), 0);
  assert.equal(moveSelection(0, -1, 3), 2);
  assert.equal(moveSelection(0, 1, 0), 0);
});

test('renders selectable sessions with keyboard instructions', () => {
  const menu = renderSelectionMenu({
    title: 'Select Session',
    items: [
      { label: 'First session', detail: '2 requests' },
      { label: 'Second session', detail: '4 requests' }
    ],
    selectedIndex: 1
  });

  assert.match(menu, /Select Session/);
  assert.match(menu, /Use arrow keys/);
  assert.match(menu, /First session/);
  assert.match(menu, /> Second session/);
  assert.match(menu, /4 requests/);
});
