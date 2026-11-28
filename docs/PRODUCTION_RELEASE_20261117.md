# Production release — 2026-11-17

Owner authorized deploying the completed Media Studio to the existing Production project. This authorizes the Production rollout below; it does not merge Draft PR #1. Development remains feature/media-studio-v1.

## Prepared resources

- Production Pages project: my-image-bed; previous canonical deployment 60d176b1-929c-4538-8aad-ff7e738ea49c, commit eb04e075c971fe5bbe1d03283e537595d0b83325.
- Existing Production KV unchanged: 8a9b05daf9384496887d063292832345.
- Verified original KV backup, stored only inside the same Cloudflare account and not bound to a website: 6f21d4feb8424b22920201bb729ec88e. Nine values plus metadata verified; raw values empty. Snapshot manifest records original keys/expirations. No backup content is in this repository.
- NEW Production D1: media-studio-production-20261117, 28f78f0b-b3b4-4c0e-a5c7-d7382d93aa7d. Schema migrations 0001–0004 applied, foreign key check clean. Preview D1/KV remain separate.
- Source inventory: 9 Production media, no Studio folder keys, no tags, all 9 liked, none explicitly aiPublished. Seed from PRODUCTION records only; Preview test folders/publication choices are not imported. Public catalog will list 0 until owner explicitly publishes media.

## Cutover procedure

1. Commit the tested write-pause guard to the development branch. Tests: 253 passing. Guard is inert unless MEDIA_STUDIO_CUTOVER_READ_ONLY=true.
2. Create a fixed release branch from the exact tested commit; set the project's Production branch to that release branch. Keep main and Draft PR unmerged so future feature pushes remain Preview-only.
3. Patch only the new Production config keys: dedicated D1 binding; metadata flag false initially; upload mode admin; cutover read-only true. Never resend masked secret values. A reversible Preview marker PATCH verified env-vars partial-map preservation and deletion via null; no secrets were sent in those PATCH bodies.
4. Deploy the fixed release in paused mode. It blocks /upload, modern writes and legacy mutating GET admin routes, while preserving read/login/download routes. Read-triggered putMetadata does not persist during pause. Existing file paths keep serving. Confirm read-only header on /api/config and 503 on upload.
5. While paused, compare all source KV keys, values and metadata with the backup. If changed, take a new complete snapshot without discarding the first. Import editable whitelist and derived inventory into the NEW D1; preserve original IDs, liked flags and explicit AI state. Verify coverage, values, foreign keys, then set ready last.
6. Enable MEDIA_STUDIO_METADATA_D1=true, remove the cutover flag, retain UPLOAD_AUTH_MODE=admin and redeploy the same fixed release. Verify canonical Production /studio/, configuration/storage readiness, management auth, anonymous upload refusal, curated catalog and existing public files. Do not upload/delete real Telegram files for acceptance.

## Rollback boundary

Before D1 edits exist, the previous Production deployment is the emergency rollback target; original KV backup remains available and no media is deleted. After ANY authoritative D1 edit, keep the D1 adapter/binding/flag active: do not blindly roll back to old KV-only code. Prefer a new release preserving that adapter, or a separately reviewed data reconciliation during another write pause.

Old commit-specific deployments cannot be retroactively given the new guard. Do not use old admin/upload URLs during migration. Recheck the source after cutover and preserve D1 edits if any old-client KV changes appear. Backups and both databases remain in place; no destructive cleanup is part of this release.

## Runtime acceptance

Actual deployment and migration verification are recorded below. Production credentials are preserved; never include their values in this document or output.

## Executed cutover and verification

- Release commit: 3a45de3b7599e254e85711c24343881609a76333. Production branch release/media-studio-v1-20261117; main and Draft PR not merged. Development remains feature/media-studio-v1.
- Read-only stage: 9f1fb277-585c-402b-8b03-416fb05dfd91 succeeded. Actual canonical checks: config 200, read-only header 1, storage ready true, anonymous upload 503, management 401. Existing secrets were never present in PATCH bodies.
- Frozen source matched the verified backup exactly: 9 values and metadata records. Imported 9 editable documents and 9 inventory rows; folders/memberships 0; liked 9; aiPublished 0; versions 0; FK violations 0; ready set last. No direct source KV writes by migration.
- Final Production deployment: beaf8f25-1dee-4483-bb0a-89eff44583c2, success and canonical. Metadata-D1 true, UPLOAD_AUTH_MODE admin, cutover flag removed. API/config checks storage ready true, uploadRequiresAuth true, no read-only header. Studio and helper assets available; anonymous upload/management 401. Public curated catalog 200 with 0 published items as intended.
- Final Cloudflare data audit: original source values preserved; 9 metadata rows, 9 inventory rows, liked 9, publication 0, no edits yet at verification, FK clean. Preview data/bindings remain separate.
- No authenticated user mutation, real Telegram upload or deletion was performed for release verification. Full original-media readback was rejected by automatic review due to possible private-media export; no content readback is claimed as evidence. The safer HEAD-only link check timed out, so original-image HTTP/content health remains unverified in this release journal. Original IDs/values were verified, not image bytes.
- Fixed release branch prevents later feature/documentation pushes from automatically changing Production. Keep D1 authoritative on rollback after edits. Backup namespace remains unbound to the site.


