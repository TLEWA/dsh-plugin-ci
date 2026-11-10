# Codex PR review

> [中文](./code-review.md) · English

## Responsibilities and settings

Enable cloud Codex automatic reviews for all authors in the nine repositories below, on first readiness and each new commit; defer draft reviews. Repositories may follow configured personal preferences. Verify coverage and trigger timing, not just the automatic review switch. Manage these in [Codex settings](https://chatgpt.com/codex/settings/code-review), not GitHub Actions.

Reviews consume subscription usage. Extra credits and comprehensive review default to off. Consult the account usage page for limits. Unverified settings, missing results, exhausted usage, or insufficient permissions mean incomplete, never passed. If the account cannot review every new commit automatically, stop rollout and record the gap.

Codex reports provable serious defects in Chinese with triggers, impact, and code locations. CI handles mechanical checks; humans provide approval labels and merge decisions. Reviews are feedback, without automatic fixes, version changes, or publishing. Preserve the existing required check `ci / ci-ok`, ruleset, `human-approved`, and `ci-change` processes.

## Maintaining and checking rules

The shared block lives in `templates/AGENTS.md` and its English counterpart, marked `dsh-review-policy:v1`. Each repository must contain the actual block in AGENTS; an external link does not provide inheritance. Preserve local constraints outside the block and distinguish source lib from generated lib. Update existing English documents too. Use separate adoption PRs per repository without replacing entire AGENTS files.

Run from the central repository (replace the dot with the target repository path):

~~~bash
node scripts/check-review-policy.mjs .
~~~

The check only reads local files, never accesses GitHub or executes target code. It ignores CRLF/LF differences. Missing, stale, modified, duplicate, or malformed blocks return 1; valid blocks return 0. English AGENTS is checked if present. This adoption tool is outside the merge gate and cannot verify cloud settings or review results. Initializing a new repository with --full supplies Chinese rules; adopt blocks manually in existing repositories rather than overwriting local instructions with --force.

## Daily workflow and acceptance

After readiness, check CI and Codex independently. After fixes, confirm a review corresponds to the latest head SHA. A maintainer can comment `@codex review` when automatic review is missing; old-SHA results do not cover new commits. Record PR, SHA, and result links for initial readiness, automatic rereview after a new commit, and manual review in every repository. Assess one normal change and an isolated known regression for useful locations and false positives; never merge the regression. Do not mark checks passed without actual results.

Run the gate before repository tests/builds; complete the PR template and let a maintainer add required labels. AI never merges or adds human approval labels. Automatic review may be disabled on failure while existing CI remains active; request a latest-commit review after recovery.

## Adoption record

On 2026-11-10, the maintainer explicitly confirmed in this task that all nine repositories review each push automatically. Initial readiness and latest-commit rereviews still require actual PR acceptance. The table records evidence; rule files alone do not prove cloud adoption.

| Repository | Rule version | Cloud settings | Acceptance PR / SHA / result |
| --- | --- | --- | --- |
| dsh-plugin-ci | v1 (PR pending merge) | Maintainer confirmed triggers and connection | [#14](https://github.com/TLEWA/dsh-plugin-ci/pull/14) · `6cc1e34ba3cf` · No Codex result yet |
| dsh-better-choice | v1 (PR pending merge) | Maintainer confirmed triggers and connection | [#7](https://github.com/TLEWA/dsh-better-choice/pull/7) · `a683434de4a0` · No Codex result yet |
| dsh-fastload | v1 (PR pending merge) | Maintainer confirmed triggers and connection | [#8](https://github.com/TLEWA/dsh-fastload/pull/8) · `53b0487def8f` · No Codex result yet |
| dsh-if | v1 (PR pending merge) | Maintainer confirmed triggers and connection | [#6](https://github.com/TLEWA/dsh-if/pull/6) · `8b356999c1fb` · No Codex result yet |
| dsh-opencode-go-router | v1 (PR pending merge) | Maintainer confirmed triggers and connection | [#10](https://github.com/TLEWA/dsh-opencode-go-router/pull/10) · `0696f96cb319` · No Codex result yet |
| dsh-sidebar-organizer | v1 (PR pending merge) | Maintainer confirmed triggers and connection | [#6](https://github.com/TLEWA/dsh-sidebar-organizer/pull/6) · `02f849e67934` · No Codex result yet |
| dsh-sidebar-row-menu | v1 (PR pending merge) | Maintainer confirmed triggers and connection | [#6](https://github.com/TLEWA/dsh-sidebar-row-menu/pull/6) · `010f0449cc0c` · No Codex result yet |
| dsh-utf8-output | v1 (PR pending merge) | Maintainer confirmed triggers and connection | [#6](https://github.com/TLEWA/dsh-utf8-output/pull/6) · `fb602d4431a4` · No Codex result yet |
| dsh-ptc-noargs | v1 (PR pending merge) | Maintainer confirmed triggers and connection | [#3](https://github.com/TLEWA/dsh-ptc-noargs/pull/3) · `1af23bfcd90c` · No Codex result yet |

Implementation snapshot: local gates and required tests/builds passed in all nine repositories. No visible Codex review, comment, or PR acknowledgement has appeared. One manual review was requested in central #14 and row-menu #6; their request comments have no bot acknowledgement either. The maintainer reconfirmed the connection and repository permissions; the cause remains undetermined and the review path is not verified. Router #10 has a second real commit to exercise synchronize rereview. Initial review, automatic rereview, manual review, and isolated regression-quality acceptance remain incomplete.

Merge gates still await maintainer-added `ci-change` and `human-approved`. Existing AGENTS edits from the original router/organizer directories were explicitly authorized and included in their respective PRs. Those original working directories were not reset; do not discard them before merging.
