import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillPath = path.join(packageRoot, 'SKILLS.md');

export function renderBanner({ cwd, session, storeRoot, usageLine, warnings = [] }) {
  return [
    '',
    'VibeChat Local Console',
    '======================',
    usageLine ? `Usage:       ${usageLine}` : null,
    warnings.length ? `Warnings:    ${warnings.join(' | ')}` : null,
    `Session root: ${cwd}`,
    session ? `Session id:   ${session.id}` : null,
    storeRoot ? `Sessions:     ${storeRoot}` : null,
    `Skill file:   ${skillPath}`,
    '',
    'Paste one complete VibeChat JSON request, or type :help.',
    'The response is copied to your clipboard after each run.',
    ''
  ].filter(Boolean).join('\n');
}

export function renderHelp() {
  return [
    '',
    'Commands',
    '--------',
    ':help       Show this help',
    ':menu       Open the TUI action menu',
    ':status     Show cwd, buffer, and debug state',
    ':usage      Show request usage dashboard',
    ':limits     Show or configure usage limits',
    ':sessions   Browse recent VibeChat sessions',
    ':resume ID  Resume a session by full id or unique prefix',
    ':new        Start a fresh session in the current cwd',
    ':history    Show this session request history',
    ':search-history QUERY  Search saved session history',
    ':compact    Copy and print a compact handoff summary',
    ':diff-last  Show changed paths and git diff for last request',
    ':undo-plan  Print a safe revert plan for the last request',
    ':favorite   Toggle favorite status for this session',
    ':favorites  List favorite sessions',
    ':export-session [PATH]  Export current session as Markdown',
    ':trust MODE Set trust mode: read-only, edit, shell',
    ':watch CMD  Rerun a command after each successful request; use off to disable',
    ':github     Show GitHub workflow and local git status',
    ':last       Print the last copied response',
    ':copy-last  Copy the last response to the clipboard again',
    ':doctor     Print session, clipboard, and environment diagnostics',
    ':pwd        Print the active working root',
    ':cd PATH    Change the active working root',
    ':ls [PATH]  List files from the active working root',
    ':example    Print a copyable starter request',
    ':skill      Print the SKILLS.md path',
    ':debug      Toggle parser/debug details',
    ':clear      Clear the current pasted request buffer',
    ':exit       Quit VibeChat',
    '',
    'Paste Tips',
    '----------',
    '- Commands can use either :command or /command.',
    '- Pretty-printed JSON is okay. VibeChat waits for the full top-level object.',
    '- Use write/patch for file content, not giant shell heredocs.',
    '- If a request looks stuck, type :status to see whether VibeChat is waiting for more JSON.',
    ''
  ].join('\n');
}

export function renderStatus({ cwd, buffer, debug, requestState, session, storeRoot, usageLine, warnings = [] }) {
  return [
    '',
    'Session Status',
    '--------------',
    `cwd: ${cwd}`,
    usageLine ? `usage: ${usageLine}` : null,
    warnings.length ? `warnings: ${warnings.join(' | ')}` : null,
    session ? `sessionId: ${session.id}` : null,
    session ? `sessionEntries: ${session.entries.length}` : null,
    storeRoot ? `sessionStore: ${storeRoot}` : null,
    `bufferedLines: ${buffer.length}`,
    `debug: ${debug ? 'on' : 'off'}`,
    `requestKind: ${requestState.kind}`,
    `requestComplete: ${requestState.complete}`,
    `jsonDepth: ${requestState.depth}`,
    requestState.inString ? 'state: inside JSON string' : 'state: ready',
    ''
  ].filter(Boolean).join('\n');
}

export function renderExample() {
  return [
    '',
    'Example Request',
    '---------------',
    '```json',
    JSON.stringify({
      version: 1,
      summary: 'Inspect this project.',
      continueOnError: true,
      operations: [
        { type: 'session_info' },
        { type: 'tree', path: '.', depth: 2 },
        { type: 'read', paths: ['package.json', 'README.md'], maxBytes: 20000 }
      ]
    }, null, 2),
    '```',
    ''
  ].join('\n');
}

export function renderSkillPath() {
  return [
    '',
    'SKILLS.md',
    '---------',
    skillPath,
    ''
  ].join('\n');
}

export function renderSessions(sessions, { currentId = '' } = {}) {
  return [
    '',
    'Saved Sessions',
    '--------------',
    sessions.length
      ? sessions.map((session) => {
        const marker = session.id === currentId ? '*' : ' ';
        const summary = session.lastSummary || '(no requests yet)';
        return `${marker} ${session.id}  entries=${session.entryCount}  updated=${session.updatedAt || '?'}  cwd=${session.cwd}  last=${summary}`;
      }).join('\n')
      : 'No saved sessions yet.',
    ''
  ].join('\n');
}

export function renderHistory(session, { limit = 20 } = {}) {
  const entries = session.entries.slice(-limit);

  return [
    '',
    'Session History',
    '---------------',
    `sessionId: ${session.id}`,
    `cwd: ${session.cwd}`,
    entries.length
      ? entries.map((entry) => renderHistoryEntry(entry)).join('\n\n')
      : 'No requests recorded in this session yet.',
    ''
  ].join('\n');
}

