# Security Policy

VibeChat executes local developer operations from chatbot-generated request blocks, so treat it like a powerful local tool rather than a sandbox.

## Reporting security issues

If you find a vulnerability, please report it privately to the maintainer before opening a public issue or discussion thread.

## Safety notes

- Review request summaries and operations before pressing Enter.
- Use `read-only` or `edit` trust mode when you do not want local shell access available.
- Do not commit local session history, screenshots with private data, `.env` files, or machine-specific secrets.
- Be especially careful with `shell`, `rm`, and file-writing operations in shared repositories.
