# Pace

Field collections, intelligently prioritised.

Pace is an offline-first field collections platform for an RBI-registered NBFC. Stage 1 establishes the modular monolith, authentication, branch/officer isolation, seeded synthetic portfolio, and field and manager workflows.

## Architecture

- `apps/api`: FastAPI, SQLAlchemy 2, PostgreSQL, JWT cookie authentication, modular domain endpoints.
- `apps/web`: Next.js App Router, TypeScript, Tailwind, TanStack Query, Zod, React Hook Form, Dexie foundation.
- `packages/types`: shared API contracts.
- `infra`: local PostgreSQL via Compose.
- `docs`: assumptions and offline architecture notes.

## Local setup

Copy `.env.example` to `.env`, replace `JWT_SECRET` with a random value (`openssl rand -hex 32`), then run `docker compose -f infra/docker-compose.yml up -d`. Backend: `cd apps/api && uv sync && uv run alembic upgrade head && uv run python -m app.seed && uv run uvicorn app.main:app --reload`. The API loads the repository root `.env` automatically. Frontend: from the repository root run `pnpm install && pnpm dev`.

Demo accounts (development only): `manager@pace.demo`, `rahul@pace.demo`, `neha@pace.demo`, `imran@pace.demo`; password `PaceDemo!2026`. Synthetic data only.

Run API checks with `cd apps/api && uv run pytest`. Frontend checks: `pnpm lint`, `pnpm typecheck`, `pnpm build` from `apps/web`.

## Stage 1

Login/logout/me, role-aware routing, officer daily queue, loan details and promises, manager overview, workload and activity, backend health, persisted snapshots and seeded priority explanations, PWA manifest, and offline storage preparation.

CSV ingestion, assignment optimization, real ML/SHAP, outcome submission, GPS, reminders, offline synchronization/conflict handling, AI overrides and formal roll-rate calculations are deferred to later stages.
