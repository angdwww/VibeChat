import test from 'node:test';
import assert from 'node:assert/strict';
import { getComposerEditorRowCount, renderTuiScreen } from '../src/tui-screen.js';

test('renders a two-panel terminal screen with activity, sidebar, and composer', () => {
  const screen = renderTuiScreen({
    columns: 96,
    rows: 28,
    title: 'Patch landing page',
    cwd: '/tmp/project',
    sessionId: 'session-1',
    usageLine: 'Today 1 | Week 2 | Month 3 | All 4',
    trustMode: 'shell',
    warnings: ['Daily usage is at 80%'],
    activity: [
      { role: 'user', text: 'Patch landing page' },
      {
        role: 'assistant',
        title: 'VibeChat',
        lines: [
          { kind: 'success', text: 'read index.html' },
          { kind: 'success', text: 'wrote 105 bytes to index.html' }
        ]
      }
    ],
    composer: '{"summary":"Patch landing page"}',
    composerCursor: 3
  });

  assert.match(screen, /VibeChat/);
  assert.match(screen, /You/);
  assert.match(screen, /Patch landing page/);
  assert.match(screen, /read index\.html/);
  assert.match(screen, /wrote 105 bytes/);
  assert.match(screen, /Usage/);
  assert.match(screen, /Trust/);
  assert.match(screen, /Enter send/);
  assert.match(screen, /Today 1 \| Week 2 \| Month 3 \| All 4/);
  assert.match(screen, /\x1b\[48;5;24m/);
  assert.doesNotMatch(screen, /```vibechat-response/);
  assert.doesNotMatch(screen, /complete JSON auto-runs/);
  assert.ok(screen.startsWith('\x1b[H'));
  assert.doesNotMatch(screen, /\x1b\[2J/);
  assert.equal(screen.split('\n').length, 28);
});

test('shows chatbot onboarding in the empty transcript and a real editor placeholder', () => {
  const screen = renderTuiScreen({
    columns: 96,
    rows: 28,
    cwd: '/tmp/project',
    sessionId: 'session-1',
    usageLine: 'Today 0 | Week 0 | Month 0 | All 0',
    skillPath: '/opt/vibechat/SKILLS.md',
    activity: [],
    composer: '',
    composerCursor: 0
  });

  assert.match(screen, /Getting Started/);
  assert.match(screen, /ChatGPT Plus/);
  assert.match(screen, /\/opt\/vibechat\/SKILLS\.md/);
  assert.match(screen, /inspect the current project/);
  assert.match(screen, /Paste or type one VibeChat request here\./);
  assert.match(screen, /Arrows edit/);
});

test('collapses to one panel without writing past a narrow terminal width', () => {
  const screen = renderTuiScreen({
    columns: 50,
    rows: 22,
    activity: [],
    composer: '',
    usageLine: 'Today 0 | Week 0 | Month 0 | All 0'
  });
  const visibleLines = screen
    .replace(/\x1b\[H/g, '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n');

  assert.equal(visibleLines.length, 22);
  assert.ok(visibleLines.every((line) => line.length <= 50));
  assert.doesNotMatch(screen, / Status/);
  assert.match(screen, /Getting Started/);
  assert.match(screen, /ChatGPT Plus/);
});

test('uses a prompt-style composer, highlights clipboard success, and shows live settings', () => {
  const screen = renderTuiScreen({
    columns: 100,
    rows: 28,
    composer: '',
    status: 'Request complete. Full response copied to clipboard.',
    usageLine: 'Today 2 | Week 4 | Month 8 | All 12',
    trustMode: 'edit',
    limits: { profile: 'chatgpt-plus', daily: 80, weekly: 560, monthly: 2400 },
    favorite: true,
    watchCommand: 'npm test',
    activity: [
      {
        role: 'assistant',
        lines: [{ kind: 'clipboard', text: 'copied full response to clipboard' }]
      }
    ]
  });

  assert.match(screen, /Paste or type one VibeChat request here\./);
  assert.doesNotMatch(screen, /\+─+\+/);
  assert.match(screen, /PgUp\/PgDn scroll/);
  assert.match(screen, /Ctrl\+Y copy/);
  assert.match(screen, /Ctrl\+L clear/);
  assert.match(screen, /Ctrl\+C quit/);
  assert.match(screen, /Enter send.*Arrows edit.*PgUp\/PgDn scroll.*Ctrl\+Y copy.*Ctrl\+L clear.*Ctrl\+C quit.*:menu/);
  assert.match(screen, /Settings/);
  assert.match(screen, /chatgpt-plus/);
  assert.match(screen, /Watch npm test/);
  assert.match(screen, /Favorite on/);
  assert.match(screen, /\x1b\[48;5;22m/);
  assert.match(screen, /Request complete\. Full response copied to clipboard\./);
});

test('grows the composer from one row to at most five rows as text wraps', () => {
  assert.equal(getComposerEditorRowCount('', 40), 1);
  assert.equal(getComposerEditorRowCount('one\ntwo', 40), 2);
  assert.equal(getComposerEditorRowCount('x'.repeat(1000), 40), 5);
});

test('scrolls the transcript back through older messages', () => {
  const activity = Array.from({ length: 8 }, (_, index) => ({
    role: 'system',
    text: `History item ${index + 1}`
  }));
  const latest = renderTuiScreen({ columns: 90, rows: 22, activity, transcriptScrollOffset: 0 });
  const older = renderTuiScreen({ columns: 90, rows: 22, activity, transcriptScrollOffset: 100 });

  assert.match(latest, /History item 8/);
  assert.doesNotMatch(latest, /History item 1/);
  assert.match(older, /History item 1/);
});

test('repairs unsafe transcript content without letting it break the terminal frame', () => {
  const screen = renderTuiScreen({
    columns: 90,
    rows: 22,
    activity: [{
      role: 'assistant',
      lines: [{ kind: 'success', text: 'first line\nsecond line\x1b[2Jterminal control' }]
    }]
  });

  assert.equal(screen.split('\n').length, 22);
  assert.match(screen, /first line/);
  assert.match(screen, /second line/);
  assert.doesNotMatch(screen, /\x1b\[2J/);
});
