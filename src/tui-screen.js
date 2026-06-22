const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BLUE = '\x1b[38;5;39m';
const GREEN = '\x1b[38;5;40m';
const RED = '\x1b[38;5;203m';
const YELLOW = '\x1b[38;5;220m';
const USER_BUBBLE = '\x1b[48;5;24m\x1b[38;5;255m';
const CLIPBOARD_NOTICE = '\x1b[48;5;22m\x1b[38;5;255m';
const CURSOR = '\x1b[7m';

export function renderTuiScreen({
  columns = 100,
  rows = 30,
  title = 'VibeChat',
  cwd = process.cwd(),
  sessionId = '',
  usageLine = '',
  trustMode = 'shell',
  warnings = [],
  activity = [],
  transcriptScrollOffset = 0,
  composer = '',
  composerCursor = 0,
  skillPath = 'SKILLS.md',
  limits = {},
  favorite = false,
  watchCommand = '',
  status = 'Paste or type a request, then press Enter.'
}) {
  const width = Math.max(1, Math.floor(columns) || 100);
  const height = Math.max(1, Math.floor(rows) || 30);
  if (width < 40 || height < 12) {
    return renderConstrainedScreen(width, height);
  }
  const showSidebar = width >= 76;
  const sidebarWidth = showSidebar ? Math.min(34, Math.max(26, Math.floor(width * 0.32))) : 0;
  const mainWidth = showSidebar ? width - sidebarWidth - 3 : width;
  const editorWidth = Math.max(1, width - 2);
  const editorRows = renderComposerEditor(composer, composerCursor, editorWidth, 5);
  const composerHeight = editorRows.length + 4;
  const bodyHeight = height - composerHeight - 2;

  const header = `${color(BLUE, ' VibeChat ')}${DIM}${truncate(title || 'Local coding bridge', width - 14)}${RESET}`;
  const transcriptLines = buildTranscriptLines(activity, mainWidth, { skillPath });
  const leftLines = activity.length
    ? selectTranscriptWindow(transcriptLines, bodyHeight, transcriptScrollOffset)
    : transcriptLines.slice(0, bodyHeight);
  const rightLines = [
    color(BLUE, ' Status'),
    ` ${truncate(`Usage ${usageLine || 'unavailable'}`, sidebarWidth - 2)}`,
    ` ${truncate(`Trust ${trustMode}`, sidebarWidth - 2)}`,
    ` ${truncate(`Session ${sessionId || '?'}`, sidebarWidth - 2)}`,
    '',
    color(BLUE, ' Folder'),
    ` ${truncate(cwd, sidebarWidth - 2)}`,
    '',
    color(BLUE, ' Warnings'),
    ...(warnings.length ? warnings.map((warning) => ` ${truncate(warning, sidebarWidth - 2)}`) : [' none']),
    '',
    color(BLUE, ' Settings'),
    ` Limits ${truncate(limits.profile || 'custom', sidebarWidth - 9)}`,
    ` Caps ${formatLimits(limits, sidebarWidth - 7)}`,
    ` Watch ${truncate(watchCommand || 'off', sidebarWidth - 7)}`,
    ` Favorite ${favorite ? 'on' : 'off'}`
  ];

  const body = [];
  for (let index = 0; index < bodyHeight; index += 1) {
    body.push(showSidebar
      ? `${pad(leftLines[index] || '', mainWidth)} ${DIM}│${RESET} ${pad(rightLines[index] || '', sidebarWidth)}`
      : pad(leftLines[index] || '', mainWidth));
  }

  const composerLines = renderComposer({
    editorRows,
    status,
    usageLine,
    width
  });

  const frame = stabilizeFrame([
    pad(header, width),
    ''.padEnd(width, '─'),
    ...body,
    ...composerLines.map((line) => pad(line, width))
  ], width, height);

  return `\x1b[H${frame.join('\n')}`;
}

function renderConstrainedScreen(width, height) {
  const lines = [
    `\x1b[H${pad(color(BLUE, ' VibeChat '), width)}`,
    pad(`${DIM}Resize the terminal to at least 40 columns and 12 rows.${RESET}`, width)
  ];
  while (lines.length < height) {
    lines.push(''.padEnd(width, ' '));
  }
  return lines.join('\n');
}

