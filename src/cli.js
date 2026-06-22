import { emitKeypressEvents } from 'node:readline';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { PassThrough } from 'node:stream';
import path from 'node:path';
import { promisify } from 'node:util';
import { parseRequestBlock } from './parser.js';
import { executeRequest } from './executor.js';
import { formatResponse } from './formatter.js';
import { copyToClipboard } from './clipboard.js';
import { getRequestState } from './request-state.js';
import {
  deleteAtCursor,
  deleteBeforeCursor,
  getComposerEnterAction,
  insertComposerText,
  moveTranscriptScrollOffset,
  moveComposerCursor
} from './tui-composer.js';
import {
  appendSessionEntry,
  createSession,
  deleteSession,
  getSessionStoreRoot,
  loadAllSessions,
  listSessions,
  loadSession
} from './session-store.js';
import {
  isFavorite,
  limitProfiles,
  loadConfig,
  saveConfig,
  setLimit,
  setLimitProfile,
  setTrustMode,
  setWatchCommand,
  toggleFavorite,
  validateTrustForRequest
} from './config.js';
import {
  buildCompactSummary,
  buildUndoPlan,
  collectChangedPathsFromResults,
  exportFileName,
  renderExportMarkdown,
  renderHistorySearch,
  searchHistory
} from './history-tools.js';
import { activityItemsFromResponse, activityItemsFromSessionEntries, describeOperationResult, renderHumanRunFromResponse } from './human-output.js';
import { selectFromList } from './interactive.js';
import { buildUsageDashboard, buildUsageSummary, buildUsageWarnings, formatUsageCompact } from './usage.js';
import { mainMenuItems, renderTuiDashboard } from './tui.js';
import { renderTuiScreen } from './tui-screen.js';
import { createMouseWheelDecoder, createRedrawScheduler, enterFullScreen, exitFullScreen } from './tui-terminal.js';
import {
  renderBanner,
  renderDirectoryListing,
  renderDoctor,
  renderExample,
  renderFriendlyError,
  renderHistory,
  renderHelp,
  renderIncompleteRequest,
  renderLastResponse,
  renderRequestDebug,
  renderSessions,
  renderSkillPath,
  renderStatus,
  skillFilePath
} from './ui.js';

const execAsync = promisify(exec);

export async function handleRequestText(text, { cwd = process.cwd(), clipboard, onResult } = {}) {
  const request = parseRequestBlock(text);
  const execution = await executeRequest(request, { cwd, onResult });
  const response = formatResponse({ ...execution, copiedToClipboard: true });
  const clipboardResult = await copyToClipboard(response, clipboard);

  if (!clipboardResult.ok) {
    return formatResponse({
      ...execution,
      copiedToClipboard: false,
      clipboardError: clipboardResult.error || ''
    });
  }

  return response;
}

export async function runCli({ cwd = process.cwd() } = {}) {
  const state = {
    cwd: path.resolve(cwd),
    buffer: [],
    debug: false,
    session: await createSession({ cwd }),
    storeRoot: getSessionStoreRoot(),
    config: await loadConfig(),
    usage: null
  };
  await refreshUsage(state);

  if (input.isTTY && output.isTTY && process.env.VIBECHAT_TUI !== '0') {
    await runInteractiveTui(state);
    return;
  }

  console.log(renderBanner({
    cwd: state.cwd,
    session: state.session,
    storeRoot: state.storeRoot,
    usageLine: formatUsageCompact(state.usage),
    warnings: usageWarnings(state)
  }));

  const rl = readline.createInterface({ input, output });
  writePrompt(state);

  for await (const line of rl) {
    if (isConsoleCommand(line.trim())) {
      try {
        const action = await handleConsoleCommand(line.trim(), state);
        if (action === 'exit') {
          rl.close();
          return;
        }
      } catch (error) {
        console.log(renderFriendlyError(error));
      }
      writePrompt(state);
      continue;
    }

    state.buffer.push(line);
    const requestText = state.buffer.join('\n');
    const requestState = getRequestState(requestText);

    if (requestState.complete) {
      state.buffer = [];

      try {
        if (state.debug) {
          console.log(renderRequestDebug({ requestText, requestState }));
        }
        const { humanOutput } = await executeRequestText(requestText, state);
        console.log(humanOutput);
        await runWatchCommand(state);
      } catch (error) {
        console.log(renderFriendlyError(error));
      }
    }

    writePrompt(state);
  }

  if (state.buffer.length > 0) {
    const requestState = getRequestState(state.buffer.join('\n'));
    console.log(renderIncompleteRequest({ requestState }));
  }
}

