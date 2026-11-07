import Dexie, { type EntityTable } from "dexie";
import type {
  CachedLoan,
  CachedPromise,
  OutboxEvent,
  SyncMetadata,
} from "./types";

class PaceOfflineDatabase extends Dexie {
  cachedLoans!: EntityTable<CachedLoan, "key">;
  cachedPromises!: EntityTable<CachedPromise, "key">;
  outbox!: EntityTable<OutboxEvent, "client_event_id">;
  syncMetadata!: EntityTable<SyncMetadata, "key">;
  constructor() {
    super("pace-officer");
    this.version(1).stores({ queue: "id,cachedAt" });
    this.version(2).stores({
      queue: null,
      cachedLoans: "key,[userId+branchId],cachedAt,id",
      outbox:
        "client_event_id,[userId+branchId],sync_status,queued_at,entity_id",
      syncMetadata: "key,[userId+branchId]",
    });
    this.version(3).stores({
      cachedLoans: "key,[userId+branchId],cachedAt,id",
      cachedPromises: "key,[userId+branchId],cachedAt,promise_id",
      outbox:
        "client_event_id,[userId+branchId],sync_status,queued_at,entity_id",
      syncMetadata: "key,[userId+branchId]",
    });
  }
}
export const offlineDb =
  typeof window === "undefined" ? null : new PaceOfflineDatabase();
export const scopeKey = (userId: number, branchId: number) =>
  `${userId}:${branchId}`;
