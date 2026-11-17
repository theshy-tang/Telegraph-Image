# Codex 项目交接手册 — Media Studio
> 更新于 2026-11-17。**仅为开发分支 `feature/media-studio-v1` 的交接资料。** 工程现状应以当前 Git/GitHub、Cloudflare 环境和代码为准，不能把文档当作运行态的唯一真相。

## 0. 第一次接手该做什么（非常重要）

1. 打开仓库 `theshy-tang/Telegraph-Image`，**checkout `feature/media-studio-v1`，不要从默认 `main` 开发**。
2. 阅读仓库根目录的 `AGENTS.md`、本文件、`studio/README.md`，再检查当前文件状态和 draft PR #1。
3. 运行现有测试（`npm test`）并检查 Cloudflare Preview 部署。当前的文件夹/D1 变动已经部署到 Preview；**之前执行过针对性语法检查和 D1 SQL 冒烟测试，但尚未全面验证真实浏览器端工作流**。
4. 先复现与验证：创建相册 → 立即出现 → 刷新 → 仍在；更名/移动父级 → 刷新；批量移动文件 → 刷新；非空文件夹拒绝删除；空文件夹删除 → 刷新仍不存在。
5. 修复真实缺陷，保持生产环境原样；提交到功能分支，等待用户验收，不要合并 PR。

## 1. 业务目标与用户要求

原项目 Telegraph-Image（Cloudflare Pages + Telegram Bot + KV 图床）扩展为全功能 **Media Studio**，既能管理个人图片和视频，也能管理 Shopify 电商图片、商品素材、页面装修素材、以及显式发布给 AI/GPT 选图的素材。

- UI 方向：高端但柔和的专业媒体管理后台，交互及时、按钮有状态反馈；当前虽已迭代样式，但用户反馈过移动鼠标、切换分类时偶发卡顿，**性能优化暂定在核心功能完善后统一处理**。
- 需要文件夹树而非平铺分类：父子相册是真正嵌套、可展开/折叠，**箭头仅展开折叠，名称负责打开**。
- 用户已选择 C **混合文件夹浏览模式**：默认仅显示直接放入当前文件夹的媒体；打开「包含子文件夹素材」才递归包括下级文件，子文件夹会在主区域显示为卡片，路径显示为面包屑。
- 多选与批量：跨页选中，批量收藏、取消收藏、标签增删、移动文件夹、分类、AI 显式发布/撤回；不可混淆收藏与公开。
- 不应为了创建/删除文件夹退出登录和连续刷新。历史根因包括 KV 最终一致性 + 前端读写后立即重新全量查询；已开始迁移 D1。

## 2. 仓库和部署

| 项目 | 当前值/说明 |
| --- | --- |
| GitHub | `https://github.com/theshy-tang/Telegraph-Image` |
| 开发分支 | `feature/media-studio-v1` |
| Draft PR | `https://github.com/theshy-tang/Telegraph-Image/pull/1`，目标 `main`，**尚未合并** |
| Cloudflare Pages project | `my-image-bed` |
| Production | `https://my-image-bed.pages.dev` (branch `main`) |
| Studio page | 开发分支 Preview 的 `/studio/` |
| 2026-11-17 交接前最后确认的 Preview | `https://8da265e1.my-image-bed.pages.dev/studio/`，对应迁移代码提交 `5c0830ab6f869346fc011b85574e4a250144ae7c`，当时 Cloudflare 状态 `success` |
| Cloudflare account | `65a407f35cae2b4ef2dac7c8b2d1d3a6`（非密钥） |

**重要：** 每次推送功能分支都可能生成新的 commit-specific Preview URL；不要假定上面的预览链接永远是最新版。查看 Pages deployments 和 GitHub commit hash。

## 3. Cloudflare 环境与绑定（最易出错）

| 绑定/配置 | Preview（隔离测试） | Production（真实业务） |
| --- | --- | --- |
| Pages branch | `feature/media-studio-v1` | `main` |
| KV binding | `img_url` → `media-studio-preview-kv` | `img_url` → `telegraph-image-kv` |
| Preview KV namespace ID | `736f1301ecb14a7ab03417b54386fdb1` | 不适用 |
| Production KV namespace ID | 不适用 | `8a9b05daf9384496887d063292832345` |
| D1 binding | `MEDIA_STUDIO_DB` → `media-studio-preview` | **没有 D1 binding** |
| Preview D1 database UUID | `c096d27b-5189-4c6c-bfc2-734366653ea2` | 不适用 |
| Basic Auth | Preview 独立 `BASIC_USER` / `BASIC_PASS` | Production 独立 `BASIC_USER` / `BASIC_PASS` |
| Telegram Bot upload credentials | **未配置**；预览上传按钮被禁用 | Production 配置，属于 secret |

