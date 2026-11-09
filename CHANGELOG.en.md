# Changelog

> Primary documentation language: Chinese · [中文](./CHANGELOG.md)

## [Unreleased]

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
