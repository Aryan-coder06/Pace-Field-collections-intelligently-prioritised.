import type { User } from "@/lib/api";
import { offlineDb, scopeKey } from "./database";
export async function discardTerminalEvent(clientEventId: string) {
  if (!offlineDb) return;
  const event = await offlineDb.outbox.get(clientEventId);
  if (event && ["SYNCED", "CONFLICT", "REJECTED"].includes(event.sync_status))
    await offlineDb.outbox.delete(clientEventId);
}

export async function retryConflict(clientEventId: string, user: User) {
  if (!offlineDb) throw new Error("Offline storage is unavailable.");
  const event = await offlineDb.outbox.get(clientEventId);
  if (!event || event.sync_status !== "CONFLICT")
    throw new Error("Only conflicted events can be retried.");
  const loan = await offlineDb.cachedLoans.get(
    `${scopeKey(user.id, user.branch_id)}:${event.entity_id}`,
  );
  if (!loan)
    throw new Error("This account is no longer in your verified queue.");
  if (loan.assignment_version === event.base_version)
    throw new Error("Refresh the queue before retrying this conflict.");
  const replacement = {
    ...event,
    client_event_id: crypto.randomUUID(),
    base_version: loan.assignment_version,
    queued_at: new Date().toISOString(),
    retry_count: 0,
    sync_status: "PENDING" as const,
    last_error: undefined,
    server_received_at: undefined,
  };
  await offlineDb.outbox.add(replacement);
  return replacement;
}
