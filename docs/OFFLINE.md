# Offline foundation

The officer client has a PWA manifest and a Dexie database boundary for later cached reads and queued device events. Stage 2 mutations remain server-backed and are never presented as synchronized before the API accepts them.

Outcome requests now carry a client-generated UUID, device occurrence time, server receipt time, location status and coordinates where available. The API processes repeated UUIDs idempotently. Stage 3 can place this request envelope in an IndexedDB outbox and replay it without changing the server contract; explicit pending, failed and conflict states still need to be implemented.
