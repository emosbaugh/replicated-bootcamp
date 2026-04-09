# AI Commentary Feature Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate AI-generated baseball play-by-play commentary behind a `ai_commentary_enabled` Replicated license field, with KOTS config items for provider and API keys that are hidden when the entitlement is off.

**Architecture:** A new `src/lib/commentary.ts` module reads `AI_PROVIDER` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` env vars and calls the appropriate LLM SDK. A thin `GET /api/commentary` route wraps it. `AtBatScreen` fetches commentary after each at-bat animation completes and displays it before showing the CONTINUE button. Helm chart passes config values as env vars via the existing secret.

**Tech Stack:** openai npm package (GPT-4o), @anthropic-ai/sdk npm package (claude-haiku-4-5-20251001), Next.js route handlers, KOTS config `when` + `LicenseFieldValue` template functions, Helm chart.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/lib/commentary.ts` | Create | `generateCommentary(outcome, batterName)` — calls OpenAI or Anthropic |
| `src/lib/commentary.test.ts` | Create | Unit tests for `generateCommentary` |
| `src/app/api/commentary/route.ts` | Create | Thin GET handler — auth check + delegates to `generateCommentary` |
| `src/app/api/license/fields/[field]/route.ts` | Modify | Add `ai_commentary_enabled` to ALLOWED_FIELDS |
| `src/components/AtBatScreen.tsx` | Modify | Fetch commentary after 'done' phase; show it before CONTINUE button |
| `deploy/manifests/kots-config.yaml` | Modify | Add "AI Commentary" group gated by `LicenseFieldValue` |
| `deploy/manifests/helmchart.yaml` | Modify | Pass ai commentary config options as helm values |
| `deploy/charts/values.yaml` | Modify | Add `aiCommentary` section with empty defaults |
| `deploy/charts/values.schema.json` | Modify | Add `aiCommentary` property so helm lint passes |
| `deploy/charts/templates/secret.yaml` | Modify | Inject `AI_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` as env vars |

---

## Task 0: Create `ai_commentary_enabled` license field in Vendor Portal (manual)

This is a one-time manual step in the Replicated Vendor Portal UI — no code is needed.

- [ ] **Step 1: Add the license field**

In the Vendor Portal → your app → License Fields, create a new field:

| Setting | Value |
|---|---|
| Name (key) | `ai_commentary_enabled` |
| Title | AI Commentary |
| Type | Boolean |
| Default | false |

- [ ] **Step 2: Update the customer license**

On the customer's license page, set `ai_commentary_enabled = false` (leave at default). You will flip it to `true` during the demo.

---

## Task 1: Install LLM npm packages

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install openai and @anthropic-ai/sdk**

```bash
npm install openai @anthropic-ai/sdk
```

Expected: both packages appear in `package.json` dependencies and `package-lock.json` is updated.

