# AI Commentary Feature Gate — Design Spec

**Date:** 2026-04-08
**App:** playball.exe

## Overview

Add an AI-powered play-by-play commentary feature gated behind a Replicated license entitlement. When the entitlement is disabled, the KOTS config items for the feature are hidden and the feature is unavailable in-app. When enabled, the operator configures their LLM provider and API key, and players see AI-generated commentary in the AtBatScreen after each plate appearance.

## License Field

| Field | Value |
|---|---|
| Name | `ai_commentary_enabled` |
| Type | Boolean |
| Default | false |

Defined in the Replicated Vendor Portal. Controls visibility of all AI commentary config items and disables the feature in the app.

## KOTS Config

New config group: **AI Commentary**

All items in this group use:
```
when: '{{repl LicenseFieldValue "ai_commentary_enabled"}}'
```

| Item | Type | Details |
|---|---|---|
| `ai_provider` | select_one (dropdown) | Options: `openai`, `anthropic`. Default: `openai` |
| `openai_api_key` | password | Shown only when `ai_provider == "openai"` |
| `anthropic_api_key` | password | Shown only when `ai_provider == "anthropic"` |

## Helm / Environment Variables

The Helm chart passes config values to the app container as env vars:

| Env Var | Source |
|---|---|
| `AI_PROVIDER` | `{{repl ConfigOption "ai_provider"}}` |
| `OPENAI_API_KEY` | `{{repl ConfigOption "openai_api_key"}}` |
| `ANTHROPIC_API_KEY` | `{{repl ConfigOption "anthropic_api_key"}}` |

## API Route

**`GET /api/commentary`**

Query params: `result` (e.g. "home_run"), `batter` (player name), `pitcher` (CPU pitcher name)

Behavior:
- If `AI_PROVIDER` env var is unset or empty → return `{ commentary: null }` (feature off)
- If `AI_PROVIDER == "openai"` → call OpenAI chat completions (GPT-4o), 2-sentence play-by-play prompt
- If `AI_PROVIDER == "anthropic"` → call Anthropic messages API (claude-haiku-4-5), same prompt
- On any LLM error (bad key, quota, network) → return `{ commentary: null }` (graceful degradation)
- Returns: `{ commentary: string | null }`

The route never returns a non-200 status for LLM failures — errors are swallowed and the UI falls back gracefully.

## AtBatScreen Integration

No prop changes. Commentary fetch is self-contained inside the component.

Flow after pitch animation completes:
1. Fire `GET /api/commentary` with result details
2. Show blinking `GENERATING COMMENTARY...` line while fetching
3. On response:
   - If `commentary` is non-null: display it in a styled box below the result
   - If `commentary` is null: skip commentary step, call `onDone` immediately (existing behavior)

## Demo Flow

1. **Entitlement off (default):** Vendor Portal shows `ai_commentary_enabled = false`. KOTS Admin Console config screen has no AI Commentary group. Playing an at-bat shows plain result text only.
2. **Enable entitlement:** Set `ai_commentary_enabled = true` in Vendor Portal, update customer license. KOTS config now shows the AI Commentary group.
3. **Configure:** Operator selects provider (e.g. OpenAI), enters API key. Deploys config.
4. **Feature active:** Play an at-bat — AtBatScreen now shows AI-generated commentary after the animation.

## Out of Scope

- Streaming LLM responses (returns full text when complete)
- Persisting commentary to the database
- User-facing toggle to disable commentary per-session
