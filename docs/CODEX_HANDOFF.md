# Current Production status — 2026-11-17

2026-11-17 owner-authorized Production release: https://my-image-bed.pages.dev/studio/ . Production pinned to release/media-studio-v1-20261117 at 0da2c32 (2026-11-18 image-read hotfix); feature/media-studio-v1 stays development, main and Draft PR #1 unmerged. Original Production KV 8a9b05daf9384496887d063292832345 retained; dedicated Production D1 28f78f0b-b3b4-4c0e-a5c7-d7382d93aa7d enabled. Nine records/favorites migrated, AI publication count zero. Upload mode admin; write pause removed. See docs/PRODUCTION_RELEASE_20261117.md.

Backup KV 6f21d4feb8424b22920201bb729ec88e. Initial Production deployment beaf8f25-1dee-4483-bb0a-89eff44583c2; current hotfix deployment 267a0a32-b4bf-4bb2-a488-9d7953aeb4bf. Earlier sections below describe historical pre-release states, not current Production.

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


## 2026-11-17 toolbar unfiled regression fix

- User reported `Invalid folder ID` from the toolbar's remove-from-album action. The UI renamed `clear_folder` to `move_folder` before constructing its payload, dropping the explicit `folderId: null` needed to unfile media.
- Construct the payload using the original UI action before translating to the API action. Backend validation stays strict; missing folderId remains invalid.
- Added toolbar request regressions covering unfile, move to a selected folder, and opening the destination dialog. The unfile test failed before the fix, while the other two passed. After the fix the full suite has 135 passing tests.
- Existing D1 lifecycle test covers null membership deletion and verifies the original KV media survives. No existing Preview/production records or original media URLs were modified for this fix.


## 2026-11-17 folder integrity and batch retry reliability

- Added migration 0002 with SQLite triggers for INSERT/UPDATE. Atomic database checks reject cycles, depth beyond 8, more than 1000 folders, and duplicate sibling names (SQLite NOCASE; existing application locale-aware checks still apply). Known constraint failures return API 409, storage outages remain 503.
- Applied 0002 only to media-studio-preview after checking existing hierarchy and duplicate names. Preview smoke test rejected a cyclic update and duplicate root; confirmed the original parent did not change. Only newly generated Codex test records were created/cleaned; user rows and Production were untouched.
- Added Miniflare as an explicit pinned dev dependency and real SQL tests covering constraints, stale-read inverse moves, API lifecycle, nonempty delete protection and preserved KV media metadata. Full suite: 141 passing locally.
- Bulk operations now remove only confirmed successes from retry selection. Failed, absent-result, interrupted and unsent IDs remain selected, including failures spanning multiple 50-item batches. Responses lost in transit are uncertain and safe to retry because operations set state.
- Remaining: Unicode sibling equality at the database layer is narrower than the application locale comparison; KV metadata lost updates; legacy deletion membership cleanup; authenticated browser E2E; production upload/catalog rollout. No production migration or merge authorized/performed.


## 2026-11-17 tag management panel

- Replaced tag prompt interaction with a modal for add/remove, searchable existing tags, selection membership counts, and new tag input (English/Chinese commas or lines). Remove mode only lists tags found on selected loaded media; cancel sends no writes.
- Added exact single-tag filtering alongside existing search, folder/hybrid browsing and type filters; clear filters resets the tag selection. Tag choices describe the loaded-data scope, without pretending to be a global KV index.
- Preserves existing tags, folder membership, favorites and AI publication; no automatic publication. Backend now rejects an add that exceeds 30 tags per file instead of silently truncating new tags. Failure reason is visible and failed IDs remain selected.
- Added regression tests for parsing/limits, add/remove payloads, mixed membership counts, exact filtering and metadata preservation on tag capacity failures. Full suite: 148 passing locally. UI/handler tests plus Miniflare integration; not authenticated browser acceptance.
- Tags still use legacy KV metadata; concurrent KV lost updates remain unresolved. No production data/config changes or PR merge.


## 2026-11-17 editable media details