- [ ] **Step 2: Run tests to confirm nothing broke**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add openai and @anthropic-ai/sdk dependencies"
```

---

## Task 2: Allow `ai_commentary_enabled` in the license fields route

**Files:**
- Modify: `src/app/api/license/fields/[field]/route.ts` (line 6)

- [ ] **Step 1: Add the field to ALLOWED_FIELDS**

In `src/app/api/license/fields/[field]/route.ts`, change line 6 from:

```typescript
const ALLOWED_FIELDS = ['advanced_stats_enabled'] as const
```

to:

```typescript
const ALLOWED_FIELDS = ['advanced_stats_enabled', 'ai_commentary_enabled'] as const
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all existing tests pass (no tests cover this route directly — the change is safe).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/license/fields/[field]/route.ts
git commit -m "feat: allow ai_commentary_enabled license field in API route"
```

---

## Task 3: Write failing tests for `generateCommentary`

**Files:**
- Create: `src/lib/commentary.test.ts`

- [ ] **Step 1: Create the test file**

Create `src/lib/commentary.test.ts` with the following content:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockOpenAICreate, mockAnthropicCreate } = vi.hoisted(() => ({
  mockOpenAICreate: vi.fn(),
  mockAnthropicCreate: vi.fn(),
}))

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockOpenAICreate } },
  })),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicCreate },
  })),
}))

import { generateCommentary } from './commentary'

beforeEach(() => {
  mockOpenAICreate.mockReset()
  mockAnthropicCreate.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('generateCommentary', () => {
  it('returns null when AI_PROVIDER is not set', async () => {
    vi.stubEnv('AI_PROVIDER', '')
    const result = await generateCommentary('HOME RUN', 'J. Smith')
    expect(result).toBeNull()
  })

  it('returns null for an unknown provider', async () => {
    vi.stubEnv('AI_PROVIDER', 'gemini')
    const result = await generateCommentary('HOME RUN', 'J. Smith')
    expect(result).toBeNull()
  })

  it('returns null when provider is openai but OPENAI_API_KEY is not set', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai')
    vi.stubEnv('OPENAI_API_KEY', '')
    const result = await generateCommentary('HOME RUN', 'J. Smith')
    expect(result).toBeNull()
    expect(mockOpenAICreate).not.toHaveBeenCalled()
  })

  it('returns null when provider is anthropic but ANTHROPIC_API_KEY is not set', async () => {
    vi.stubEnv('AI_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const result = await generateCommentary('STRIKEOUT', 'M. Jones')
    expect(result).toBeNull()
    expect(mockAnthropicCreate).not.toHaveBeenCalled()
  })

  it('calls OpenAI and returns trimmed commentary when provider is openai', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai')
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: '  What a blast by J. Smith!  ' } }],
    })

    const result = await generateCommentary('HOME RUN', 'J. Smith')

    expect(result).toBe('What a blast by J. Smith!')
    expect(mockOpenAICreate).toHaveBeenCalledOnce()
    expect(mockOpenAICreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o',
        max_tokens: 100,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user' }),
        ]),
      })
    )
  })

  it('calls Anthropic and returns trimmed commentary when provider is anthropic', async () => {
    vi.stubEnv('AI_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test')
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '  Amazing catch by M. Jones!  ' }],
    })

    const result = await generateCommentary('FLYOUT', 'M. Jones')

    expect(result).toBe('Amazing catch by M. Jones!')
    expect(mockAnthropicCreate).toHaveBeenCalledOnce()
    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user' }),
        ]),
      })
    )
  })

  it('returns null when Anthropic response has no text block', async () => {
    vi.stubEnv('AI_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test')
    mockAnthropicCreate.mockResolvedValue({ content: [] })

    const result = await generateCommentary('WALK', 'B. Williams')
    expect(result).toBeNull()
  })

  it('returns null when OpenAI throws (graceful degradation)', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai')
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    mockOpenAICreate.mockRejectedValue(new Error('quota exceeded'))

    const result = await generateCommentary('DOUBLE', 'K. Brown')
    expect(result).toBeNull()
  })

  it('returns null when Anthropic throws (graceful degradation)', async () => {
    vi.stubEnv('AI_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test')
    mockAnthropicCreate.mockRejectedValue(new Error('API error'))

    const result = await generateCommentary('TRIPLE', 'R. Davis')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- src/lib/commentary.test.ts
```

Expected: FAIL — `Cannot find module './commentary'`

---

## Task 4: Implement `generateCommentary`

**Files:**
- Create: `src/lib/commentary.ts`

- [ ] **Step 1: Create the implementation**

Create `src/lib/commentary.ts`:

```typescript
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

export async function generateCommentary(outcome: string, batterName: string): Promise<string | null> {
  const provider = process.env.AI_PROVIDER
  if (!provider) return null

  const prompt = `You are an enthusiastic baseball radio announcer. Generate exactly 2 sentences of exciting play-by-play commentary for this at-bat result: ${batterName} had a ${outcome}. Be vivid and energetic. Output only the 2 sentences, nothing else.`

  try {
    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) return null
      const client = new OpenAI({ apiKey })
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      })
      return response.choices[0]?.message?.content?.trim() ?? null
    }

    if (provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) return null
      const client = new Anthropic({ apiKey })
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      })
      const block = response.content[0]
      return block?.type === 'text' ? block.text.trim() : null
    }

    return null
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Run tests to confirm they pass**

```bash
npm test -- src/lib/commentary.test.ts
```

Expected: all 9 tests PASS.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/commentary.ts src/lib/commentary.test.ts
git commit -m "feat: add generateCommentary lib with OpenAI and Anthropic support"
```

