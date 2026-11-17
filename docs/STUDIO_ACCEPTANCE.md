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
