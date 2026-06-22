function sanitizeHeaderValue(value) {
  return String(value).replace(/\r?\n/g, ' ').replace(/```/g, "'''");
}

const DEFAULT_MAX_STRING_LENGTH = 8000;
const DEFAULT_MAX_ARRAY_ITEMS = 120;

export function formatResponse({
  cwd,
  summary = '',
  copiedToClipboard = false,
  clipboardError = '',
  results = [],
  maxStringLength = DEFAULT_MAX_STRING_LENGTH,
  maxArrayItems = DEFAULT_MAX_ARRAY_ITEMS
}) {
  const payload = {
    cwd,
    summary,
    copiedToClipboard,
    clipboardError,
    results
  };
  const compactPayload = compactValue(payload, { maxStringLength, maxArrayItems });

  return [
    '```vibechat-response',
    '# VibeChat Response',
    `cwd: ${cwd}`,
    `summary: ${sanitizeHeaderValue(summary)}`,
    `copiedToClipboard: ${copiedToClipboard}`,
    '',
    JSON.stringify(compactPayload, null, 2),
    '```'
  ].join('\n');
}

function compactValue(value, limits) {
  if (typeof value === 'string') {
    return compactString(value, limits.maxStringLength);
  }

  if (Array.isArray(value)) {
    const visible = value.slice(0, limits.maxArrayItems).map((item) => compactValue(item, limits));
    if (value.length > limits.maxArrayItems) {
      visible.push({
        truncated: true,
        omittedItems: value.length - limits.maxArrayItems
      });
    }
    return visible;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, compactValue(item, limits)])
    );
  }

  return value;
}

function compactString(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  const omitted = value.length - maxLength;
  return `[truncated ${omitted} chars omitted]\n${value.slice(0, maxLength)}`;
}
