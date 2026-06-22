import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { applyPatch, parsePatch } from 'diff';
import { resolveInsideRoot, resolveSafePath, toRelative } from './path-utils.js';

const execAsync = promisify(exec);
const OPERATION_NAMES = [
  'session_info',
  'list',
  'tree',
  'read',
  'stat',
  'search',
  'write',
  'append',
  'patch',
  'mkdir',
  'rm',
  'move',
  'copy',
  'shell',
  'clipboard',
  'note',
  'finish'
];
const SKIPPED_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);
const DEFAULT_MAX_BYTES = 200000;
const MAX_SHELL_COMMAND_BYTES = 12000;

export async function runOperation(operation, { cwd = process.cwd(), clipboard } = {}) {
  try {
    switch (operation?.type) {
      case 'session_info':
        return ok(await sessionInfo(cwd));
      case 'list':
        return ok(await listOperation(cwd, operation));
      case 'tree':
        return ok(await treeOperation(cwd, operation));
      case 'read':
        return ok(await readOperation(cwd, operation));
      case 'stat':
        return ok(await statOperation(cwd, operation));
      case 'search':
        return ok(await searchOperation(cwd, operation));
      case 'write':
        return ok(await writeOperation(cwd, operation));
      case 'append':
        return ok(await appendOperation(cwd, operation));
      case 'patch':
        return ok(await patchOperation(cwd, operation));
      case 'mkdir':
        return ok(await mkdirOperation(cwd, operation));
      case 'rm':
        return ok(await rmOperation(cwd, operation));
      case 'move':
        return ok(await moveOperation(cwd, operation));
      case 'copy':
        return ok(await copyOperation(cwd, operation));
      case 'shell':
        return ok(await shellOperation(cwd, operation));
      case 'clipboard':
        return ok(await clipboardOperation(operation, clipboard));
      case 'note':
        return ok({ message: String(operation.message || operation.content || '') });
      case 'finish':
        return ok({ message: String(operation.message || 'Finished') });
      default:
        return fail(`Unknown operation type: ${operation?.type}`);
    }
  } catch (error) {
    return fail(error?.message || String(error));
  }
}

function ok(output) {
  return { ok: true, output };
}

function fail(error) {
  return { ok: false, error };
}

async function sessionInfo(cwd) {
  const { root } = resolveInsideRoot(cwd);
  let version = null;

  try {
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    version = pkg.version || null;
  } catch {
    version = null;
  }

  return {
    cwd: root,
    platform: process.platform,
    shell: process.env.SHELL || process.env.ComSpec || '',
    node: process.version,
    version,
    operations: OPERATION_NAMES
  };
}

async function listOperation(cwd, operation) {
  const target = await resolveSafePath(cwd, operation.path || '.');
  const dirents = await fs.readdir(target.resolved, { withFileTypes: true });
  const entries = await Promise.all(dirents.map(async (dirent) => {
    const absolutePath = path.join(target.resolved, dirent.name);
    const relativePath = toRelative(target.root, absolutePath);
    const entry = {
      name: dirent.name,
      path: relativePath,
      type: dirent.isDirectory() ? 'directory' : 'file'
    };

    if (dirent.isFile()) {
      entry.size = (await fs.stat(absolutePath)).size;
    }

    return entry;
  }));

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { path: target.relative, entries };
}

async function treeOperation(cwd, operation) {
  const target = await resolveSafePath(cwd, operation.path || '.');
  const depth = Number.isInteger(operation.depth) ? operation.depth : 3;
  const lines = [target.relative];

  async function walk(directory, level) {
    if (level >= depth) {
      return;
    }

    const dirents = await fs.readdir(directory, { withFileTypes: true });
    const visible = dirents
      .filter((dirent) => !shouldSkipDirectory(dirent) && !dirent.isSymbolicLink())
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const dirent of visible) {
      const absolutePath = path.join(directory, dirent.name);
      lines.push(`${'  '.repeat(level + 1)}${dirent.name}${dirent.isDirectory() ? '/' : ''}`);
      if (dirent.isDirectory()) {
        await walk(absolutePath, level + 1);
      }
    }
  }

  await walk(target.resolved, 0);
  return { path: target.relative, tree: lines.join('\n') };
}

