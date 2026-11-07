import type { User } from "@/lib/api";
import { offlineDb } from "./database";
import type { OutboxEvent, OutcomePayload } from "./types";

export async function enqueueOutcome(
  user: User,
  loanId: number,
  assignmentVersion: number,
  payload: OutcomePayload,
  clientEventId = crypto.randomUUID(),
) {
  if (!offlineDb)
    throw new Error("Offline storage is unavailable in this browser.");
  const event: OutboxEvent = {
    client_event_id: clientEventId,
    event_type: "COLLECTION_OUTCOME",
    entity_id: String(loanId),
    userId: user.id,
    branchId: user.branch_id,
    payload,
    client_occurred_at: new Date().toISOString(),
    queued_at: new Date().toISOString(),
    base_version: assignmentVersion,
    retry_count: 0,
    sync_status: "PENDING",
  };
  await offlineDb.outbox.add(event);
  return event;
}

export async function pendingCount(user: User) {
  if (!offlineDb) return 0;
  return offlineDb.outbox
    .where("[userId+branchId]")
    .equals([user.id, user.branch_id])
    .filter(
      (event) =>
        event.sync_status === "PENDING" || event.sync_status === "SYNCING",
    )
    .count();
}

export async function listOutbox(user: User) {
  if (!offlineDb) return [];
  return offlineDb.outbox
    .where("[userId+branchId]")
    .equals([user.id, user.branch_id])
    .reverse()
    .sortBy("queued_at");
}