---

## Task 5: Create `/api/commentary` route

**Files:**
- Create: `src/app/api/commentary/route.ts`

- [ ] **Step 1: Create the route handler**

Create `src/app/api/commentary/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateCommentary } from '@/lib/commentary'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const outcome = searchParams.get('outcome') ?? ''
  const batterName = searchParams.get('batter') ?? ''

  const commentary = await generateCommentary(outcome, batterName)
  return NextResponse.json({ commentary })
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/commentary/route.ts
git commit -m "feat: add GET /api/commentary route"
```

---

## Task 6: Add AI Commentary group to KOTS config

**Files:**
- Modify: `deploy/manifests/kots-config.yaml`

The `when` on the group hides all items when the license field is false. The per-key items have additional `when` clauses to show only the relevant key based on the selected provider.

- [ ] **Step 1: Append the AI Commentary group**

In `deploy/manifests/kots-config.yaml`, add the following after the `secrets` group (after line 42):

```yaml
    - name: ai_commentary
      title: AI Commentary
      when: '{{repl LicenseFieldValue "ai_commentary_enabled"}}'
      items:
        - name: ai_provider
          title: AI Provider
          type: select_one
          default: openai
          items:
            - name: openai
              title: OpenAI (GPT-4o)
            - name: anthropic
              title: Anthropic (Claude Haiku)

        - name: openai_api_key
          title: OpenAI API Key
          type: password
          when: '{{repl ConfigOptionEquals "ai_provider" "openai"}}'

        - name: anthropic_api_key
          title: Anthropic API Key
          type: password
          when: '{{repl ConfigOptionEquals "ai_provider" "anthropic"}}'
```

- [ ] **Step 2: Commit**

```bash
git add deploy/manifests/kots-config.yaml
git commit -m "feat: add AI Commentary config group gated by license field"
```

---

## Task 7: Update Helm chart to wire config values to env vars

**Files:**
- Modify: `deploy/charts/values.yaml`
- Modify: `deploy/charts/values.schema.json`
- Modify: `deploy/charts/templates/secret.yaml`
- Modify: `deploy/manifests/helmchart.yaml`

- [ ] **Step 1: Add `aiCommentary` to values.yaml**

In `deploy/charts/values.yaml`, add the following at the end of the file:

```yaml

# AI Commentary — set by KOTS config when ai_commentary_enabled license field is true
aiCommentary:
  provider: ""
  openaiApiKey: ""
  anthropicApiKey: ""
```

- [ ] **Step 2: Add `aiCommentary` to values.schema.json**

In `deploy/charts/values.schema.json`, add the following inside the top-level `"properties"` object, after the `"imagePullSecrets"` entry (before the closing `}` of properties, around line 257):

```json
    "aiCommentary": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "provider": { "type": "string" },
        "openaiApiKey": { "type": "string" },
        "anthropicApiKey": { "type": "string" }
      }
    }
```

- [ ] **Step 3: Add env vars to secret.yaml**

In `deploy/charts/templates/secret.yaml`, add three lines after the `SUPPORT_BUNDLE_SECRET_NAME` line (before `{{- end }}`):

```yaml
  AI_PROVIDER: {{ .Values.aiCommentary.provider | quote }}
  OPENAI_API_KEY: {{ .Values.aiCommentary.openaiApiKey | quote }}
  ANTHROPIC_API_KEY: {{ .Values.aiCommentary.anthropicApiKey | quote }}
```

- [ ] **Step 4: Wire KOTS config options to Helm values in helmchart.yaml**

In `deploy/manifests/helmchart.yaml`, add the following inside the `values:` section (after the `nextauth:` block):

```yaml
    aiCommentary:
      provider: 'repl{{ ConfigOption "ai_provider" }}'
      openaiApiKey: 'repl{{ ConfigOption "openai_api_key" }}'
      anthropicApiKey: 'repl{{ ConfigOption "anthropic_api_key" }}'
```

- [ ] **Step 5: Run helm lint to confirm the chart is valid**

```bash
helm lint deploy/charts --set nextauth.secret=test
```

Expected: `0 chart(s) failed`

- [ ] **Step 6: Run docker build**