async function runInteractiveTui(state) {
  const activity = activityItemsFromSessionEntries(state.session.entries);
  let composer = '';
  let composerCursor = 0;
  let transcriptScrollOffset = 0;
  let status = 'Paste or type a request, then press Enter.';
  let busy = false;
  let closed = false;
  let pasting = false;

  const keyboardInput = new PassThrough();
  emitKeypressEvents(keyboardInput);
  input.setRawMode(true);
  input.resume();
  enterFullScreen(output);

  const scheduler = createRedrawScheduler(() => {
    output.write(renderTuiScreen({
      columns: output.columns || 100,
      rows: output.rows || 30,
      title: state.session.entries.at(-1)?.summary || 'VibeChat',
      cwd: state.cwd,
      sessionId: state.session.id,
      usageLine: formatUsageCompact(state.usage),
      trustMode: state.config.trustMode,
      warnings: usageWarnings(state),
      activity,
      transcriptScrollOffset,
      composer,
      composerCursor,
      skillPath: skillFilePath(),
      limits: state.config.limits,
      favorite: isFavorite(state.config, state.session.id),
      watchCommand: state.config.watchCommand,
      status
    }));
  });
  const draw = () => scheduler.request();
  const redrawForResize = () => scheduler.drawNow();

  output.on('resize', redrawForResize);

  scheduler.drawNow();

  await new Promise((resolve) => {
    const pendingKeypresses = [];
    const mouseWheel = createMouseWheelDecoder((direction) => {
      if (closed) {
        return;
      }
      transcriptScrollOffset = moveTranscriptScrollOffset(transcriptScrollOffset, direction, 1);
      status = transcriptScrollOffset === 0 ? 'History: latest messages.' : 'History: older messages. Scroll down to return to the latest view.';
      draw();
    });

    function onTerminalData(chunk) {
      const keyboardData = mouseWheel.push(chunk);
      if (keyboardData) {
        keyboardInput.write(keyboardData);
      }
    }

    async function copyLatestResponse() {
      const lastEntry = state.session.entries.at(-1);
      if (!lastEntry) {
        status = 'No completed response is available to copy yet.';
        draw();
        return;
      }

      const result = await copyToClipboard(lastEntry.responseText);
      status = result.ok
        ? 'Full response copied to clipboard again.'
        : `Full response was not copied: ${result.error || 'unknown clipboard error'}`;
      draw();
    }

    async function finish() {
      if (closed) {
        return;
      }
      closed = true;
      keyboardInput.off('keypress', onKeypress);
      input.off('data', onTerminalData);
      input.off('end', finish);
      input.off('close', finish);
      output.off('resize', redrawForResize);
      input.setRawMode(false);
      input.pause();
      exitFullScreen(output);
      resolve();
    }

    async function runCommand(command) {
      const { text, action } = await captureConsoleOutput(() => handleConsoleCommand(command, state));
      if (text.trim()) {
        activity.push({ role: 'system', text: text.trim().split(/\r?\n/).slice(-12).join('\n') });
        transcriptScrollOffset = 0;
      }
      if (action === 'exit') {
        await finish();
        return action;
      }
      status = `Ran ${command}`;
      return action;
    }

    async function onKeypress(character, key) {
      if (closed) {
        return;
      }
      if (busy) {
        if ((key?.ctrl && key.name === 'c') || (key?.ctrl && key.name === 'd') || character === '\u0004') {
          await finish();
          return;
        }
        pendingKeypresses.push([character, key]);
        return;
      }

      await handleKeypress(character, key);
    }

    async function drainPendingKeypresses() {
      while (!closed && !busy && pendingKeypresses.length > 0) {
        const [queuedCharacter, queuedKey] = pendingKeypresses.shift();
        await handleKeypress(queuedCharacter, queuedKey);
      }
    }

    async function handleKeypress(character, key) {
      if (key?.name === 'paste-start') {
        pasting = true;
        status = 'Pasting request...';
        scheduler.suspend();
        return;
      }
      if (key?.name === 'paste-end') {
        pasting = false;
        status = 'Paste ready. Press Enter to send.';
        scheduler.resume();
        return;
      }

      if (pasting) {
        if (character) {
          const next = insertComposerText(composer, composerCursor, character === '\r' ? '\n' : character);
          composer = next.value;
          composerCursor = next.cursor;
          status = 'Pasting request...';
          draw();
        }
        return;
      }

      if (key?.ctrl && key.name === 'c') {
        await finish();
        return;
      }
      if ((key?.ctrl && key.name === 'd') || character === '\u0004') {
        await finish();
        return;
      }
      if (key?.ctrl && key.name === 'l') {
        composer = '';
        composerCursor = 0;
        status = 'Composer cleared.';
        draw();
        return;
      }
      if (key?.ctrl && key.name === 'y') {
        await copyLatestResponse();
        return;
      }
      if (key?.name === 'backspace') {
        const next = deleteBeforeCursor(composer, composerCursor);
        composer = next.value;
        composerCursor = next.cursor;
        status = 'Editing request. Press Enter to send.';
        draw();
        return;
      }
      if (key?.name === 'delete') {
        const next = deleteAtCursor(composer, composerCursor);
        composer = next.value;
        composerCursor = next.cursor;
        status = 'Editing request. Press Enter to send.';
        draw();
        return;
      }
      if (key?.ctrl && ['up', 'down', 'home', 'end'].includes(key.name)) {
        transcriptScrollOffset = moveTranscriptScrollOffset(transcriptScrollOffset, key.name, 1);
        status = transcriptScrollOffset === 0 ? 'History: latest messages.' : 'History: older messages. Ctrl+Down or PageDown returns to the latest view.';
        draw();
        return;
      }
      if (['left', 'right', 'up', 'down', 'home', 'end'].includes(key?.name)) {
        composerCursor = moveComposerCursor(composer, composerCursor, key.name);
        status = 'Editing request. Press Enter to send.';
        draw();
        return;
      }
      if (key?.name === 'pageup' || key?.name === 'pagedown') {
        transcriptScrollOffset = moveTranscriptScrollOffset(
          transcriptScrollOffset,
          key.name,
          Math.max(1, Math.floor((output.rows || 30) / 2))
        );
        status = transcriptScrollOffset === 0 ? 'History: latest messages.' : 'History: older messages. PageDown returns to the latest view.';
        draw();
        return;
      }
      if (key?.name === 'return' || key?.name === 'enter' || character === '\r' || character === '\n') {
        const enterAction = getComposerEnterAction(composer);
        if (enterAction.action === 'ignore') {
          draw();
          return;
        }
        if (enterAction.action === 'command') {
          busy = true;
          const action = await runCommand(enterAction.command);
          composer = '';
          composerCursor = 0;
          busy = false;
          if (action === 'exit') {
            return;
          }
          draw();
          await drainPendingKeypresses();
          return;
        }
        if (enterAction.action === 'submit') {
          busy = true;
          const requestText = composer;
          composer = '';
          composerCursor = 0;
          transcriptScrollOffset = 0;
          try {
            const request = parseRequestBlock(requestText);
            activity.push({ role: 'user', text: request.summary || '(no summary)' });
            const responseActivity = {
              role: 'assistant',
              title: 'VibeChat',
              lines: []
            };
            activity.push(responseActivity);
            status = `Running ${request.operations.length} operation(s)...`;
            scheduler.drawNow();

            const { response } = await executeRequestText(requestText, state, {
              onResult: async (result) => {
                responseActivity.lines.push({
                  kind: result.ok ? 'success' : 'error',
                  text: describeOperationResult(result)
                });
                status = `Completed operation ${result.index} of ${request.operations.length}.`;
                scheduler.drawNow();
              }
            });
            const completion = activityItemsFromResponse(response).at(-1);
            if (completion) {
              responseActivity.lines.push(completion);
            }
            const watchOutput = await captureConsoleOutput(() => runWatchCommand(state));
            if (watchOutput.text.trim()) {
              activity.push({
                role: 'system',
                text: watchOutput.text.trim().split(/\r?\n/).slice(-8).join('\n')
              });
            }
            status = 'Request complete. Full response copied to clipboard.';
          } catch (error) {
            activity.push({ role: 'user', text: 'Input Request failed.' });
            activity.push({
              role: 'assistant',
              title: 'VibeChat',
              lines: [{ kind: 'error', text: error?.message || String(error) }]
            });
            status = 'Request failed. Edit the request and press Enter again.';
          }
          busy = false;
          draw();
          await drainPendingKeypresses();
          return;
        }
        const next = insertComposerText(composer, composerCursor, '\n');
        composer = next.value;
        composerCursor = next.cursor;
        status = 'Request is not complete yet. Keep typing, then press Enter.';
        draw();
        return;
      }

      if (character) {
        const next = insertComposerText(composer, composerCursor, character);
        composer = next.value;
        composerCursor = next.cursor;
        status = 'Editing request. Press Enter to send.';
      }

      draw();
    }

    input.on('data', onTerminalData);
    keyboardInput.on('keypress', onKeypress);
    input.once('end', finish);
    input.once('close', finish);
  });
}

