# Changelog

> Primary documentation language: Chinese · [中文](./CHANGELOG.md)

## [Unreleased]

- Added the `version.runtime` check: a product-version constant hard-coded in shipped code (`VERSION`, `PLUGIN_VERSION`, and similar) must equal `package.json`'s `version`; otherwise the gate fails and points at reading `package.json` at runtime. The check comes from the `dsh-opencode-go-router` 0.7.0 incident, where `lib/core.js` still said 0.6.1 and its status route and settings page reported the old version to users. The check expands wildcards in `files` and masks comments and template literals before matching, so a legitimate whitelist such as `lib/*.js` is still inspected and a documented example cannot fail CI. Only module-scope constants count as the product version, so an identically named local constant (a protocol version, say) is left alone; when a shipped directory carries `.npmignore`, the scan intersects with the real `npm pack` list, so an unpublished fixture cannot block CI.

## [1.0.5] - 2026-11-11

- `ci-rerun.yml` now serializes runs instead of cancelling them (`cancel-in-progress: false`): adding both labels no longer cancels one rerun, so the SHA keeps no cancelled check run and the PR does not drop to `mergeStateStatus=UNSTABLE`; repeated rerun requests are skipped idempotently.

## [1.0.4] - 2026-11-11

- `ci-rerun.yml` now scopes concurrency to the job: unrelated label events never start it and therefore cannot cancel a pending or running rerun; the group is still keyed by PR number.

- `ci-rerun.yml` now keys its concurrency group by PR number (`github.event.pull_request.number`), so forks whose branches share a name no longer cancel each other's pending rerun.

## [1.0.3] - 2026-11-11

- Label changes no longer open a new CI run: a new `.github/workflows/ci-rerun.yml` reruns the existing `ci` run on the same commit when `ci-change` / `human-approved` is added. A rerun is a new attempt of the original run, its check runs are replaced in place, and the SHA keeps exactly one check suite. This fixes the "open a PR, then add labels" pattern that produced two CI runs, left the ruleset reporting `BLOCKED`, and made `gh pr checks` look green; callers no longer listen to `labeled` / `unlabeled`.

- The label gates (`guard.g5` / `guard.g9`) now read labels from the GitHub API at run time (`DSH_CI_PR_LABELS` exists only for tests), so a rerun sees a label added after the original event; added regression tests.

- Labels and the PR body are read live at gate run time, so fixing the checklist and rerunning is enough; when that lookup fails in CI the gate fails closed instead of reusing the stale event snapshot, which could let a revoked label through.

- `ci-rerun.yml` uses `pull_request_target`: a fork PR's `pull_request` token is read-only and cannot request `actions: write`; the workflow never checks out PR code and only calls the API from the trusted context.

- `wiring.workflows` gained two wiring checks: a missing `ci-rerun.yml`, or a `ci.yml` that still listens to label events, fails with a fix hint; `dsh-ci-init` now writes `ci-rerun.yml`.
- Add shared Codex PR review templates, a read-only local policy check, and bilingual adoption/acceptance guidance; preserve existing CI, human approvals, and publishing.

- Added the managed DSH plugin index at `docs/plugins.md` and `docs/plugins.en.md`, linked from the README documentation table and registered in `ci.config.json` under `docs.pairs` / `docs.required`.

## [1.0.2] - 2026-11-10

- `dsh-ci-init` now accepts `--npm-token`: it writes `with: use-token: true` under the `reusable-release.yml` call, patches an existing caller, and is idempotent; OIDC remains the default. Added three initializer tests.

## [1.0.1] - 2026-11-10

- The release handbook now documents advancing the moving `v1` tag; this release points `v1` at the v1.0.1 release commit so plugin repositories calling `@v1` pick it up.
- Added English mirrors for the remaining canonical docs: `docs/gates.en.md`, `docs/model-playbook.en.md`, `docs/release.en.md` and `AGENTS.en.md`. Chinese is now the primary documentation language and English editions use the `.en.md` suffix; README, PROCESS, AGENTS and CHANGELOG gained language switches, and ci.config.json registers the new docs in `pairs`/`required`.
- Added `reusable-release-recover.yml` and a `workflow_dispatch` trigger on the release caller: when npm is already published but the GitHub Release is missing or incomplete, pass the tag to create or repair it, optionally with `dry_run`; recovery checks tag/version, main ancestry, registry `gitHead`/provenance and the local tarball integrity, and never runs `npm publish` again.
- Fixed recovery being unable to override GitHub's reserved `GITHUB_SHA`, which made `--after-publish` compare against the workflow dispatch commit: the recovery workflow now passes `DSH_CI_EXPECTED_SHA`, and the gate prefers it before falling back to `GITHUB_SHA`.
- Fixed `--after-publish` giving up after 15 seconds when registry propagation was slow; the default is now about 10 minutes (120 × 5 s), overridable with `DSH_CI_REGISTRY_ATTEMPTS` / `DSH_CI_REGISTRY_DELAY_MS`.
- Added regression tests for the `--after-publish` registry wait: a local fake registry covers the 404-then-200 path and exhausted retries, with `DSH_CI_REGISTRY_URL` available to point at the test service so acceptance no longer depends on real npm propagation timing.
- Fixed the caller `pull_request` trigger missing `labeled` / `unlabeled`, so adding a label no longer requires a separate push; the canonical template and self-hosted workflow now match.
- Fixed the canonical `release.yml` not calling `reusable-release.yml`, which left GitHub Releases without `*.tgz` or `SHA256SUMS` assets.
- Fixed `apply-rulesets.mjs` including the HTTP method in the endpoint, which made `gh api` return 404.

## [1.0.0] - 2026-11-09

### Added

- `ci-gate.mjs`: a zero-dependency, single-command verify / release / PR guard with 17 verify, 7 release and 9 guard checks.
- Three reusable workflows: the CI matrix with `ci-ok` aggregation, OIDC publishing, and weekly drift patrol; a plugin repository only needs a thin caller pinned at `@v1`.
- Five helper scripts - `init-repo`, `apply-rulesets`, `check-drift`, `release-notes`, `scan-adopt` - plus the `ci.config.json` JSON Schema and main/tag rulesets.
- Added `wiring.prepublish` and a real local publish guard: publishing repositories must route `prepublishOnly` through `dsh-ci-gate --prepublish`; `dsh-ci-init` writes it when missing.
- 53 tests covering the gate, workflows, schema, rulesets and release notes, plus bilingual architecture docs, the model playbook and the release handbook.

### Changed

- Replaced "copy the script and sync it with sync-ci" with a five-layer model: templates, reusable workflows, policy source, rulesets and drift.
- Unified the required check as `ci / ci-ok`; releases call the center reusable workflow from the caller `release.yml`, with OIDC as the default path.
- `reusable-release.yml` now reads `release.publish`: when it is `false`, only the GitHub Release is created and both `npm publish` and post-publish verification are skipped.
- `--after-publish` retries registry propagation up to six times; internal gate failures exit with code 2; `wiring.workflows` only accepts real YAML `uses:` lines and is no longer fooled by comments.

### Removed

- Removed `sync-ci.mjs`, `ci-process.json` and the `stamp.self` check; repositories no longer keep a gate copy.
- Removed the `install`, `gate` and unused `release.assetAlias` config keys; added the optional `$schema` and `selfHosted` keys.
- `dsh-ci-init` no longer accepts the ineffective `--repo` flag; it always operates on the current directory.