```bash
docker build -f deploy/Dockerfile .
```

Expected: successful build.

- [ ] **Step 7: Commit**

```bash
git add deploy/charts/values.yaml deploy/charts/values.schema.json deploy/charts/templates/secret.yaml deploy/manifests/helmchart.yaml
git commit -m "feat: wire AI commentary config options through Helm chart to env vars"
```

---

## Task 8: Update AtBatScreen to fetch and display commentary

**Files:**
- Modify: `src/components/AtBatScreen.tsx`

The component already has `phase: 'rolling' | 'landed' | 'done'`. When phase becomes `'done'`, it now fetches commentary. A new `commentary` state (`string | null | 'loading'`) controls what's displayed. The CONTINUE button appears only when `commentary !== 'loading'`.

- [ ] **Step 1: Add commentary state and fetch effect**

In `src/components/AtBatScreen.tsx`:

1. After the existing `const [showPopup, setShowPopup] = useState(false)` line (line 36), add:
```typescript
  const [commentary, setCommentary] = useState<string | null | 'loading'>(null)
```

2. After the existing `useEffect` for `phase === 'landed'` (which ends around line 63), add a new effect:
```typescript
  useEffect(() => {
    if (phase !== 'done' || !lastRoll) return
    const outcome = OUTCOME_TABLE[lastRoll.adjusted] ?? ''
    setCommentary('loading')
    fetch(`/api/commentary?outcome=${encodeURIComponent(outcome)}&batter=${encodeURIComponent(batter.name)}`)
      .then((r) => r.json())
      .then((data: { commentary?: string | null }) => setCommentary(data.commentary ?? null))
      .catch(() => setCommentary(null))
  }, [phase, lastRoll, batter.name])
```

- [ ] **Step 2: Update the render output**

Find the section that currently renders the CONTINUE button (around line 162):
```typescript
      {phase === 'done' && (
        <button
          onClick={onDone}
          className="font-mono text-black bg-green-400 hover:bg-green-300 px-8 py-3 text-sm tracking-widest mt-6"
        >
          CONTINUE
        </button>
      )}
```

Replace it with:
```typescript
      {phase === 'done' && commentary === 'loading' && (
        <pre
          style={{ fontFamily: "'Courier New', Courier, monospace" }}
          className="text-yellow-400 text-xs mt-6 animate-pulse"
        >
          GENERATING COMMENTARY...
        </pre>
      )}

      {phase === 'done' && commentary !== null && commentary !== 'loading' && (
        <pre
          style={{ fontFamily: "'Courier New', Courier, monospace" }}
          className="text-cyan-300 text-xs mt-4 max-w-sm text-center whitespace-pre-wrap"
        >
          {commentary}
        </pre>
      )}

      {phase === 'done' && commentary !== 'loading' && (
        <button
          onClick={onDone}
          className="font-mono text-black bg-green-400 hover:bg-green-300 px-8 py-3 text-sm tracking-widest mt-4"
        >
          CONTINUE
        </button>
      )}
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/AtBatScreen.tsx
git commit -m "feat: display AI commentary in AtBatScreen after each plate appearance"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests pass, no failures.

- [ ] **Step 2: Run helm lint**

```bash
helm lint deploy/charts --set nextauth.secret=test
```

Expected: `0 chart(s) failed`

- [ ] **Step 3: Run docker build**

```bash
docker build -f deploy/Dockerfile .
```

Expected: successful build, no errors.

---

## Demo Steps (after deployment)

1. **Confirm entitlement is off:** In Vendor Portal, verify `ai_commentary_enabled = false`. In KOTS Admin Console → Config, confirm no "AI Commentary" group is visible.
2. **Play an at-bat:** The AtBatScreen shows results normally — no commentary, CONTINUE appears immediately.
3. **Enable entitlement:** In Vendor Portal, set `ai_commentary_enabled = true` and update the customer's license. In KOTS, sync the license.
4. **Configure:** In KOTS Admin Console → Config, the "AI Commentary" group is now visible. Select provider, enter API key, deploy.
5. **Play an at-bat:** After the dice animation, "GENERATING COMMENTARY..." appears briefly, then 2 sentences of AI play-by-play appear in cyan, followed by the CONTINUE button.
