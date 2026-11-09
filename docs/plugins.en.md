# Managed DSH plugins

> Primary documentation language: Chinese · [中文](./plugins.md)

This page is the index of downstream plugins managed by this canonical repository. It records each repository's wiring to the shared CI and does not duplicate the plugin's own installation or usage documentation.

## Scope

A repository is "managed" only when all of the following hold:

- it has a root `ci.config.json`;
- `ci.yml` calls `TLEWA/dsh-plugin-ci/.github/workflows/reusable-ci.yml@v1`;
- `release.yml` calls `TLEWA/dsh-plugin-ci/.github/workflows/reusable-release.yml@v1`;
- the canonical main ruleset is applied, so merges require `ci / ci-ok`;
- for publishing repositories, the tag ruleset is applied and a repository-level `NPM_TOKEN` is used (`with: use-token: true`).

DSH plugins that are not wired to the canonical CI are out of scope, even when they share an author. This repository is CI tooling, not a plugin, so it is not listed.

## Plugin index

| Plugin | Purpose | Build / test |
| --- | --- | --- |
| [dsh-better-choice](https://github.com/TLEWA/dsh-better-choice) · [npm](https://www.npmjs.com/package/dsh-better-choice) | Enhances `ask_user_question`: right-click an option to add a note, and ask the model a side question before choosing, reusing the current session context. | `npm run build` → `lib` (git-diff); `npm test` |
| [dsh-fastload](https://github.com/TLEWA/dsh-fastload) · [npm](https://www.npmjs.com/package/dsh-fastload) | Reduces the first history page of a long session; the web client fills the viewport in the background when that page is too short. | No build; `npm test` |
| [dsh-if](https://github.com/TLEWA/dsh-if) · [npm](https://www.npmjs.com/package/dsh-if) | Adds a custom `/if` command: a forked subagent judges the condition, then the instruction below it is sent as a normal user message when true. | No build; `node test/run.mjs` |
| [dsh-opencode-go-router](https://github.com/TLEWA/dsh-opencode-go-router) · [npm](https://www.npmjs.com/package/dsh-opencode-go-router) | Maintains a warm OpenCode Go routing-id pool and rotates the route before a request would lose the upstream prefix cache. | No build; `node --test` |
| [dsh-sidebar-organizer](https://github.com/TLEWA/dsh-sidebar-organizer) · [npm](https://www.npmjs.com/package/dsh-sidebar-organizer) | Long-press drag to reorder and tuck DSH panels, toolbars and menus across seven regions, with importable and exportable layouts. | `npm run build` → `lib` (git-diff); CI does not run tests (`test: null`) |
| [dsh-sidebar-row-menu](https://github.com/TLEWA/dsh-sidebar-row-menu) · [npm](https://www.npmjs.com/package/dsh-sidebar-row-menu) | Adds workspace-row and session-row context menus to the DSH sidebar, including open-with, more-actions and archive cleanup. | `npm run build:client` → `lib` (git-diff); `npm test` |
| [dsh-utf8-output](https://github.com/TLEWA/dsh-utf8-output) · [npm](https://www.npmjs.com/package/dsh-utf8-output) | Fixes GBK/CP936/CP932 mojibake from DSH subprocess output on Windows by re-decoding the bytes before they reach the agent. | No build; `node test/run.mjs` |
| [dsh-ptc-noargs](https://github.com/TLEWA/dsh-ptc-noargs) · [npm](https://www.npmjs.com/package/dsh-ptc-noargs) | Fixes rejected argument-less tool calls in PTC `run_code`: injects a one-line prelude before TypeScript function-body programs and normalizes an omitted or undefined first argument to `{}`. | No build; `npm test` |

## Shared wiring

- The repositories in the index pin `@v1`; after a new major release of the canonical repository, `reusable-drift.yml` reports stale pins.
- The CI matrix is Ubuntu / Windows × Node 20 / 22 / 24, and the only required check is `ci / ci-ok`.
- Releases are tag-only: `release.yml` calls `reusable-release.yml@v1`, which runs preflight, npm publish, post-publish verification and the GitHub Release.
- Publishing repositories in the index are configured to publish npm packages with provenance. Every release caller uses `with: use-token: true` with the repository secret `NPM_TOKEN` instead of OIDC.
- Local publishing is blocked by `prepublishOnly` calling `dsh-ci-gate --prepublish`; do not run `npm publish` directly.

## Maintenance

- When adding a plugin, update this page, the README documentation table, and every other plugin README's cross-index in the same adoption PR; remove entries when a repository is renamed or retired.
- This page records wiring, not plugin versions. Versions live in each repository's `package.json` and on npm, so the index does not drift with every release.
- Build and test commands come from each repository's `ci.config.json`; update this page when those commands change.
- To check whether a repository still qualifies, inspect its `ci.config.json` and both caller workflows.

## Related docs

- [Adoption guide](../README.en.md)
- [Release handbook](./release.en.md)
- [Check rationale](./gates.en.md)
- [Architecture](./architecture.en.md)
