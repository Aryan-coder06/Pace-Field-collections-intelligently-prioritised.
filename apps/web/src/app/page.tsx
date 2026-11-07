"use client";
import Link from "next/link";
import * as Tabs from "@radix-ui/react-tabs";
import { Button } from "@/components/ui/button";
import { ContactButton } from "@/components/contact-button";
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
  ShieldCheck,
  WalletCards,
  LogOut,
  Sparkles,
  UsersRound,
  FileUp,
} from "lucide-react";
import { ApiError, request, type Loan, type User } from "@/lib/api";
import {
  cacheOfficerQueue,
  checkApiConnectivity,
  clearProtectedCache,
  getConnectivity,
  getServerConnectivity,
  pendingCount,
  readCachedQueue,
  subscribeConnectivity,
  syncNow,
} from "@/lib/offline";
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
    if (me.error instanceof ApiError && [401, 403].includes(me.error.status))
      router.replace("/login");
  }, [me.error, router]);
  if (me.isLoading) return <main className="loading">PACE</main>;
  if (me.isError && !me.data)
    return (
      <main className="detail-wrap">
        <ErrorBox
          message="Pace must verify your session online before protected offline data can be unlocked. Reconnect, then try again."
          retry={() => me.refetch()}
        />
      </main>
    );
  if (!me.data) return null;
  return me.data.role === "FIELD_OFFICER" ? (
    <Officer user={me.data} />
  ) : (
    <Manager user={me.data} />
  );
}
function Officer({ user }: { user: User }) {
  const router = useRouter();
  const [fromCache, setFromCache] = useState(false);
  const [pending, setPending] = useState(0);
  const q = useQuery({
    queryKey: ["today"],
    queryFn: async () => {
      try {
        const response = await request<{
          accounts: number;
          outstanding_total: string;
          completed: number;
          items: Loan[];
        }>("/officer/today");
        await cacheOfficerQueue(user, response.items);
        setFromCache(false);
        return response;
      } catch (error) {
        if (!(error instanceof ApiError) || !error.network) throw error;
        const items = await readCachedQueue(user);
        if (!items.length) throw error;
        setFromCache(true);
        return {
          accounts: items.length,
          outstanding_total: items
            .reduce((total, item) => total + Number(item.outstanding), 0)
            .toFixed(2),
          completed: items.filter((item) => item.touched).length,
          items,
        };
      }
    },
  });
  const refetchToday = q.refetch;
  const [active, setActive] = useState("Today");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("priority");
  const [filter, setFilter] = useState("all");
  const connectivity = useSyncExternalStore(
    subscribeConnectivity,
    getConnectivity,
    getServerConnectivity,
  );
  const online = connectivity === "ONLINE";
  useEffect(() => {
    let active = true;
    const refreshPending = async () => {
      const count = await pendingCount(user);
      if (active) setPending(count);
    };
    const synchronize = async () => {
      if (await checkApiConnectivity()) {
        const results = await syncNow(user);
        if (results.length) {
          await refetchToday();
        }
      }
      await refreshPending();
    };
    const onNetwork = () => void synchronize();
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);
    window.addEventListener("focus", onNetwork);
    const timer = window.setInterval(synchronize, 15_000);
    void synchronize();
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
      window.removeEventListener("focus", onNetwork);
    };
  }, [user, refetchToday]);
  const visible = [...(q.data?.items ?? [])]
    .filter((item) =>
      `${item.borrower} ${item.loan_number}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .filter(
      (item) =>
        filter === "all" ||
        (filter === "touched"
          ? item.touched
          : filter === "open"
            ? item.promise_status === "OPEN"
            : item.promise_status === "BROKEN"),
    )
    .sort((a, b) =>
      sort === "dpd"
        ? b.dpd - a.dpd
        : sort === "outstanding"
          ? Number(b.outstanding) - Number(a.outstanding)
          : b.score - a.score,
    );
  return (
    <div className="officer-shell">
      <header className="mobile-head">
        <Link href="/" className="brand">
          <span className="brand-mark">P</span>pace
        </Link>
        <span className={`online ${online ? "" : "offline"}`}>
          <i />{" "}
          {online
            ? "Online"
            : connectivity === "CHECKING"
              ? "Checking"
              : "Offline"}
        </span>
        <button
          className="avatar"
          aria-label="Profile"
          onClick={async () => {
            await clearProtectedCache(user);
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
                <i /> {online ? "API CONNECTED" : "OFFLINE MODE"}
              </span>
            </p>
            {(fromCache || pending > 0) && (
              <p className="offline-context" role="status">
                {fromCache ? "Showing your last verified queue. " : ""}
                {pending > 0
                  ? `${pending} outcome${pending === 1 ? "" : "s"} waiting to sync.`
                  : ""}
              </p>
            )}
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
              <span className="queue-count">{visible.length} accounts</span>
            </div>
            <div className="queue-controls">
              <input
                aria-label="Search borrower or loan ID"
                placeholder="Search borrower or loan ID"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                aria-label="Sort accounts"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="priority">Priority</option>
                <option value="dpd">Highest DPD</option>
                <option value="outstanding">Outstanding</option>
              </select>
            </div>
            <div className="queue-filters" aria-label="Filter accounts">
              {[
                ["all", "All"],
                ["open", "Open promises"],
                ["broken", "Broken"],
                ["touched", "Touched"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={filter === value ? "active" : ""}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="queue">
              {visible.map((loan, i) => (
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
                    <div className="queue-context">
                      {loan.promise_status && (
                        <span>{loan.promise_status} promise</span>
                      )}
                      {loan.touched && <span>Logged today</span>}
                      <span>{loan.next_action}</span>
                    </div>
                    <div className="card-actions">
                      <ContactButton
                        loanId={loan.id}
                        borrower={loan.borrower}
                        className="card-action"
                      />
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
            {visible.length === 0 && (
              <div className="surface empty">
                <Check size={22} />
                <h2>
                  {q.data!.items.length
                    ? "No accounts match these filters."
                    : "You’re clear for today."}
                </h2>
                <p className="muted">
                  {q.data!.items.length
                    ? "Try a different search or filter."
                    : "There are no accounts assigned to your queue yet."}
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
  const analytics = useQuery({
    queryKey: ["manager-analytics"],
    queryFn: () =>
      request<{
        buckets: { "1_30": number; "31_60": number; "61_plus": number };
        assigned: number;
        unassigned: number;
        due_today: number;
        open_disputes: number;
        outcomes_today: number;
        same_day_logging_rate: number | null;
        roll_rate: {
          target: number;
          brief_baseline: number;
          periods: {
            start: string;
            follow_up: string;
            eligible: number;
            observed: number;
            missing: number;
            rolled: number;
            rate: number | null;
            coverage: number | null;
          }[];
        };
      }>("/manager/analytics/overview"),
  });
  const nav = [
    ["Overview", Building2],
    ["Officers", ContactRound],
    ["Recent activity", Activity],
    ["Promises", WalletCards],
    ["Imports", FileUp],
    ["AI review", Sparkles],
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
            <small>Collections workspace</small>
          </span>
          <ChevronRight size={15} />
        </div>
        <nav>
          {nav.map(([label, Icon]) => (
            <a
              key={label}
              href={
                label === "Overview"
                  ? "#overview"
                  : label === "Officers"
                    ? "#officers"
                    : label === "Imports"
                      ? "/imports"
                      : label === "AI review"
                        ? "/ai-review"
                        : label === "Promises"
                          ? "/promises"
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
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className="manager-main">
        <header className="manager-header" id="overview">
          <div>
            <p className="eyebrow">YOUR BRANCH, AT A GLANCE</p>
            <h1>Collections overview</h1>
            <p className="muted">
              {today} <span className="dot-sep">·</span> Good morning,{" "}
              {user.name.split(" ")[0]}
            </p>
          </div>
          <Button
            variant="secondary"
            className="btn secondary"
            onClick={() => overview.refetch()}
          >
            <Activity size={16} /> Refresh data
          </Button>
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
                    {overview.data!.trend.length > 1
                      ? `${overview.data!.trend[0].rate - overview.data!.trend[overview.data!.trend.length - 1].rate >= 0 ? "↓" : "↑"} ${Math.abs(overview.data!.trend[0].rate - overview.data!.trend[overview.data!.trend.length - 1].rate)} pts`
                      : "Current view"}{" "}
                    <small>
                      since {overview.data!.trend[0]?.month ?? "start"}
                    </small>
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
                <a className="exception-row" href="#activity">
                  <span className="exception-mark">!</span>
                  <span>
                    <b>Broken promises</b>
                    <small>Follow up on missed commitments</small>
                  </span>
                  <ArrowUpRight size={16} />
                </a>
                <a className="exception-row" href="#activity">
                  <span className="exception-mark">!</span>
                  <span>
                    <b>Open disputes</b>
                    <small>
                      {analytics.data?.open_disputes ?? 0} require manager
                      review
                    </small>
                  </span>
                  <ArrowUpRight size={16} />
                </a>
                <div className="exception-row">
                  <span className="exception-mark amber">◷</span>
                  <span>
                    <b>Accounts nearing 30 DPD</b>
                    <small>Review early intervention cases</small>
                  </span>
                </div>
                <a className="exception-row" href="#officers">
                  <span className="exception-mark muted-mark">↗</span>
                  <span>
                    <b>Assignment balance</b>
                    <small>Review workload across the team</small>
                  </span>
                  <ArrowUpRight size={16} />
                </a>
              </section>
            </div>
            {analytics.isLoading ? (
              <div className="surface skeleton" />
            ) : analytics.isError ? (
              <ErrorBox
                message={analytics.error.message}
                retry={() => analytics.refetch()}
              />
            ) : (
              analytics.data && (
                <section className="surface analytics-strip">
                  <div>
                    <span className="eyebrow">OBSERVED ROLL RATE</span>
                    <strong>
                      {analytics.data.roll_rate.periods.at(-1)?.rate ?? "—"}%
                    </strong>
                    <small>
                      Target {analytics.data.roll_rate.target}% · brief baseline{" "}
                      {analytics.data.roll_rate.brief_baseline}%
                    </small>
                    <small>
                      {analytics.data.roll_rate.periods.at(-1)?.eligible ?? 0}{" "}
                      eligible ·{" "}
                      {analytics.data.roll_rate.periods.at(-1)?.observed ?? 0}{" "}
                      followed ·{" "}
                      {analytics.data.roll_rate.periods.at(-1)?.missing ?? 0}{" "}
                      missing
                    </small>
                  </div>
                  <div>
                    <span className="eyebrow">DPD DISTRIBUTION</span>
                    <div className="dpd-bars">
                      <span style={{ flex: analytics.data.buckets["1_30"] }} />
                      <span style={{ flex: analytics.data.buckets["31_60"] }} />
                      <span
                        style={{ flex: analytics.data.buckets["61_plus"] }}
                      />
                    </div>
                    <small>
                      1–30: {analytics.data.buckets["1_30"]} · 31–60:{" "}
                      {analytics.data.buckets["31_60"]} · 61+:{" "}
                      {analytics.data.buckets["61_plus"]}
                    </small>
                  </div>
                  <div>
                    <span className="eyebrow">OPERATIONS TODAY</span>
                    <strong>{analytics.data.outcomes_today} outcomes</strong>
                    <small>
                      {analytics.data.assigned} assigned ·{" "}
                      {analytics.data.unassigned} unassigned
                    </small>
                    <small>
                      {analytics.data.due_today} promises due ·{" "}
                      {analytics.data.same_day_logging_rate ?? "—"}% logged same
                      day
                    </small>
                  </div>
                </section>
              )
            )}
            <section className="command-panel" id="officers">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">FIELD COMMAND</span>
                  <h2>Today’s field team</h2>
                </div>
                <span className="command-count">
                  <UsersRound size={15} /> {overview.data!.officers} officers on
                  route
                  <Link href="/assignments" className="command-link">
                    Manage assignments <ArrowUpRight size={14} />
                  </Link>
                </span>
              </div>
              {officers.isLoading ? (
                <div className="manager-skeleton">
                  <div />
                  <div />
                </div>
              ) : officers.isError ? (
                <ErrorBox
                  message={officers.error.message}
                  retry={() => officers.refetch()}
                />
              ) : officers.data!.length === 0 ? (
                <p className="command-empty">
                  No officers are assigned to this branch yet.
                </p>
              ) : (
                <Tabs.Root
                  className="command-tabs"
                  defaultValue={String(officers.data![0].id)}
                  orientation="vertical"
                >
                  <Tabs.List
                    className="command-list"
                    aria-label="Select an officer"
                  >
                    {officers.data!.map((o) => (
                      <Tabs.Trigger
                        className="command-officer"
                        value={String(o.id)}
                        key={o.id}
                      >
                        <span className="command-avatar">
                          {o.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </span>
                        <span className="command-person">
                          <b>{o.name}</b>
                          <small>{o.assigned} assigned accounts</small>
                        </span>
                        <span className="command-amount">
                          {compact(o.outstanding)}
                        </span>
                        <ChevronRight size={16} />
                      </Tabs.Trigger>
                    ))}
                  </Tabs.List>
                  {officers.data!.map((o) => (
                    <Tabs.Content
                      className="command-detail"
                      value={String(o.id)}
                      key={o.id}
                    >
                      <div className="command-detail-top">
                        <span>OFFICER SNAPSHOT</span>
                        <span className="command-live">
                          <i /> {o.active ? "On route" : "Inactive"}
                        </span>
                      </div>
                      <div className="command-detail-person">
                        <span className="command-avatar large">
                          {o.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </span>
                        <div>
                          <h3>{o.name}</h3>
                          <p>Indore field collections</p>
                        </div>
                      </div>
                      <div className="command-stats">
                        <div>
                          <small>ASSIGNED</small>
                          <strong>{o.assigned}</strong>
                          <span>accounts today</span>
                        </div>
                        <div>
                          <small>OUTSTANDING</small>
                          <strong>{compact(o.outstanding)}</strong>
                          <span>on assigned route</span>
                        </div>
                        <div>
                          <small>HIGH PRIORITY</small>
                          <strong>{o.high_priority}</strong>
                          <span>need attention</span>
                        </div>
                      </div>
                      <div className="command-foot">
                        <Sparkles size={16} />
                        <span>
                          Priority is based on persisted demo scores. Review
                          each account before taking action.
                        </span>
                      </div>
                    </Tabs.Content>
                  ))}
                </Tabs.Root>
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
