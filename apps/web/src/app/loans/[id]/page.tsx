"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, MapPin, ShieldCheck } from "lucide-react";
import { ContactButton } from "@/components/contact-button";
import { OutcomeSheet } from "@/components/outcome-sheet";
import { request, type Loan } from "@/lib/api";
const money = (n: string | number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(n));
const compact = (n: string | number) => `₹${(Number(n) / 100000).toFixed(2)}L`;
type LoanDetails = Loan & {
  history: { occurred_at: string; event: string; officer: string }[];
  promises: { amount: string; promise_date: string; status: string }[];
};
export default function LoanDetail() {
  const [showOutcome, setShowOutcome] = useState(false);
  const { id } = useParams<{ id: string }>();
  const q = useQuery({
    queryKey: ["loan", id],
    queryFn: () => request<LoanDetails>(`/loans/${id}`),
  });
  if (q.isLoading)
    return <div className="detail-loading">Loading account…</div>;
  if (q.isError)
    return (
      <main className="detail-wrap">
        <Link href="/" className="back-link">
          <ArrowLeft size={16} /> Today’s queue
        </Link>
        <div className="surface detail-error">
          <h2>Couldn’t open this account.</h2>
          <p>{q.error.message}</p>
          <button className="btn" onClick={() => q.refetch()}>
            Try again
          </button>
        </div>
      </main>
    );
  const l = q.data!;
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
      <main className="detail-wrap">
        <Link href="/" className="back-link desktop-back">
          <ArrowLeft size={16} /> Back to today
        </Link>
        <div className="detail-top">
          <div>
            <span className="eyebrow">ACCOUNT · {l.loan_number}</span>
            <h1>{l.borrower}</h1>
            <p className="muted">
              {l.product} <span className="dot-sep">·</span> {l.pincode} Indore
            </p>
          </div>
          <span className={`pill ${l.band.toLowerCase()}`}>
            {l.band} PRIORITY
          </span>
        </div>
        <section className="detail-hero surface">
          <div>
            <span className="eyebrow">OUTSTANDING AMOUNT</span>
            <strong>{compact(l.outstanding)}</strong>
            <span className="muted">Overdue {money(l.overdue)}</span>
          </div>
          <div className="detail-dpd">
            <b>{l.dpd}</b>
            <span>days past due</span>
          </div>
        </section>
        <div className="detail-columns">
          <section className="surface panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">PACE PRIORITY</span>
                <h2>Why this account</h2>
              </div>
              <span className="score">
                {l.score}
                <small> / 100</small>
              </span>
            </div>
            <ul className="reason-list">
              {l.reasons.map((r) => (
                <li key={r}>
                  <ShieldCheck size={16} />
                  {r}
                </li>
              ))}
            </ul>
            <p className="muted small-note">
              Seeded demonstration score · recommendation support only
            </p>
          </section>
          <section className="surface panel">
            <span className="eyebrow">RECENT HISTORY</span>
            <h2>Account activity</h2>
            {l.history.length ? (
              <div className="timeline">
                {l.history.map((event, i) => (
                  <div key={i}>
                    <i />
                    <span>
                      <b>
                        {new Date(event.occurred_at).toLocaleDateString(
                          "en-IN",
                          {
                            month: "short",
                            day: "numeric",
                            timeZone: "Asia/Kolkata",
                          },
                        )}{" "}
                        · {event.event}
                      </b>
                      <small>{event.officer}</small>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small-note">
                No activity has been logged for this account.
              </p>
            )}
          </section>
        </div>
        <section className="surface contact-panel">
          <div>
            <span className="eyebrow">BORROWER CONTACT</span>
            <b>{l.phone}</b>
            <span className="muted">{l.address}</span>
          </div>
          <div className="contact-actions">
            <ContactButton loanId={l.id} borrower={l.borrower} />
            <a
              className="btn secondary"
              href={`https://maps.google.com/?q=${encodeURIComponent(`${l.address} ${l.pincode} Indore`)}`}
              target="_blank"
              rel="noreferrer"
            >
              <MapPin size={16} /> Route
            </a>
          </div>
        </section>
        <button
          className="btn outcome-btn"
          onClick={() => setShowOutcome(true)}
        >
          Log outcome <ArrowUpRight size={16} />
        </button>
        {showOutcome && (
          <OutcomeSheet
            loanId={l.id}
            borrower={l.borrower}
            onClose={() => setShowOutcome(false)}
          />
        )}
      </main>
    </div>
  );
}
