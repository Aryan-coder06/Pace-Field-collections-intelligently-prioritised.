# Offline-first architecture

Pace uses an explicit Dexie persistence boundary rather than service-worker caching for authenticated domain data.

## Device data

`cachedLoans` stores only the officer's scoped assignment summary: loan identity, borrower display name, financial summary, priority explanation, promise status, assignment version and cache timestamp. `cachedPromises` stores limited promise summaries. Phone numbers, addresses, access tokens and authentication responses are not persisted.

`outbox` stores client UUIDs, event payloads, device occurrence times, assignment base versions, retries and one of `PENDING`, `SYNCING`, `SYNCED`, `CONFLICT` or `REJECTED`. Events are never removed before a server acknowledgement. Cache keys include authenticated user and branch identity.

## Connectivity and replay

Pace checks `/health` with a timeout instead of trusting `navigator.onLine`. Online submissions and offline submissions use the same durable path: persist locally first, then call `POST /sync/events`. The server derives actor and branch scope from the secure cookie session, checks the current assignment and base version, and records an append-only receipt with a per-event result.

- `ACKNOWLEDGED`: the transactional outcome projection and receipt were committed.
- `CONFLICT`: the assignment changed after the device cached it; no outcome was applied.
- `REJECTED`: validation or authorization failed; no outcome was applied.
- Network failure: the event returns to `PENDING` with retry metadata.

Reconnection, app focus and a 15-second foreground check trigger controlled replay. A valid online session is required before replay. Pace does not claim universal background synchronization support.

## PWA boundary

The service worker caches the login shell and versioned static assets only. It does not runtime-cache authenticated API responses. A waiting worker produces an explicit update prompt. Dexie remains the source of offline domain projections and outbox state.

## Privacy limitations

IndexedDB is not an encrypted vault. Logout removes cached portfolio and promise projections, while isolated unsynchronized events remain to prevent silent work loss. Shared-device residual storage risk must be addressed with managed devices, OS-level encryption and remote-wipe policy in a production deployment.