function buildTranscriptLines(activity, width, { skillPath }) {
  if (!activity.length) {
    return buildWelcomeLines(width, skillPath);
  }

  const lines = [];
  for (const item of activity) {
    if (item.role === 'user') {
      lines.push(...renderUserBubble(item.text || '(no summary)', width));
      lines.push('');
      continue;
    }

    if (item.role === 'assistant') {
      lines.push(color(GREEN, ` VibeChat ${item.title ? `- ${item.title}` : ''}`));
      for (const entry of item.lines || []) {
        if (entry.kind === 'clipboard') {
          lines.push(...wrapText(entry.text || '', width - 2).map((line) => color(CLIPBOARD_NOTICE, ` clipboard  ${pad(line, width - 14)} `)));
          continue;
        }
        lines.push(...wrapText(`${renderStatusIcon(entry)} ${entry.text}`, width - 2).map((line) => `  ${line}`));
      }
      lines.push('');
      continue;
    }

    if (item.role === 'system') {
      lines.push(color(YELLOW, ' System'));
      lines.push(...wrapText(item.text || '', width - 2).map((line) => `  ${line}`));
      lines.push('');
      continue;
    }

    lines.push(renderLegacyActivityLine(item));
  }

  return lines;
}

function buildWelcomeLines(width, skillPath) {
  const prompt = 'Read the attached SKILLS.md, inspect the current project, and send one VibeChat request to understand the repo before making changes.';
  const entries = [
    color(BLUE, ' Getting Started'),
    '  1. Open a chatbot. ChatGPT Plus is recommended for the smoothest workflow.',
    '  2. Attach or paste this skill file into that chat:',
    `     ${skillPath}`,
    '  3. Tell the chatbot what you want to build. It will send one JSON request here.',
    '',
    color(GREEN, ' Starter prompt'),
    `  ${prompt}`,
    '',
    `${DIM} Local work happens here. Research and reasoning stay in your chatbot.${RESET}`
  ];

  return entries.flatMap((line) => line ? wrapText(line, width) : ['']);
}

function renderUserBubble(text, width) {
  const bubbleWidth = Math.min(width - 2, Math.max(24, Math.floor(width * 0.78)));
  const contentWidth = bubbleWidth - 2;
  const content = [
    color(USER_BUBBLE, ` You${' '.repeat(Math.max(0, contentWidth - 3))} `),
    ...wrapText(text, contentWidth).map((line) => color(USER_BUBBLE, ` ${pad(line, contentWidth)} `))
  ];

  return content.map((line) => `${' '.repeat(Math.max(0, width - stripAnsi(line).length))}${line}`);
}

function renderComposer({ editorRows, status, usageLine, width }) {
  const usage = usageLine || 'Today 0 | Week 0 | Month 0 | All 0';
  const statusLine = /full response copied to clipboard/i.test(status)
    ? color(CLIPBOARD_NOTICE, status)
    : `${DIM}${status}${RESET}`;

  return [
    ''.padEnd(width, '─'),
    `> ${editorRows[0]}`,
    ...editorRows.slice(1).map((line) => `  ${line}`),
    ''.padEnd(width, '─'),
    joinSides(statusLine, color(GREEN, usage), width),
    `${DIM}Enter send | Arrows edit | PgUp/PgDn scroll | Ctrl+Y copy | Ctrl+L clear | Ctrl+C quit | :menu${RESET}`
  ];
}

export function getComposerEditorRowCount(composer, width, maxLines = 5) {
  const value = String(composer || '').replace(/\t/g, '  ');
  if (!value) {
    return 1;
  }
  return Math.min(Math.max(1, maxLines), splitComposerSegments(value, Math.max(1, width)).length);
}

function renderComposerEditor(composer, cursor, width, maxLines) {
  const value = String(composer || '').replace(/\t/g, '  ');
  if (!value) {
    return [
      `${color(CURSOR, ' ')}${color(DIM, 'Paste or type one VibeChat request here.')}${' '.repeat(Math.max(0, width - 42))}`
    ];
  }

  const segments = splitComposerSegments(value, width);
  const cursorIndex = Math.max(0, Math.min(value.length, Number.isInteger(cursor) ? cursor : value.length));
  const cursorSegment = Math.max(0, segments.findIndex((segment) => cursorIndex >= segment.start && cursorIndex <= segment.end));
  const start = Math.min(Math.max(0, cursorSegment - maxLines + 1), Math.max(0, segments.length - maxLines));
  const selected = segments.slice(start, start + maxLines);
  const visible = selected.map((segment) => renderEditorSegment(segment, cursorIndex, width));
  return visible;
}

