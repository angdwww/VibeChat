import clipboardy from 'clipboardy';

export async function copyToClipboard(text, adapter = clipboardy) {
  try {
    await adapter.write(text);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}
