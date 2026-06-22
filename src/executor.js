import { runOperation } from './operations.js';

export async function executeRequest(request, { cwd = process.cwd(), onResult } = {}) {
  if (!request || typeof request !== 'object') {
    throw new Error('VibeChat request must be a JSON object.');
  }

  if (!Array.isArray(request.operations)) {
    throw new Error('VibeChat request must include an operations array.');
  }

  if (!String(request.summary || '').trim()) {
    throw new Error('VibeChat request must include a human-readable summary field explaining what it is doing.');
  }

  const results = [];

  for (const [index, operation] of request.operations.entries()) {
    const result = await runOperation(operation, { cwd });
    const indexedResult = {
      index: index + 1,
      type: operation?.type || 'unknown',
      ...result
    };
    results.push(indexedResult);

    if (typeof onResult === 'function') {
      await onResult(indexedResult);
    }

    if (!indexedResult.ok && !request.continueOnError) {
      break;
    }
  }

  return {
    cwd,
    summary: request.summary || '',
    results
  };
}