不要复制、暴露、提交任何 token、密码或机密的实际值。不要将 Preview D1 绑定到 Production，也不要在 Preview 改用 Production KV。

### 数据迁移历史

1. 最初为了可视化测试，将生产 KV 的 **9 个公开图片元数据记录**复制到独立 Preview KV（没有复制 Telegram 凭据/媒体实体）。
2. 随后用户在 Preview 创建了相册与归类。
3. 2026-11-17 创建 **`media-studio-preview` D1**，位置 APAC、读副本 disabled；运行 `migrations/0001_media_studio_folders_d1.sql` 的相册表与素材归属表。
4. 从 Preview KV 导入当时的 **2 个相册及 2 条图片相册归属记录**。之后查询发现 D1 中已有 **3 个相册、2 条归属记录**（测试期间数据可能发生变化，不要硬编码数量）。
5. 预览版本 API 已切换：D1 binding 存在时，文件夹树和媒体所属文件夹 **以 D1 为权威来源**；否则兼容旧 KV 路径。Production 未绑定 D1，因此保留生产旧行为。
6. Preview KV 仍用于图床文件列表、元数据（标签/收藏/AI 状态等），媒体原始 URL 仍走正式图床 `/file/<id>`，Studio Preview 缩略图通过白名单同域代理 `/api/studio/media/<id>` 加载。

### 需要留意的迁移完整性

- 相册树的创建/改名/移动/删除走 `functions/api/manage/folders*.js`；媒体归属的批量写入走 `functions/api/manage/bulk.js`；素材列表归属覆盖走 `functions/api/manage/list.js`。
- D1 相册写入不应再向 KV 写同一份文件夹记录；D1 模式下媒体移入文件夹不应顺手覆盖 KV 文件名、收藏、AI 状态等。
- **数据迁移并未把收藏、标签、AI 发布、类别等全部迁到 D1**。不要报告成「全量迁移」。
- D1 当前表：`studio_folders(id, name, parent_id, created_at, updated_at)` 和 `studio_media_folders(media_id, folder_id, updated_at)`，带外键和索引。
- 注意 D1 API JSON 对象可能返回 `meta.changes`；尤其创建/删除/修改时做好错误处理。后台实际请求与单元模拟要一起验证。

## 4. 主要文件入口

### UI
- `studio/index.html`：单文件 HTML/CSS/JS，登录、素材展示、左侧相册树、多选、对话框、上传入口、用户反馈。UI 不使用 React/Vue。
- `studio/README.md`：目前已有功能、安全提示、验收检查。

### API 与核心数据
- `functions/api/manage/_middleware.js`：后台 Basic Auth。
- `functions/api/manage/folders.js`：`GET/POST /api/manage/folders`。
- `functions/api/manage/folders/[id].js`：`PATCH/DELETE /api/manage/folders/:id`。
- `functions/api/manage/list.js`：原 KV 目录列表；有 D1 时用 D1 覆盖 media.folderId。
- `functions/api/manage/bulk.js`：批量收藏、标签、AI、`move_folder` 等，批次最多 50。
- `functions/utils/studio-folders.js`：旧 KV 相册实现的校验与兼容逻辑。
- `functions/utils/studio-d1.js`：D1 绑定探测、相册查询、媒体归属查询。
- `migrations/0001_media_studio_folders_d1.sql`：D1 结构。
- `functions/api/studio/media/[id].js`：预览图片同域代理（上游固定为生产公开图床 URL）。
- `functions/api/shopify-assets.js`：AI 商品素材目录（分支实现显式 `aiPublished` 过滤）。
- `functions/upload.js`：既有 Telegram 上传流程（生产关键路径，不要擅动）。

### 测试
- `package.json`：`npm test` = `mocha`；`npm run test:e2e` 有旧主页端到端测试。
- `test/media-studio.test.js`
- `test/media-studio-folders.test.js`
- `test/media-studio-explorer.test.js`
- `test/media-studio-kv-consistency.test.js`
- `test/media-studio-d1.test.js`
- `test/media-studio-proxy.test.js`

之前部分针对性逻辑/SQL 检查在开发助手环境做过，但没有确认完整 `npm test` 和基于真实浏览器的全套 E2E 验收。因此 Codex 的第一轮工作应检查测试实际可运行性，且优先修测试或修实现。

## 5. 已完成功能（尚未意味着可直接发布生产）

- Preview 登录和独立 KV 环境，界面已能显示实际媒体条目。
- 相册：创建、重命名、调整父子级、空相册删除保护。
- 真实可展开/折叠的文件夹树；混合模式、面包屑、未归类和子文件夹卡片。
- 图片/视频预览、按类型筛选、搜索、收藏和 AI 发布视图。
- 跨页和当前结果选择、批量收藏/取消、标签操作、分类、相册归类。
- 图片加载代理、有限的卡片 DOM 复用、hover 性能修整。
- Preview 的 D1 文件夹/媒体归属迁移第一阶段已部署；注意其他元数据仍在 KV。
- PR #1 仍 Draft，生产没有部署这套 Studio，正式站点仍有历史旧逻辑。

