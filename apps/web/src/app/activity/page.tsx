"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock3 } from "lucide-react";
import { request, type User } from "@/lib/api";
import {
  discardTerminalEvent,
  cacheOfficerQueue,
  listOutbox,
  retryConflict,
  syncNow,
} from "@/lib/offline";
type Event = {
  time: string;
  officer: string;
  borrower: string;
  event: string;
  audit_id?: number;
  location_status?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};
export default function ActivityPage() {
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ["my-activity"],
    queryFn: async () => {
      const me =
        client.getQueryData<User>(["me"]) ?? (await request<User>("/auth/me"));
      const events = await request<Event[]>(
        me.role === "FIELD_OFFICER"
          ? "/officer/recent-activity"
          : "/manager/recent-activity",
      ).catch(() => []);
      return {
        events,
        outbox: me.role === "FIELD_OFFICER" ? await listOutbox(me) : [],
      };
    },
  });
  const user = client.getQueryData<User>(["me"]);
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
          <>
            {q
              .data!.outbox.filter((event) => event.sync_status !== "SYNCED")
              .map((event) => (
                <div
                  className={`surface activity-card local-event ${event.sync_status.toLowerCase()}`}
                  key={event.client_event_id}
                >
                  <Clock3 size={17} />
                  <span>
                    <b>{event.payload.outcome_type.replaceAll("_", " ")}</b>
                    <small>
                      Device event · {event.sync_status}
                      {event.last_error ? ` · ${event.last_error}` : ""}
                    </small>
                    <span className="local-event-actions">
                      {event.sync_status === "CONFLICT" && user && (
                        <button
                          onClick={async () => {
                            const latest = await request<{
                              items: import("@/lib/api").Loan[];
                            }>("/officer/today");
                            await cacheOfficerQueue(user, latest.items);
                            await retryConflict(event.client_event_id, user);
                            await syncNow(user);
                            await q.refetch();
                          }}
                        >
                          Retry with refreshed assignment
                        </button>
                      )}
                      {(event.sync_status === "CONFLICT" ||
                        event.sync_status === "REJECTED") && (
                        <button
                          onClick={async () => {
                            await discardTerminalEvent(event.client_event_id);
                            await q.refetch();
                          }}
                        >
                          Discard device copy
                        </button>
                      )}
                    </span>
                  </span>
                  <time>
                    {new Date(event.queued_at).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
            {q.data!.events.map((e, i) => (
              <div className="surface activity-card" key={i}>
                <Clock3 size={17} />
                <span>
                  <b>{e.event}</b>
                  <small>
                    {e.borrower} · {e.officer} · Audit #{e.audit_id ?? "—"}
                  </small>
                  {e.location_status && (
                    <small>
                      Location: {e.location_status}
                      {e.latitude != null && e.longitude != null && (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            href={`https://maps.google.com/?q=${e.latitude},${e.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View map
                          </a>
                        </>
                      )}
                    </small>
                  )}
                </span>
                <time>
                  {new Date(e.time).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            ))}
          </>
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
