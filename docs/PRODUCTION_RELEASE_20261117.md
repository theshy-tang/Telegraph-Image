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

Not yet recorded in this preparatory commit. Deployment and migration results will be appended after actual verification. Production credentials are preserved; never include their values in this document or output.