export function renderLastResponse(session) {
  const lastEntry = session.entries.at(-1);
  if (!lastEntry) {
    return [
      '',
      'Last Run',
      '--------',
      'No response has been recorded in this session yet.',
      ''
    ].join('\n');
  }

  return [
    '',
    'Last Run',
    '--------',
    `sessionId: ${session.id}`,
    `entry: #${lastEntry.id}`,
    `What it did: ${lastEntry.summary || '(none)'}`,
    `Operations: ${lastEntry.operationsLabel || `${lastEntry.operationCount} operation(s)`}`,
    `Result: ${lastEntry.failedCount > 0 ? `${lastEntry.failedCount} failed` : 'passed'}`,
    'Full response remains available with :copy-last.',
    ''
  ].join('\n');
}

export function renderDoctor({ cwd, session, storeRoot }) {
  return [
    '',
    'VibeChat Doctor',
    '---------------',
    `cwd: ${cwd}`,
    `sessionId: ${session.id}`,
    `sessionEntries: ${session.entries.length}`,
    `sessionStore: ${storeRoot}`,
    `node: ${process.version}`,
    `platform: ${process.platform}`,
    `shell: ${process.env.SHELL || process.env.ComSpec || ''}`,
    'clipboard: VibeChat will report copy failures after each request.',
    ''
  ].join('\n');
}

function renderHistoryEntry(entry) {
  return [
    `Request #${entry.id}  ${entry.createdAt}`,
    `What it did: ${entry.summary || '(no summary)'}`,
    `Operations: ${entry.operationsLabel || `${entry.operationCount} operation(s)`}`,
    `Result: ${entry.failedCount > 0 ? `${entry.failedCount} failed` : 'passed'} | clipboard=${entry.copiedToClipboard}`
  ].join('\n');
}

export function renderDirectoryListing({ cwd, path: requestedPath, entries }) {
  return [
    '',
    'Directory',
    '---------',
    `cwd: ${cwd}`,
    `path: ${requestedPath}`,
    entries.length
      ? entries.map((entry) => `${entry.type === 'directory' ? 'dir ' : 'file'} ${entry.name}${entry.type === 'directory' ? '/' : ''}`).join('\n')
      : '(empty)',
    ''
  ].join('\n');
}

export function renderRequestDebug({ requestText, requestState }) {
  return [
    '',
    'Request debug',
    '-------------',
    `characters: ${requestText.length}`,
    `lines: ${requestText.split(/\r?\n/).length}`,
    `kind: ${requestState.kind}`,
    `complete: ${requestState.complete}`,
    `depth: ${requestState.depth}`,
    `inString: ${requestState.inString}`,
    ''
  ].join('\n');
}

export function renderOperationSummary(response) {
  const payload = parsePayload(response);
  if (!payload) {
    return '';
  }

  const results = Array.isArray(payload.results) ? payload.results : [];
  const failed = results.filter((result) => !result.ok);
  const shellCommands = results.filter((result) => result.type === 'shell').length;
  const changedPaths = new Set();

  for (const result of results) {
    collectChangedPaths(result.output, changedPaths);
  }

  return [
    '',
    'Operation summary',
    '-----------------',
    `summary: ${payload.summary || '(none)'}`,
    `operations: ${results.length}`,
    `passed: ${results.length - failed.length}`,
    `failed: ${failed.length}`,
    `shellCommands: ${shellCommands}`,
    `changedPaths: ${changedPaths.size}`,
    `clipboard: ${payload.copiedToClipboard ? 'copied' : 'not copied'}`,
    failed.length ? `firstFailure: #${failed[0].index} ${failed[0].type} - ${failed[0].error}` : 'firstFailure: none',
    ''
  ].join('\n');
}

export function renderFriendlyError(error) {
  const message = error?.message || String(error);
  const isJson = /JSON|parse|operations array|request/i.test(message);

  return [
    '',
    'Could not run request',
    '---------------------',
    message,
    '',
    isJson
      ? 'Tip: paste exactly one complete JSON object. If ChatGPT includes Markdown, include the full fenced block.'
      : 'Tip: type :help for commands, or paste a complete VibeChat JSON request.',
    ''
  ].join('\n');
}

export function renderIncompleteRequest({ requestState }) {
  return [
    '',
    'Incomplete request',
    '------------------',
    `VibeChat reached end-of-input while waiting for more ${requestState.kind}.`,
    `Current JSON depth: ${requestState.depth}`,
    'Tip: paste the entire request through the final closing brace, or type :clear to reset the buffer.',
    ''
  ].join('\n');
}

export function skillFilePath() {
  return skillPath;
}

function parsePayload(response) {
  const jsonStart = response.indexOf('{\n');
  const jsonEnd = response.lastIndexOf('\n```');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return null;
  }

  try {
    return JSON.parse(response.slice(jsonStart, jsonEnd));
  } catch {
    return null;
  }
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