function writePrompt(state) {
  output.write(state.buffer.length === 0
    ? `vibe [D${state.usage?.today ?? 0} W${state.usage?.week ?? 0}]> `
    : '... ');
}

async function executeRequestText(requestText, state, { onResult } = {}) {
  validateTrustForRequest(parseRequestBlock(requestText), state.config);
  const response = await handleRequestText(requestText, { cwd: state.cwd, onResult });
  state.session = await appendSessionEntry(state.session.id, buildSessionEntry(requestText, response, state.cwd));
  await refreshUsage(state);
  return {
    response,
    humanOutput: renderHumanRunFromResponse(response)
  };
}

async function captureConsoleOutput(callback) {
  const originalLog = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.map(String).join(' '));
  };

  try {
    const action = await callback();
    return { action, text: lines.join('\n') };
  } finally {
    console.log = originalLog;
  }
}

async function handleConsoleCommand(rawCommand, state) {
  const command = normalizeConsoleCommand(rawCommand);
  const [name] = command.split(/\s+/, 1);
  const args = command.slice(name.length).trim();

  switch (name) {
    case ':help':
      console.log(renderHelp());
      return false;
    case ':menu':
    case ':tui':
      await handleMenuCommand(state);
      return false;
    case ':status':
      console.log(renderStatus({
        cwd: state.cwd,
        buffer: state.buffer,
        debug: state.debug,
        session: state.session,
        storeRoot: state.storeRoot,
        usageLine: formatUsageCompact(state.usage),
        warnings: usageWarnings(state),
        requestState: getRequestState(state.buffer.join('\n'))
      }));
      return false;
    case ':usage':
      console.log(buildUsageDashboard(await loadAllSessions(), {
        color: Boolean(output.isTTY)
      }));
      await refreshUsage(state);
      return false;
    case ':sessions':
      await handleSessionsCommand(state, parseLimit(args, 20));
      return false;
    case ':browse':
      await handleSessionsCommand(state, parseLimit(args, 20), { forceInteractive: true });
      return false;
    case ':resume':
      await resumeSession(state, requireCommandArg(args, ':resume ID'));
      return false;
    case ':new':
      state.session = await createSession({ cwd: state.cwd });
      await refreshUsage(state);
      console.log(`Started new session ${state.session.id}`);
      return false;
    case ':limits':
      await handleLimitsCommand(state, args);
      return false;
    case ':trust':
      await handleTrustCommand(state, args);
      return false;
    case ':favorite':
      await handleFavoriteCommand(state);
      return false;
    case ':favorites':
      await handleFavoritesCommand(state);
      return false;
    case ':history':
      console.log(renderHistory(state.session, { limit: parseLimit(args, 20) }));
      return false;
    case ':search-history':
      console.log(renderHistorySearch(searchHistory(await loadAllSessions(), requireCommandArg(args, ':search-history QUERY'))));
      return false;
    case ':compact':
      await copyTextWithNotice(buildCompactSummary(state.session), 'Compact summary');
      console.log(buildCompactSummary(state.session));
      return false;
    case ':diff-last':
      console.log(await renderDiffLast(state));
      return false;
    case ':undo-plan':
      console.log(buildUndoPlan(state.session));
      return false;
    case ':export-session':
      await handleExportSession(state, args);
      return false;
    case ':watch':
      await handleWatchCommand(state, args);
      return false;
    case ':github':
    case ':git':
      console.log(await renderGitHubWorkflow(state));
      return false;
    case ':last':
      console.log(renderLastResponse(state.session));
      return false;
    case ':copy-last':
      await copyLastResponse(state.session);
      return false;
    case ':doctor':
      console.log(renderDoctor({
        cwd: state.cwd,
        session: state.session,
        storeRoot: state.storeRoot
      }));
      return false;
    case ':pwd':
      console.log(state.cwd);
      return false;
    case ':cd':
      state.cwd = await resolveDirectory(state.cwd, requireCommandArg(args, ':cd PATH'));
      state.session.cwd = state.cwd;
      process.chdir(state.cwd);
      console.log(`cwd: ${state.cwd}`);
      return false;
    case ':ls':
      console.log(renderDirectoryListing(await listDirectoryForConsole(state.cwd, args || '.')));
      return false;
    case ':example':
      console.log(renderExample());
      return false;
    case ':skill':
      console.log(renderSkillPath());
      return false;
    case ':debug':
      state.debug = !state.debug;
      console.log(`Debug mode: ${state.debug ? 'on' : 'off'}`);
      return false;
    case ':clear':
      state.buffer = [];
      console.log('Cleared current request buffer.');
      return false;
    case ':exit':
    case ':quit':
      return 'exit';
    default:
      console.log(renderFriendlyError(new Error(`Unknown VibeChat command: ${command}`)));
      return false;
  }
}

