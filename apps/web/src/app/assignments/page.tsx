"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { request, type Loan, type User } from "@/lib/api";

type Assigned = Loan & {
  officer_id: number | null;
  officer: string | null;
  version: number;
  assignment_source: string;
  eligible_officer_ids: number[];
};
type Officer = {
  id: number;
  name: string;
  assigned: number;
  outstanding: string;
  high_priority: number;
  active: boolean;
};
export default function Assignments() {
  const qc = useQueryClient();
  const [loan, setLoan] = useState<Assigned | null>(null);
  const [officer, setOfficer] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => request<User>("/auth/me"),
  });
  const assignments = useQuery({
    queryKey: ["assignments"],
    queryFn: () => request<Assigned[]>("/manager/assignments"),
    enabled: me.data?.role === "BRANCH_MANAGER",
  });
  const officers = useQuery({
    queryKey: ["officers"],
    queryFn: () => request<Officer[]>("/manager/officers"),
    enabled: me.data?.role === "BRANCH_MANAGER",
  });
  async function save() {
    if (!loan) return;
    setBusy(true);
    setError("");
    try {
      await request("/manager/assignments/reassign", {
        method: "POST",
        body: JSON.stringify({
          loan_id: loan.id,
          officer_id: Number(officer),
          expected_version: loan.version,
          reason,
        }),
      });
      setDone(`${loan.borrower} reassigned.`);
      setLoan(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["officers"] });
      qc.invalidateQueries({ queryKey: ["manager"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reassign.");
    } finally {
      setBusy(false);
    }
  }
  if (me.isLoading)
    return (
      <main className="import-page">
        <div className="surface skeleton" />
      </main>
    );
  if (me.isError || me.data?.role !== "BRANCH_MANAGER")
    return <main className="import-page">Branch manager access required.</main>;
  return (
    <main className="import-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} /> Branch overview
      </Link>
      <header className="import-header">
        <div>
          <span className="eyebrow">FIELD ALLOCATION</span>
          <h1>Assignments</h1>
          <p className="muted">
            Automatic allocation respects pincode coverage. Overrides require a
            reason.
          </p>
        </div>
        <Link href="/imports" className="btn secondary">
          Import accounts
        </Link>
      </header>
      {done && (
        <p className="import-success" role="status">
          {done}
        </p>
      )}
      {assignments.isLoading ? (
        <div className="surface skeleton" />
      ) : assignments.isError ? (
        <div className="surface empty">
          Could not load assignments.
          <button className="btn" onClick={() => assignments.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <section className="surface import-preview">
          <div className="panel-head">
            <div>
              <span className="eyebrow">TODAY’S ROUTES</span>
              <h2>{assignments.data?.length ?? 0} accounts</h2>
            </div>
            <span className="pill broken">
              {assignments.data?.filter((a) => !a.officer_id).length ?? 0} need
              review
            </span>
          </div>
          <div className="assignment-list">
            {assignments.data?.map((a) => (
              <div className="assignment-row" key={a.id}>
                <div>
                  <b>{a.borrower}</b>
                  <small>
                    {a.loan_number} · {a.pincode} · {a.dpd} DPD
                  </small>
                </div>
                <strong>
                  ₹{Number(a.outstanding).toLocaleString("en-IN")}
                </strong>
                <span className={a.officer ? "" : "assignment-unassigned"}>
                  {a.officer ?? "UNASSIGNED — NEEDS REVIEW"}
                </span>
                <button
                  className="btn secondary"
                  onClick={() => {
                    setLoan(a);
                    setOfficer(a.officer_id ? String(a.officer_id) : "");
                    setError("");
                  }}
                >
                  {a.officer ? "Reassign" : "Assign"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {loan && (
        <div className="sheet-backdrop" onClick={() => setLoan(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Reassign account"
            className="outcome-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="eyebrow">MANAGER OVERRIDE</span>
            <h2>{loan.borrower}</h2>
            <p className="muted">
              Current: {loan.officer ?? "Unassigned"}. A new assignment updates
              officer queues immediately.
            </p>
            <label>
              Officer
              <select
                value={officer}
                onChange={(event) => setOfficer(event.target.value)}
              >
                <option value="">Choose officer</option>
                {officers.data
                  ?.filter((o) => loan.eligible_officer_ids.includes(o.id))
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} · {o.assigned} accounts
                    </option>
                  ))}
              </select>
              {!loan.eligible_officer_ids.length && (
                <small>
                  No active officer covers {loan.pincode}. This account remains
                  unassigned for review.
                </small>
              )}
            </label>
            <label>
              Reason
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why is this reassignment needed?"
              />
            </label>
            {error && (
              <p className="import-alert" role="alert">
                <CircleAlert size={16} />
                {error}
              </p>
            )}
            <div className="sheet-actions">
              <button className="btn secondary" onClick={() => setLoan(null)}>
                Cancel
              </button>
              <button
                className="btn"
                disabled={busy || !officer || reason.trim().length < 5}
                onClick={save}
              >
                {busy ? "Saving…" : "Confirm reassignment"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