function splitComposerSegments(value, width) {
  const segments = [];
  let start = 0;
  let text = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '\n') {
      segments.push({ start, end: index, text });
      start = index + 1;
      text = '';
      continue;
    }
    text += character;
    if (text.length >= width) {
      segments.push({ start, end: index + 1, text });
      start = index + 1;
      text = '';
    }
  }
  segments.push({ start, end: value.length, text });
  return segments;
}

function renderEditorSegment(segment, cursor, width) {
  const hasCursor = cursor >= segment.start && cursor <= segment.end;
  if (!hasCursor) {
    return pad(segment.text, width);
  }

  const offset = cursor - segment.start;
  const before = segment.text.slice(0, offset);
  const current = segment.text[offset] || ' ';
  const after = segment.text.slice(offset + 1);
  return pad(`${before}${color(CURSOR, current)}${after}`, width);
}

function joinSides(left, right, width) {
  if (stripAnsi(right).length >= width) {
    return truncate(right, width);
  }
  const leftWidth = width - stripAnsi(right).length - 1;
  const visibleLeft = truncate(left, Math.max(0, leftWidth));
  const gap = Math.max(1, width - stripAnsi(visibleLeft).length - stripAnsi(right).length);
  return `${visibleLeft}${' '.repeat(gap)}${right}`;
}

function selectTranscriptWindow(lines, height, scrollOffset) {
  const offset = Math.max(0, Math.floor(Number(scrollOffset) || 0));
  const end = Math.max(height, lines.length - offset);
  return lines.slice(Math.max(0, end - height), end);
}

function formatLimits(limits, width) {
  const values = [limits.daily, limits.weekly, limits.monthly].map((value) => value || 'off').join('/');
  return truncate(values, width);
}

function renderLegacyActivityLine(item) {
  const icon = renderStatusIcon(item);
  const tone = item.kind === 'error' ? RED : item.kind === 'success' ? GREEN : YELLOW;
  return `${color(tone, icon)} ${item.text || ''}`;
}

function renderStatusIcon(item) {
  if (item.kind === 'error') {
    return 'x';
  }
  if (item.kind === 'success') {
    return 'ok';
  }
  return '>';
}

function wrapText(value, width) {
  const physicalLines = sanitizeDisplayText(value).split('\n');
  return physicalLines.flatMap((text) => wrapPhysicalLine(text, width));
}

function wrapPhysicalLine(text, width) {
  if (text.length <= width) {
    return [text];
  }

  const lines = [];
  let remaining = text;
  while (remaining.length > width) {
    let breakAt = remaining.lastIndexOf(' ', width);
    if (breakAt < Math.floor(width * 0.5)) {
      breakAt = width;
    }
    lines.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining) {
    lines.push(remaining);
  }
  return lines;
}

function stabilizeFrame(lines, width, height) {
  const stable = lines
    .slice(0, height)
    .map((line) => pad(sanitizeRenderLine(line), width));

  while (stable.length < height) {
    stable.push(''.padEnd(width, ' '));
  }
  return stable;
}

function sanitizeDisplayText(value) {
  return removeUnsafeAnsi(String(value))
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f]/g, '');
}

function sanitizeRenderLine(value) {
  return removeUnsafeAnsi(String(value))
    .replace(/[\r\n]/g, ' ')
    .replace(/[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f]/g, '');
}

function removeUnsafeAnsi(value) {
  return String(value)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, (sequence) => /^\x1b\[[0-9;]*m$/.test(sequence) ? sequence : '')
    .replace(/\x1b(?!\[[0-9;]*m)/g, '');
}

function color(code, value) {
  return `${code}${value}${RESET}`;
}

function pad(value, width) {
  const visibleLength = stripAnsi(value).length;
  if (visibleLength >= width) {
    return truncate(value, width);
  }
  return `${value}${' '.repeat(width - visibleLength)}`;
}

function truncate(value, width) {
  const plain = stripAnsi(String(value));
  if (plain.length <= width) {
    return value;
  }
  return `${plain.slice(0, Math.max(0, width - 1))}…`;
}

function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, '');
}
