import path from 'node:path';

export function searchHistory(sessions, query) {
  const needle = String(query || '').toLowerCase();
  if (!needle) {
    return [];
  }

  const matches = [];
  for (const session of sessions) {
    for (const entry of session.entries || []) {
      const haystack = [
        session.id,
        session.cwd,
        entry.id,
        entry.summary,
        entry.operationsLabel,
        ...(entry.changedPaths || []),
        entry.requestText
      ].join('\n').toLowerCase();

      if (haystack.includes(needle)) {
        matches.push({ sessionId: session.id, cwd: session.cwd, entry });
      }
    }
  }

  return matches;
}

export function renderHistorySearch(matches) {
  return [
    '',
    'History Search',
    '--------------',
    matches.length
      ? matches.map((match) => [
        `${match.sessionId} #${match.entry.id} ${match.entry.createdAt}`,
        `What it did: ${match.entry.summary || '(no summary)'}`,
        `Operations: ${match.entry.operationsLabel || `${match.entry.operationCount} operation(s)`}`,
        `cwd: ${match.cwd}`
      ].join('\n')).join('\n\n')
      : 'No matching history entries.',
    ''
  ].join('\n');
}

export function buildCompactSummary(session, { limit = 12 } = {}) {
  const entries = (session.entries || []).slice(-limit);
  return [
    '# VibeChat Compact Summary',
    '',
    `Session: ${session.id}`,
    `cwd: ${session.cwd}`,
    `Requests: ${(session.entries || []).length}`,
    '',
    'Recent requests:',
    ...entries.map((entry) => `- #${entry.id}: ${entry.summary || '(no summary)'} [${entry.operationsLabel || `${entry.operationCount} operation(s)`}]`),
    '',
    'Use this summary to re-orient the chatbot, then ask VibeChat for :last or targeted reads if more detail is needed.',
    ''
  ].join('\n');
}

export function renderExportMarkdown(session) {
  return [
    `# VibeChat Session ${session.id}`,
    '',
    `- cwd: ${session.cwd}`,
    `- created: ${session.createdAt}`,
    `- updated: ${session.updatedAt}`,
    `- requests: ${(session.entries || []).length}`,
    '',
    ...(session.entries || []).flatMap((entry) => [
      `## Request ${entry.id}`,
      '',
      `- created: ${entry.createdAt}`,
      `- summary: ${entry.summary || '(no summary)'}`,
      `- operations: ${entry.operationsLabel || `${entry.operationCount} operation(s)`}`,
      `- failed: ${entry.failedCount}`,
      `- changed paths: ${(entry.changedPaths || []).join(', ') || 'none'}`,
      '',
      '```json',
      entry.requestText || '',
      '```',
      ''
    ])
  ].join('\n');
}

export function buildUndoPlan(session) {
  const lastEntry = (session.entries || []).at(-1);
  const changedPaths = lastEntry?.changedPaths || [];

  return [
    '',
    'Undo Plan',
    '---------',
    lastEntry ? `Last request: #${lastEntry.id} ${lastEntry.summary || '(no summary)'}` : 'No request has completed in this session.',
    changedPaths.length ? `Changed paths: ${changedPaths.join(', ')}` : 'Changed paths: none recorded.',
    '',
    changedPaths.length
      ? 'Recommended next step: inspect `git diff -- ' + changedPaths.map(shellQuote).join(' ') + '` and ask the chatbot for a targeted revert patch.'
      : 'Recommended next step: inspect `git diff` and ask the chatbot for a targeted revert patch.',
    'VibeChat does not auto-revert files because file operations may not be git-tracked.',
    ''
  ].join('\n');
}

export function collectChangedPathsFromResults(results = []) {
  const changed = new Set();
  for (const result of results) {
    collectChangedPaths(result.output, changed);
  }
  return [...changed].sort();
}

export function exportFileName(session) {
  return `vibechat-session-${safeName(session.id)}.md`;
}

function collectChangedPaths(value, paths) {
  if (!value || typeof value !== 'object') {
    return;
  }

  for (const key of ['path', 'from', 'to']) {
    if (typeof value[key] === 'string') {
      paths.add(value[key]);
    }
  }

  if (Array.isArray(value.paths)) {
    value.paths.filter((item) => typeof item === 'string').forEach((item) => paths.add(item));
  }

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      child.forEach((item) => collectChangedPaths(item, paths));
    } else {
      collectChangedPaths(child, paths);
    }
  }
}

function safeName(value) {
  return String(value || 'session').replace(/[^a-zA-Z0-9._-]/g, '-');
}

function shellQuote(value) {
  const normalized = path.normalize(value);
  return /^[a-zA-Z0-9_./-]+$/.test(normalized) ? normalized : `'${normalized.replace(/'/g, "'\\''")}'`;
}
