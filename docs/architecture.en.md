# Architecture

> Primary documentation language: Chinese · [中文](./architecture.md)

This repository is not "copy a gate script into every plugin repository". It has five layers: templates, reusable workflows, policy source, enforcement, and drift patrol. Policy is written once and applies to every repository on the next CI run.

## Layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| Templates | `templates/` | Thin declarations a downstream repository copies once: caller workflows, `ci.config.json`, PR template, AGENTS.md |
| Reusable | `.github/workflows/reusable-*.yml` | Runs CI, releases and drift checks; downstream calls it at `@v1` |
| Policy | `scripts/`, `schema/`, `rulesets/` | The single source of truth: checks, config contract, protection rules |
| Enforcement | GitHub rulesets per repository | Makes `ci / ci-ok` and `pr-guard / guard` hard merge conditions; forbids force pushes and tag deletion |
| Patrol | `reusable-drift.yml`, `check-drift.mjs` | Finds stale `@vN` pins and broken wiring every week |

## Templates are declarations only

A downstream `.github/workflows/ci.yml` is about a dozen lines: triggers, permissions, concurrency, and one `uses: TLEWA/dsh-plugin-ci/.github/workflows/reusable-ci.yml@v1`; an equally thin `.github/workflows/pr-guard.yml` calls `reusable-pr-guard.yml@v1`. They contain no check logic, so they cannot be edited to weaken the gate and do not need rewriting when the center upgrades.

`init-repo.mjs` writes these files once. A template is a starting point for humans, not a replica to keep in sync.

## Reusable workflows do the work

`reusable-ci.yml` still bundles verify and the guard by default: the matrix runs verify (Ubuntu and Windows x Node 20/22/24), a `pr-guard` job runs the pull-request `--pr` checks, and `ci-ok` aggregates both. When a caller passes `separate-guard: true` the inline job is skipped and `reusable-pr-guard.yml` runs the guard alone; `ci-ok` still waits for `pr-guard` and `verify`, treating a skipped guard as success. Legacy callers that omit the switch keep working, so upgrading the center never breaks downstream. `reusable-release.yml` publishes tags; `reusable-drift.yml` compares versions weekly.

Steps that need the center own code use GitHub `job.workflow_repository` and `job.workflow_sha` to check the center out into `.ci`. Those contexts point at the repository and commit that owns the reusable workflow, not the caller.

## The policy layer is the single source of truth

`scripts/ci-gate.mjs` runs at the workspace root, reads the caller `ci.config.json`, and inspects the caller code. It is invoked as `.ci/scripts/ci-gate.mjs` and never enters the caller history.

`schema/ci.config.schema.json` defines the config contract; `rulesets/*.json` define main and tag protection. Both are versioned with the gate, and no repository may weaken them locally.

## Enforcement pins the result

`rulesets/main.json` requires two checks, `ci / ci-ok` and `pr-guard / guard`, and forbids branch deletion, force pushes and merge commits. `rulesets/tags-v.json` protects `v*.*.*` so a published version cannot be overwritten, while leaving the moving `v1` tag free.

TLEWA is a personal account today, so GitHub organization rulesets are unavailable and `apply-rulesets.mjs` deploys the same JSON repository by repository. Once an org exists, that JSON can be promoted to an org ruleset unchanged.

## Drift patrol is the backstop

`reusable-drift.yml` runs weekly: `check-drift.mjs` reads the major pinned by the four callers, compares it with the latest center release, and fails when it lags, opening (or reusing) a `[ci] policy drift` issue.

The gate `wiring.workflows` check also blocks regressions: copying the gate back into a repository, deleting a caller, or switching to `@main` turns the pull request red.

## Why scripts are no longer copied

The old model had `sync-ci` copy `ci-gate.mjs` into every repository. A bug fix needed N pull requests; one forgotten sync silently pinned old logic; and a local edit could weaken the rules.

A reusable workflow is native GitHub: pin one ref and every caller runs the same logic. A copy therefore changes from "sync artifact" to "violation signal".

## Why not a composite action

A composite action `uses` cannot contain expressions, so it cannot bootstrap the center. Referencing a local action inside a reusable workflow also resolves to the caller repository, creating a second version pin. A reusable workflow exposes `job.workflow_repository` and `job.workflow_sha`, so one pin is enough.

## Version contract

Callers always pin `@v1`. The center releases `v1.0.0`, then moves the mutable `v1` tag to the latest 1.x. Only a breaking change gets `v2`, and `v1` is never retargeted at an incompatible version.

Breaking changes include renaming the caller job id `ci` or `pr-guard`, renaming the aggregate job `ci-ok` or `guard`, renaming or removing a reusable workflow input, removing a required `ci.config.json` key, or changing gate exit codes or CLI semantics.

## Check names and the merge gate

A GitHub check name is "caller job name / called job name". In the template `ci.yml`'s caller job id is `ci` with no extra `name`, and the reusable aggregate job is `ci-ok`; `pr-guard.yml`'s caller job id is `pr-guard` and the called job is `guard`. The exact required strings are therefore `ci / ci-ok` and `pr-guard / guard`.

Matrix child jobs do not need to be required; `ci-ok` uses `if: always()` and treats the inline `pr-guard` skipped in split mode as satisfied. `pr-guard / guard` exists only on pull-request events and is absent on push to main, which matches a ruleset that only governs pull-request merges. Renaming any of these jobs is a contract break and requires a major version.

## Execution path and .ci

CI checks out the caller into the workspace, checks the center out into `.ci`, sets up Node, then runs `node .ci/scripts/ci-gate.mjs`. The gate `ROOT` is the current working directory, so it always inspects the caller, never the center.

`.ci` is untracked, downstream `.gitignore` must contain `.ci/`, and `release.r3-clean-tree` filters it. No gate copy exists in the repository, so there is no path to "edit the gate until green".

## Release and security

Releases prefer npm trusted publishing: GitHub issues the OIDC token, `id-token: write` must be present in both the caller and the reusable workflow, and npm validates the caller workflow filename `release.yml`. `package.json` `repository.url` must exactly match the GitHub repository, and npm CLI must be 11.5.1 or newer (the workflow installs 11.21.0).

A repository without trusted publishing can opt into `use-token` and pass `NPM_TOKEN` as a fallback; both paths publish with `--provenance`.

## This repository itself

The center sets `selfHosted: true`, calls its own `./.github/workflows/reusable-ci.yml` and `reusable-pr-guard.yml` instead of itself over the network, and releases only the gate and a GitHub Release, never npm. It does not run drift because it is the source of policy.

An external repository may set `selfHosted: true` only for a fork or an offline drill; it must vendor the gate and all four reusable workflows and own the sync cost.

## Personal account and a future org

Every repository belongs to a personal account today, so rulesets are applied per repository and the owner can change them; enforcement still relies on the maintainer not using a bypass. After migrating to an org, POST the same ruleset JSON at the org level for uniform enforcement without touching workflows or the gate.

## Changing this repository

Changes to the gate, schema, rulesets or reusable workflows are CI-sensitive: the pull request needs `ci-change` and `human-approved`, tests, and a bilingual CHANGELOG entry. Never weaken a global rule to unblock one repository; add an optional config key instead.