## 6. 优先级与已知风险

### P0 — 先复核，不应在不了解影响时直接上生产

1. **预览 D1 真实验收：** 创建/重命名/移动/删除后刷新，数据应立即一致；在有子文件夹或有直接素材时必须拒绝删除；检查相册展示和实际 D1 数据完全一致。
2. **上传接口安全：** 由于历史配置变动，生产 `/upload` 可能允许匿名上传；核查并提出兼容的认证方案。不要未经授权更改 Production。
3. **公开 AI 目录的隐私：** Production `/api/shopify-assets` 原实现可能按 `liked` 公开图片，而开发分支改为 `aiPublished`。合并前必须验证未发布图片不会出现在无需认证的目录，且避免个人收藏意外公开。不要在任务报告中假称生产已修复。
4. **Secrets 和资源边界：** Preview/Production 绝对隔离；不得在日志、commit、命令参数和回复中输出真实认证秘密；不批量删除真实资源。
5. **旧系统兼容：** `/file/<id>` 图片 URL、Telegram 上传、旧版管理后台不能因为 Studio 迁移而失效。

### P1 — 功能完善

1. 完成标签的完整管理系统、图片/视频的日常管理（重命名、下载、上传、安全校验）。
2. 改进批量操作与跨页体验，失败可重试、全选准确、反馈及时。
3. 进一步完成 AI/GPT 目录的权限、发布管理和素材筛选。
4. 设计从 Preview D1 到未来**单独 Production D1** 的有审核、备份、回滚、分阶段迁移策略。切忌直接复用 Preview D1。

### P2 — 核心功能稳定之后

1. UI 继续打磨（更柔和、更高级、更强按钮反馈）。
2. 性能测量与优化：图片轻量缩略图、浏览器解码、缓存、分类渲染、虚拟滚动。
3. 根据需求决定是否采用 React/Vue，不要以“换框架”替代定位性能问题。

## 7. 第一轮 Codex 实施任务（建议）

1. 先输出一份精简的现状审计，列出预览与生产风险，以及测试是否通过。
2. 在 **`feature/media-studio-v1`** 修复 D1 迁移遗留问题和测试缺口（尤其 `move_folder`、空相册删除、刷新后状态）。
3. 如果可使用 Cloudflare 连接，执行只读的 Preview D1/KV 核对；需要写入时只用 Preview 的明确测试记录，结束时清理自己创建的测试记录，别改用户已有记录。
4. 提交清楚的 commit，验证最新 Preview 部署与界面；PR 保持 Draft。
5. 汇报：做了哪些修改、测试结果、预览地址、仍然需要用户验收什么、是否涉及真实业务数据。

## 8. 交接完成标准

Codex 能回答以下问题才算完成接手：它知道当前分支/PR 与 Production 的差别；能定位文件夹 API、批量归属 API、D1 migration；知道 `liked` 不等于 `aiPublished`；知道预览上传不通是因为没有 TG 凭据；知道生产上传权限风险；知道用户希望先让功能完善再统一优化视觉性能；能安全在 Preview 做更改并给出真实测试结果，而非口头承诺。

**不要复制本聊天的密码、Token 或私有数据进入交接文件。** 所需配置应通过 Cloudflare Secrets/Bindings 和授权后读取，不能靠手工硬编码。


## 2026-11-17 Codex first repair batch

- Baseline: aa882ef on feature/media-studio-v1; confirmed Preview b3bf14d9, isolated KV/D1, production without D1. Read-only Preview check: 3 folders, 2 memberships, 9 media records, no FK violations. One legacy KV membership differs from D1; D1 remains authoritative.
- Disabled external Sentry request telemetry (including remote sampling); no credentials, request headers, URLs or upload details are sent by the project middleware. Existing exports remain compatible.
- Malformed Basic Base64 now returns 400; management errors no longer return exception stacks. Bulk D1 preflight failures return structured no-store 503.
- Repaired D1 mock statement methods so the existing lifecycle test actually runs; added security regressions. npm test: 132 passing on Node 24.15.0. This is not a browser or real Cloudflare D1 lifecycle acceptance result.
- Repaired missing platform entries in package-lock.json. Do not commit installed node_modules changes.
- Still outstanding: database-level concurrent cycle/depth/sibling protection; KV metadata lost-update/stale reads; legacy media deletion leaving D1 memberships; authenticated Studio browser workflow; production upload protection and liked-based public catalog require separately approved production rollout.
- No production data/config changes, Telegram deletions, PR merge, or media URL changes performed.
