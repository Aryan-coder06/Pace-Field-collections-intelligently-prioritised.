"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock3 } from "lucide-react";
import { request, type User } from "@/lib/api";
type Event = { time: string; officer: string; borrower: string; event: string };
export default function ActivityPage() {
  const q = useQuery({
    queryKey: ["my-activity"],
    queryFn: async () => {
      const me = await request<User>("/auth/me");
      return request<Event[]>(
        me.role === "FIELD_OFFICER"
          ? "/officer/recent-activity"
          : "/manager/recent-activity",
      );
    },
  });
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
        <span className="eyebrow">FIELD LOG</span>
        <h1>Activity</h1>
        <p className="muted">
          A record of recent field activity in your workspace.
        </p>
        {q.isLoading ? (
          <div className="surface skeleton" />
        ) : q.isError ? (
          <div className="surface empty">
            <p>Couldn’t load activity.</p>
            <button className="btn" onClick={() => q.refetch()}>
              Try again
            </button>
          </div>
        ) : (
          q.data!.map((e, i) => (
            <div className="surface activity-card" key={i}>
              <Clock3 size={17} />
              <span>
                <b>{e.event}</b>
                <small>
                  {e.borrower} · {e.officer}
                </small>
              </span>
              <time>
                {new Date(e.time).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          ))
        )}
      </main>
      <nav className="bottom-nav">
        <Link href="/">
          <span>Today</span>
        </Link>
        <Link href="/promises">
          <span>Promises</span>
        </Link>
        <Link className="selected" href="/activity">
          <span>Activity</span>
        </Link>
        <Link href="/profile">
          <span>Profile</span>
        </Link>
      </nav>
    </div>
  );
}
