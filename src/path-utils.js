import path from 'node:path';
import { lstat } from 'node:fs/promises';

export function resolveInsideRoot(cwd, requestedPath = '.') {
  const root = path.resolve(cwd);
  const resolved = path.resolve(root, requestedPath);
  const relative = path.relative(root, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path is outside the VibeChat session root: ${requestedPath}`);
  }

  return { root, resolved, relative: relative || '.' };
}

export function toRelative(root, absolutePath) {
  const relative = path.relative(root, absolutePath);
  return relative || '.';
}

export async function resolveSafePath(cwd, requestedPath = '.') {
  const target = resolveInsideRoot(cwd, requestedPath);
  await assertNoSymlinkPath(target.root, target.resolved);
  return target;
}

export async function assertNoSymlinkPath(root, absolutePath) {
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path is outside the VibeChat session root: ${absolutePath}`);
  }

  if (!relative || relative === '.') {
    return;
  }

  let current = path.resolve(root);
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);

    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink()) {
        throw new Error(`Path uses a symlink inside the VibeChat session root: ${toRelative(root, current)}`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }
}