## 2026-11-18 gallery image HTTP 500 hotfix

- Feature commit 0da2c32b31248c017baa815dc660d7cd7c7a12ea; 258 tests pass. Preview d02c50b7-4200-4ca4-ac6d-1b666489f609 and Production 267a0a32-b4bf-4bb2-a488-9d7953aeb4bf succeeded. Production release branch advanced by lease; main and Draft PR remain unmerged.
- Public file reads previously wrote KV even when no moderation result changed. A rejected write could discard a successfully fetched image and produce HTTP 500. Removed redundant writes and isolated read-through/verdict persistence failures. HEAD remains read-only; stored blocks/whitelist and newly detected adult verdicts still apply. Full stored metadata is preserved when a changed verdict is saved.
- At inspection source KV had 578 records. Three screenshot-matched samples returned 500 before release, with one existing admin-path control returning 200. Following release, the same three HEAD samples returned 200 image/jpeg. Ordinary GET checks also returned 200; bodies cancelled, no raw media exported or decoded. Exact remote quota/error message was not obtained; temporary failed tail session removed.
- No data migration/deletion, credentials, bindings or environment changes. This is a code-only reliability patch.


## 2026-11-18 owner-authorized gallery/theme/wallpaper release

- Source 7469c21cad5fcbdff933bffa7123830eb22466bb (successful Preview a9c64103), released to the existing fixed Production branch by expected-SHA lease. Production deployment ca1e1b4a-2aae-4f4c-aa67-122fd3858c37 succeeded and is canonical. Main and Draft PR remain unmerged.
- Includes original-ratio justified image rows, warm paper/sage theme and native library image/video wallpapers. Changes since prior Production are confined to Studio frontend, QA helpers/tests and documents. No backend function/schema changes, migration, KV/D1 edits, credential changes or binding changes. Existing D1 authority and admin-only upload remain enabled.
- Re-ran 16 focused preference/layout/wallpaper regressions, all passed. Canonical Studio and four changed supporting assets return200. Config returns200 with uploadRequiresAuth true and no read-only header; anonymous management/list and upload both401. Actual video codec/playback is still dependent on browser and selected file; no new real-media mutation or browser-authenticated playback claim.
- Code rollback target is previous successful Production 267a0a32-b4bf-4bb2-a488-9d7953aeb4bf / 0da2c32, which preserves the same D1-capable backend. Preserve Production data and bindings on rollback.
- Wallpaper settings persist only per browser/origin; Preview preferences do not automatically transfer to Production. Development documentation commits remain Preview-only.


## 2026-11-18 approved ordered-list/upload-feedback hotfix

- Owner explicitly approved this hotfix after automatic review required separate approval. Released769abc437d60181328572b0c062b946c4783f863 (Preview7442d2fe) to fixed Production branch; deployment29e9a519-4231-4a5e-8447-22e2cd293d62 succeeded and is canonical. Main/Draft PR remain unmerged.
- Main listing now opts into full-library D1 ordering with keyset pagination; legacy no-order KV cursors preserved. Upload failures retain staged diagnostics and original recovery link only after provider confirmation. Sticky progress appears immediately, result precedes list refresh;120-second abort reports unknown outcome.
-33 related tests passed. Actual Production page200 contains all changed controls/logic; anonymous ordered listing/upload401; config200 ready/auth true. KV8a9b05daf9384496887d063292832345, D1 28f78f0b-b3b4-4c0e-a5c7-d7382d93aa7d, metadata flag and admin upload unchanged. No credential/migration/plan change or real-media mutation.
- Exact original afternoon registration failure remains unconfirmed; the previous screenshot files have not been automatically recovered. Do not equate deployment with successful authenticated end-to-end upload. Billing lookup restriction was not bypassed and is unrelated to this explicit release approval.
- Rollback target ca1e1b4a-2aae-4f4c-aa67-122fd3858c37 /7469c21 retains D1-capable backend; do not roll data or disable D1.
