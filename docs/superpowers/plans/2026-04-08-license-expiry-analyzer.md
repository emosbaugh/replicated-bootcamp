# License Expiry Warning: Periodic Log + Support Bundle Analyzer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log a structured warning when the license expires within 7 days, and surface it as a `textAnalyze` analyzer in the support bundle.

**Architecture:** A new `logLicenseExpiryWarning()` function in `license.ts` fetches the SDK license info and logs `[license] warning: expires in N days (YYYY-MM-DD)` if expiry is 1–7 days away. `src/instrumentation.ts` (Next.js startup hook) calls this once at boot and every hour. The support bundle spec gains a `textAnalyze` analyzer that searches app logs for that pattern and returns an actionable message.

**Tech Stack:** Next.js 16 instrumentation hook, vitest, troubleshoot.sh `textAnalyze` analyzer, Helm

---

### Task 1: Add `logLicenseExpiryWarning()` to `license.ts` (TDD)

**Files:**
- Modify: `src/lib/license.ts`
- Modify: `src/lib/license.test.ts`

- [ ] **Step 1: Add failing tests to `src/lib/license.test.ts`**

Add this import at the top of the file (alongside the existing imports):

```typescript
import { checkLicense, _resetCacheForTesting, getLicenseField, logLicenseExpiryWarning } from './license'
```

Then append this `describe` block at the bottom of `src/lib/license.test.ts`:

```typescript
describe('logLicenseExpiryWarning', () => {
  it('logs a warning when license expires in 3 days', async () => {
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entitlements: { expires_at: { value: expiresAt } } }),
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logLicenseExpiryWarning()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[license\] warning: expires in 3 days \(\d{4}-\d{2}-\d{2}\)/)
    )
  })

  it('logs a warning when license expires in exactly 7 days', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entitlements: { expires_at: { value: expiresAt } } }),
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logLicenseExpiryWarning()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[license\] warning: expires in 7 days/)
    )
  })

  it('does not log when license expires in 8 days', async () => {
    const expiresAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entitlements: { expires_at: { value: expiresAt } } }),
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logLicenseExpiryWarning()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not log when expires_at is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entitlements: { expires_at: { value: '' } } }),
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logLicenseExpiryWarning()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not log when SDK returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logLicenseExpiryWarning()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not log when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logLicenseExpiryWarning()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not log when REPLICATED_SDK_URL is not set', async () => {
    vi.unstubAllEnvs()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logLicenseExpiryWarning()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "logLicenseExpiryWarning|FAIL|PASS|✓|×"
```

Expected: all `logLicenseExpiryWarning` tests fail with `logLicenseExpiryWarning is not a function` or similar.

- [ ] **Step 3: Implement `logLicenseExpiryWarning()` in `src/lib/license.ts`**

Append this function at the end of `src/lib/license.ts` (after `getLicenseField`):

```typescript
export async function logLicenseExpiryWarning(): Promise<void> {
  const sdkUrl = process.env.REPLICATED_SDK_URL
  if (!sdkUrl) return

  try {
    const res = await fetch(`${sdkUrl}/api/v1/license/info`)
    if (!res.ok) return

    const data = await res.json() as { entitlements?: { expires_at?: { value?: string } } }
    const expiresAt: string = data?.entitlements?.expires_at?.value ?? ''
    if (!expiresAt) return

    const expiryDate = new Date(expiresAt)
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysUntilExpiry > 0 && daysUntilExpiry <= 7) {
      const formatted = expiryDate.toISOString().split('T')[0]
      console.warn(`[license] warning: expires in ${daysUntilExpiry} days (${formatted})`)
    }
  } catch {
    // no-op: don't disrupt startup on SDK connectivity issues
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test
```

Expected: all tests pass, including the new `logLicenseExpiryWarning` suite.

- [ ] **Step 5: Commit**

```bash
git add src/lib/license.ts src/lib/license.test.ts
git commit -m "feat: log warning when license expires within 7 days"
```

---

### Task 2: Create `src/instrumentation.ts`

