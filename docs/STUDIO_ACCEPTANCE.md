# Studio acceptance — 2026-11-17

## Reproduce the isolated local environment

Run npm ci, npm test, then npm run test:studio:serve. Open http://127.0.0.1:8083/studio/.
The fixture-only login is defined in test/e2e/studio-server.js; never use real account credentials here.
This server imports real Pages handlers and uses all three migrations in an ephemeral Miniflare database, in-memory fixture KV and a one-pixel fixture image. Stop the server to discard all fixture changes.

## Browser steps observed passing

1. Log in; one fixture media item appears.
2. Open details, edit display name/category, add a tag and save. Saved feedback appears.
3. Rename the new tag inline and remove the original tag. Favorite the item, then save the details draft. The tag draft survives the favorite action.
4. Reload details. Name/category/tag/favorite remain as saved.
5. Create a root album; assign the item from details.
6. Refresh the full page and log in again. Album, name, tag, category and favorite remain.
7. Create a child album and move the media into it.
8. Open the parent: no direct media, one child folder. Enable Include descendant media: exactly one media item appears.

## Additional automated coverage

Real D1 integration tests cover concurrent independent metadata edits, stale-version rejection, primary read-after-write behavior in Miniflare, immediate catalog publish/unpublish, legacy name/favorite compatibility, tombstone visibility and membership cleanup after simulated KV deletion failure, same-origin DELETE requirements and retry cleanup. Unit tests cover retained drafts, duplicate saves and missing admin credentials.

## Limits

This browser session did not exercise production, Telegram uploads, real multi-region networking, media deletion via the UI, or automated browser test execution in CI. Browser checks were performed through the UI; npm test is the repeatable API/logic/SQL suite. A standalone automated Studio browser suite is still future work.


## Deployed Preview recovery checks

After restoring the owner-authorized Preview credential and redeploying, real HTTP checks against Preview 2e6f11f5 passed: no credentials 401; intentionally wrong password 401; valid account list request 200, 9 records all carrying D1 metadata versions; single-media read 200. These were read-only checks, not a browser or production mutation test. No credential values were recorded here.


## Local authenticated upload acceptance

The local fixture server now also uses ephemeral Miniflare R2. Logged in with its fixture account, chose a 68-byte PNG through the file chooser and observed: successful uploads 1, failures 0, a newly visible media card, and both favorite/AI counts remaining 0. No remote Telegram calls or user media were used. Automated coverage also reads the stored R2 bytes and immediately edits the uploaded record through the D1 metadata API.


## Indexed full-library search — 2026-11-17

- Complete local suite: 185 passing. Seven real Miniflare D1 search regressions cover unloaded records, tied timestamp/name pagination, filter-bound cursors, direct/recursive folders, exact tags/types/favorites, immediate metadata updates/tombstones, literal wildcard handling and invalid/unready requests. Two UI request regressions cover stale responses, selection preservation, frozen pagination filters and metadata version preservation.
- Local browser fixture: 107 media records; main view initially loads 100. Full-library search found the unloaded target. Opened its details, saved a new tag and immediately found it by exact tag. Loaded two search pages, selected 50 plus one item from the next page, and returned to the bulk toolbar with 51 selected. All writes affected local fixtures only.
- Isolated Preview migration 0004 applied; all 9 current KV media keys covered by derived inventory. Editable metadata row/version/deletion aggregates unchanged; foreign_key_check empty. Catalog readiness enabled only after those checks. No environment variables or credentials changed.
- Full authenticated remote search/browser acceptance remains distinct from local fixture acceptance. Deployment build/unauthenticated HTTP verification must be reported separately. Remote Preview uploads remain intentionally disabled.
- Tag suggestions are capped at 500, with exact typed input supported. Concurrent edits may change matches between pages; keyset pagination is not a whole-session snapshot.


## Global tags — 2026-11-17

- Owner accepted existing remote full-library search, editable details and cross-page bulk workflows and requested the next module. This is owner-reported acceptance.
- Complete local suite: 197 passing. Global tag integration covers distinct counts/current overlays, complete rename, explicit merge/deduplication, atomic rollback, tombstones, folder preservation, version conflicts, concurrent additive edits, 100-tag pagination, wildcard literals and request/auth validation. UI tests cover invalid/unconfirmed operations, duplicate submit protection, failed drafts, uncertain-write refresh, stale responses and frozen pagination queries.
- Browser saw global counts of 106 Fixture media plus 1 Global-only across 107 disposable samples. An old native confirm blocked browser automation; confirmation is now an in-page checkbox. Browser write-to-refresh acceptance of the revised control is still outstanding.
- Separate HTTP acceptance through real local management middleware/handlers: renamed Fixture on 106 records, merged Global-only into Organized on 1, final usage count 107, immediate exact-tag search 107 and old-tag search 0. Local fixture credentials/storage only. No real Preview or Production tags changed.
- Preview deployment and unauthenticated HTTP checks are reported separately; successful build does not replace authenticated global tag browser acceptance.


## Download and export — 2026-11-17

- Complete suite: 214 passing. New checks cover authoritative whitelisted export fields/folder paths, no raw/provider data, tombstones, original byte attachments, filename/header safety, block/whitelist behavior, fixed Preview upstream/credential stripping, sanitized failures, request limits and inherited management auth.
- Format tests independently unpack ZIP bytes with Python zipfile and verify CRC, Unicode names and ordinal collision prevention. CSV tests cover quotes/newlines/array boundaries and formula-prefix mitigation. Streaming/job tests cover undeclared overflow, cancellation, empty/error responses, no partial ZIP, preserved selection and request batching.
- Actual local browser acceptance on isolated R2 fixtures: detail action opens single-file mode; original PNG saved; ZIP saved; JSON and CSV saved. Then selected two full-library results and downloaded through the bulk toolbar as one ZIP.
- Disk readback: original 68 bytes; two ZIP entries both byte-identical to the original and CRC valid; exported JSON current tag Download; CSV parsed as header plus one record, each 14 columns. No real Telegram credentials or media were used.
- Limits are explicit product policy, not provider limits: 100 files and 100 MiB total per ZIP; 50 MiB per file (also single-file mode); metadata at most 1000 items, fetched in batches of 50. Remote authenticated real-media download still needs user acceptance; build/unauthenticated runtime checks are separate.


## Index maintenance — 2026-11-17

- Owner accepted download/export and requested the next module.
- Complete local suite: 227 passing, including 13 new maintenance/checkpoint regressions. Failure injection verifies no partial page writes; stale KV cannot overwrite D1 edits, versions, tombstones or folder ownership. Missing metadata and stalled cursors fail instead of skipping data.
- Browser fixture on a separate local server: 109 KV media, initially only 108 inventory rows. Exact search for Index repair fixture initially 0. Manual scan completed 2 pages/109 media and added 1 inventory record. Current index 109; exact search 1. Reload/relogin preserved the completed checkpoint; repeat full scan changed 0.
- Checkpoint interruption and uncertain-outcome retries were exercised in UI regression tests; the browser acceptance covered completed-checkpoint restore, not a forced network outage mid-page.
- No real Preview user records were used for scan writes. Tool is manually started, then paginates automatically; no scheduled job. It requires the already-ready catalog. KV eventual consistency means repeated scans may be needed for concurrent external writes; absence never triggers deletion.