- Replaced read-only preview information with an editable inspector: display filename, category, removable/renameable tag chips, inline new tags with datalist suggestions, tag lookup, folder assignment, favorite and separately confirmed AI publication. Original link copying and legacy album labels remain available.
- Names/categories/tags are drafts until Save details; closing/Escape warns about unsaved changes. Folder/favorite/publication actions save independently without discarding the details draft. Controls are locked during requests, duplicate saves are rejected, and failures retain the draft.
- New single-item bulk action edit_details validates display filename (1-160 chars), category (0-48 chars) and tags (0-30, each 1-48). It updates only those metadata properties, preserving KV value, file ID/URL, moderation/provider/unknown fields and publication flags. D1 remains authoritative for membership in its response. Renaming a tag affects this media item only.
- Added six inspector regressions, extended the real D1 lifecycle test to verify metadata edits preserve D1 membership. Full suite: 154 passing locally. Browser connection attempt timed out; authenticated UI acceptance is still outstanding.
- KV metadata concurrency/eventual consistency remains an outstanding limitation. No Production writes/config changes, original file deletion, credential changes or PR merge.


## 2026-11-17 authoritative metadata and deletion consistency

- Current Preview adds migration 0003 and MEDIA_STUDIO_METADATA_D1=true. Editable name/tags/albums/category/favorite/AI publication are authoritative in studio_media_metadata. KV still discovers original file records and holds original references/provider/moderation fields. No dual writes of editable fields. The prior milestone notes about KV-only editable metadata are historical.
- Imported 9 isolated Preview KV metadata records with INSERT OR IGNORE and validated the copy. Original KV values and Production were not modified. Preview bindings were preserved and Production was not sent in the configuration PATCH. IMPORTANT: see the credential incident below; the Preview password was accidentally overwritten with a masked empty API value.
- Atomic version-checked updates retry additive actions against latest state. Full inspector saves require the version captured when opening the draft and refuse stale overwrites; drafts remain intact and a Reload details button retrieves current single-media state. The list, single-media route, legacy name/favorite handlers, and public catalog share the same D1 overlay.
- Deletion now records a durable tombstone and removes membership in one D1 batch before attempting the legacy KV deletion. A failed KV deletion stays hidden and can be retried; membership triggers reject moves back into deleted records. No Telegram deletion behavior was added. D1-backed deletion requires same-origin DELETE, and both old UIs now send DELETE. Tests exercised fixture deletion only, never existing user media.
- Management auth now fails closed when BASIC_USER or BASIC_PASS is missing. Legacy KV deployments otherwise retain their storage behavior; Production upload protection still awaits a separately approved rollout.
- 164 tests pass, including concurrent merge, stale form conflict, catalog unpublish, legacy compatibility, failed deletion recovery and auth regressions. Local browser acceptance used fixture KV and real Miniflare D1: login, edit/save/reload, tag add/rename/remove, favorite without draft loss, full page refresh/relogin, nested album creation and movement, direct-only vs descendants switch. This is local acceptance, not a production browser test. See docs/STUDIO_ACCEPTANCE.md.
- Use only the newest Preview for edits after migration. Old commit-specific Preview URLs run older code and can still write stale KV. Disabling the metadata flag is NOT a safe rollback once D1 edits exist: preserve/export D1 edits first or retain the D1 adapter when reverting UI changes. Do not copy this database to Production.


### Preview credential incident — resolved

- Code commit 08cf0ef and migration 0003 are present. The e46f23b7 Preview builds successfully, but unauthenticated /api/manage/list returns 503 with Admin credentials must be configured. Do not describe this deployment as ready for user acceptance.
- Cause: while adding the metadata feature flag, the assistant copied the GET project's entire Preview env_vars map into PATCH. Cloudflare represents secret_text values as empty strings when reading; re-sending BASIC_PASS with that placeholder overwrote the runtime secret. Comparing masked API values before/after was not a valid preservation check.
- Production config was excluded from the PATCH. The previous e381acde Preview still returns 401 as expected and retains its historical runtime credentials. No original files or Production data were changed. The original Preview credential cannot be read back from the API.
- Recovery requires the owner to re-enter the ORIGINAL Preview BASIC_PASS using Cloudflare Pages project my-image-bed > Settings > Variables and Secrets > Preview. Never ask for the password in chat, copy Production secrets, weaken auth, or silently set a replacement password.
- After owner recovery: re-read current isolated Preview KV metadata; refresh only D1 version=0/deleted=0 snapshots if legacy Preview edits happened during the outage, preserving any versioned edits; redeploy feature/media-studio-v1; verify unauthenticated management returns 401 and complete authenticated Preview acceptance.
- Future environment changes must never resend masked secret_text values. Do not repeat the faulty full-map PATCH approach. A successful build or identical masked API output does not prove valid runtime credentials.


