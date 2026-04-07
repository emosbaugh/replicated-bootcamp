# Friction Log

A running log of every friction point encountered during the Replicated Bootcamp.
Shared at the end of the exercise as structured developer experience feedback.

---

## Entry 1 — 2026-04-07 — annoyance

**Trying to:** Determine whether the `.replicated` file needs a support bundle spec path, similar to how preflights are configured with an explicit `path` field.
**Expected:** Docs or CLI help to clearly explain whether support bundles are referenced in `.replicated` (like preflights are via `PreflightConfig.Path`) or whether they live only as in-chart manifests.
**Actual:** The `Config` struct in `pkg/tools/types.go` has a `Preflights` field with an explicit path, but no equivalent `SupportBundles` field. The linting section has a `SupportBundle` linter entry, but this only controls whether the linter checks for a spec — it does not reference a spec path. The docs at `support-bundle-customizing` make no mention of `.replicated` at all. The asymmetry between preflights (path-configured) and support bundles (chart-embedded only) is undocumented.
**Resolution:** Inferred from reading `types.go` source directly and confirming via docs that support bundles are always embedded in chart templates (as a Secret or CRD) and never path-referenced in `.replicated`. Took ~15 minutes of cross-referencing source and docs.
**Severity:** annoyance
