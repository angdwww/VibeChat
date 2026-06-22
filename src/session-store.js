import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SESSION_SCHEMA_VERSION = 1;

export function getVibeChatHome(env = process.env) {
  if (env.VIBECHAT_HOME) {
    return path.resolve(env.VIBECHAT_HOME);
  }

  return path.join(os.homedir(), '.vibechat');
}

export function getSessionStoreRoot(env = process.env) {
  if (env.VIBECHAT_SESSIONS_DIR) {
    return path.resolve(env.VIBECHAT_SESSIONS_DIR);
  }

  return path.join(getVibeChatHome(env), 'sessions');
}

export async function createSession({ cwd = process.cwd(), env = process.env } = {}) {
  const now = new Date().toISOString();
  const session = {
    version: SESSION_SCHEMA_VERSION,
    id: await newSessionId({ env }),
    cwd: path.resolve(cwd),
    createdAt: now,
    updatedAt: now,
    entries: []
  };

  await writeSession(session, { env });
  return session;
}

export async function loadSession(id, { env = process.env } = {}) {
  const resolvedId = await resolveSessionId(id, { env });
  const filePath = sessionFilePath(resolvedId, env);
  const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
  return normalizeSession(parsed);
}

export async function deleteSession(id, { env = process.env } = {}) {
  const resolvedId = await resolveSessionId(id, { env });
  await fs.rm(sessionFilePath(resolvedId, env), { force: true });
}

export async function appendSessionEntry(id, entry, { env = process.env } = {}) {
  const session = await loadSession(id, { env });
  const now = new Date().toISOString();
  const entries = Array.isArray(session.entries) ? session.entries : [];
  const nextEntry = {
    id: `${entries.length + 1}`,
    createdAt: now,
    cwd: entry.cwd ? path.resolve(entry.cwd) : session.cwd,
    summary: String(entry.summary || ''),
    operationsLabel: String(entry.operationsLabel || ''),
    changedPaths: Array.isArray(entry.changedPaths) ? entry.changedPaths.map(String) : [],
    requestText: String(entry.requestText || ''),
    responseText: String(entry.responseText || ''),
    copiedToClipboard: Boolean(entry.copiedToClipboard),
    operationCount: Number.isInteger(entry.operationCount) ? entry.operationCount : 0,
    failedCount: Number.isInteger(entry.failedCount) ? entry.failedCount : 0
  };

  session.entries = [...entries, nextEntry];
  session.cwd = nextEntry.cwd;
  session.updatedAt = now;
  await writeSession(session, { env });
  return session;
}

export async function listSessions({ limit = 20, env = process.env } = {}) {
  const root = getSessionStoreRoot(env);
  let names = [];

  try {
    names = await fs.readdir(root);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const sessions = [];
  for (const name of names.filter((item) => item.endsWith('.json'))) {
    try {
      const session = normalizeSession(JSON.parse(await fs.readFile(path.join(root, name), 'utf8')));
      sessions.push(toSessionSummary(session));
    } catch {
      sessions.push({
        id: name.replace(/\.json$/, ''),
        cwd: '',
        createdAt: '',
        updatedAt: '',
        entryCount: 0,
        lastSummary: '(unreadable session file)',
        unreadable: true
      });
    }
  }

  return sessions
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, limit);
}

export async function loadAllSessions({ limit = 500, env = process.env } = {}) {
  const summaries = await listSessions({ limit, env });
  const sessions = [];

  for (const summary of summaries) {
    if (summary.unreadable) {
      continue;
    }
    sessions.push(await loadSession(summary.id, { env }));
  }

  return sessions;
}

export async function resolveSessionId(idOrPrefix, { env = process.env } = {}) {
  const requested = String(idOrPrefix || '').trim();
  if (!requested) {
    throw new Error('Session id is required.');
  }

  const exactPath = sessionFilePath(requested, env);
  try {
    await fs.access(exactPath);
    return requested;
  } catch {
    // Fall through to prefix lookup.
  }

  const root = getSessionStoreRoot(env);
  let names = [];
  try {
    names = await fs.readdir(root);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`No VibeChat sessions found in ${root}`);
    }
    throw error;
  }

  const matches = names
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, ''))
    .filter((id) => id.startsWith(requested));

  if (matches.length === 0) {
    throw new Error(`No VibeChat session matches: ${requested}`);
  }
  if (matches.length > 1) {
    throw new Error(`Session id is ambiguous: ${requested}`);
  }

  return matches[0];
}

export async function lastSession({ env = process.env } = {}) {
  const sessions = await listSessions({ limit: 1, env });
  return sessions[0] ? loadSession(sessions[0].id, { env }) : null;
}

export function toSessionSummary(session) {
  const entries = Array.isArray(session.entries) ? session.entries : [];
  const lastEntry = entries.at(-1);

  return {
    id: session.id,
    cwd: session.cwd,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    entryCount: entries.length,
    lastSummary: lastEntry?.summary || '',
    lastOperations: lastEntry?.operationsLabel || ''
  };
}

async function newSessionId({ env }) {
  const date = new Date();
  const prefix = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    '-',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0')
  ].join('');

  for (let attempts = 0; attempts < 10; attempts += 1) {
    const id = `${prefix}-${randomBytes(3).toString('hex')}`;
    try {
      await fs.access(sessionFilePath(id, env));
    } catch {
      return id;
    }
  }

  throw new Error('Could not allocate a unique VibeChat session id.');
}

async function writeSession(session, { env }) {
  const normalized = normalizeSession(session);
  const filePath = sessionFilePath(normalized.id, env);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
}

function sessionFilePath(id, env) {
  const safeId = String(id || '').trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(safeId)) {
    throw new Error(`Invalid VibeChat session id: ${id}`);
  }

  return path.join(getSessionStoreRoot(env), `${safeId}.json`);
}

function normalizeSession(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('Invalid VibeChat session file.');
  }
  if (!session.id) {
    throw new Error('VibeChat session file is missing an id.');
  }

  return {
    version: Number.isInteger(session.version) ? session.version : SESSION_SCHEMA_VERSION,
    id: String(session.id),
    cwd: path.resolve(String(session.cwd || process.cwd())),
    createdAt: String(session.createdAt || new Date().toISOString()),
    updatedAt: String(session.updatedAt || session.createdAt || new Date().toISOString()),
    entries: Array.isArray(session.entries) ? session.entries.map(normalizeEntry) : []
  };
}

function normalizeEntry(entry, index) {
  return {
    id: String(entry.id || index + 1),
    createdAt: String(entry.createdAt || ''),
    cwd: path.resolve(String(entry.cwd || process.cwd())),
    summary: String(entry.summary || ''),
    operationsLabel: String(entry.operationsLabel || ''),
    changedPaths: Array.isArray(entry.changedPaths) ? entry.changedPaths.map(String) : [],
    requestText: String(entry.requestText || ''),
    responseText: String(entry.responseText || ''),
    copiedToClipboard: Boolean(entry.copiedToClipboard),
    operationCount: Number.isInteger(entry.operationCount) ? entry.operationCount : 0,
    failedCount: Number.isInteger(entry.failedCount) ? entry.failedCount : 0
  };
}