### Preview recovery verified

- The owner explicitly authorized restoring Preview BASIC_PASS through the connected Cloudflare API. Only the owner-provided secret was written; no masked secret values were reused, and no password value was written to source, documentation, verification output, or a file. Production was excluded from the PATCH.
- Rechecked 9 current Preview KV metadata snapshots against D1. All matched; no KV writes or metadata refreshes were necessary, and no versioned rows were overwritten.
- Retried feature branch deployment 03d2e68; recovery Preview 2e6f11f5 deployed successfully with the metadata flag enabled.
- Actual HTTP checks against that deployed Preview: unauthenticated 401; intentionally wrong password 401; correct account authentication 200; media count 9 with integer metadata versions; single-media details 200. Verification was read-only and did not modify existing media. The password was passed to the local verifier through non-echoing process input, not through a file or command-line argument.
- The deployment blocker described above is resolved. Future password changes remain owner-controlled; do not reuse the historical broken Preview URLs as acceptance targets.


## 2026-11-17 authenticated upload channel and release preparation

- Studio now posts multipart uploads to /api/manage/upload with its admin Authorization header. The route independently revalidates admin auth, requires same-origin requests, checks bounded multipart bodies/media extensions and returns confirmed metadata for immediate display. Dedicated /upload credentials do not break the Studio login path.
- Optional UPLOAD_AUTH_MODE=admin or dedicated protects /upload; an unset mode preserves legacy client behavior. Missing explicit-mode credentials and unknown modes fail closed. Protected-mode browser uploads reject foreign origins; native clients may omit Origin. No Production or Preview env var was changed to enable these modes in this batch.
- Studio uses a default 50 MiB application policy (configurable via STUDIO_MAX_UPLOAD_BYTES up to 100 MiB), capped while streaming with 64 KiB multipart overhead. No assertion of provider limits/content verification. Empty files, malformed requests, SVG and unsupported extensions are rejected before storage writes.
- Confirmed uploads stay in memory if immediate KV listing is stale; failed upload feedback survives refresh, duplicate upload starts are blocked, and new items stay unfiled/unfavorited/unpublished. Preview UI uploads remain disabled because the remote Preview intentionally has no Telegram credentials.
- Removed obsolete telemetry callbacks from the uploader and raw exception logs from Telegram network/file lookup failures. New authenticated upload error responses do not disclose provider messages or references. Legacy client error compatibility is retained.
- Added authenticated upload and frontend regressions plus real local Miniflare R2/D1 upload-to-edit checks. Local browser uploaded a 68-byte fixture PNG and observed one successful upload and its new card; remote Telegram credentials/data were not used. See docs/PRODUCTION_READINESS.md for the approval-dependent production plan and rollback constraints.

- Final verification for this batch: 176 tests passing, including 12 new upload/UI regressions. No environment variables, secrets, production bindings or production data were changed.


## 2026-11-17 full-library search

- New authenticated GET /api/manage/search queries a derived D1 inventory instead of scanning all KV pages in the browser. Migration 0004 adds studio_media_inventory and studio_catalog_state. No new environment flag or secret is needed; the existing metadata-D1 mode plus ready=1 gates availability.
- Queries overlay current D1 editable metadata, membership and tombstones. Bound parameters protect text filters; keyset cursors bind normalized filters and use media ID tiebreakers. Supports keywords, exact tag/legacy-album, media type, favorite/publication, folder/explicit descendants, date/name sorting. Suggestions contain at most 500 live tags. Search reads no KV raw values.
- Separate full-library dialog preserves C hybrid browsing and existing loaded-data search. Results open the editable inspector and feed existing cross-page selection/batch processing. Reset/close abort requests; generation checks discard late responses; old responses cannot downgrade newer item versions. Pagination keeps submitted filters until a new search.
- Current uploader indexes confirmed KV records when the catalog tables exist; old deployments/direct KV writers need an inventory reconciliation. Derived inventory does not replace original provider records. Index initialization uses whitelisted metadata only, verifies full key coverage and leaves existing versioned edits/tombstones intact. Set ready last, and leave it false on incomplete import.
- 185 tests passing. Local 107-record browser fixture verified unloaded discovery, edit-to-search consistency and selection of 51 records across pages. These are local fixture tests, not authenticated remote search acceptance.
- Preview only: applied migration 0004, indexed all 9 existing media keys, verified unchanged editable counts/version/deletion aggregates and no FK violations, then enabled ready. No KV writes, original media/link changes, environment/credential changes, Production operations or PR merge.
- Next: confirm feature-branch deployment and remote runtime HTTP behavior; full authenticated Preview search acceptance is still separate. Production migration continues to require explicit approval and a separate database. See studio/README.md and docs/STUDIO_ACCEPTANCE.md for operating limits.


