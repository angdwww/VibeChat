import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getVibeChatHome } from './session-store.js';

const CONFIG_VERSION = 1;
const LIMIT_PROFILES = {
  custom: { daily: 0, weekly: 0, monthly: 0 },
  'chatgpt-free': { daily: 25, weekly: 175, monthly: 750 },
  'chatgpt-plus': { daily: 80, weekly: 560, monthly: 2400 },
  'chatgpt-pro': { daily: 300, weekly: 2100, monthly: 9000 }
};

const READ_ONLY_OPERATIONS = new Set(['session_info', 'list', 'tree', 'read', 'stat', 'search', 'note', 'finish']);
const EDIT_OPERATIONS = new Set([...READ_ONLY_OPERATIONS, 'write', 'append', 'patch', 'mkdir', 'rm', 'move', 'copy', 'clipboard']);

export function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    trustMode: 'shell',
    limits: {
      profile: 'custom',
      daily: 0,
      weekly: 0,
      monthly: 0,
      warnAt: 0.8
    },
    favorites: [],
    watchCommand: '',
    github: {
      preferCli: true
    }
  };
}

export async function loadConfig({ env = process.env } = {}) {
  const filePath = configPath(env);

  try {
    return normalizeConfig(JSON.parse(await fs.readFile(filePath, 'utf8')));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
    return defaultConfig();
  }
}

export async function saveConfig(config, { env = process.env } = {}) {
  const normalized = normalizeConfig(config);
  const filePath = configPath(env);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export function setLimitProfile(config, profile) {
  const preset = LIMIT_PROFILES[profile];
  if (!preset) {
    throw new Error(`Unknown limit profile: ${profile}`);
  }

  return normalizeConfig({
    ...config,
    limits: {
      ...config.limits,
      profile,
      ...preset
    }
  });
}

export function setLimit(config, window, value) {
  if (!['daily', 'weekly', 'monthly'].includes(window)) {
    throw new Error(`Unknown limit window: ${window}`);
  }

  const limit = Number.parseInt(value, 10);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`Limit must be a non-negative integer: ${value}`);
  }

  return normalizeConfig({
    ...config,
    limits: {
      ...config.limits,
      profile: 'custom',
      [window]: limit
    }
  });
}

export function setTrustMode(config, trustMode) {
  if (!['read-only', 'edit', 'shell'].includes(trustMode)) {
    throw new Error(`Unknown trust mode: ${trustMode}`);
  }

  return normalizeConfig({ ...config, trustMode });
}

export function setWatchCommand(config, command) {
  return normalizeConfig({ ...config, watchCommand: String(command || '') });
}

export function toggleFavorite(config, sessionId) {
  const favorites = new Set(config.favorites || []);
  if (favorites.has(sessionId)) {
    favorites.delete(sessionId);
  } else {
    favorites.add(sessionId);
  }

  return normalizeConfig({ ...config, favorites: [...favorites] });
}

export function isFavorite(config, sessionId) {
  return (config.favorites || []).includes(sessionId);
}

export function validateTrustForRequest(request, config) {
  const mode = config.trustMode || 'shell';
  if (mode === 'shell') {
    return;
  }

  const allowed = mode === 'read-only' ? READ_ONLY_OPERATIONS : EDIT_OPERATIONS;
  for (const operation of request.operations || []) {
    const type = operation?.type || 'unknown';
    if (!allowed.has(type)) {
      throw new Error(`Operation "${type}" is blocked by ${mode} trust mode.`);
    }
  }
}

export function limitProfiles() {
  return Object.keys(LIMIT_PROFILES);
}

export function configPath(env = process.env) {
  return path.join(getVibeChatHome(env), 'config.json');
}

function normalizeConfig(config) {
  const base = defaultConfig();
  const limits = { ...base.limits, ...(config?.limits || {}) };
  return {
    ...base,
    ...config,
    version: CONFIG_VERSION,
    trustMode: ['read-only', 'edit', 'shell'].includes(config?.trustMode) ? config.trustMode : base.trustMode,
    limits: {
      profile: String(limits.profile || 'custom'),
      daily: nonNegativeInteger(limits.daily),
      weekly: nonNegativeInteger(limits.weekly),
      monthly: nonNegativeInteger(limits.monthly),
      warnAt: Number.isFinite(Number(limits.warnAt)) ? Number(limits.warnAt) : base.limits.warnAt
    },
    favorites: Array.isArray(config?.favorites) ? [...new Set(config.favorites.map(String))] : [],
    watchCommand: String(config?.watchCommand || ''),
    github: { ...base.github, ...(config?.github || {}) }
  };
}

function nonNegativeInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