async function handleSessionsCommand(state, limit, { forceInteractive = false } = {}) {
  const sessions = await listSessions({ limit });
  const canSelect = (forceInteractive || (input.isTTY && output.isTTY)) && sessions.length > 0;

  if (!canSelect) {
    console.log(renderSessions(sessions, {
      currentId: state.session.id
    }));
    return;
  }

  const selected = await selectFromList({
    title: 'Select Session',
    input,
    output,
    items: sessions.map((session) => ({
      value: session.id,
      label: session.id === state.session.id ? `${session.id} (current)` : session.id,
      detail: `${session.entryCount} requests | ${session.lastSummary || 'no requests yet'}`
    }))
  });

  if (!selected) {
    console.log('Session selection canceled.');
    return;
  }

  await resumeSession(state, selected.value);
}

async function handleMenuCommand(state) {
  const dashboard = renderTuiDashboard({
    cwd: state.cwd,
    session: state.session,
    usageLine: formatUsageCompact(state.usage),
    warnings: usageWarnings(state),
    trustMode: state.config.trustMode,
    favorite: isFavorite(state.config, state.session.id),
    watchCommand: state.config.watchCommand
  });

  if (!input.isTTY || !output.isTTY) {
    console.log(dashboard);
    return;
  }

  const selected = await selectFromList({
    title: dashboard,
    input,
    output,
    items: mainMenuItems()
  });

  if (!selected || selected.value === 'cancel') {
    console.log('Menu canceled.');
    return;
  }

  await handleConsoleCommand(`:${selected.value}`, state);
}

