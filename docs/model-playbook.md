# 模型工作手册

本仓的约束是机器执行的：`AGENTS.md` 写死的规则由 `scripts/ci-gate.mjs` 逐条检查，PR 里的 `guard` 检查会把偷懒直接变成红色。本文说明模型在红项面前应该怎么想、怎么做。

## 角色边界

模型可以做：

- 在 `feat/`、`fix/`、`chore/`、`docs/`、`refactor/`、`test/` 分支上改代码、测试、双语文档与 CHANGELOG。
- 运行本仓的 gate 与测试命令，并把红色项修到绿。
- 开 PR，按模板逐项勾选，说明改了什么、怎么验证。

模型不可以做：

- 执行 `npm publish`，或在非 `release/` 分支修改版本号。
- 自己加 `ci-change` / `human-approved` 标签。
- 用 `--skip=`、删检查、`.only`、`@ts-ignore`、`eslint-disable` 让红项变绿。
- 把 `ci-gate.mjs` 复制进插件仓，或把 caller 的 `@v1` 改成 `@main`；`wiring.workflows` 会拦。
- 直接改 `ci.config.json`、caller workflow、schema 或 ruleset 来放宽自己（这些属于敏感文件，PR 必须带 `ci-change` 标签，由维护者确认）。
- 把 `lib/` 产物当源码手改；产物只能由构建命令生成。

## 标准循环

1. 先读 `AGENTS.md`、`PROCESS.md`、`docs/gates.md`，确认本仓的构建、测试、文档要求。
2. 从最新 `main` 开分支，分支名必须匹配 `^(feat|fix|chore|docs|refactor|test|release)/[a-z0-9._-]+$`。
3. 代码与测试同一次提交；有构建产物就重新构建并一起提交。
4. 同一个 PR 内更新中英文文档；改了行为就写 CHANGELOG 的 `[Unreleased]`。
5. 本地跑：

```bash
npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-gate
npm test
```

6. 开 PR，`guard` 的红项按 `fix:` 提示修，不要重试同一条违规。
7. 维护者加 `human-approved` 后才合并；合并后由维护者打 tag 发布。
8. 失败时读输出里的 `fix:` 行；看不懂再查 `docs/gates.md` 的动机表。

## 红项速查

| 检查 | 含义 | 正确做法 |
| --- | --- | --- |
| `config.schema` | `ci.config.json` 缺键、多键或类型不对 | 按 `schema/ci.config.schema.json` 补齐；不要删键 |
| `wiring.workflows` | caller 缺失、pin 不是 `@v1`、仓库里有 gate 副本、`.ci/` 没忽略 | 恢复薄 caller；删副本；把 `.ci/` 写进 `.gitignore` |
| `wiring.repository` | 要发布但 `repository` 与 GitHub 仓库不符 | 改成 `https://github.com/<owner>/<repo>.git` 的规范形式 |
| `wiring.prepublish` | 要发布但 `prepublishOnly` 没有调用中心 gate | 加 `npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-gate --prepublish`，不要删 |
| `manifest.engines` | 缺顶层 `engines.dsh`、`manifestVersion` 不是 1 | 加在 `package.json` 顶层，不要写进 `dsh.engines` |
| `manifest.bundle` | `dsh.bundle.patch` 缺失，或 `insert[].name` 不等于包名 | 指向真实 `cordis.patch.yml`，`name` 写完整包名 |
| `manifest.exports` | `exports`/`main` 指向不存在的文件，或 inject 了裸模块 | 指向真实文件；只 inject `@deepseek-ai/*` |
| `files.present` | `files` 里的条目不存在，或必需文档缺失 | 补文件；不要靠删 `files` 条目过关 |
| `tarball.contents` | 打包内容缺项、混入禁止文件或超过体积上限 | 调 `files` 与 `tarball.mustInclude/mustExclude`，不改检查 |
| `artifacts.fresh` | 构建产物与源码不一致 | 运行构建命令，把 `lib/` 的差异一起提交 |
| `typecheck` / `tests` | 类型或测试失败 | 修根因；不要删测试或加跳过标记 |
| `docs.pairs` | 中英文文档结构或代码块命令不一致 | 两边同步改；命令保持逐字一致 |
| `docs.links` | 相对链接指向不存在的文件 | 补文件或改链接，不要用绝对 URL 绕过 |
| `version.changelog` | CHANGELOG 首节不是当前版本，或缺双语版本节 | 在 `CHANGELOG.md` 与 `CHANGELOG.en.md` 同时写该版本 |
| `repo.hygiene` | 提交了 `node_modules`、`*.tgz`、`.env`、日志等 | 删除并加入 `.gitignore` |
| `guard.g1` | PR 模板的必选项没勾 | 逐项确认后改成 `- [x]` |
| `guard.g2` | 分支名不合规 | 重命名分支，不要改检查 |
| `guard.g3` | 新增了 `.only` / `.skip` / `xit` | 删掉；CI 必须跑全部测试 |
| `guard.g4` | 新增了类型/规范压制注释 | 修根因；确需压制在 PR 说明并等 `ci-change` |
| `guard.g5` | 改了 CI 敏感文件但没有 `ci-change` 标签 | 请维护者 review 后加标签 |
| `guard.g6` | 新增了禁止入库的文件 | 删除并写进 `.gitignore` |
| `guard.g7` | 在非 `release/` 分支改版本号，或没改 CHANGELOG | 把版本改动移到 `release/<version>` 分支 |
| `guard.g9` | 缺少 `human-approved` 标签 | 等维护者放行；模型不得自己加 |

## 必须停下来问人的情况

- 需要改 CI 敏感文件、版本号或发布流程。
- 需要新增依赖、改动构建方式，或测试在当前环境无法运行。
- 同一个红项按提示修了两次仍然失败。
- 需求本身有歧义，或修复会改变用户可见行为。

## 反模式

- 把「本地能跑」当证据：PR 以 CI 的 `ci / ci-ok` 为准。
- 把 `--skip=` 写进 workflow，或把 gate 复制进仓库让检查“看得见”却不再受中心控制。
- 改文档把失败描述成通过；`docs.links` 与 `docs.pairs` 会拆穿。
- 一次 PR 混入无关重构；`guard.g8` 会警告 diff 规模。