## 2026-11-17 global tag management

- Owner reports the deployed full-library search, inspector editing and cross-page bulk workflows work and authorized moving to the next module. Record this as owner acceptance of those workflows, separately from assistant-run checks.
- Added authenticated GET/POST /api/manage/tags and a global tag manager beside full-library search. Lists distinct live-media usage counts across the complete derived inventory, literal substring search and binary-name pagination (100/page), with direct links to exact-tag full-library results.
- Rename only accepts a new target; merging into an existing tag is an explicit separate action. Both transform all current matching live documents in one SQL statement. Materialized effective documents and eligibility prevent target checks from changing mid-write. Updates preserve unrelated editable fields, deduplicate tags in first-occurrence order and increment metadata versions. Unseeded inventory uses only editable fallback fields; derived moderation/date/size fields never become authoritative metadata. Tombstones and memberships are untouched.
- Global changes require an explicit checkbox acknowledging whole-library impact, list refresh and selection clearing; modifying target/action clears that confirmation. UI locks duplicate writes/close during submission, retains failed inputs and reloads authoritative media even after an uncertain response. Old inspector drafts then conflict instead of overwriting global changes.
- Native confirm initially blocked the browser automation transport. Replaced it with the in-page checkbox. Browser verified whole-library counts (106 Fixture + 1 Global-only), but the browser write/reload flow is not accepted yet. Separate real local fixture HTTP checks renamed all 106, merged the remaining 1 and immediately searched all 107 under the final tag, with 0 old-tag matches. No remote user tags were modified.
- 197 tests pass: 9 new Miniflare integration cases and 3 UI regressions, including rollback on a forced row failure, concurrent metadata changes, stale drafts, tombstones, membership preservation, pagination and request coordination.
- No new migrations, secret/env changes, Production writes or PR merge. This module requires the existing ready D1 catalog. Tags are stored on media only; zero-use tags disappear from the list naturally, with no persistent empty tag registry. Standalone global tag deletion is not added in this batch.


## 2026-11-17 download and export

- Added authenticated GET /api/manage/download/:id and POST /api/manage/export. Export validates 1-50 IDs/request with a bounded streamed JSON body, overlays authoritative editable metadata/membership, and emits only explicit safe fields. Missing/tombstoned records are reported; raw KV values, provider references and arbitrary metadata never leave this API. No storage writes.
- Downloads validate original IDs, require existing live metadata, honor block/whitelist restrictions and return octet-stream attachments with sanitized UTF-8 filenames. Management Authorization, cookies and query strings are never forwarded upstream. Preview fetches only the fixed Production public file path without following redirects; other environments read the existing provider, with direct R2 body reads. HTML/JSON source errors are refused and provider failures sanitized. Original URLs and Telegram content are unchanged.
- Added a common download/export panel in details and the selected-item toolbar: original file, ZIP, JSON or CSV. Selection snapshot is frozen on open; active job locks duplicate work, progress/cancellation are supported, and failures never emit a partial ZIP or clear the selection. Download blobs are handed to the browser; final disk-save remains browser-controlled.
- Browser policy: 100 files max/ZIP, 50 MiB/file, 100 MiB aggregate; metadata up to 1000 records in API batches of 50. studio/export-utils.js provides dependency-free STORE ZIP with CRC32/UTF-8 names and ordinal prefixes, bounded body reads, safe names and CSV quoting/formula-prefix mitigation. Multi-batch metadata is not a fixed snapshot under concurrent edits.
- 214 tests passing (17 new API/format/job regressions). ZIP output independently opened and CRC-checked by Python zipfile, including duplicate/Unicode names. Covered auth, deleted/restricted sources, safe headers, credential stripping, internal-field exclusion, latest D1 data, body/ZIP limits, cancellation, failed-file all-or-nothing output and frozen selection.
- Local browser actually saved a 68-byte original PNG, a two-entry ZIP, JSON and CSV from isolated R2 fixtures. Read files from disk afterward: both ZIP entries match the original bytes, CRC passes, JSON tags correct and CSV has 14 columns. Fixture server supports STUDIO_FIXTURE_PORT to avoid older acceptance sessions sharing the default port.
- No migrations, environment/credential changes, real user-tag changes, Production writes, Telegram deletion or PR merge. Use latest successful feature-branch Preview; remote real-media download acceptance is separate from the local fixture checks.


