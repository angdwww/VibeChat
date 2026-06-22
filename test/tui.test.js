import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mainMenuItems,
  renderTuiDashboard
} from '../src/tui.js';

test('renders a dashboard-style TUI shell with menu choices and warnings', () => {
  const dashboard = renderTuiDashboard({
    cwd: '/tmp/project',
    session: { id: 'session-1', entries: [{}, {}] },
    usageLine: 'Today 10 | Week 20 | Month 30 | All 40',
    warnings: ['Daily usage is at 80%'],
    trustMode: 'edit',
    favorite: true
  });

  assert.match(dashboard, /VibeChat TUI/);
  assert.match(dashboard, /Today 10/);
  assert.match(dashboard, /Daily usage is at 80%/);
  assert.match(dashboard, /Trust: edit/);
  assert.match(dashboard, /Favorite: yes/);
});

test('exposes stable main menu actions', () => {
  const actions = mainMenuItems().map((item) => item.value);
  assert.deepEqual(actions, [
    'sessions',
    'usage',
    'history',
    'compact',
    'limits',
    'github',
    'trust',
    'watch',
    'help',
    'cancel'
  ]);
});
