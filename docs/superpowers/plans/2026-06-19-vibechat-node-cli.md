# VibeChat Node CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js terminal tool named `vibe` that runs local machine operations from chatbot request blocks, prints a structured paste-back response, and copies that response to the clipboard.

**Architecture:** The CLI reads pasted JSON request blocks, parses them into ordered operations, dispatches each operation through a focused executor, formats a single response block, and sends that block to stdout and the clipboard. Local machine behavior is split into parser, formatter, clipboard, filesystem operations, shell execution, and interactive CLI modules so each piece can be tested directly.

**Tech Stack:** Node.js ESM, npm scripts, `node:test`, `node:assert`, `clipboardy`, `ignore`, and `diff`.

---

## File Map

- Create `package.json`: package metadata, `vibe` binary mapping, dependencies, and test scripts.
- Create `bin/vibe.js`: executable entrypoint that imports and runs the CLI.
- Create `src/parser.js`: extracts JSON from fenced or unfenced chatbot request blocks.
- Create `src/formatter.js`: formats operation results into one paste-back Markdown block.
- Create `src/path-utils.js`: resolves session-relative paths and blocks accidental path escapes.
- Create `src/operations.js`: implements local operations such as list, tree, read, write, append, patch, mkdir, rm, move, copy, search, stat, shell, note, clipboard, and finish.
- Create `src/executor.js`: validates request shape and executes operations in order with `continueOnError` support.
- Create `src/clipboard.js`: copies text to the clipboard and reports fallback errors.
- Create `src/cli.js`: starts the interactive `vibe` terminal session and handles pasted blocks.
- Create `SKILLS.md`: chatbot-facing instructions and full command protocol.
- Create `test/*.test.js`: focused tests for parser, formatter, operations, executor, and clipboard handling.

## Task 1: Scaffold Node Package And Parser

**Files:**
- Create: `package.json`
- Create: `bin/vibe.js`
- Create: `src/parser.js`
- Test: `test/parser.test.js`

- [ ] **Step 1: Create the failing parser tests**

Create `test/parser.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequestBlock } from '../src/parser.js';

test('parses a plain JSON request block', () => {
  const request = parseRequestBlock('{"version":1,"operations":[{"type":"session_info"}]}');
  assert.equal(request.version, 1);
  assert.deepEqual(request.operations, [{ type: 'session_info' }]);
});

test('parses a fenced JSON request block', () => {
  const input = [
    '```json',
    '{"version":1,"summary":"Inspect","operations":[{"type":"tree","path":"."}]}',
    '```'
  ].join('\n');
  const request = parseRequestBlock(input);
  assert.equal(request.summary, 'Inspect');
  assert.deepEqual(request.operations, [{ type: 'tree', path: '.' }]);
});

test('throws a readable error for invalid JSON', () => {
  assert.throws(
    () => parseRequestBlock('```json\n{"version":1,\n```'),
    /Could not parse VibeChat request JSON/
  );
});
```

- [ ] **Step 2: Run parser tests to verify they fail**

Run:

```bash
npm test -- test/parser.test.js
```

Expected: failure because `package.json`, `src/parser.js`, or the exported parser does not exist yet.

- [ ] **Step 3: Create minimal package and parser implementation**

Create `package.json`:

```json
{
  "name": "vibechat",
  "version": "0.1.0",
  "description": "A terminal bridge for copy-paste vibe coding with chatbots.",
  "type": "module",
  "bin": {
    "vibe": "./bin/vibe.js"
  },
  "scripts": {
    "test": "node --test",
    "start": "node ./bin/vibe.js"
  },
  "dependencies": {
    "clipboardy": "^4.0.0",
    "diff": "^5.2.0",
    "ignore": "^5.3.2"
  },
  "devDependencies": {},
  "engines": {
    "node": ">=20"
  },
  "license": "MIT"
}
```

Create `bin/vibe.js`:

```js
#!/usr/bin/env node

