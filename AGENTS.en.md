# AGENTS.md

> Primary documentation language: Chinese · [中文](./AGENTS.md)

This file is the working policy for models and applies together with [PROCESS.en.md](./PROCESS.en.md); when the two conflict, the stricter rule wins.

## Must

- Before starting, read `PROCESS.en.md`, `docs/gates.en.md` and `docs/architecture.en.md`; identify the change type and its blast radius.
- Work only on branches with an allowed prefix; one PR does one thing.
- Run `node scripts/ci-gate.mjs` locally before committing; push only when it is green.
- Change tests when behavior changes; update both the Chinese and English docs and the CHANGELOG when user-visible content changes.
- When adding or retiring an adopted plugin, update `docs/plugins.md` and `docs/plugins.en.md` in the same change.
- When changing the gate, schema, rulesets or reusable workflows, explain the impact and include tests in the PR.
- When CI fails, read the `fix:` hint on each line and fix the root cause; if it cannot be fixed, document every attempt in the PR and hand it to a human.
- To rerun CI, add the label or edit the PR description and let `ci-rerun` rerun the existing `pr-guard` run (one check suite per SHA); do not push an empty commit just to retrigger it, and the verify matrix is not rerun.

## Prohibited

- Copying `ci-gate.mjs` or a reusable workflow into a plugin repository (the center is reused through `@v1`).
- Changing a caller pin from `@v1` to `@main`, or deleting a caller workflow.
- Adding `.only`, `.skip`, `@ts-ignore`, `eslint-disable` or similar skips or suppressions.
- Adding `ci-change` or `human-approved` labels to a PR yourself.
- Running `npm publish` locally, or force-pushing main.
- Deleting or rewriting required checklist items in the PR template.

## Common commands

```bash
node scripts/ci-gate.mjs
node scripts/ci-gate.mjs --only=manifest
node scripts/ci-gate.mjs --json
```

## Delivery standard

1. verify is fully green, and every PR template item is ticked.
2. The Chinese and English docs have one-to-one headings, and code-block commands are identical.
3. The CHANGELOG has an entry for this version that states what changed and what it means for users.

<!-- dsh-review-policy:v1:start -->
## Code Review Rules

- Report provable serious defects in Chinese, with the trigger, actual impact, and smallest relevant code location. Avoid style suggestions and mechanical checks already covered by CI. No review result does not mean approval.
- Check host compatibility and user data boundaries: plugins must not accidentally change unrelated requests, messages, configuration, or persisted data. Respect compatibility exceptions explicitly documented by the repository.
- Check errors, cancellation, disposal, and repeated initialization: hooks, listeners, and shared state must be cleaned up correctly. Fallbacks must not cause duplicate execution, data loss, or sensitive information leaks.
- Reviews provide feedback only. Do not automatically fix code, add human approval labels, merge, change versions, or publish. Preserve existing CI and human approval processes.
<!-- dsh-review-policy:v1:end -->

### Central CI review focus

- Check permission escalation, publishing credentials, and tag/release paths. Policy and reusable workflow changes must preserve downstream @v1 inputs, check names, and configuration contracts; never weaken global gates for one repository.