async function handleLimitsCommand(state, args) {
  const parts = args.split(/\s+/).filter(Boolean);
  if (parts[0] === 'profile') {
    state.config = setLimitProfile(state.config, requireCommandArg(parts[1], ':limits profile NAME'));
    await saveConfig(state.config);
    console.log(`Limit profile: ${state.config.limits.profile}`);
    return;
  }
  if (parts[0] === 'set') {
    state.config = setLimit(state.config, requireCommandArg(parts[1], ':limits set daily|weekly|monthly COUNT'), requireCommandArg(parts[2], ':limits set daily|weekly|monthly COUNT'));
    await saveConfig(state.config);
    console.log(`${capitalize(parts[1])} limit set to ${state.config.limits[parts[1]]}`);
    return;
  }

  console.log([
    '',
    'Limits',
    '------',
    `profile: ${state.config.limits.profile}`,
    `daily: ${state.config.limits.daily || 'off'}`,
    `weekly: ${state.config.limits.weekly || 'off'}`,
    `monthly: ${state.config.limits.monthly || 'off'}`,
    `profiles: ${limitProfiles().join(', ')}`,
    usageWarnings(state).length ? `warnings: ${usageWarnings(state).join(' | ')}` : 'warnings: none',
    ''
  ].join('\n'));
}

