# Codex working instructions — Telegraph-Image / Media Studio

Read `docs/CODEX_HANDOFF.md` **before making any change**, then `studio/README.md` and the relevant source files. This repository contains a LIVE production image-hosting service and an IN-PROGRESS Media Studio feature. Treat the two environments separately.

## Mission

Continue building **Media Studio**, a personal + Shopify media asset manager on Cloudflare Pages with Telegram image/video storage, Workers KV for legacy image records, and Cloudflare D1 for preview album trees/membership. Work in **`feature/media-studio-v1`**; its draft pull request is #1, targeting `main`. Do **not** merge or deploy to production until the owner explicitly authorizes it.

## Non-negotiable safety rules

- Do not modify or rebind the production `img_url` KV namespace, change the production Pages deployment configuration, delete Telegram content, rotate credentials, expose secrets, or replace image IDs/URLs without explicit approval.
- Production URL: `https://my-image-bed.pages.dev`. Preview URL changes on each deployment; inspect the latest successful deployment on the feature branch. Never confuse a commit-specific preview with production.
- Preview uses an **isolated** KV namespace and the separate D1 database `media-studio-preview`; production currently has **no D1 binding**. The preview copy does not include Telegram upload credentials. Upload is disabled in the preview UI by design.
- Existing production `/upload` may be publicly accessible because upload-specific Basic Auth variables were previously removed. Treat this as an outstanding security issue; propose and test protection without breaking existing upload clients, then request authorization before production changes.
- Do not commit, print, log, paste into prompts, or re-create Cloudflare/Telegram tokens, passwords, API keys, or any unredacted secrets. Keep runtime credentials in secure environment settings.
- Existing media links `/file/<id>` are long-lived: preserve them through every migration. `liked` is personal favorite; `aiPublished` is the deliberate opt-in to public AI asset catalogs. NEVER make favorites public by default.
- Preview media thumbnails are proxied via `functions/api/studio/media/[id].js` from the production public file URL. Avoid exposing new private content through this mechanism.
- D1 folder records and media membership are the source of truth **when the D1 binding is present**; otherwise the existing KV implementation is a backwards-compatibility fallback. Do not silently make half of an operation write KV while another half reads D1.
- Avoid destructive changes, untested migrations, unnecessary major framework rewrites, and premature PR merge. Preserve current user data.

## Project workflow

1. Read the handoff and identify current branch/commit/deployment and test environment. Inspect source rather than assuming the handoff is current.
2. Prefer small, verified changes with a concise explanation of the problem and expected behavior. Maintain compatibility with existing Pages Functions and the original Telegraph-Image UI.
3. Run `npm install` or `npm ci` as appropriate, `npm test`, and focused tests. Validate frontend behavior and D1 read-after-write across create/rename/reparent/delete and media moves. If tests cannot run, explicitly say so.
4. Verify feature branch Cloudflare **Preview** deploy status; never equate a successful build with successful end-user behavior.
5. Ask before any changes to production environment, private credentials, paid plans, file deletion, or merging the draft PR.
6. Keep `docs/CODEX_HANDOFF.md` up to date as architecture, known issues, and handoff state evolve. Do not commit generated credentials or local state.

## User-facing preferences

The owner communicates in Chinese and expects you to **make real, verifiable implementation progress**, not only give instructions. The target UI is a polished, friendly professional media-management workspace. Folder browsing uses **C / hybrid Explorer mode**: actual collapsible nested tree; chevron toggles disclosure separately from opening; default only direct media in current folder; an explicit switch includes descendant media. Keep album path breadcrumbs, multi-select, bulk operations, and clear progress/error feedback.

## Key locations

- Main UI: `studio/index.html`
- Studio usage + QA checklist: `studio/README.md`
- Folder API: `functions/api/manage/folders.js`, `functions/api/manage/folders/[id].js`
- Media list + bulk: `functions/api/manage/list.js`, `functions/api/manage/bulk.js`
- Data helpers: `functions/utils/studio-folders.js`, `functions/utils/studio-d1.js`
- D1 schema: `migrations/0001_media_studio_folders_d1.sql`
- Auth middleware: `functions/api/manage/_middleware.js`
- AI catalog: `functions/api/shopify-assets.js`
- Tests: `test/media-studio*.test.js`

**First task:** Audit the deployed preview D1 migration end to end (especially create/delete across refreshes, folder/media membership consistency, and API error handling), document any remaining defects and fix them on the feature branch. The owner has experienced stale album creation/deletion when KV was used, so correctness comes before more cosmetic features.
