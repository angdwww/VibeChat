# VibeChat Design

Date: 2026-06-19

## Purpose

VibeChat is a terminal tool for copy-paste collaboration between a chatbot and a local machine. The user runs `vibe` in any folder to start a VibeChat session. The chatbot sends one complete request block at a time. VibeChat executes that request locally, formats the result, and copies the full output to the clipboard so the user can paste it back into the chatbot.

The chatbot remains the planner and reasoning engine. VibeChat is the local execution surface for filesystem inspection, file edits, shell commands, verification commands, and paste-back reporting.

## Scope

VibeChat will be a Node.js CLI with a package `bin` entry for the `vibe` command. It will be installable from the repo with `npm link` during local development.

The initial version will include a chatbot-facing `SKILLS.md` file that explains the workflow and command protocol. The skill will tell chatbots to use their own native web/search tools for internet research, and to use VibeChat for all local machine actions.

## Session Flow

1. The user opens a terminal in any project folder.
2. The user runs `vibe`.
3. VibeChat starts an interactive session rooted at the current working directory.
4. The user pastes a single request block from a chatbot.
5. VibeChat parses and executes the operations in order.
6. VibeChat prints one clean response block.
7. VibeChat copies that response block to the clipboard.
8. The user pastes the result back into the chatbot.
9. The chatbot decides the next request.

## Request Format

The request format will be one fenced block containing JSON. A request can include multiple operations, which run in order.

Example:

```json
{
  "version": 1,
  "summary": "Inspect the repo and read package files.",
  "operations": [
    { "type": "session_info" },
    { "type": "tree", "path": ".", "depth": 2 },
    { "type": "read", "paths": ["package.json", "README.md"] }
  ]
}
```

The CLI should accept pasted blocks with or without surrounding Markdown fences so common chatbot output works without extra editing.

## Operation Set

- `session_info`: Return cwd, OS, shell, Node version, VibeChat version, and available operation types.
- `list`: List files and folders in a directory with optional depth and ignore patterns.
- `tree`: Return a compact file tree for repo orientation.
- `read`: Read one or more files with size limits and clear errors for missing or oversized files.
- `stat`: Return metadata for files or folders.
- `search`: Search local file contents with a query or regular expression.
- `write`: Create or overwrite a file.
- `append`: Append text to a file.
- `patch`: Apply unified diff patches.
- `mkdir`: Create directories.
- `rm`: Remove files or folders with guardrails.
- `move`: Rename or move files and folders.
- `copy`: Copy files.
- `shell`: Run local shell commands and capture exit code, stdout, and stderr.
- `clipboard`: Copy specific text to the clipboard.
- `note`: Record chatbot context in the output without executing anything.
- `finish`: Mark a request as complete and include a final paste-back message.

## Guardrails

VibeChat is intentionally powerful because it runs local commands and edits files. The initial guardrails are:

- Run all path-based operations relative to the session root unless an operation explicitly allows absolute paths.
- Include the session cwd in every response.
- Report every file changed, command executed, and error encountered.
- Limit file read output to a configurable maximum.
- Require explicit recursive removal for non-empty directories.
- Preserve operation order and continue or stop according to a per-request `continueOnError` flag.
- Never hide shell command failures; include exit code, stdout, and stderr.

## Clipboard Behavior

After each request, VibeChat will copy the full response block to the clipboard automatically. It will use a Node clipboard dependency when available and provide a clear fallback message if clipboard access fails.

The response block should be easy to paste directly into ChatGPT, Claude, or another chatbot. It should include enough structure for the chatbot to decide the next step without requiring the user to summarize terminal output.

## Files And Components

- `package.json`: Node package metadata, scripts, and `bin` mapping for `vibe`.
- `src/cli.js`: Interactive terminal session and pasted-block handling.
- `src/parser.js`: Request-block extraction and JSON parsing.
- `src/executor.js`: Operation dispatch and ordered execution.
- `src/operations.js`: Local filesystem and shell operation implementations.
- `src/formatter.js`: Paste-back response formatting.
- `src/clipboard.js`: Clipboard integration and fallback behavior.
- `SKILLS.md`: Chatbot-facing skill instructions and protocol reference.
- `test/`: Focused tests for parser, operations, formatter, and CLI behavior.

## Testing

Tests should cover the main contract rather than implementation details:

- Parses fenced and unfenced request JSON.
- Executes multiple operations in order.
- Reads, writes, appends, patches, searches, moves, copies, and removes local files.
- Captures shell command output and exit codes.
- Formats paste-back output with cwd, operation results, and errors.
- Handles clipboard success and failure paths.

The implementation should follow test-driven development: write failing tests for each behavior, verify they fail for the expected reason, then implement the minimal code needed to pass.
