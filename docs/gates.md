# 每条检查的动机

`ci-gate.mjs` 的每一条检查都对应用户真实踩过的坑。删检查之前先读这里。

## verify（本地与 CI 都跑）

| 检查 | 拦什么 | 为什么 |
| --- | --- | --- |
| `config.schema` | 未知键、类型错误、缺字段 | 配置写错时静默失效比报错更危险 |
| `stamp.self` | 手改 gate、未同步 | 六个仓库必须跑同一份逻辑 |
| `manifest.name` | 包名/版本格式、仓库名不一致 | npm 与 GitHub 对不上时无法追溯 |
| `manifest.bundle` | patch 文件缺失、name 与包名不符 | 宿主按包名解析插件，写错等于不生效 |
| `manifest.engines` | 缺顶层 `engines.dsh`、manifestVersion 不符 | 宿主与插件市场只读顶层字段 |
| `manifest.exports` | 导出指向不存在文件、inject 裸模块 | 安装后 404 或运行时解析失败 |
| `files.present` | files 白名单缺项、必需文档缺失 | npm 包缺文件时使用者拿到半成品 |
| `tarball.contents` | 打包进禁止文件、超体积、版本不符 | 本地能跑不等于发布内容正确 |
| `artifacts.fresh` | 构建产物不新鲜 | 提交的 dist 与源码不一致会误导用户 |
| `typecheck` | 类型错误 | 类型是契约，不能靠运行时碰运气 |
| `tests` | 测试失败、测试未被收集 | 没被跑到的测试等于没有 |
| `docs.pairs` | 中英文标题/命令/版本不一致 | 只改一份文档等于另一份在说谎 |
| `docs.links` | 相对链接失效 | 文档死链是长期腐化的起点 |
| `version.changelog` | 版本小节缺失或为空 | 用户升级前需要知道破坏性变更 |
| `repo.hygiene` | 提交 node_modules、.env、tgz、日志 | 泄漏密钥与仓库膨胀 |

## release（只在 tag 触发时跑）

| 检查 | 拦什么 |
| --- | --- |
| `release.r1-tag-version` | tag 与 package.json 版本不一致 |
| `release.r2-ancestor` | tag 不在 main 上（绕过评审的直接发版） |
| `release.r3-clean-tree` | 工作区脏、产物不新鲜 |
| `release.r4-notes` | CHANGELOG 缺当前版本 |
| `release.r5-unpublished` | npm 上已存在同版本（覆盖发布） |
| `release.r6-verify` | verify 未全绿就发布 |
| `release.r7-post` | 发布后 gitHead / integrity / provenance 对不上 |

## guard（只跑 PR）

| 检查 | 拦什么 |
| --- | --- |
| `guard.g1-checklist` | PR 模板必勾项未勾 |
| `guard.g2-branch` | 分支名不合规 |
| `guard.g3-focus-tests` | 新增 `.only`/`.skip`/`xit` |
| `guard.g4-suppressions` | 新增 `@ts-ignore`/压规则 |
| `guard.g5-sensitive` | 改 CI 敏感文件却没有 `ci-change` 标签 |
| `guard.g6-forbidden-files` | 新增 tgz/node_modules/.env/日志 |
| `guard.g7-version-bump` | 版本号改动不在 release 分支、没改 CHANGELOG |
| `guard.g8-diff-size` | 超大 diff（警告，促使拆分） |
| `guard.g9-human-approved` | 缺人工放行标签 |

## 失败时怎么读

- `✓` 通过，`·` 跳过（配置为 null 或模式不适用），`!` 警告（不阻断），`✗` 失败。
- 失败行下面紧跟 `fix:`，写的是最短修复路径，不是建议。
- 想只跑一条：`node scripts/ci-gate.mjs --only=manifest.engines`。