## 2026-11-17 index maintenance

- Owner reports download/export acceptance complete and authorized the next goal. Treat this as owner-reported remote acceptance of that module, separate from local fixture checks.
- Added authenticated GET/POST /api/manage/catalog-sync and an index maintenance panel. Ready catalog is required; uninitialized/legacy modes fail closed. No new migration or env flag.
- GET reports inventory/visible/tombstone counts and live editable/membership rows lacking inventory. It does not claim to audit original storage bytes or all missing KV values.
- POST reads at most 100 KV keys/page, validates pagination and complete media metadata, normalizes whitelist inventory fields, and performs a single D1 batch. Only changed/new inventory documents are written. Failed pages are atomic; retries are idempotent. Only derived inventory changes: authoritative editable documents, versions, tombstones, memberships, original KV values and provider files are untouched.
- UI automatically advances pages after manual start. Pause/cancel and failure retain the last acknowledged cursor; sessionStorage contains bounded cursor/counters only, never auth. Refresh/relogin restores progress on the same origin/tab. Unknown outcomes retry the unconfirmed page; acknowledged changed counts may undercount writes whose response was lost. Per-run guard pauses after 1000 pages; resume is available. No cron/scheduled automation was created.
- KV listing is eventually consistent, not a snapshot. Missing source metadata stops a page instead of silently declaring it repaired. Absent keys are never used to delete inventory or resurrect tombstones. Relational anomalies are reported, not auto-deleted; missing original KV/provider objects still need independent investigation.
- 227 tests pass: 9 new real D1/source integration regressions plus 4 checkpoint/UI regressions. Covered missing discovery, stale source overlays, preserved membership/deletion, changed-only writes, multi-page resume, failed-page rollback, relational diagnostics, unsafe/malformed requests, stalled cursors, auth, uncertain cancellation, refresh checkpoint restoration and secret-free persistence.
- Actual local browser: deliberately left 1 of 109 KV media outside inventory. Initial exact search found 0. Two-page maintenance scanned 109 and added 1 (108 to 109 inventory); exact search then found 1. Refresh/relogin restored completed checkpoint. Full rescan changed 0 records, confirming idempotence. Only disposable local fixtures were written.
- This batch does not run maintenance against real Preview records; deployment and unauthenticated runtime checks are separate. No Production writes, credentials/env changes, original media deletion or PR merge.


## 2026-11-17 private asset details

- Added description (4000 chars), sourceUrl (2048), prompt (8000) to the editable inspector with multiline textareas and prompt copying. Only shown when the existing catalog/D1 setup is ready. New field writes require metadata-D1 mode; legacy field-only clients remain compatible. No KV capacity expansion, new schema or flag.
- Central validator allows plaintext/newlines/model syntax, rejects disallowed control characters and oversized fields. Source is HTTP(S) only, no embedded credentials/whitespace; no URL fetching or automatic AI calls. Optional fields are preserved across all D1 mutation/seed/overlay helpers and unrelated actions. Missing fields in old edit payloads do not clear them; explicit empty strings do.
- Inspector drafts include these fields in dirty checks and version conflicts. Browser acceptance caught an incomplete confirmed-response mapping that cleared new inputs after Save; fixed and added a successful-save UI regression. Independent favorite action preserves the draft and baseline version behavior.
- Both loaded-media and authenticated full-library keyword search include the new fields. Explicit admin JSON/CSV export includes them; CSV appends 3 columns (17 total) without changing previous column order. Public curated catalog remains an explicit whitelist and exposes none of these fields, even for published media. Audited current D1 metadata read/overlay callers: management routes are protected; public catalog retains whitelist output.
- 239 tests pass (12 new): multiline exact preservation, new-field search, old-client/unrelated/global-tag preservation, stale conflicts, public privacy vs explicit admin export, URL/control/length validation, clearing/boundaries, D1 requirement and draft/confirmed-response behavior.
- Actual local browser: saved description/source/multiline prompt including LoRA syntax; favorite preserved unsaved text; refreshed/relogged and located by unique prompt keyword; all fields persisted. Re-saved description without clearing prompt, exported JSON and verified all 3 values from the saved file. All writes used disposable local fixtures, no real Preview media.
- This is private AI asset documentation, not model inference/automatic tagging. No Production data/config changes, public-field expansion, credentials, migrations, provider file changes or PR merge. Remote real-media editing acceptance remains distinct from local acceptance.

