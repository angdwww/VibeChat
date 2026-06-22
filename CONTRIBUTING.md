# Contributing to VibeChat

Thanks for helping improve VibeChat. Contributions from people and automated coding or review tools are welcome when they keep the local, human-in-the-loop workflow clear and safe.

## Before You Start

1. Read [README.md](./README.md) for the product workflow.
2. Read [SKILLS.md](./SKILLS.md) if your change affects the chatbot request contract.
3. Search existing issues and discussions before opening a duplicate.
4. Use GitHub Discussions for ideas, questions, and feature requests before building a large change.

## Feature Requests and Discussions

Use the **Feature requests** discussion to describe the problem, who it helps, and the smallest useful behavior. Concrete examples and terminal transcripts with sensitive details removed are especially helpful.

## Code Contributions

- Keep changes focused on one behavior or fix.
- Create your work from `dev` and open pull requests back into `dev`.
- Do not push directly to `main` or `dev`; both branches are maintainer-managed integration branches.
- Preserve the human copy-paste handoff between the chatbot and VibeChat.
- Keep local file actions inside the active workspace and respect trust modes.
- Update `SKILLS.md` whenever the chatbot-facing request format or workflow changes.
- Add or update focused tests for behavior changes.
- Run `npm test` before opening a pull request.

## Automated Contributions and Reviews

Bots and AI-assisted contributors may open issues, discussions, pull requests, or reviews. Please make the automated assistance clear in the submission and keep the change understandable without requiring a proprietary tool to review it.

Automated reviewers should focus on reproducible bugs, safety concerns, regressions, missing tests, and documentation drift. A review should point to the relevant file and explain the practical impact.

## Privacy and Safety

Do not submit personal information, credentials, API keys, private filesystem paths, production data, or copied session history. Redact screenshots and terminal output before sharing them.

Do not add code that bypasses VibeChat's workspace protections or trust modes. Shell operations are intentionally powerful and should stay visible, explicit, and testable.

## Pull Requests

Describe what changed, why it changed, and how you tested it. Keep commits and pull requests small enough to review. Maintainers may ask for a discussion first when a proposal changes the core request protocol, safety model, or terminal interaction model.

Pull requests should target `dev`. Maintainers promote tested changes from `dev` to `main`.
