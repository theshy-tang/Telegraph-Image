# Current release status

2026-11-17 owner-authorized Production release: https://my-image-bed.pages.dev/studio/ . Production pinned to release/media-studio-v1-20261117 at 3a45de3; feature/media-studio-v1 stays development, main and Draft PR #1 unmerged. Original Production KV 8a9b05daf9384496887d063292832345 retained; dedicated Production D1 28f78f0b-b3b4-4c0e-a5c7-d7382d93aa7d enabled. Nine records/favorites migrated, AI publication count zero. Upload mode admin; write pause removed. See docs/PRODUCTION_RELEASE_20261117.md.

This rollout has been authorized and executed. The historical checklist below remains a runbook; see the dated release journal for actual results.

# Production rollout preparation — not authorization to execute

Production is still the main branch, its original img_url KV, and Telegram storage. No production D1 database or upload-auth configuration was created or changed in this work. Draft PR #1 must remain unmerged until the owner explicitly approves release.

## Available upload protection

| Setting | Behavior |
| --- | --- |
| UPLOAD_AUTH_MODE unset or legacy | Preserve existing clients: use UPLOAD_BASIC_USER/PASS if present; otherwise /upload stays public |
| UPLOAD_AUTH_MODE=admin | /upload requires BASIC_USER/PASS; missing or partial admin config fails closed |
| UPLOAD_AUTH_MODE=dedicated | /upload requires UPLOAD_BASIC_USER/PASS; missing or partial credentials fail closed |
| Unknown mode | Reject uploads; never silently become public |

POST /api/manage/upload always requires same-origin admin authentication, independently of dedicated /upload credentials. Studio uses this route and sends its current in-memory login header. Native clients may omit Origin on /upload; browser requests carrying a foreign Origin are rejected in protected modes. Do not hard-code credentials in a static client.

Studio uploads use a 50 MiB per-file application policy by default. STUDIO_MAX_UPLOAD_BYTES can set a positive integer up to 100 MiB; providers or the platform may impose lower limits. The streaming multipart body is capped at the file policy plus 64 KiB overhead. Empty files, invalid filenames and unsupported media extensions including SVG are rejected. This is an extension/size policy, not file-content verification or malware scanning. Legacy /upload document support remains unchanged.

## Required before requesting Production release approval

1. Inventory current original KV keys, values and metadata; short links, clients, moderation behavior and upload authentication requirements. Keep backup contents in an owner-approved secure location, never in this repository.
2. Rehearse migrations 0001–0003 using a separate test database and representative data. Confirm no cycles/over-depth/duplicates before installing guards; confirm item counts, membership, tags/favorites and AI state. Preview imports are not a production backup.
3. Prepare a NEW, dedicated production D1 database. Never bind the current Preview database to Production. Creation/binding and production data writes require owner approval first.
4. Define a controlled write-pause/cutover window so old deployments and old admin clients cannot keep writing KV while D1 becomes authoritative. Migrate editable fields and folder membership, preserving original IDs and raw KV values. Reconcile final changes before enabling MEDIA_STUDIO_METADATA_D1.
5. Agree on upload mode and test each existing client. Anonymous clients will receive 401 if protection is enabled; update those clients or explicitly retire them. Enabling the option in code alone does not secure the current Production deployment.
6. Prepare explicit AI publication choices. Favorites must never be promoted automatically; the current production liked-based catalog cannot be assumed fixed until the new code is released and verified.
7. Confirm automated tests and authenticated Preview acceptance, including old admin compatibility, original /file links, upload, immediate editing, publish/unpublish, conflict handling and failed deletion retry.
8. Present the exact release commit, production bindings/flags, credential setup process, data reconciliation results and rollback procedure for owner approval. Only then merge/release/configure Production.

## Rollback design

Reverting the code or disabling the metadata flag is not sufficient after D1 writes. Either retain the D1 adapter while reverting UI changes, or, during a controlled write pause, export and reconcile authoritative D1 editable fields back into the original KV records under separately approved production access. Preserve the existing KV value, original file ID, moderation/provider fields and permanent file URLs; do not use a helper that replaces the raw value with an empty string. Preserve tombstones and short-link deletion semantics. Never delete Telegram files as part of rollback. Verify read-after-write behavior before reopening writes.

## Still outstanding

Owner-approved production backup/migration/cutover, actual Telegram transfer verification, independent rate limiting and content verification, full unattended browser CI, and production release approval. This document is a reviewable runbook, not a claim that these operations were performed.

## Remaining operational work

Independent rate limiting/content verification, unattended browser CI and an actual new Telegram upload smoke test remain future work. No existing Telegram files were deleted.
