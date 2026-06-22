export function parseRequestBlock(input) {
  const text = String(input || '').trim();
  const jsonText = extractJsonText(text);

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Could not parse VibeChat request JSON: ${error.message}`);
  }
}

function extractJsonText(text) {
  const fenceMatch = text.match(/^```[^\r\n]*\r?\n([\s\S]*?)\r?\n?```\s*$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  const labeledBlockMatch = text.match(/^(?:json|vibechat-request)\s*\r?\n([\s\S]*)$/i);
  return labeledBlockMatch ? labeledBlockMatch[1].trim() : text;
}