- Final review also synchronized toolbar results with the returned display name and private fields before accepting a newer metadata version. Regression prevents a subsequent inspector save from using old prompt text with a fresh version.

- Compatibility boundary: old commit-specific deployments still run older editableMetadata whitelists and can drop these keys when writing. Use the newest Preview; old client payloads against the NEW endpoint are covered and preserve absent fields. No old deployments were disabled in this batch.


## 2026-11-17 large-library rendering

- Owner explicitly prioritized large-library performance and deferred other feature goals. Do not restart drag/drop, recycle bin or production rollout as the next default task.
- Found the main bottleneck: render attached every matched card and rebuilt the full grid. The old 320-node cache could not evict them because all matched IDs were marked visible.
- Added studio/grid-window.js row geometry/navigation helper and main-grid viewport rendering above 200 matched items. Fixed card heights (260/220), two overscan rows, exact spacer geometry, frame-coalesced passive scroll and resize observation. Window scroll does not recalculate tags/filter/sort/statistics.
- Virtual cache bounded by max(96, mounted/focus-retained cards). Selection is still an ID set across the complete loaded result; checkbox updates use the cached filtered list. Focus can stay on one offscreen card; arrow/Home/End navigation reaches all items. Nonvirtual small grids and C hybrid folder filtering remain intact. Search dialog receives content-visibility only, not full DOM virtualization.
- 244 tests passing, including 5 new geometry/navigation cases. Local real browser: same 1504 loaded items, baseline 1504 card nodes vs 16 at measured desktop location; 17 at end including focus retention; narrow layout 11. Exact row heights, full-set selection (1504), independent first/last selection plus successful 2-item favorite, filter clear/restore and native scroll were checked. Temporary viewport restored. See docs/STUDIO_PERFORMANCE.md for evidence and limits.
- Fixture server can seed large sets with STUDIO_FIXTURE_MEDIA_COUNT, now indexes every source page in D1 batches. No auth credentials or schema/config changed in remote environments.
- No server-generated thumbnails/video posters, bandwidth/FPS/heap improvement claim, paid image feature or external image service. Original media paths are preserved. Only local fixture metadata was changed for acceptance; Production/real Preview media and Draft PR merge remain untouched.


## 2026-11-17 Preview download 502 compatibility fix

- Owner reported original-file download returns HTTP 502. Found a deterministic Preview-path defect: fetch used redirect: error, supported by Node fetch but rejected by Workers before any outbound request. Reproduced the TypeError in Miniflare's actual workerd runtime; manual/follow succeeded in the same isolated experiment. Official Request API documents this limitation: https://developers.cloudflare.com/workers/runtime-apis/request/ . This is unrelated to viewport rendering.
- Changed Preview fetch to manual and explicitly reject 3xx without following Location. Preserved fixed upstream origin, credential/cookie/query stripping, source/media checks, no-store attachments and unchanged original URLs. No compatibility-date/flag/env change.
- Added sanitized download error codes, including fetch failure, redirects, source HTTP/content failures, missing/restricted records. Client maps known codes to Chinese messages and never displays raw error bodies, Location, provider URLs or exception text. Unknown/prototype/null responses fall back to safe HTTP feedback.
- Previous tests used local R2 plus Node-level preview fetch mocks, which did not enforce Workers redirect validation. New regression bundles the actual download handler/import graph, runs it inside workerd with real fixture KV and isolated outbound responses, verifies original bytes and rejects a redirect with only one outgoing request and no credentials forwarded. Workspace-only bundler resolver avoids scanning denied host parent paths.
- 248 tests pass (4 new cases across actual-runtime, redirect and client-error regressions). Sampled two existing public original URLs read-only and got 200; this is not proof for every file. Connecting the owner's authenticated Chrome tab timed out twice, so the specific remote authenticated download has not been replayed by the assistant. Do not claim it has.
- No private credentials read/exported, Production config/data changes, original file deletion, redirect destination exposure or Draft PR merge. Use the newest Preview for user retry.


