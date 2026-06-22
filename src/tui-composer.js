import { getRequestState } from './request-state.js';

export function getComposerEnterAction(text) {
  const value = String(text || '');
  const trimmed = value.trim();

  if (!trimmed) {
    return { action: 'ignore', reason: 'empty' };
  }

  if (trimmed.startsWith(':')) {
    return { action: 'command', command: trimmed };
  }

  const requestState = getRequestState(value);
  if (requestState.complete) {
    return { action: 'submit', requestState };
  }

  return { action: 'newline', requestState };
}

export function insertComposerText(value, cursor, text) {
  const source = String(value || '');
  const position = clampCursor(source, cursor);
  const insertion = String(text || '');

  return {
    value: `${source.slice(0, position)}${insertion}${source.slice(position)}`,
    cursor: position + insertion.length
  };
}

export function deleteBeforeCursor(value, cursor) {
  const source = String(value || '');
  const position = clampCursor(source, cursor);
  if (position === 0) {
    return { value: source, cursor: position };
  }

  return {
    value: `${source.slice(0, position - 1)}${source.slice(position)}`,
    cursor: position - 1
  };
}

export function deleteAtCursor(value, cursor) {
  const source = String(value || '');
  const position = clampCursor(source, cursor);
  if (position === source.length) {
    return { value: source, cursor: position };
  }

  return {
    value: `${source.slice(0, position)}${source.slice(position + 1)}`,
    cursor: position
  };
}

export function moveComposerCursor(value, cursor, direction) {
  const source = String(value || '');
  const position = clampCursor(source, cursor);

  if (direction === 'left') {
    return Math.max(0, position - 1);
  }
  if (direction === 'right') {
    return Math.min(source.length, position + 1);
  }

  const location = lineLocation(source, position);
  if (direction === 'home') {
    return location.start;
  }
  if (direction === 'end') {
    return location.end;
  }
  if (direction === 'up' || direction === 'down') {
    const targetLine = location.index + (direction === 'up' ? -1 : 1);
    if (targetLine < 0 || targetLine >= location.lines.length) {
      return position;
    }
    const target = location.lines[targetLine];
    return target.start + Math.min(location.column, target.end - target.start);
  }

  return position;
}

export function moveTranscriptScrollOffset(offset, direction, pageSize) {
  const current = Math.max(0, Number.isFinite(offset) ? Math.floor(offset) : 0);
  const page = Math.max(1, Number.isFinite(pageSize) ? Math.floor(pageSize) : 1);

  if (direction === 'pageup') {
    return current + page;
  }
  if (direction === 'pagedown') {
    return Math.max(0, current - page);
  }
  if (direction === 'up') {
    return current + 1;
  }
  if (direction === 'down') {
    return Math.max(0, current - 1);
  }
  if (direction === 'home') {
    return Number.MAX_SAFE_INTEGER;
  }
  if (direction === 'end') {
    return 0;
  }
  return current;
}

function clampCursor(value, cursor) {
  return Math.max(0, Math.min(String(value || '').length, Number.isInteger(cursor) ? cursor : 0));
}

function lineLocation(value, cursor) {
  const lines = [];
  let start = 0;
  for (let index = 0; index <= value.length; index += 1) {
    if (index === value.length || value[index] === '\n') {
      lines.push({ start, end: index });
      start = index + 1;
    }
  }

  const index = lines.findIndex((line, lineIndex) => {
    const isLast = lineIndex === lines.length - 1;
    return cursor >= line.start && (cursor <= line.end || isLast);
  });
  const line = lines[Math.max(0, index)];

  return {
    lines,
    index: Math.max(0, index),
    start: line.start,
    end: line.end,
    column: cursor - line.start
  };
}
