# CLAUDE.md

This file provides guidance to AI assistants (Claude and others) working in this repository.

## Project Overview

**Repository:** `matan-talichim/video-Claude-`
**Purpose:** Video processing/analysis project powered by Claude AI (Anthropic).

> This repository is in its initial state. Update this section as the project evolves.

---

## Repository Structure

```
video-Claude-/
├── CLAUDE.md          # This file — AI assistant guidance
└── (project files TBD)
```

As files are added, update this tree to reflect the actual structure.

---

## Development Workflow

### Branching

- Feature branches follow the pattern: `claude/<feature-name>-<session-id>`
- Never push directly to `main` or `master` without explicit permission
- Always develop on the designated feature branch for your session

### Git Conventions

```bash
# Push with upstream tracking
git push -u origin <branch-name>

# If push fails due to network errors, retry with exponential backoff:
# wait 2s → retry, wait 4s → retry, wait 8s → retry, wait 16s → retry
```

Commit message format:
- Use clear, descriptive commit messages in imperative mood
- Example: `Add video transcription pipeline` not `Added transcription`

### Common Commands

```bash
# Check current branch
git branch --show-current

# Stage and commit
git add <specific-files>
git commit -m "Descriptive message"

# Push to remote
git push -u origin $(git branch --show-current)
```

---

## AI Assistant Guidelines

### When Working in This Repo

1. **Read before editing** — Always read a file before modifying it
2. **Minimal changes** — Only make changes directly requested or clearly necessary
3. **No speculative improvements** — Don't add comments, docstrings, error handling, or refactors beyond the task scope
4. **No new files unless required** — Prefer editing existing files
5. **Security first** — Avoid introducing command injection, XSS, SQL injection, or other OWASP top-10 vulnerabilities

### Code Style

- Follow existing conventions in the codebase (indentation, naming, etc.)
- Keep solutions simple — minimum complexity for the current task
- Three similar lines of code is better than a premature abstraction

### Risky Actions — Always Confirm First

Before taking any of the following actions, explicitly confirm with the user:

- Deleting files or branches
- Force pushing (`--force`)
- Hard resets (`git reset --hard`)
- Modifying CI/CD pipelines
- Pushing to remote repositories
- Creating/closing/commenting on PRs or issues

---

## Claude API Integration

If this project uses the Anthropic Claude API:

- Model IDs (as of 2026): `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`
- Default to the latest/most capable model unless performance or cost constraints apply
- SDK: `@anthropic-ai/sdk` (Node.js) or `anthropic` (Python)

---

## Environment Notes

- Platform: Linux
- Shell: bash/zsh
- Working directory: `/home/user/video-Claude-`

---

## Updating This File

Keep this file current as the project evolves:

- Update the **Repository Structure** section when new directories/files are added
- Add **setup instructions** once a build system or package manager is established
- Document **testing commands** when a test suite is introduced
- Add **environment variable** requirements when configuration is needed
