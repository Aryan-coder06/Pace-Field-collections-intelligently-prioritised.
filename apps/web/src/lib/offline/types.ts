import type { Loan } from "@/lib/api";

export type SyncStatus =
  "PENDING" | "SYNCING" | "SYNCED" | "CONFLICT" | "REJECTED";
export type OfflineScope = { userId: number; branchId: number };
export type CachedLoan = Pick<
  Loan,
  | "id"
  | "loan_number"
  | "borrower"
  | "product"
  | "outstanding"
  | "overdue"
  | "dpd"
  | "score"
  | "band"
  | "reasons"
  | "promise_status"
  | "touched"
  | "last_activity"
  | "next_action"
  | "assignment_version"
  | "priority_source"
  | "priority_model_version"
  | "override_rank"
  | "override_reason"
> & { key: string; userId: number; branchId: number; cachedAt: string };
export type CachedPromise = {
  key: string;
  userId: number;
  branchId: number;
  cachedAt: string;
  id: number;
  promise_id: number;
  loan_number: string;
  borrower: string;
  dpd: number;
  amount: string;
  promise_date: string;
  promise_status: string;
  version: number;
};
export type OutcomePayload = {
  outcome_type: "PAID" | "PROMISE_TO_PAY" | "NOT_REACHABLE" | "DISPUTE";
  notes: string;
  reported_amount: string | null;
  promised_amount: string | null;
  promise_date: string | null;
  latitude?: number;
  longitude?: number;
  location_status: string;
};
export type OutboxEvent = {
  client_event_id: string;
  event_type: "COLLECTION_OUTCOME";
  entity_id: string;
  userId: number;
  branchId: number;
  payload: OutcomePayload;
  client_occurred_at: string;
  queued_at: string;
  base_version: number;
  retry_count: number;
  sync_status: SyncStatus;
  last_error?: string;
  server_received_at?: string;
};
export type SyncMetadata = {
  key: string;
  userId: number;
  branchId: number;
  lastSuccessfulSyncAt?: string;
  lastAttemptedSyncAt?: string;
  lastError?: string;
  cacheAsOf?: string;
};
export type SyncResult = {
  client_event_id: string;
  status: "ACKNOWLEDGED" | "CONFLICT" | "REJECTED";
  duplicate: boolean;
  server_received_at?: string;
  error?: { code: string; message: string } | null;
  result: Record<string, unknown>;
};
