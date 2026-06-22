export function getRequestState(text) {
  const trimmed = String(text || '').trim();

  if (!trimmed) {
    return { complete: false, kind: 'empty', depth: 0, inString: false };
  }

  if (trimmed.startsWith('```')) {
    const complete = /```\s*$/.test(trimmed) && trimmed.split('```').length >= 3;
    return { complete, kind: 'fence', depth: complete ? 0 : 1, inString: false };
  }

  return getJsonBoundaryState(trimmed);
}

function getJsonBoundaryState(text) {
  if (!text.startsWith('{') && !text.startsWith('[')) {
    return { complete: false, kind: 'unknown', depth: 0, inString: false };
  }

  let depth = 0;
  let inString = false;
  let escaping = false;
  let closedTopLevel = false;

  for (const char of text) {
    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaping = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{' || char === '[') {
      depth += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      depth -= 1;
      if (depth <= 0) {
        closedTopLevel = true;
      }
      if (depth < 0) {
        return { complete: true, kind: 'json', depth, inString, invalidBoundary: true };
      }
    }
  }

  return {
    complete: closedTopLevel && depth === 0 && !inString,
    kind: 'json',
    depth,
    inString
  };
}
