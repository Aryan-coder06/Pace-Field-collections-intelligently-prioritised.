import type { User } from "@/lib/api";
import { request } from "@/lib/api";
import { offlineDb, scopeKey } from "./database";
import { checkApiConnectivity } from "./network-state";
import type { OutboxEvent, SyncResult } from "./types";

let running: Promise<SyncResult[]> | null = null;
async function performSync(user: User): Promise<SyncResult[]> {
  const db = offlineDb;
  if (!db || !(await checkApiConnectivity())) return [];
  const events = await db.outbox
    .where("[userId+branchId]")
    .equals([user.id, user.branch_id])
    .filter(
      (event) =>
        event.sync_status === "PENDING" || event.sync_status === "SYNCING",
    )
    .sortBy("queued_at");
  if (!events.length) return [];
  const attemptedAt = new Date().toISOString();
  await db.outbox.bulkUpdate(
    events.map((event) => ({
      key: event.client_event_id,
      changes: { sync_status: "SYNCING" as const },
    })),
  );
  try {
    const response = await request<{
      results: SyncResult[];
      server_time: string;
    }>("/sync/events", {
      method: "POST",
      body: JSON.stringify({
        events: events.map((event) => ({
          client_event_id: event.client_event_id,
          event_type: event.event_type,
          entity_id: event.entity_id,
          client_occurred_at: event.client_occurred_at,
          base_version: event.base_version,
          payload: event.payload,
        })),
      }),
    });
    await db.transaction("rw", db.outbox, db.syncMetadata, async () => {
      for (const result of response.results)
        await db.outbox.update(result.client_event_id, {
          sync_status:
            result.status === "ACKNOWLEDGED" ? "SYNCED" : result.status,
          server_received_at: result.server_received_at,
          last_error: result.error?.message,
        });
      await db.syncMetadata.put({
        key: scopeKey(user.id, user.branch_id),
        userId: user.id,
        branchId: user.branch_id,
        lastAttemptedSyncAt: attemptedAt,
        lastSuccessfulSyncAt: response.server_time,
      });
    });
    return response.results;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Synchronization failed.";
    const updates: { key: string; changes: Partial<OutboxEvent> }[] =
      events.map((event) => ({
        key: event.client_event_id,
        changes: {
          sync_status: "PENDING",
          retry_count: event.retry_count + 1,
          last_error: message,
        },
      }));
    await db.outbox.bulkUpdate(updates);
    await db.syncMetadata.put({
      key: scopeKey(user.id, user.branch_id),
      userId: user.id,
      branchId: user.branch_id,
      lastAttemptedSyncAt: attemptedAt,
      lastError: message,
    });
    return [];
  }
}
export function syncNow(user: User) {
  if (!running)
    running = performSync(user).finally(() => {
      running = null;
    });
  return running;
}
