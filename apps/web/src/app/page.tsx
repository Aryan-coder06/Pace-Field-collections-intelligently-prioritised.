"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  ContactRound,
  MapPin,
  Phone,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { request, type Loan, type User } from "@/lib/api";
import { useEffect, useState, useSyncExternalStore } from "react";

const inr = (value: string | number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
const compact = (value: string | number) => {
  const n = Number(value);
  return n >= 10000000
    ? `₹${(n / 10000000).toFixed(2)}Cr`
    : `₹${(n / 100000).toFixed(1)}L`;
};
const businessDate = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
}).format(new Date());
function subscribeToConnection(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}
const getConnectionState = () => navigator.onLine;
const getServerConnectionState = () => true;
function ErrorBox({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="surface" style={{ padding: 24 }}>
      <strong>We couldn’t load this view.</strong>
      <p className="muted">{message}</p>
      <button className="btn" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
export default function Home() {
  const router = useRouter();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => request<User>("/auth/me"),
    retry: false,
  });
  useEffect(() => {
    if (me.isError) router.replace("/login");
  }, [me.isError, router]);
  if (me.isLoading) return <main className="loading">PACE</main>;
  if (!me.data) return null;
  return me.data.role === "FIELD_OFFICER" ? (
    <Officer user={me.data} />
  ) : (
    <Manager user={me.data} />
  );
}
function Officer({ user }: { user: User }) {
  const router = useRouter();
  const q = useQuery({
    queryKey: ["today"],
    queryFn: () =>
      request<{
        accounts: number;
        outstanding_total: string;
        completed: number;
        items: Loan[];
      }>("/officer/today"),
  });
  const [active, setActive] = useState("Today");
  const online = useSyncExternalStore(
    subscribeToConnection,
    getConnectionState,
    getServerConnectionState,
  );
  return (
    <div className="officer-shell">
      <header className="mobile-head">
        <Link href="/" className="brand">
          <span className="brand-mark">P</span>pace
        </Link>
        <span className={`online ${online ? "" : "offline"}`}>
          <i /> {online ? "Online" : "Offline"}
        </span>
        <button
          className="avatar"
          aria-label="Profile"
          onClick={async () => {
            await request("/auth/logout", { method: "POST" });
            router.replace("/login");
          }}
        >
          {user.name
            .split(" ")
            .map((x) => x[0])
            .join("")}
        </button>
      </header>
      <main className="officer-main">
        <div className="greeting">
          <div>
            <p className="eyebrow">
              {businessDate.toLocaleUpperCase("en-IN")}{" "}
              <span className={`sync ${online ? "" : "offline"}`}>
                <i /> {online ? "CONNECTED" : "NO CONNECTION"}
              </span>
            </p>
            <h1>Good morning, {user.name.split(" ")[0]}</h1>
            <p className="muted">
              Your route is ready. Start with the accounts that need you most.
            </p>
          </div>
          <div className="day-chip">
            <CalendarDays size={16} /> My day
          </div>
        </div>
        {q.isLoading ? (
          <div className="skeleton-list">
            {[1, 2, 3].map((i) => (
              <div className="surface skeleton" key={i} />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorBox message={q.error.message} retry={() => q.refetch()} />
        ) : (
          <>
            <section className="summary surface">
              <div>
                <span className="eyebrow">TODAY’S PORTFOLIO</span>
                <strong>
                  {q.data!.accounts} <small>accounts</small>
                </strong>
              </div>
              <div className="summary-divider" />
              <div>
                <span className="eyebrow">TOTAL OUTSTANDING</span>
                <strong>{compact(q.data!.outstanding_total)}</strong>
              </div>
              <div className="progress-wrap">
                <div className="progress-top">
                  <span>Route progress</span>
                  <b>
                    {q.data!.completed} / {q.data!.accounts}
                  </b>
                </div>
                <div className="progress">
                  <i
                    style={{
                      width: `${q.data!.accounts ? (100 * q.data!.completed) / q.data!.accounts : 0}%`,
                    }}
                  />
                </div>
              </div>
            </section>
            <div className="queue-heading">
              <div>
                <span className="eyebrow">YOUR QUEUE</span>
                <h2>Prioritised for today</h2>
              </div>
              <span className="queue-count">
                {q.data!.items.length} accounts
              </span>
            </div>
            <div className="queue">
              {q.data!.items.map((loan, i) => (
                <article className="loan-card surface" key={loan.id}>
                  <div className="rank">{String(i + 1).padStart(2, "0")}</div>
                  <div className="loan-content">
                    <div className="loan-title">
                      <Link href={`/loans/${loan.id}`} className="loan-name">
                        <h3>{loan.borrower}</h3>
                        <span className="loan-number">
                          {loan.loan_number} · {loan.product}
                        </span>
                      </Link>
                      <span className={`pill ${loan.band.toLowerCase()}`}>
                        {loan.band} PRIORITY
                      </span>
                    </div>
                    <div className="loan-metrics">
                      <div>
                        <span>Outstanding</span>
                        <b className="tabular">{compact(loan.outstanding)}</b>
                      </div>
                      <div>
                        <span>Overdue</span>
                        <b className="tabular">{inr(loan.overdue)}</b>
                      </div>
                      <div className="dpd">
                        <b>{loan.dpd}</b>
                        <span>DPD</span>
                      </div>
                    </div>
                    <div className="reason-line">
                      <ShieldCheck size={14} />
                      {loan.reasons.slice(0, 2).join(" · ")}
                    </div>
                    <div className="card-actions">
                      <a
                        className="card-action"
                        href={`tel:${loan.phone}`}
                        aria-label={`Call ${loan.borrower}`}
                      >
                        <Phone size={16} /> Call
                      </a>
                      <a
                        className="card-action"
                        href={`https://maps.google.com/?q=${encodeURIComponent(`${loan.address} ${loan.pincode} Indore`)}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Route to ${loan.borrower}`}
                      >
                        <MapPin size={16} /> Route
                      </a>
                      <Link
                        href={`/loans/${loan.id}`}
                        className="card-chevron"
                        aria-label={`Open ${loan.borrower} account`}
                      >
                        <ChevronRight size={18} />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {q.data!.items.length === 0 && (
              <div className="surface empty">
                <Check size={22} />
                <h2>You’re clear for today.</h2>
                <p className="muted">
                  There are no accounts assigned to your queue yet.
                </p>
              </div>
            )}
          </>
        )}
      </main>
      <nav className="bottom-nav">
        {[
          ["Today", CalendarDays, "/"],
          ["Promises", WalletCards, "/promises"],
          ["Activity", Activity, "/activity"],
          ["Profile", ContactRound, "/profile"],
        ].map(([label, Icon, href]) => (
          <Link
            href={href as string}
            className={active === label ? "selected" : ""}
            key={label as string}
            onClick={() => setActive(label as string)}
          >
            <Icon size={20} />
            <span>{label as string}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
function Manager({ user }: { user: User }) {
  const [tab, setTab] = useState("Overview");
  const today = businessDate;
  const router = useRouter();
  const overview = useQuery({
    queryKey: ["manager"],
    queryFn: () =>
      request<{
        branch: string;
        accounts: number;
        overdue_total: string;
        dpd_1_30: number;
        broken_promises: number;
        activity_today: number;
        officers: number;
        trend: { month: string; rate: number }[];
      }>("/manager/overview"),
  });
  const officers = useQuery({
    queryKey: ["officers"],
    queryFn: () =>
      request<
        {
          id: number;
          name: string;
          assigned: number;
          outstanding: string;
          high_priority: number;
          active: boolean;
        }[]
      >("/manager/officers"),
  });
  const activity = useQuery({
    queryKey: ["activity"],
    queryFn: () =>
      request<
        { time: string; officer: string; borrower: string; event: string }[]
      >("/manager/recent-activity"),
  });
  const nav = [
    ["Overview", Building2],
    ["Officers", ContactRound],
    ["Recent activity", Activity],
  ] as const;
  return (
    <div className="manager-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">P</span>pace
        </Link>
        <div className="branch-select">
          <span className="branch-icon">
            <Building2 size={17} />
          </span>
          <span>
            <b>Indore Branch</b>
            <small>Branch workspace</small>
          </span>
          <ChevronRight size={15} />
        </div>
        <span className="side-label">WORKSPACE</span>
        <nav>
          {nav.map(([label, Icon]) => (
            <a
              key={label}
              href={
                label === "Overview"
                  ? "#overview"
                  : label === "Officers"
                    ? "#officers"
                    : "#activity"
              }
              className={`nav-item ${tab === label ? "active" : ""}`}
              onClick={() => setTab(label)}
            >
              <Icon size={17} />
              {label}
            </a>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="user-chip">
            <span className="avatar">
              {user.name
                .split(" ")
                .map((x) => x[0])
                .join("")}
            </span>
            <span>
              <b>{user.name}</b>
              <small>Branch manager</small>
            </span>
            <button
              aria-label="Sign out"
              onClick={async () => {
                await request("/auth/logout", { method: "POST" });
                router.replace("/login");
              }}
            >
              ↗
            </button>
          </div>
          <div className="secure-note">
            <ShieldCheck size={14} /> Branch data is access controlled
          </div>
        </div>
      </aside>
      <main className="manager-main">
        <header className="manager-header" id="overview">
          <div>
            <p className="eyebrow">BRANCH OPERATIONS</p>
            <h1>Good morning, {user.name.split(" ")[0]}</h1>
            <p className="muted">
              {today} <span className="dot-sep">·</span> Indore Branch
            </p>
          </div>
          <button className="btn secondary" onClick={() => overview.refetch()}>
            <Activity size={16} /> Refresh data
          </button>
        </header>
        {overview.isLoading ? (
          <div className="manager-skeleton">
            <div />
            <div />
            <div />
          </div>
        ) : overview.isError ? (
          <ErrorBox
            message={overview.error.message}
            retry={() => overview.refetch()}
          />
        ) : (
          <>
            <section className="manager-kpis">
              <div className="kpi feature">
                <span className="eyebrow">OVERDUE PORTFOLIO</span>
                <strong>{compact(overview.data!.overdue_total)}</strong>
                <span className="muted">
                  Across {overview.data!.accounts} active accounts
                </span>
              </div>
              <div className="kpi">
                <span className="eyebrow">1–30 DPD ACCOUNTS</span>
                <strong>{overview.data!.dpd_1_30}</strong>
                <span className="muted">Early intervention window</span>
              </div>
              <div className="kpi">
                <span className="eyebrow">BROKEN PROMISES</span>
                <strong className="warn-number">
                  {overview.data!.broken_promises}
                </strong>
                <span className="muted">Need follow-up</span>
              </div>
              <div className="kpi">
                <span className="eyebrow">FIELD ACTIVITY TODAY</span>
                <strong>
                  {overview.data!.activity_today}
                  <small> events</small>
                </strong>
                <span className="muted">
                  Across {overview.data!.officers} officers
                </span>
              </div>
            </section>
            <div className="manager-grid">
              <section className="surface panel trend-panel">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">PORTFOLIO HEALTH</span>
                    <h2>Roll-rate trend</h2>
                  </div>
                  <span className="trend-badge">
                    ↓ 5 pts <small>since June</small>
                  </span>
                </div>
                <div className="chart">
                  {overview.data!.trend.map((item, i) => (
                    <div className="chart-col" key={item.month}>
                      <span className="chart-val">{item.rate}%</span>
                      <div className="chart-track">
                        <i style={{ height: `${item.rate * 4}px` }} />
                      </div>
                      <span className="muted">{item.month}</span>
                      {i === overview.data!.trend.length - 1 && (
                        <span className="chart-now">NOW</span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="chart-foot">
                  Indicative seeded preview · formal roll-rate reporting arrives
                  in a later workflow stage
                </p>
              </section>
              <section className="surface panel exception-panel">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">NEEDS ATTENTION</span>
                    <h2>Operational exceptions</h2>
                  </div>
                  <span className="exception-count">
                    {overview.data!.broken_promises}
                  </span>
                </div>
                <div className="exception-row">
                  <span className="exception-mark">!</span>
                  <span>
                    <b>Broken promises</b>
                    <small>Follow up on missed commitments</small>
                  </span>
                  <ArrowUpRight size={16} />
                </div>
                <div className="exception-row">
                  <span className="exception-mark amber">◷</span>
                  <span>
                    <b>Accounts nearing 30 DPD</b>
                    <small>Review early intervention cases</small>
                  </span>
                  <ArrowUpRight size={16} />
                </div>
                <div className="exception-row">
                  <span className="exception-mark muted-mark">↗</span>
                  <span>
                    <b>Assignment balance</b>
                    <small>Review workload across the team</small>
                  </span>
                  <ArrowUpRight size={16} />
                </div>
              </section>
            </div>
            <section className="surface panel workload" id="officers">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">FIELD TEAM</span>
                  <h2>Officer workload</h2>
                </div>
                <span className="muted">
                  {overview.data!.officers} officers
                </span>
              </div>
              {officers.isLoading ? (
                <p className="muted">Loading officer allocations…</p>
              ) : officers.isError ? (
                <ErrorBox
                  message={officers.error.message}
                  retry={() => officers.refetch()}
                />
              ) : (
                <div className="officer-table">
                  <div className="table-row table-label">
                    <span>OFFICER</span>
                    <span>ACCOUNTS</span>
                    <span>OUTSTANDING</span>
                    <span>HIGH PRIORITY</span>
                    <span>STATUS</span>
                  </div>
                  {officers.data!.map((o) => (
                    <div className="table-row" key={o.id}>
                      <span className="officer-name">
                        <span className="avatar mini">
                          {o.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </span>
                        {o.name}
                      </span>
                      <b>{o.assigned}</b>
                      <b className="tabular">{compact(o.outstanding)}</b>
                      <b>{o.high_priority}</b>
                      <span className="status-live">
                        <i /> Active
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="surface panel activity-panel" id="activity">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">AUDIT TRAIL</span>
                  <h2>Recent activity</h2>
                </div>
                <span className="muted">Latest field events</span>
              </div>
              {activity.isLoading ? (
                <p className="muted">Loading activity…</p>
              ) : activity.isError ? (
                <ErrorBox
                  message={activity.error.message}
                  retry={() => activity.refetch()}
                />
              ) : (
                activity.data!.map((e, i) => (
                  <div className="activity-row" key={i}>
                    <span className="activity-dot" />
                    <span className="activity-time">
                      {new Date(e.time).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span>
                      <b>{e.officer}</b>
                      <span className="muted"> {e.event.toLowerCase()} · </span>
                      <b>{e.borrower}</b>
                    </span>
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