## 2026-11-18 file read reliability hotfix

- Production gallery reported partial image failures after library growth (578 source KV records at inspection). Three sampled file HEAD requests returned 500; the same file with the existing admin preview path returned 200 image/jpeg. This isolates failure to post-fetch metadata handling, not proof of lost Telegram files. Exact remote exception/quota class was unavailable (temporary tail connection failed and was removed).
- Found unconditional KV puts on every ordinary public image view, including HEAD and unchanged/disabled moderation. Removed unchanged writes; HEAD enforces stored block/whitelist rules without moderation or writes. Newly missing metadata initialization and changed verdict persistence failures no longer discard successfully fetched media. A new adult verdict still blocks even if persistence fails. Explicit management writes remain strict.
- Read-triggered moderation preserves complete existing metadata rather than normalizing away tags/private fields. No new caching policy, auth bypass, data migration, deletion, credential or environment change.
- Added five regressions for repeated reads with KV write rejection, missing-record initialization rejection, read-only HEAD with restrictions, full metadata preservation and adult verdict write failure. Full suite: 258 passing. Preview d02c50b7 and Production 267a0a32 both built successfully at 0da2c32; canonical Production confirmed. The same three sampled image HEAD requests changed from 500 to 200 image/jpeg; ordinary GET checks returned 200 and cancelled bodies without reading or saving original content. This verifies sampled HTTP recovery, not every file or complete decoded-image health.


## 2026-11-18 gallery presentation preferences

- Owner approved complete-image/cover switch, thumbnail sizing and compact card details. Added main-grid controls; defaults contain / target width 200 / compact filename. Detailed metadata remains available by checkbox and card title. Display-only preferences persist per origin in localStorage; corrupt or denied storage falls back safely.
- studio/gallery-view.js validates and stores only fit/size/info. No credentials, media data or API calls. Grid rows now derive exact square-media/card heights from resolved CSS columns and the information mode; virtual cache/selection/folder browsing retained.
- Owner requested only 100 synthetic images for UI acceptance. Temporary gallery-only fixture uses 100; no fixture data deployed or stored in remote databases. Browser QA could not connect to the managed local preview route despite successful server startup, so no browser interaction success is claimed.
- Relevant preference/virtual-geometry tests: 7 pass. Full suite: 202 pass, 11 runtime hook/test failures: bundled old workerd aborts because /sys CPU topology is missing (NumPossibleCPUsNoCache -> EPIPE). Earlier Windows full-suite result 258 remains historical. No backend logic/schema/config/real media modification. Publish development Preview only; Production release branch remains pinned.


## 2026-11-18 owner-selected justified layout

- Owner rejected uniform square frames and chose aspect-preserving justified rows. Replaced main-grid CSS/geometry with studio/justified-layout.js, 8px gaps, variable image widths, proportional row heights, and an unfinished final row capped at the target height. No external/CDN dependency or backend/schema change.
- Slider now controls target row height; removed contain/cover mode buttons. Filenames overlay on hover/focus/selection, always visible on touch; optional always-visible information. Persist only size/info, safely reading older preference objects.
- Natural image dimensions update an in-memory ratio map on load and coalesce relayout by animation frame. Unknown ratios temporarily use 1:1; no separate full-library dimension scan or downloads. Row geometry drives virtual viewport, container height and keyboard navigation; selection remains independent. Preserve visible-row anchor on ratio/width changes when the result list is unchanged. Videos retain placeholders.
- Geometry acceptance uses100 mixed-aspect fixtures as requested; 3 new justified-layout regressions cover aspect preservation, no overlap, ordered/full rows, final row, viewport, navigation and extreme ratios. Relevant suite10 passes plus inline JS syntax/diff checks. Browser visual/interaction acceptance remains unverified due managed preview routing failure already documented; do not claim screenshots or live interaction proof. No production branch, credentials, real data or original links changed.
