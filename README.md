# dsh-plugin-ci

DSH 插件仓库共用的严格 CI / PR 校验器。它把「怎么改、怎么测、怎么发版」写成可执行的检查，模型只能按流程提交，无法靠口头说明绕过。

## 这是什么

- 一份零依赖的 `scripts/ci-gate.mjs`，Node.js >= 20 即可运行，不需要安装任何包。
- 一套 `ci.config.json` 声明式配置：每个仓库只声明自己的构建、测试、文档与发布差异。
- 一组 GitHub Actions 模板与 ruleset 定义，保证 required check、tag 发布与防篡改。

## 强制的内容

校验分为三种模式，任一失败即退出码 1：

- verify（默认）：配置合法、manifest 完整、导出存在、产物新鲜、类型与测试通过、双语文档同步、CHANGELOG 有当前版本、仓库卫生。
- release：tag 必须等于版本号、必须落在 main 上、npm 上不得已存在同一版本、发布后核对 gitHead 与 provenance。
- guard（只跑 PR）：清单全勾、分支名合规、不得新增 `.only` 或抑制注释、CI 敏感文件需 `ci-change` 标签、版本号只能走 release 分支、需人工 `human-approved` 标签。

## 接入一个插件仓库

1. 复制 `templates/` 下的工作流、PR 模板与 `AGENTS.md`。
2. 写一份 `ci.config.json`，只声明本仓库的差异。
3. 用 `sync-ci` 同步校验器，并在 CI 里运行。

```bash
node scripts/sync-ci.mjs
node scripts/ci-gate.mjs
```

## 本地命令

```bash
node scripts/ci-gate.mjs
node scripts/ci-gate.mjs --release
node scripts/ci-gate.mjs --after-publish
```

## 仓库结构

| 路径 | 作用 |
| --- | --- |
| `scripts/ci-gate.mjs` | 唯一的校验入口 |
| `ci.config.json` | 本仓库的校验配置 |
| `templates/` | 工作流、PR 模板、AGENTS.md 模板 |
| `schema/` | 配置的 JSON Schema |
| `rulesets/` | GitHub ruleset 定义 |
| `docs/gates.md` | 每条检查的完整说明 |

## 发布流程

发布只能由 tag 触发，本机禁止 `npm publish`：

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 给模型的工作准则

模型必须遵守 [AGENTS.md](./AGENTS.md)：先读 [PROCESS.md](./PROCESS.md)，只在 `feat/`、`fix/` 等分支提交，把 CI 的红色项当作阻断，不得用跳过或压制绕过。每条检查的动机见 [docs/gates.md](./docs/gates.md)。

## 许可

MIT，见 [LICENSE](./LICENSE)。
