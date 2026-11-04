"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { request, type Loan } from "@/lib/api";

type PromiseItem = Loan & {
  amount: string;
  promise_date: string;
  promise_status: string;
  promise_id: number;
};
type Tab = "Due today" | "Upcoming" | "Broken";
const compact = (value: string | number) =>
  `₹${(Number(value) / 100000).toFixed(2)}L`;
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
}).format(new Date());

export default function Promises() {
  const [tab, setTab] = useState<Tab>("Due today");
  const q = useQuery({
    queryKey: ["promises"],
    queryFn: () => request<PromiseItem[]>("/officer/promises"),
  });
  const items = q.data?.filter((item) =>
    tab === "Broken"
      ? item.promise_status === "BROKEN"
      : tab === "Upcoming"
        ? item.promise_status === "OPEN" && item.promise_date > today
        : item.promise_status === "OPEN" && item.promise_date <= today,
  );
  return (
    <div className="officer-shell">
      <header className="mobile-head">
        <Link href="/" className="brand">
          <span className="brand-mark">P</span>pace
        </Link>
        <Link href="/" className="back-link">
          <ArrowLeft size={16} /> Queue
        </Link>
      </header>
      <main className="promise-wrap">
        <span className="eyebrow">FOLLOW THROUGH</span>
        <h1>Promises</h1>
        <p className="muted">
          Commitments made by the borrowers in your portfolio.
        </p>
        <div className="promise-tabs">
          {(["Due today", "Upcoming", "Broken"] as Tab[]).map((name) => (
            <button
              key={name}
              onClick={() => setTab(name)}
              className={tab === name ? "active" : ""}
            >
              {name}
            </button>
          ))}
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
              <Link
                href={`/loans/${p.id}`}
                className="surface promise-card"
                key={p.promise_id}
              >
                <span
                  className={`pill ${p.promise_status === "BROKEN" ? "broken" : "medium"}`}
                >
                  {p.promise_status}
                </span>
                <h3>{p.borrower}</h3>
                <span className="muted">
                  {p.loan_number} · {p.dpd} DPD
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
              </Link>
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
                  : "No upcoming promises"}
            </h2>
            <p className="muted">
              This list will update as borrower commitments change.
            </p>
          </div>
        )}
      </main>
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
    </div>
  );
}
