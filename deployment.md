# Pace deployment and reviewer guide

## Repository

GitHub: https://github.com/Aryan-coder06/Pace-Field-collections-intelligently-prioritised..git

Live application: not deployed from this workspace. A Render Blueprint and Vercel configuration are included, but deployment requires the repository owner's hosting credentials and explicit authorization. Do not treat a local URL as a public demo URL.

## Prerequisites

- Docker Engine and Docker Compose v2
- Node.js 22+ and pnpm 10+
- Python 3.12+
- `uv` (recommended) or the existing `apps/api/.venv`

## Local setup

```bash
git clone https://github.com/Aryan-coder06/Pace-Field-collections-intelligently-prioritised..git
cd Pace-Field-collections-intelligently-prioritised.
cp .env.example .env
# Set JWT_SECRET in .env to a fresh value: openssl rand -hex 32
docker compose -f infra/docker-compose.yml up -d

cd apps/api
uv sync
uv run alembic upgrade head
uv run python -m app.seed
uv run uvicorn app.main:app --reload
```

In a second terminal:

```bash
cd Pace-Field-collections-intelligently-prioritised.
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The API health check is `http://localhost:8000/health`.

If `uv` is not installed, use the checked-in virtual environment after dependencies have been installed:

```bash
cd apps/api
.venv/bin/alembic upgrade head
.venv/bin/python -m app.seed
.venv/bin/uvicorn app.main:app --reload
```

## Environment variables

| Variable                    | Purpose                                                                         |
| --------------------------- | ------------------------------------------------------------------------------- |
| `DATABASE_URL`              | SQLAlchemy PostgreSQL connection URL.                                           |
| `JWT_SECRET`                | At least 32-character signing secret; never commit it.                          |
| `WEB_ORIGIN`                | Comma-separated trusted frontend origins for CORS.                              |
| `ENVIRONMENT`               | `development` or `production`; production enforces secure cookie configuration. |
| `COOKIE_SECURE`             | Enables HTTPS-only authentication cookies.                                      |
| `ACCESS_TOKEN_MINUTES`      | Access-token lifetime.                                                          |
| `REFRESH_TOKEN_DAYS`        | Refresh-session lifetime.                                                       |
| `LOGIN_RATE_WINDOW_SECONDS` | Failed-login rate-limit window.                                                 |
| `LOGIN_RATE_MAX_FAILURES`   | Failed-login limit within the window.                                           |
| `NEXT_PUBLIC_API_URL`       | Browser-visible API base URL.                                                   |
| `API_INTERNAL_URL`          | Optional same-origin API target used by the Next.js `/api` rewrite.             |
| `ALLOW_DEMO_RESET`          | Explicitly permits synthetic demo reset in production-like environments.        |

## Deployment architecture

- The frontend is deployable to Vercel using `apps/web/vercel.json`.
- The FastAPI service is deployable to Render using `apps/api/Dockerfile` and `render.yaml`.
- Render provisions PostgreSQL; application startup runs migrations and idempotent synthetic seeding.
- For public HTTPS deployment, set `ENVIRONMENT=production`, `COOKIE_SECURE=true`, `WEB_ORIGIN` to the exact frontend URL, a private `JWT_SECRET`, and preferably use the same-origin rewrite via `API_INTERNAL_URL`.

Run the reset utility only for synthetic demo environments:

```bash
cd apps/api
ALLOW_DEMO_RESET=true uv run python -m app.reset_demo --confirm RESET_SYNTHETIC_DEMO
```

## Demo accounts

All records and accounts are synthetic.

| Role           | Email               | Password        |
| -------------- | ------------------- | --------------- |
| Branch manager | `manager@pace.demo` | `PaceDemo!2026` |
| Field officer  | `rahul@pace.demo`   | `PaceDemo!2026` |
| Field officer  | `neha@pace.demo`    | `PaceDemo!2026` |

## Reviewer walkthrough

1. Sign in as the manager and inspect the Indore overview, analytics and AI Review.
2. Open Imports, download or upload `data/sample-overdue-valid.csv`, review validation, and confirm it.
3. Open Assignments and reassign an eligible account with a rationale; inspect Activity for the audit record.
4. Sign in as Rahul, open Today, select an account and record a promise-to-pay.
5. Open Promises to see the persisted promise; preview English and Hindi reminders. Delivery is explicitly simulated and contact-window controlled.
6. To demonstrate offline work, first load Rahul's queue online, disable browser networking, log a NOT_REACHABLE outcome, then reconnect and return to Today or Activity. The event changes from device-saved to server-synced.
7. For a conflict demonstration, cache Rahul's account, go offline, reassign it as manager, record an offline outcome, then reconnect. The event remains a visible, audited conflict rather than being applied.

## Troubleshooting

- **Compose file not found:** run Docker Compose from the repository root, not `apps/api`: `docker compose -f infra/docker-compose.yml up -d`.
- **`uv` not found:** install it from https://docs.astral.sh/uv/ or use the virtual-environment commands above.
- **Login does not work locally:** confirm API is on port 8000, run migration + seed, and use the synthetic credentials above.
- **Cookie/CORS error after deployment:** verify HTTPS, exact `WEB_ORIGIN`, `COOKIE_SECURE=true`, and a same-site API arrangement.
- **Offline queue empty:** visit Today while online first; Pace intentionally requires an online session verification before protected cached records are unlocked after a fresh restart.
- **Reminder button disabled:** borrower contact is intentionally unavailable outside 08:00-19:00 Asia/Kolkata.

## Validation commands

```bash
cd apps/api && .venv/bin/ruff check app migrations tests && .venv/bin/pytest -q
cd ../.. && pnpm --filter pace-web lint && pnpm --filter pace-web typecheck && pnpm --filter pace-web build
cd apps/web && pnpm test:e2e
```