import { runCli } from '../src/cli.js';

runCli().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
```

Create `src/parser.js`:

```js
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
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenceMatch ? fenceMatch[1].trim() : text;
}
```

Create temporary `src/cli.js` so the bin import resolves:

```js
export async function runCli() {
  console.log('VibeChat CLI is not implemented yet.');
}
```

- [ ] **Step 4: Run parser tests to verify they pass**

Run:

```bash
npm install
npm test -- test/parser.test.js
```

Expected: all parser tests pass.

- [ ] **Step 5: Commit parser scaffold**

Run:

```bash
git add package.json package-lock.json bin/vibe.js src/parser.js src/cli.js test/parser.test.js
git commit -m "feat: scaffold VibeChat parser"
```

## Task 2: Formatter And Clipboard Result Shape

**Files:**
- Create: `src/formatter.js`
- Create: `src/clipboard.js`
- Test: `test/formatter.test.js`
- Test: `test/clipboard.test.js`

- [ ] **Step 1: Write failing formatter tests**

Create `test/formatter.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatResponse } from '../src/formatter.js';

test('formats a paste-back response with cwd and operation results', () => {
  const output = formatResponse({
    cwd: '/tmp/project',
    summary: 'Inspect repo',
    copiedToClipboard: true,
    results: [
      { index: 1, type: 'session_info', ok: true, output: { node: 'v20.0.0' } },
      { index: 2, type: 'read', ok: false, error: 'File not found: README.md' }
    ]
  });

  assert.match(output, /VibeChat Response/);
  assert.match(output, /cwd: \/tmp\/project/);
  assert.match(output, /summary: Inspect repo/);
  assert.match(output, /copiedToClipboard: true/);
  assert.match(output, /"type": "session_info"/);
  assert.match(output, /File not found: README.md/);
});
```

Create `test/clipboard.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyToClipboard } from '../src/clipboard.js';

test('reports clipboard success when adapter write succeeds', async () => {
  const result = await copyToClipboard('hello', { write: async () => undefined });
  assert.deepEqual(result, { ok: true });
});

