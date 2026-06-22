export function renderHumanRunFromResponse(responseText) {
  const payload = parseResponsePayload(responseText);
  if (!payload) {
    return [
      '',
      'Run Summary',
      '-----------',
      'Could not render a readable summary for this response.',
      'The full response was still copied to the clipboard when available.',
      ''
    ].join('\n');
  }

  return renderHumanRun(payload);
}

export function renderHumanRun({ summary = '', copiedToClipboard = false, clipboardError = '', results = [] }) {
  const failed = results.filter((result) => !result.ok);
  return [
    '',
    'Run Summary',
    '-----------',
    `What it did: ${summary || '(no summary)'}`,
    `Result: ${results.length - failed.length} passed, ${failed.length} failed`,
    copiedToClipboard
      ? 'Copied full response to clipboard.'
      : `Full response not copied${clipboardError ? `: ${clipboardError}` : '.'}`,
    '',
    ...results.map((result) => `${result.ok ? 'OK' : 'FAIL'} ${result.index || '?'} ${describeOperationResult(result)}`),
    ''
  ].join('\n');
}

export function describeOperationResult(result) {
  if (!result?.ok) {
    return `${result?.type || 'operation'} failed: ${result?.error || 'unknown error'}`;
  }

  const output = result.output || {};
  switch (result.type) {
    case 'session_info':
      return `checked session info for ${output.cwd || 'current folder'}`;
    case 'list':
      return `listed ${output.path || '.'} (${(output.entries || []).length} entries)`;
    case 'tree':
      return `read tree for ${output.path || '.'}`;
    case 'read':
      return (output.files || []).map((file) => `read ${file.path} (${file.bytes} bytes)`).join(', ') || 'read files';
    case 'stat':
      return `statted ${(output.entries || []).map((entry) => entry.path).join(', ') || 'paths'}`;
    case 'search':
      return `searched files (${(output.matches || []).length} matches)`;
    case 'write':
      return `wrote ${output.bytes || 0} bytes to ${output.path || 'file'}`;
    case 'append':
      return `appended ${output.bytes || 0} bytes to ${output.path || 'file'}`;
    case 'patch':
      return `patched ${(output.paths || []).join(', ') || 'files'}`;
    case 'mkdir':
      return `created directory ${output.path || ''}`.trim();
    case 'rm':
      return `removed ${output.path || ''}`.trim();
    case 'move':
      return `moved ${output.from || 'source'} to ${output.to || 'destination'}`;
    case 'copy':
      return `copied ${output.from || 'source'} to ${output.to || 'destination'}`;
    case 'shell':
      return `ran ${inlineCommand(output.command || 'command')} (exit ${output.exitCode ?? '?'})`;
    case 'clipboard':
      return output.action === 'read'
        ? 'read clipboard'
        : `copied ${output.bytes || 0} bytes to clipboard`;
    case 'note':
      return `noted ${output.message || ''}`.trim();
    case 'finish':
      return `finished ${output.message || ''}`.trim();
    default:
      return `${result.type || 'operation'} completed`;
  }
}

function inlineCommand(command, limit = 180) {
  const compact = String(command || '').replace(/\s+/g, ' ').trim();
  return compact.length > limit ? `${compact.slice(0, limit - 1)}…` : compact;
}

export function activityItemsFromResponse(responseText) {
  const payload = parseResponsePayload(responseText);
  if (!payload) {
    return [{ kind: 'error', text: 'Could not render readable response summary' }];
  }

  return [
    { kind: 'input', text: payload.summary || '(no summary)' },
    ...payload.results.map((result) => ({
      kind: result.ok ? 'success' : 'error',
      text: describeOperationResult(result)
    })),
    {
      kind: payload.copiedToClipboard ? 'clipboard' : 'error',
      text: payload.copiedToClipboard ? 'full response copied to clipboard' : 'full response was not copied'
    }
  ];
}

export function activityItemsFromSessionEntries(entries) {
  const transcript = [];

  for (const entry of entries || []) {
    const items = activityItemsFromResponse(entry?.responseText || '');
    const lines = items[0]?.kind === 'input' ? items.slice(1) : items;
    transcript.push({ role: 'user', text: entry?.summary || items[0]?.text || '(no summary)' });
    transcript.push({ role: 'assistant', title: 'VibeChat', lines });
  }

  return transcript;
}

export function parseResponsePayload(responseText) {
  const jsonStart = responseText.indexOf('{\n');
  const jsonEnd = responseText.lastIndexOf('\n```');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return null;
  }

  try {
    return JSON.parse(responseText.slice(jsonStart, jsonEnd));
  } catch {
    return null;
  }
}