async function handleTrustCommand(state, args) {
  if (args) {
    state.config = setTrustMode(state.config, args);
    await saveConfig(state.config);
  }
  console.log(`Trust mode: ${state.config.trustMode}`);
}

async function handleFavoriteCommand(state) {
  const wasFavorite = isFavorite(state.config, state.session.id);
  state.config = toggleFavorite(state.config, state.session.id);
  await saveConfig(state.config);
  console.log(wasFavorite ? 'Favorite removed.' : 'Favorite added.');
}

async function handleFavoritesCommand(state) {
  const sessions = await loadAllSessions();
  const favorites = sessions.filter((session) => isFavorite(state.config, session.id));
  console.log([
    '',
    'Favorite Sessions',
    '-----------------',
    favorites.length
      ? favorites.map((session) => `${session.id}  ${session.entries.length} requests  ${session.cwd}`).join('\n')
      : 'No favorite sessions yet.',
    ''
  ].join('\n'));
}

async function handleExportSession(state, args) {
  const requestedPath = args || exportFileName(state.session);
  const resolvedPath = path.resolve(state.cwd, requestedPath);
  await fs.writeFile(resolvedPath, renderExportMarkdown(state.session), 'utf8');
  console.log(`Exported session to ${resolvedPath}`);
}

async function handleWatchCommand(state, args) {
  if (!args) {
    console.log(`Watch command: ${state.config.watchCommand || 'off'}`);
    return;
  }
  const command = args === 'off' ? '' : args;
  state.config = setWatchCommand(state.config, command);
  await saveConfig(state.config);
  console.log(command ? `Watch command set: ${command}` : 'Watch disabled.');
}

async function resumeSession(state, sessionId) {
  if (state.session.entries.length === 0) {
    await deleteSession(state.session.id);
  }
  state.session = await loadSession(sessionId);
  state.cwd = state.session.cwd;
  await ensureDirectory(state.cwd);
  process.chdir(state.cwd);
  await refreshUsage(state);
  console.log(`Resumed session ${state.session.id}`);
}

function isConsoleCommand(line) {
  return line.startsWith(':') || line.startsWith('/');
}

function normalizeConsoleCommand(command) {
  return command.startsWith('/') ? `:${command.slice(1)}` : command;
}

function parseLimit(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function requireCommandArg(value, usage) {
  if (!value) {
    throw new Error(`Usage: ${usage}`);
  }
  return value;
}

async function ensureDirectory(directory) {
  const stats = await fs.stat(directory);
  if (!stats.isDirectory()) {
    throw new Error(`Session cwd is not a directory: ${directory}`);
  }
}

async function resolveDirectory(cwd, requestedPath) {
  const resolved = path.resolve(cwd, requestedPath);
  await ensureDirectory(resolved);
  return resolved;
}

async function listDirectoryForConsole(cwd, requestedPath) {
  const resolved = await resolveDirectory(cwd, requestedPath);
  const entries = await fs.readdir(resolved, { withFileTypes: true });
  const visible = entries
    .filter((entry) => !entry.isSymbolicLink())
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 80)
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file'
    }));

  return {
    cwd,
    path: path.relative(cwd, resolved) || '.',
    entries: visible
  };
}

async function copyLastResponse(session) {
  const lastEntry = session.entries.at(-1);
  if (!lastEntry) {
    console.log('Last response is empty; no request has completed in this session yet.');
    return;
  }

  const result = await copyToClipboard(lastEntry.responseText);
  if (result.ok) {
    console.log('Last response copied to clipboard.');
  } else {
    console.log(`Last response was not copied to clipboard: ${result.error || 'unknown clipboard error'}`);
  }
}

function buildSessionEntry(requestText, responseText, cwd) {
  const request = parseRequestBlock(requestText);
  const payload = parseResponsePayload(responseText);
  const results = Array.isArray(payload?.results) ? payload.results : [];

  return {
    cwd,
    summary: request.summary || payload?.summary || '',
    operationsLabel: summarizeOperations(request.operations),
    changedPaths: collectChangedPathsFromResults(results),
    requestText,
    responseText,
    copiedToClipboard: Boolean(payload?.copiedToClipboard),
    operationCount: results.length,
    failedCount: results.filter((result) => !result.ok).length
  };
}

