import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUsageDashboard,
  buildUsageSummary,
  contributionLevel
} from '../src/usage.js';

test('summarizes request usage for daily weekly monthly and lifetime windows', () => {
  const sessions = [
    {
      entries: [
        { createdAt: '2026-06-19T10:00:00.000Z' },
        { createdAt: '2026-06-19T11:00:00.000Z' },
        { createdAt: '2026-06-18T10:00:00.000Z' },
        { createdAt: '2026-06-01T10:00:00.000Z' },
        { createdAt: '2026-05-01T10:00:00.000Z' }
      ]
    }
  ];

  const usage = buildUsageSummary(sessions, { now: new Date('2026-06-19T12:00:00.000Z') });

  assert.equal(usage.today, 2);
  assert.equal(usage.week, 3);
  assert.equal(usage.month, 4);
  assert.equal(usage.lifetime, 5);
});

test('renders a compact activity dashboard with usage totals and day levels', () => {
  const sessions = [
    {
      entries: [
        { createdAt: '2026-06-19T10:00:00.000Z' },
        { createdAt: '2026-06-19T11:00:00.000Z' },
        { createdAt: '2026-06-18T10:00:00.000Z' }
      ]
    }
  ];

  const dashboard = buildUsageDashboard(sessions, {
    now: new Date('2026-06-19T12:00:00.000Z'),
    weeks: 2,
    color: false
  });

  assert.match(dashboard, /Usage Dashboard/);
  assert.match(dashboard, /Today 2/);
  assert.match(dashboard, /Week 3/);
  assert.match(dashboard, /Month 3/);
  assert.match(dashboard, /Lifetime 3/);
  assert.match(dashboard, /Activity/);
});

test('maps higher request counts to darker activity levels', () => {
  assert.equal(contributionLevel(0, 10), 0);
  assert.equal(contributionLevel(1, 10), 1);
  assert.equal(contributionLevel(5, 10), 3);
  assert.equal(contributionLevel(10, 10), 4);
});
