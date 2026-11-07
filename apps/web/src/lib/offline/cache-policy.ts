import type { Loan, User } from "@/lib/api";
import { offlineDb, scopeKey } from "./database";
import type { CachedLoan, CachedPromise } from "./types";

export async function cacheOfficerQueue(user: User, loans: Loan[]) {
  const db = offlineDb;
  if (!db) return;
  const cachedAt = new Date().toISOString();
  await db.transaction("rw", db.cachedLoans, db.syncMetadata, async () => {
    await db.cachedLoans
      .where("[userId+branchId]")
      .equals([user.id, user.branch_id])
      .delete();
    const rows: CachedLoan[] = loans.map((loan) => ({
      key: `${scopeKey(user.id, user.branch_id)}:${loan.id}`,
      userId: user.id,
      branchId: user.branch_id,
      cachedAt,
      id: loan.id,
      loan_number: loan.loan_number,
      borrower: loan.borrower,
      product: loan.product,
      outstanding: loan.outstanding,
      overdue: loan.overdue,
      dpd: loan.dpd,
      score: loan.score,
      band: loan.band,
      reasons: loan.reasons,
      promise_status: loan.promise_status,
      touched: loan.touched,
      last_activity: loan.last_activity,
      next_action: loan.next_action,
      assignment_version: loan.assignment_version,
      priority_source: loan.priority_source,
      priority_model_version: loan.priority_model_version,
      override_rank: loan.override_rank,
      override_reason: loan.override_reason,
    }));
    await db.cachedLoans.bulkPut(rows);
    await db.syncMetadata.put({
      key: scopeKey(user.id, user.branch_id),
      userId: user.id,
      branchId: user.branch_id,
      cacheAsOf: cachedAt,
    });
  });
}

export async function readCachedQueue(user: User): Promise<Loan[]> {
  if (!offlineDb) return [];
  const rows = await offlineDb.cachedLoans
    .where("[userId+branchId]")
    .equals([user.id, user.branch_id])
    .toArray();
  return rows.map(
    ({
      key: _key,
      userId: _user,
      branchId: _branch,
      cachedAt: _at,
      ...loan
    }) => ({
      ...loan,
      legal_name: loan.borrower,
      phone: "",
      address: "",
      pincode: "",
    }),
  );
}

export async function clearProtectedCache(user: User) {
  if (!offlineDb) return;
  await offlineDb.cachedLoans
    .where("[userId+branchId]")
    .equals([user.id, user.branch_id])
    .delete();
  await offlineDb.cachedPromises
    .where("[userId+branchId]")
    .equals([user.id, user.branch_id])
    .delete();
}

export async function cachePromiseSummaries(
  user: User,
  promises: Omit<CachedPromise, "key" | "userId" | "branchId" | "cachedAt">[],
) {
  const db = offlineDb;
  if (!db) return;
  const cachedAt = new Date().toISOString();
  await db.transaction("rw", db.cachedPromises, async () => {
    await db.cachedPromises
      .where("[userId+branchId]")
      .equals([user.id, user.branch_id])
      .delete();
    await db.cachedPromises.bulkPut(
      promises.map((promise) => ({
        ...promise,
        key: `${scopeKey(user.id, user.branch_id)}:${promise.promise_id}`,
        userId: user.id,
        branchId: user.branch_id,
        cachedAt,
      })),
    );
  });
}

export async function readCachedPromises(user: User) {
  if (!offlineDb) return [];
  return offlineDb.cachedPromises
    .where("[userId+branchId]")
    .equals([user.id, user.branch_id])
    .toArray();
}