function parseResponsePayload(responseText) {
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

async function refreshUsage(state) {
  state.usage = buildUsageSummary(await loadAllSessions());
}

function usageWarnings(state) {
  return buildUsageWarnings(state.usage, state.config.limits);
}

async function copyTextWithNotice(text, label) {
  const result = await copyToClipboard(text);
  console.log(result.ok ? `${label} copied to clipboard.` : `${label} was not copied to clipboard: ${result.error || 'unknown clipboard error'}`);
}

async function renderDiffLast(state) {
  const lastEntry = state.session.entries.at(-1);
  const changedPaths = lastEntry?.changedPaths || [];
  if (changedPaths.length === 0) {
    return '\nChanged paths\n-------------\nNo changed paths were recorded for the last request.\n';
  }

  let gitDiff = '';
  try {
    await execAsync('git rev-parse --is-inside-work-tree', {
      cwd: state.cwd,
      timeout: 5000
    });
    const { stdout } = await execAsync(`git diff -- ${changedPaths.map(shellQuote).join(' ')}`, {
      cwd: state.cwd,
      timeout: 10000,
      maxBuffer: 200000
    });
    gitDiff = stdout.trim();
  } catch (error) {
    gitDiff = error.message.includes('rev-parse')
      ? 'Not a git repository; changed paths are still listed above.'
      : `Could not read git diff: ${error.message}`;
  }

  return [
    '',
    'Changed paths',
    '-------------',
    changedPaths.join('\n'),
    '',
    'Git diff',
    '--------',
    gitDiff || '(no git diff for recorded paths)',
    ''
  ].join('\n');
}

async function renderGitHubWorkflow(state) {
  let branch = '(not a git repository)';
  let status = '';
  let remotes = '';

  try {
    branch = (await execAsync('git branch --show-current', { cwd: state.cwd })).stdout.trim() || '(detached)';
    status = (await execAsync('git status --short', { cwd: state.cwd })).stdout.trim() || 'clean';
    remotes = (await execAsync('git remote -v', { cwd: state.cwd })).stdout.trim() || 'no remotes';
  } catch {
    // Keep the static workflow text useful outside git repos.
  }

  return [
    '',
    'GitHub Workflow',
    '---------------',
    `branch: ${branch}`,
    `status: ${status}`,
    'remotes:',
    remotes,
    '',
    'Current VibeChat GitHub flow: ask the chatbot to inspect git status, create commits, push branches, and open PRs through VibeChat shell operations.',
    'Better path: use VibeChat helpers for status/diff/export now, and add first-class PR helpers later for branch creation, commit staging, push, and PR templates.',
    ''
  ].join('\n');
}

async function runWatchCommand(state) {
  if (!state.config.watchCommand) {
    return;
  }

  console.log(`Running watch command: ${state.config.watchCommand}`);
  try {
    const { stdout, stderr } = await execAsync(state.config.watchCommand, {
      cwd: state.cwd,
      timeout: 120000,
      maxBuffer: 400000
    });
    console.log([
      '',
      'Watch Result',
      '------------',
      stdout.trim() || '(no stdout)',
      stderr.trim() ? `\nstderr:\n${stderr.trim()}` : '',
      ''
    ].join('\n'));
  } catch (error) {
    console.log([
      '',
      'Watch Result',
      '------------',
      `Command failed: ${error.message}`,
      error.stdout ? `stdout:\n${error.stdout}` : '',
      error.stderr ? `stderr:\n${error.stderr}` : '',
      ''
    ].join('\n'));
  }
}

function summarizeOperations(operations = []) {
  if (!Array.isArray(operations) || operations.length === 0) {
    return '0 operations';
  }

  const counts = new Map();
  for (const operation of operations) {
    const type = operation?.type || 'unknown';
    counts.set(type, (counts.get(type) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');
}

function capitalize(value) {
  return String(value || '').slice(0, 1).toUpperCase() + String(value || '').slice(1);
}

function shellQuote(value) {
  return /^[a-zA-Z0-9_./-]+$/.test(value) ? value : `'${String(value).replace(/'/g, "'\\''")}'`;
}
