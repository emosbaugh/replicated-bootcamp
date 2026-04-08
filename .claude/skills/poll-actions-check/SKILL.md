---
name: poll-actions-check
description: Poll a PR's GitHub Actions check until it completes. Use when waiting for any CI check to finish on a pull request.
---

Use `~/.claude/scripts/poll-e2e.sh` to poll — never write an inline `for` loop, as Claude Code's parser cannot handle shell `for` constructs.

## Usage

```bash
~/.claude/scripts/poll-e2e.sh <pr-number> [check-name] [max-attempts] [interval-seconds]
```

**Defaults:** check-name=`"e2e / e2e"`, max-attempts=`30`, interval=`30` seconds.

## Examples

```bash
# Poll PR 42 for the default e2e check
~/.claude/scripts/poll-e2e.sh 42

# Poll a specific check
~/.claude/scripts/poll-e2e.sh 42 "build / build" 20 60

# Poll a release or lint check
~/.claude/scripts/poll-e2e.sh 42 "release / release" 40 30
```

Run this with the Bash tool. It will poll every N seconds and exit when the check reaches COMPLETED status (pass or fail).
