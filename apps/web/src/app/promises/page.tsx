"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { ApiError, request, type Loan, type User } from "@/lib/api";
import { cachePromiseSummaries, readCachedPromises } from "@/lib/offline";
import { contactOpen } from "@/components/contact-button";

type PromiseItem = Loan & {
  amount: string;
  promise_date: string;
  promise_status: string;
  promise_id: number;
  version: number;
  officer?: string;
};
type Tab = "Due today" | "Upcoming" | "Broken" | "Kept";
const compact = (value: string | number) =>
  `₹${(Number(value) / 100000).toFixed(2)}L`;
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
}).format(new Date());

export default function Promises() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("Due today");
  const [selected, setSelected] = useState<PromiseItem | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reminderText, setReminderText] = useState("");
  const [language, setLanguage] = useState("en");
  const [simulated, setSimulated] = useState(false);
  const [draftEngine, setDraftEngine] = useState("");
  const [history, setHistory] = useState<
    { from: string; to: string; reason: string; time: string }[]
  >([]);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => request<User>("/auth/me"),
  });
  const q = useQuery({
    queryKey: ["promises"],
    queryFn: async () => {
      try {
        const response = await request<PromiseItem[]>(
          me.data?.role === "BRANCH_MANAGER"
            ? "/manager/promises"
            : "/officer/promises",
        );
        if (me.data?.role === "FIELD_OFFICER")
          await cachePromiseSummaries(
            me.data,
            response.map((item) => ({
              id: item.id,
              promise_id: item.promise_id,
              loan_number: item.loan_number,
              borrower: item.borrower,
              dpd: item.dpd,
              amount: item.amount,
              promise_date: item.promise_date,
              promise_status: item.promise_status,
              version: item.version,
            })),
          );
        return response;
      } catch (error) {
        if (
          !(error instanceof ApiError) ||
          !error.network ||
          !me.data ||
          me.data.role !== "FIELD_OFFICER"
        )
          throw error;
        const cached = await readCachedPromises(me.data);
        return cached.map((item) => ({
          ...item,
          legal_name: item.borrower,
          phone: "",
          address: "",
          pincode: "",
          product: "",
          outstanding: "0",
          overdue: "0",
          score: 0,
          band: "MEDIUM",
          reasons: [],
          assignment_version: 1,
          priority_source: "SEEDED" as const,
          officer: undefined,
        }));
      }
    },
    enabled: Boolean(me.data),
  });
  const items = q.data?.filter((item) =>
    tab === "Kept"
      ? item.promise_status === "KEPT"
      : tab === "Broken"
        ? item.promise_status === "BROKEN"
        : tab === "Upcoming"
          ? item.promise_status === "OPEN" && item.promise_date > today
          : item.promise_status === "OPEN" && item.promise_date <= today,
  );
  async function update(action: "cancel" | "mark-kept") {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await request(`/promises/${selected.promise_id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ expected_version: selected.version, reason }),
      });
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["promises"] });
      qc.invalidateQueries({ queryKey: ["loan", String(selected.id)] });
      qc.invalidateQueries({ queryKey: ["manager"] });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update promise.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="officer-shell">
      <header className="mobile-head">
        <Link href="/" className="brand">
          <span className="brand-mark">P</span>pace
        </Link>
        <Link href="/" className="back-link">
          <ArrowLeft size={16} />{" "}
          {me.data?.role === "BRANCH_MANAGER" ? "Overview" : "Queue"}
        </Link>
      </header>
      <main className="promise-wrap">
        <span className="eyebrow">FOLLOW THROUGH</span>
        <h1>Promises</h1>
        <p className="muted">
          Commitments made by the borrowers in your portfolio.
        </p>
        <div className="promise-tabs">
          {(["Due today", "Upcoming", "Broken", "Kept"] as Tab[]).map(
            (name) => (
              <button
                key={name}
                onClick={() => setTab(name)}
                className={tab === name ? "active" : ""}
              >
                {name}
              </button>
            ),
          )}
        </div>
        {q.isLoading ? (
          <div className="surface skeleton" />
        ) : q.isError ? (
          <div className="surface empty">
            <p>Couldn’t load promises.</p>
            <button className="btn" onClick={() => q.refetch()}>
              Try again
            </button>
          </div>
        ) : items?.length ? (
          <div className="promise-list">
            {items.map((p) => (
              <article className="surface promise-card" key={p.promise_id}>
                <span
                  className={`pill ${p.promise_status === "BROKEN" ? "broken" : "medium"}`}
                >
                  {p.promise_status}
                </span>
                <Link href={`/loans/${p.id}`}>
                  <h3>{p.borrower}</h3>
                </Link>
                <span className="muted">
                  {p.loan_number} · {p.dpd} DPD
                  {p.officer ? ` · ${p.officer}` : ""}
                </span>
                <div className="promise-bottom">
                  <b>{compact(p.amount)}</b>
                  <span>
                    {new Date(`${p.promise_date}T00:00:00`).toLocaleDateString(
                      "en-IN",
                      {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        timeZone: "Asia/Kolkata",
                      },
                    )}
                  </span>
                </div>
                <button
                  className="promise-manage"
                  onClick={async () => {
                    setSelected(p);
                    setError("");
                    setReason("");
                    setReminderText("");
                    setSimulated(false);
                    setDraftEngine("");
                    setHistory(
                      await request<
                        {
                          from: string;
                          to: string;
                          reason: string;
                          time: string;
                        }[]
                      >(`/promises/${p.promise_id}/history`).catch(() => []),
                    );
                  }}
                >
                  Manage promise →
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="surface empty">
            <CalendarClock size={22} />
            <h2>
              {tab === "Due today"
                ? "No promises due today"
                : tab === "Broken"
                  ? "No broken promises"
                  : tab === "Kept"
                    ? "No kept promises"
                    : "No upcoming promises"}
            </h2>
            <p className="muted">
              This list will update as borrower commitments change.
            </p>
          </div>
        )}
      </main>
      {selected && (
        <div className="sheet-backdrop" onClick={() => setSelected(null)}>
          <section
            className="outcome-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Manage promise"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="eyebrow">PROMISE LIFECYCLE</span>
            <h2>{selected.borrower}</h2>
            <p className="muted">
              ₹{Number(selected.amount).toLocaleString("en-IN")} due{" "}
              {selected.promise_date} · {selected.promise_status}
            </p>
            <h3>History</h3>
            {history.length ? (
              history.map((entry, i) => (
                <p className="promise-history" key={i}>
                  {entry.from} → {entry.to} · {entry.reason}
                </p>
              ))
            ) : (
              <p className="muted">No prior transitions.</p>
            )}
            <div className="reminder-preview">
              <h3>Reminder preview</h3>
              <div className="sheet-actions">
                <select
                  aria-label="Reminder language"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                >
                  <option value="en">English</option>
                  <option value="hi">हिन्दी</option>
                </select>
                <button
                  className="btn secondary"
                  onClick={async () => {
                    setError("");
                    try {
                      setReminderText(
                        (
                          await request<{
                            message: string;
                            drafting_engine: string;
                          }>(
                            `/promises/${selected.promise_id}/reminder?language=${language}`,
                          )
                        ).message,
                      );
                      setDraftEngine(
                        "Approved template · human review required",
                      );
                    } catch (cause) {
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "Could not preview reminder.",
                      );
                    }
                  }}
                >
                  Preview
                </button>
              </div>
              {reminderText && (
                <>
                  <p>{reminderText}</p>
                  <small>{draftEngine}</small>
                  {me.data?.role === "FIELD_OFFICER" && (
                    <button
                      className="btn secondary"
                      disabled={busy || !contactOpen()}
                      title={
                        !contactOpen() ? "Contact allowed 8 AM–7 PM" : undefined
                      }
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          await request(
                            `/promises/${selected.promise_id}/send-reminder?language=${language}`,
                            { method: "POST" },
                          );
                          setSimulated(true);
                        } catch (cause) {
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "Could not simulate delivery.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Simulate delivery
                    </button>
                  )}
                  {simulated && (
                    <small role="status">
                      Simulated delivery logged. No real message was sent.
                    </small>
                  )}
                </>
              )}
            </div>
            <label>
              Reason for update
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Enter a clear reason"
              />
            </label>
            {error && (
              <p className="import-alert" role="alert">
                {error}
              </p>
            )}
            <div className="sheet-actions">
              <button
                className="btn secondary"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
              {selected.promise_status === "OPEN" && (
                <button
                  className="btn secondary"
                  disabled={busy || reason.trim().length < 5}
                  onClick={() => update("cancel")}
                >
                  Cancel promise
                </button>
              )}
              {["OPEN", "BROKEN"].includes(selected.promise_status) && (
                <button
                  className="btn"
                  disabled={busy || reason.trim().length < 5}
                  onClick={() => update("mark-kept")}
                >
                  Mark kept (mock)
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {me.data?.role !== "BRANCH_MANAGER" && (
        <nav className="bottom-nav">
          <Link href="/">
            <span>Today</span>
          </Link>
          <Link className="selected" href="/promises">
            <span>Promises</span>
          </Link>
          <Link href="/activity">
            <span>Activity</span>
          </Link>
          <Link href="/profile">
            <span>Profile</span>
          </Link>
        </nav>
      )}
    </div>
  );
}
