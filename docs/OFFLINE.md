# Offline foundation

The officer client has a PWA manifest and a Dexie database boundary for later cached reads and queued device events. Stage 1 does not claim offline synchronization: mutations remain server-backed. Future sync events should carry stable device event IDs and server idempotency, with explicit conflict states and audit events.