async function readOperation(cwd, operation) {
  const paths = requireArray(operation.paths, 'read.paths');
  const maxBytes = operation.maxBytes ?? DEFAULT_MAX_BYTES;
  const files = [];

  for (const requestedPath of paths) {
    const target = await resolveSafePath(cwd, requestedPath);
    const stats = await fs.stat(target.resolved);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${requestedPath}`);
    }
    if (stats.size > maxBytes) {
      throw new Error(`File exceeds maxBytes (${maxBytes}): ${requestedPath}`);
    }

    files.push({
      path: target.relative,
      content: await fs.readFile(target.resolved, 'utf8'),
      bytes: stats.size
    });
  }

  return { files };
}

async function statOperation(cwd, operation) {
  const paths = requireArray(operation.paths, 'stat.paths');
  const entries = [];

  for (const requestedPath of paths) {
    const target = await resolveSafePath(cwd, requestedPath);
    const stats = await fs.stat(target.resolved);
    entries.push({
      path: target.relative,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      modifiedAt: stats.mtime.toISOString()
    });
  }

  return { entries };
}

async function searchOperation(cwd, operation) {
  const target = await resolveSafePath(cwd, operation.path || '.');
  const query = String(operation.query ?? '');
  if (!query) {
    throw new Error('search.query is required');
  }

  const matcher = operation.regex ? new RegExp(query) : null;
  const matches = [];

  async function visit(absolutePath) {
    const stats = await fs.lstat(absolutePath);
    if (stats.isSymbolicLink()) {
      return;
    }

    if (stats.isDirectory()) {
      const dirents = await fs.readdir(absolutePath, { withFileTypes: true });
      for (const dirent of dirents) {
        if (shouldSkipDirectory(dirent) || dirent.isSymbolicLink()) {
          continue;
        }
        await visit(path.join(absolutePath, dirent.name));
      }
      return;
    }

    if (!stats.isFile() || stats.size > DEFAULT_MAX_BYTES) {
      return;
    }

    const buffer = await fs.readFile(absolutePath);
    if (looksBinary(buffer)) {
      return;
    }

    const relativePath = toRelative(target.root, absolutePath);
    const lines = buffer.toString('utf8').split(/\r?\n/);
    lines.forEach((text, index) => {
      const column = matcher ? regexColumn(matcher, text) : text.indexOf(query);
      if (column >= 0) {
        matches.push({ path: relativePath, line: index + 1, column: column + 1, text });
      }
    });
  }

  await visit(target.resolved);
  return { matches };
}

async function writeOperation(cwd, operation) {
  const target = await resolveSafePath(cwd, operation.path);
  await fs.mkdir(path.dirname(target.resolved), { recursive: true });
  await fs.writeFile(target.resolved, String(operation.content ?? ''), 'utf8');
  return { path: target.relative, bytes: Buffer.byteLength(String(operation.content ?? ''), 'utf8') };
}

async function appendOperation(cwd, operation) {
  const target = await resolveSafePath(cwd, operation.path);
  await fs.mkdir(path.dirname(target.resolved), { recursive: true });
  await fs.appendFile(target.resolved, String(operation.content ?? ''), 'utf8');
  return { path: target.relative, bytes: Buffer.byteLength(String(operation.content ?? ''), 'utf8') };
}

async function patchOperation(cwd, operation) {
  const root = resolveInsideRoot(cwd).root;
  const patches = parsePatch(String(operation.patch || ''));
  if (patches.length === 0) {
    throw new Error('patch.patch did not contain a valid unified diff');
  }

  const changes = new Map();
  for (const parsedPatch of patches) {
    const requestedPath = patchTargetPath(parsedPatch);
    const target = await resolveSafePath(root, requestedPath);
    const existingChange = changes.get(target.relative);
    const oldContent = existingChange ? existingChange.content : await readFileOrEmpty(target.resolved);
    const nextContent = applyPatch(oldContent, parsedPatch);
    if (nextContent === false) {
      throw new Error(`Patch did not apply cleanly: ${requestedPath}`);
    }

    changes.set(target.relative, {
      path: target.relative,
      resolved: target.resolved,
      content: nextContent,
      remove: parsedPatch.newFileName === '/dev/null'
    });
  }

  const stagedChanges = [...changes.values()];
  for (const change of stagedChanges) {
    if (change.remove) {
      await fs.rm(change.resolved, { force: true });
    } else {
      await fs.mkdir(path.dirname(change.resolved), { recursive: true });
      await fs.writeFile(change.resolved, change.content, 'utf8');
    }
  }

  return { paths: stagedChanges.map((change) => change.path) };
}

async function mkdirOperation(cwd, operation) {
  const target = await resolveSafePath(cwd, operation.path);
  await fs.mkdir(target.resolved, { recursive: true });
  return { path: target.relative };
}

async function rmOperation(cwd, operation) {
  const target = await resolveSafePath(cwd, operation.path);
  const stats = await fs.stat(target.resolved);
  if (stats.isDirectory() && !operation.recursive) {
    const entries = await fs.readdir(target.resolved);
    if (entries.length > 0) {
      throw new Error(`Directory is not empty; pass recursive: true to remove it: ${target.relative}`);
    }
  }

  await fs.rm(target.resolved, { recursive: Boolean(operation.recursive), force: Boolean(operation.force) });
  return { path: target.relative, recursive: Boolean(operation.recursive) };
}

async function moveOperation(cwd, operation) {
  const from = await resolveSafePath(cwd, operation.from);
  const to = await resolveSafePath(cwd, operation.to);
  await fs.mkdir(path.dirname(to.resolved), { recursive: true });
  await fs.rename(from.resolved, to.resolved);
  return { from: from.relative, to: to.relative };
}

async function copyOperation(cwd, operation) {
  const from = await resolveSafePath(cwd, operation.from);
  const to = await resolveSafePath(cwd, operation.to);
  const stats = await fs.stat(from.resolved);
  if (stats.isDirectory()) {
    await assertTreeHasNoSymlinks(from.resolved, from.relative);
    await fs.mkdir(path.dirname(to.resolved), { recursive: true });
    await fs.cp(from.resolved, to.resolved, { recursive: true });
  } else {
    await fs.mkdir(path.dirname(to.resolved), { recursive: true });
    await fs.copyFile(from.resolved, to.resolved);
  }
  return { from: from.relative, to: to.relative };
}

async function shellOperation(cwd, operation) {
  const { root } = resolveInsideRoot(cwd);
  const command = String(operation.command || '');
  if (!command) {
    throw new Error('shell.command is required');
  }
  if (Buffer.byteLength(command, 'utf8') > MAX_SHELL_COMMAND_BYTES) {
    throw new Error(
      `shell.command is too large (${Buffer.byteLength(command, 'utf8')} bytes). ` +
      'Use write or patch operations for file content, then run a short shell command.'
    );
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: root,
      timeout: operation.timeoutMs ?? 30000,
      maxBuffer: operation.maxBuffer ?? 1024 * 1024
    });
    return { command, exitCode: 0, stdout, stderr };
  } catch (error) {
    return {
      command,
      exitCode: Number.isInteger(error.code) ? error.code : 1,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || ''
    };
  }
}

async function clipboardOperation(operation, clipboard) {
  if (!clipboard) {
    return { available: false, message: 'Clipboard adapter is not available for this operation.' };
  }

  const action = operation.action || operation.mode || 'write';
  if (action === 'read') {
    const text = await clipboard.read();
    return { action, text };
  }

  const text = String(operation.text ?? operation.content ?? '');
  await clipboard.write(text);
  return { action: 'write', bytes: Buffer.byteLength(text, 'utf8') };
}

function requireArray(value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} must be a non-empty array`);
  }
  return value;
}

function shouldSkipDirectory(dirent) {
  return dirent.isDirectory() && SKIPPED_DIRS.has(dirent.name);
}

async function assertTreeHasNoSymlinks(absolutePath, relativePath) {
  const stats = await fs.lstat(absolutePath);
  if (stats.isSymbolicLink()) {
    throw new Error(`Cannot copy symlink inside the VibeChat session root: ${relativePath}`);
  }

  if (!stats.isDirectory()) {
    return;
  }

  const dirents = await fs.readdir(absolutePath, { withFileTypes: true });
  for (const dirent of dirents) {
    await assertTreeHasNoSymlinks(path.join(absolutePath, dirent.name), path.join(relativePath, dirent.name));
  }
}

function looksBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}

function regexColumn(regex, text) {
  regex.lastIndex = 0;
  const match = regex.exec(text);
  return match ? match.index : -1;
}

async function readFileOrEmpty(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

function patchTargetPath(parsedPatch) {
  const fileName = parsedPatch.newFileName === '/dev/null'
    ? parsedPatch.oldFileName
    : parsedPatch.newFileName;

  if (!fileName) {
    throw new Error('Patch is missing a file path');
  }

  return fileName.replace(/^[ab]\//, '');
}
