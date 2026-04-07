---
name: friction-log
description: Appends a structured entry to FRICTION_LOG.md at the repo root. Use proactively — without being asked — whenever confusion, unexpected behavior, a blocker, or frustration is encountered during FirstResponse bootcamp implementation. Captures what was tried, what was expected, what actually happened, how it was resolved, and severity for the end-of-bootcamp friction report.
---

# Friction Log

The friction log captures every pain point during FirstResponse bootcamp implementation. It is shared at the end of the bootcamp as structured feedback on the Replicated developer experience.

**File:** `FRICTION_LOG.md` at the repo root

## When to invoke

Invoke **proactively and immediately** — without waiting for the user to ask — whenever any of these occur:

- Confused about how something works
- Unexpected behavior from a tool, API, or platform
- Stuck for more than ~10 minutes on something
- Documentation was missing, wrong, or hard to find
- A blocker requiring significant debugging or outside help
- Surprised that something didn't work the way it reasonably should have

## Entry format

```markdown
## Entry [N] — [YYYY-MM-DD] — [severity]

**Trying to:** [what was being attempted]
**Expected:** [what was expected to happen]
**Actual:** [what actually happened]
**Resolution:** [how it was resolved and roughly how long it took]
**Severity:** annoyance | blocker | i-would-have-churned
```

**Severity — use exactly these three, no others:**
- `annoyance` — slowed down but self-resolved quickly
- `blocker` — could not proceed without significant debugging or outside help
- `i-would-have-churned` — a real customer would have given up at this point

## Writing the entry

1. Count existing `## Entry` headings in `FRICTION_LOG.md` to determine the next number
2. Write the entry immediately with what's available; mark genuinely unknown fields as `[unknown]`
3. Use only the 5 fields above — do not add extra fields
4. Ask only for fields that cannot be reasonably inferred from context

## First entry: create the file

If `FRICTION_LOG.md` does not exist, create it with this header before the first entry:

```markdown
# Friction Log

A running log of every friction point encountered during the Replicated Bootcamp.
Shared at the end of the exercise as structured developer experience feedback.

---
```