**Files:**
- Create: `src/instrumentation.ts`

- [ ] **Step 1: Create `src/instrumentation.ts`**

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { logLicenseExpiryWarning } = await import('./lib/license')
    void logLicenseExpiryWarning()
    setInterval(() => { void logLicenseExpiryWarning() }, 60 * 60 * 1000)
  }
}
```

Key points:
- `NEXT_RUNTIME === 'nodejs'` guards against running in Edge runtime.
- The dynamic `import()` is required to avoid loading Node.js-only modules in Edge routes.
- The initial call and interval are both voided — `register()` must not block server startup.
- The interval fires every hour (3,600,000 ms).

- [ ] **Step 2: Run tests — verify no regressions**

```bash
npm test
```

Expected: all tests pass. (`instrumentation.ts` has no unit tests — the underlying logic is covered in `license.test.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/instrumentation.ts
git commit -m "feat: start hourly license expiry check at server startup"
```

---

### Task 3: Add `textAnalyze` analyzer to support bundle spec

**Files:**
- Modify: `deploy/charts/templates/support-bundle.yaml`

- [ ] **Step 1: Add `analyzers` section to `deploy/charts/templates/support-bundle.yaml`**

The file currently ends after the last `logs` collector. Append an `analyzers` section at the same indentation level as `collectors` (6 spaces inside the multiline string):

```yaml
      analyzers:
        - textAnalyze:
            checkName: "License Expiry Warning"
            fileName: app/**/*.log
            regex: '\[license\] warning: expires in'
            outcomes:
              - fail:
                  when: "true"
                  message: >-
                    Your license expires within 7 days. Renew it before expiry
                    to avoid service interruption: https://vendor.replicated.com
              - pass:
                  when: "false"
                  message: "License is not approaching expiry."
```

The final file should look like:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "playball-exe.fullname" . }}-support-bundle
  labels:
    {{- include "playball-exe.labels" . | nindent 4 }}
    troubleshoot.sh/kind: support-bundle
stringData:
  support-bundle-spec: |
    apiVersion: troubleshoot.sh/v1beta2
    kind: SupportBundle
    metadata:
      name: {{ include "playball-exe.fullname" . }}
    spec:
      collectors:
        - logs:
            name: app
            namespace: {{ .Release.Namespace }}
            selector:
              - app.kubernetes.io/name=playball-exe
            limits:
              maxAge: "720h"
              maxLines: 10000
        - logs:
            name: postgres
            namespace: {{ .Release.Namespace }}
            selector:
              - app.kubernetes.io/name=postgresql
              - app.kubernetes.io/instance={{ .Release.Name }}
            limits:
              maxAge: "720h"
              maxLines: 10000
        - logs:
            name: redis
            namespace: {{ .Release.Namespace }}
            selector:
              - app.kubernetes.io/name=redis
              - app.kubernetes.io/instance={{ .Release.Name }}
            limits:
              maxAge: "720h"
              maxLines: 10000
        - logs:
            name: sdk
            namespace: {{ .Release.Namespace }}
            selector:
              - app.kubernetes.io/name={{ .Values.replicated.nameOverride | default "replicated" }}
              - app.kubernetes.io/instance={{ .Release.Name }}
            limits:
              maxAge: "720h"
              maxLines: 10000
      analyzers:
        - textAnalyze:
            checkName: "License Expiry Warning"
            fileName: app/**/*.log
            regex: '\[license\] warning: expires in'
            outcomes:
              - fail:
                  when: "true"
                  message: >-
                    Your license expires within 7 days. Renew it before expiry
                    to avoid service interruption: https://vendor.replicated.com
              - pass:
                  when: "false"
                  message: "License is not approaching expiry."
```

- [ ] **Step 2: Lint the Helm chart**

```bash
helm lint deploy/charts --set nextauth.secret=test
```

Expected output ends with: `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Step 3: Run tests — verify no regressions**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add deploy/charts/templates/support-bundle.yaml
git commit -m "feat: add textAnalyze analyzer for license expiry warning"
```