test('reports clipboard failure without throwing', async () => {
  const result = await copyToClipboard('hello', {
    write: async () => {
      throw new Error('no clipboard');
    }
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /no clipboard/);
});
```

- [ ] **Step 2: Run formatter and clipboard tests to verify they fail**

Run:

```bash
npm test -- test/formatter.test.js test/clipboard.test.js
```

Expected: failure because `src/formatter.js` and `src/clipboard.js` do not exist.

- [ ] **Step 3: Implement formatter and clipboard modules**

Create `src/formatter.js`:

```js
export function formatResponse({ cwd, summary = '', copiedToClipboard = false, clipboardError = '', results = [] }) {
  const payload = {
    cwd,
    summary,
    copiedToClipboard,
    clipboardError,
    results
  };

  return [
    '```vibechat-response',
    '# VibeChat Response',
    `cwd: ${cwd}`,
    `summary: ${summary}`,
    `copiedToClipboard: ${copiedToClipboard}`,
    '',
    JSON.stringify(payload, null, 2),
    '```'
  ].join('\n');
}
```

Create `src/clipboard.js`:

```js
import clipboardy from 'clipboardy';

export async function copyToClipboard(text, adapter = clipboardy) {
  try {
    await adapter.write(text);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- test/formatter.test.js test/clipboard.test.js
```

Expected: all formatter and clipboard tests pass.

- [ ] **Step 5: Commit formatter and clipboard**

Run:

```bash
git add src/formatter.js src/clipboard.js test/formatter.test.js test/clipboard.test.js
git commit -m "feat: format VibeChat responses"
```

## Task 3: Path Utilities And Filesystem Operations

**Files:**
- Create: `src/path-utils.js`
- Create: `src/operations.js`
- Test: `test/operations.test.js`

- [ ] **Step 1: Write failing operation tests**

Create `test/operations.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runOperation } from '../src/operations.js';

async function tempRoot() {
  return mkdtemp(path.join(tmpdir(), 'vibechat-'));
}

test('writes, reads, appends, stats, moves, copies, and removes files', async () => {
  const cwd = await tempRoot();

  assert.equal((await runOperation({ type: 'mkdir', path: 'src' }, { cwd })).ok, true);
  assert.equal((await runOperation({ type: 'write', path: 'src/a.txt', content: 'alpha' }, { cwd })).ok, true);
  assert.equal((await runOperation({ type: 'append', path: 'src/a.txt', content: '\nbeta' }, { cwd })).ok, true);

  const read = await runOperation({ type: 'read', paths: ['src/a.txt'] }, { cwd });
  assert.equal(read.ok, true);
  assert.equal(read.output.files[0].content, 'alpha\nbeta');

  const stat = await runOperation({ type: 'stat', paths: ['src/a.txt'] }, { cwd });
  assert.equal(stat.output.entries[0].isFile, true);

  assert.equal((await runOperation({ type: 'copy', from: 'src/a.txt', to: 'src/b.txt' }, { cwd })).ok, true);
  assert.equal((await runOperation({ type: 'move', from: 'src/b.txt', to: 'src/c.txt' }, { cwd })).ok, true);
  assert.equal(await readFile(path.join(cwd, 'src/c.txt'), 'utf8'), 'alpha\nbeta');

  assert.equal((await runOperation({ type: 'rm', path: 'src/c.txt' }, { cwd })).ok, true);
});

test('lists, trees, and searches local files', async () => {
  const cwd = await tempRoot();
  await mkdir(path.join(cwd, 'docs'), { recursive: true });
  await writeFile(path.join(cwd, 'docs/readme.md'), 'hello vibe\nsecond line', 'utf8');

  const list = await runOperation({ type: 'list', path: '.' }, { cwd });
  assert.equal(list.ok, true);
  assert.equal(list.output.entries.some((entry) => entry.name === 'docs'), true);

  const tree = await runOperation({ type: 'tree', path: '.', depth: 2 }, { cwd });
  assert.match(tree.output.tree, /docs/);
  assert.match(tree.output.tree, /readme.md/);

  const search = await runOperation({ type: 'search', query: 'vibe', path: '.' }, { cwd });
  assert.equal(search.ok, true);
  assert.equal(search.output.matches[0].path, 'docs/readme.md');
});

test('blocks session path escapes', async () => {
  const cwd = await tempRoot();
  const result = await runOperation({ type: 'write', path: '../escape.txt', content: 'nope' }, { cwd });
  assert.equal(result.ok, false);
  assert.match(result.error, /outside the VibeChat session root/);
});
```

- [ ] **Step 2: Run operation tests to verify they fail**

Run:

```bash
npm test -- test/operations.test.js
```

Expected: failure because `src/operations.js` does not exist.

- [ ] **Step 3: Implement path utilities and operations**

Create `src/path-utils.js`:

```js
import path from 'node:path';

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
```

Create `src/operations.js` with operation handlers for `session_info`, `list`, `tree`, `read`, `stat`, `search`, `write`, `append`, `patch`, `mkdir`, `rm`, `move`, `copy`, `shell`, `clipboard`, `note`, and `finish`. Use Node filesystem APIs, `node:child_process` `exec`, and `diff.applyPatch`.

The implementation must return operation results shaped like:

```js
{ ok: true, output: { /* operation-specific data */ } }
```

or:

```js
{ ok: false, error: 'Readable failure message' }
```

Important operation details:

- `read` accepts `paths` and optional `maxBytes`, defaulting to 200000 bytes per file.
- `rm` refuses non-empty directories unless `recursive: true` is supplied.
- `shell` uses the session cwd, captures stdout, stderr, and exit code, and never throws for non-zero exit.
- `patch` accepts `patch` text and applies it to files under cwd.
- `search` skips `node_modules`, `.git`, `dist`, `build`, and binary-looking files.
- `tree` skips `node_modules`, `.git`, `dist`, and `build`.

- [ ] **Step 4: Run operation tests to verify they pass**

Run:

```bash
npm test -- test/operations.test.js
```

Expected: all operation tests pass.

- [ ] **Step 5: Commit filesystem operations**

Run:

```bash
git add src/path-utils.js src/operations.js test/operations.test.js
git commit -m "feat: add local VibeChat operations"
```

## Task 4: Ordered Executor

**Files:**
- Create: `src/executor.js`
- Test: `test/executor.test.js`

- [ ] **Step 1: Write failing executor tests**

Create `test/executor.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { executeRequest } from '../src/executor.js';

async function tempRoot() {
  return mkdtemp(path.join(tmpdir(), 'vibechat-exec-'));
}

test('executes operations in order and includes operation indexes', async () => {
  const cwd = await tempRoot();
  const response = await executeRequest({
    version: 1,
    summary: 'Write then read',
    operations: [
      { type: 'write', path: 'a.txt', content: 'hello' },
      { type: 'read', paths: ['a.txt'] }
    ]
  }, { cwd });

  assert.equal(response.summary, 'Write then read');
  assert.equal(response.results.length, 2);
  assert.equal(response.results[0].index, 1);
  assert.equal(response.results[1].output.files[0].content, 'hello');
});

test('stops on first error by default', async () => {
  const cwd = await tempRoot();
  const response = await executeRequest({
    version: 1,
    operations: [
      { type: 'read', paths: ['missing.txt'] },
      { type: 'write', path: 'later.txt', content: 'no' }
    ]
  }, { cwd });

  assert.equal(response.results.length, 1);
  assert.equal(response.results[0].ok, false);
});

test('continues after errors when continueOnError is true', async () => {
  const cwd = await tempRoot();
  const response = await executeRequest({
    version: 1,
    continueOnError: true,
    operations: [
      { type: 'read', paths: ['missing.txt'] },
      { type: 'write', path: 'later.txt', content: 'yes' }
    ]
  }, { cwd });

  assert.equal(response.results.length, 2);
  assert.equal(response.results[0].ok, false);
  assert.equal(response.results[1].ok, true);
});
```

- [ ] **Step 2: Run executor tests to verify they fail**

Run:

```bash
npm test -- test/executor.test.js
```

Expected: failure because `src/executor.js` does not exist.

- [ ] **Step 3: Implement ordered executor**

Create `src/executor.js`:

```js
import { runOperation } from './operations.js';

export async function executeRequest(request, { cwd = process.cwd() } = {}) {
  if (!request || typeof request !== 'object') {
    throw new Error('VibeChat request must be a JSON object.');
  }

  if (!Array.isArray(request.operations)) {
    throw new Error('VibeChat request must include an operations array.');
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
```

- [ ] **Step 4: Run executor tests to verify they pass**

Run:

```bash
npm test -- test/executor.test.js
```

Expected: all executor tests pass.

- [ ] **Step 5: Commit executor**

Run:

```bash
git add src/executor.js test/executor.test.js
git commit -m "feat: execute VibeChat requests in order"
```

## Task 5: Interactive CLI

**Files:**
- Modify: `src/cli.js`
- Modify: `bin/vibe.js`
- Test: `test/cli.test.js`

- [ ] **Step 1: Write failing CLI tests**

Create `test/cli.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequestText } from '../src/cli.js';

test('handles one request and copies formatted response', async () => {
  const writes = [];
  const output = await handleRequestText(
    '{"version":1,"operations":[{"type":"note","message":"hello"}]}',
    {
      cwd: '/tmp/project',
      clipboard: { write: async (text) => writes.push(text) }
    }
  );

  assert.match(output, /VibeChat Response/);
  assert.match(output, /hello/);
  assert.equal(writes.length, 1);
  assert.equal(writes[0], output);
});
```

- [ ] **Step 2: Run CLI tests to verify they fail**

Run:

```bash
npm test -- test/cli.test.js
```

Expected: failure because `handleRequestText` is not exported by `src/cli.js`.

- [ ] **Step 3: Implement CLI request handling and interactive loop**

Modify `src/cli.js`:

```js
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { parseRequestBlock } from './parser.js';
import { executeRequest } from './executor.js';
import { formatResponse } from './formatter.js';
import { copyToClipboard } from './clipboard.js';

export async function handleRequestText(text, { cwd = process.cwd(), clipboard } = {}) {
  const request = parseRequestBlock(text);
  const execution = await executeRequest(request, { cwd });
  let response = formatResponse({ ...execution, copiedToClipboard: false });
  const clipboardResult = await copyToClipboard(response, clipboard);
  response = formatResponse({
    ...execution,
    copiedToClipboard: clipboardResult.ok,
    clipboardError: clipboardResult.error || ''
  });

  if (clipboardResult.ok) {
    await copyToClipboard(response, clipboard);
  }

  return response;
}

export async function runCli({ cwd = process.cwd() } = {}) {
  console.log('VibeChat session started.');
  console.log(`cwd: ${cwd}`);
  console.log('Paste one VibeChat JSON request block. Type :exit to quit.');

  const rl = readline.createInterface({ input, output });
  let buffer = [];

  while (true) {
    const line = await rl.question(buffer.length === 0 ? 'vibe> ' : '... ');
    if (line.trim() === ':exit') {
      rl.close();
      return;
    }

    buffer.push(line);

    if (isCompleteBlock(buffer.join('\n'))) {
      const text = buffer.join('\n');
      buffer = [];
      try {
        const response = await handleRequestText(text, { cwd });
        console.log(response);
        console.log('Copied VibeChat response to clipboard.');
      } catch (error) {
        console.error(error?.message || String(error));
      }
    }
  }
}

function isCompleteBlock(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    return /```\s*$/.test(trimmed) && trimmed.split('```').length >= 3;
  }
  return trimmed.startsWith('{') && trimmed.endsWith('}');
}
```

- [ ] **Step 4: Run CLI tests to verify they pass**

Run:

```bash
npm test -- test/cli.test.js
```

Expected: all CLI tests pass.

- [ ] **Step 5: Commit CLI**

Run:

```bash
git add src/cli.js bin/vibe.js test/cli.test.js
git commit -m "feat: add interactive VibeChat CLI"
```

## Task 6: Chatbot Skill File And End-To-End Verification

**Files:**
- Create: `SKILLS.md`
- Modify: `package.json`
- Test: manual CLI verification

- [ ] **Step 1: Write `SKILLS.md`**

Create `SKILLS.md` with these sections:

```md
# VibeChat Skill

You are collaborating with a human who has a local terminal session running VibeChat.

VibeChat is the local execution surface. You are the planner, reviewer, and reasoning engine. Use your native web/search tools for internet research. Use VibeChat for every action that must happen on the human's local machine.

## Core Rule

All local machine actions must go through VibeChat. Do not ask the human to manually run shell commands, inspect files, edit files, or summarize terminal output when VibeChat can do it.

## How To Talk To VibeChat

When you need local work done, output exactly one copyable `json` block. The user will paste it into the VibeChat terminal session.

One request block can contain many operations. Put all related reads, writes, searches, shell commands, and verification steps in one block so the user can copy once.

After VibeChat runs the request, it automatically copies the response to the clipboard. The user will paste that response back into this chat. Read the response, decide the next step, and send the next VibeChat request block.

## Request Shape

```json
{
  "version": 1,
  "summary": "Short description of what this request does.",
  "continueOnError": false,
  "operations": [
    { "type": "session_info" }
  ]
}
```

## Operations

- `session_info`: Return cwd, OS, shell, Node version, VibeChat version, and available operation types.
- `list`: List files and folders. Fields: `path`, `depth`.
- `tree`: Return a compact file tree. Fields: `path`, `depth`.
- `read`: Read files. Fields: `paths`, `maxBytes`.
- `stat`: Return metadata. Fields: `paths`.
- `search`: Search local text. Fields: `path`, `query`, `regex`.
- `write`: Create or overwrite a file. Fields: `path`, `content`.
- `append`: Append to a file. Fields: `path`, `content`.
- `patch`: Apply a unified diff. Fields: `patch`.
- `mkdir`: Create a directory. Fields: `path`.
- `rm`: Remove a file or directory. Fields: `path`, `recursive`.
- `move`: Move or rename. Fields: `from`, `to`.
- `copy`: Copy a file. Fields: `from`, `to`.
- `shell`: Run a local command. Fields: `command`, `timeoutMs`.
- `clipboard`: Copy specific text to the human's clipboard. Fields: `text`.
- `note`: Add context to the VibeChat response without executing anything. Fields: `message`.
- `finish`: Mark the request complete. Fields: `message`.

## Good Behavior

Inspect before editing. Prefer `tree`, `read`, and `search` before `write`, `patch`, or `shell`.

Keep requests cohesive. If you need five files and one test command, include them in one request block.

Use `shell` for local verification such as `npm test`, `git status --short`, or project-specific checks.

Report your intent in `summary`, but do not include private chain-of-thought. Keep reasoning concise and operational.

## Example

```json
{
  "version": 1,
  "summary": "Inspect the project and read package metadata.",
  "operations": [
    { "type": "session_info" },
    { "type": "tree", "path": ".", "depth": 2 },
    { "type": "read", "paths": ["package.json", "README.md"], "maxBytes": 20000 }
  ]
}
```
```

- [ ] **Step 2: Run full automated tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Link the CLI locally**

Run:

```bash
npm link
```

Expected: npm links the package and makes `vibe` available on PATH.

- [ ] **Step 4: Verify the `vibe` command starts**

Run:

```bash
vibe
```

Expected: terminal prints `VibeChat session started.`, shows the cwd, and waits for input. Type `:exit` to quit.

- [ ] **Step 5: Verify one end-to-end request**

Run `vibe`, paste:

```json
{
  "version": 1,
  "summary": "Smoke test VibeChat.",
  "operations": [
    { "type": "session_info" },
    { "type": "note", "message": "hello from VibeChat" },
    { "type": "shell", "command": "node --version" }
  ]
}
```

Expected:

- The response includes `VibeChat Response`.
- The response includes the current cwd.
- The note result includes `hello from VibeChat`.
- The shell result has exit code `0`.
- VibeChat says it copied the response to the clipboard, or prints a readable clipboard fallback error.

- [ ] **Step 6: Commit skill and verification updates**

Run:

```bash
git add SKILLS.md package.json package-lock.json
git commit -m "docs: add VibeChat chatbot skill"
```

## Self-Review

Spec coverage:

- Node CLI and `vibe` bin are covered in Tasks 1 and 5.
- Fenced and unfenced JSON parsing is covered in Task 1.
- Ordered multi-operation execution is covered in Task 4.
- Local operation set is covered in Task 3.
- Clipboard paste-back behavior is covered in Tasks 2 and 5.
- Chatbot-facing `SKILLS.md` instructions are covered in Task 6.
- End-to-end verification is covered in Task 6.

Placeholder scan:

- No unfinished markers.
- No vague error-handling placeholders.
- Each task includes exact files, exact tests, commands, and expected results.

Type consistency:

- Parser exports `parseRequestBlock`.
- Formatter exports `formatResponse`.
- Clipboard exports `copyToClipboard`.
- Operations exports `runOperation`.
- Executor exports `executeRequest`.
- CLI exports `handleRequestText` and `runCli`.
