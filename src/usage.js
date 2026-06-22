const DAY_MS = 24 * 60 * 60 * 1000;
const LEVEL_CHARS = ['.', ':', '-', '=', '#'];
const LEVEL_COLORS = [
  '\x1b[48;5;236m  \x1b[0m',
  '\x1b[48;5;22m  \x1b[0m',
  '\x1b[48;5;28m  \x1b[0m',
  '\x1b[48;5;34m  \x1b[0m',
  '\x1b[48;5;40m  \x1b[0m'
];

export function buildUsageSummary(sessions, { now = new Date() } = {}) {
  const today = dateKey(now);
  const weekStart = startOfDay(now).getTime() - (6 * DAY_MS);
  const monthStart = startOfMonth(now).getTime();
  const countsByDay = requestCountsByDay(sessions);
  let week = 0;
  let month = 0;
  let lifetime = 0;

  for (const [day, count] of countsByDay.entries()) {
    const time = new Date(`${day}T00:00:00.000Z`).getTime();
    lifetime += count;
    if (time >= weekStart) {
      week += count;
    }
    if (time >= monthStart) {
      month += count;
    }
  }

  return {
    today: countsByDay.get(today) || 0,
    week,
    month,
    lifetime,
    countsByDay
  };
}

export function buildUsageDashboard(sessions, {
  now = new Date(),
  weeks = 13,
  color = true
} = {}) {
  const usage = buildUsageSummary(sessions, { now });
  const days = activityDays({ now, weeks });
  const max = Math.max(1, ...days.map((day) => usage.countsByDay.get(day) || 0));
  const rows = [];

  for (let weekday = 0; weekday < 7; weekday += 1) {
    const cells = [];
    for (let week = 0; week < weeks; week += 1) {
      const day = days[(week * 7) + weekday];
      const count = usage.countsByDay.get(day) || 0;
      cells.push(renderLevel(contributionLevel(count, max), color));
    }
    rows.push(`${weekdayLabel(weekday)} ${cells.join('')}`);
  }

  return [
    '',
    'Usage Dashboard',
    '---------------',
    `Today ${usage.today} | Week ${usage.week} | Month ${usage.month} | Lifetime ${usage.lifetime}`,
    '',
    `Activity (${weeks} weeks)`,
    ...rows,
    color ? 'Less  \x1b[48;5;236m  \x1b[0m\x1b[48;5;22m  \x1b[0m\x1b[48;5;28m  \x1b[0m\x1b[48;5;34m  \x1b[0m\x1b[48;5;40m  \x1b[0m  More' : 'Less  .:-=#  More',
    ''
  ].join('\n');
}

export function formatUsageCompact(usage) {
  return `Today ${usage.today} | Week ${usage.week} | Month ${usage.month} | All ${usage.lifetime}`;
}

export function buildUsageWarnings(usage, limits) {
  const warnings = [];
  addLimitWarning(warnings, 'Daily', usage.today, limits.daily, limits.warnAt);
  addLimitWarning(warnings, 'Weekly', usage.week, limits.weekly, limits.warnAt);
  addLimitWarning(warnings, 'Monthly', usage.month, limits.monthly, limits.warnAt);
  return warnings;
}

export function contributionLevel(count, max) {
  if (count <= 0) {
    return 0;
  }
  if (max <= 1) {
    return 1;
  }

  return Math.min(4, Math.max(1, Math.floor((count / max) * 4) + 1));
}

function requestCountsByDay(sessions) {
  const counts = new Map();

  for (const session of sessions) {
    for (const entry of session.entries || []) {
      const day = dateKey(new Date(entry.createdAt));
      if (!day) {
        continue;
      }
      counts.set(day, (counts.get(day) || 0) + 1);
    }
  }

  return counts;
}

function activityDays({ now, weeks }) {
  const end = startOfWeek(startOfDay(now));
  end.setUTCDate(end.getUTCDate() + 6);
  const start = new Date(end.getTime() - ((weeks * 7 - 1) * DAY_MS));
  const days = [];

  for (let offset = 0; offset < weeks * 7; offset += 1) {
    days.push(dateKey(new Date(start.getTime() + offset * DAY_MS)));
  }

  return days;
}

function renderLevel(level, color) {
  return color ? LEVEL_COLORS[level] : LEVEL_CHARS[level];
}

function weekdayLabel(index) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][index];
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfWeek(date) {
  const start = startOfDay(date);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return start;
}

function dateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
}

function addLimitWarning(warnings, label, used, limit, warnAt = 0.8) {
  if (!limit || limit <= 0) {
    return;
  }

  const ratio = used / limit;
  if (ratio >= 1) {
    warnings.push(`${label} usage is at ${used}/${limit}`);
  } else if (ratio >= warnAt) {
    warnings.push(`${label} usage is at ${Math.round(ratio * 100)}%`);
  }
}
