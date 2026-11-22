# Consistent diary storage

The `LIVE` Durable Object binding handles diary storage, Android sessions, account deletion and the shared AI quota. It reads a week of diary entries in a single request and imports populated legacy days from KV when needed. Empty reads create no diary records. Edits merge against the caller's baseline, preserving unrelated meals, water increments and pill marks. New KV day values contain only an activity marker for aggregate statistics.

Deleting an account revokes sessions before cleanup and advances the account generation. Requests from the previous generation cannot write data, and subsequent accounts skip legacy diary imports. Large deletions resume in batches through Durable Object alarms.

Deploy with the checked-in wrangler.toml. Its existing v1 migration already creates the Live class; do not create another migration for an existing class. No remote deployment is performed by the code patch.

A deployment that previously used only the dashboard and omitted LIVE must add the binding before publishing this version. Keep KV DB for profiles and legacy imports. Do not roll back to a KV-only worker after new writes: the old worker cannot see durable diary changes. Export/migrate durable days before any such rollback.

Tests: `node --test test/day-storage.test.js`; full bot scenarios: `npm test`.
