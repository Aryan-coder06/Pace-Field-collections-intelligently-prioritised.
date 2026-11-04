# Pace

Field collections, intelligently prioritised.

Pace is an offline-first field collections platform for an RBI-registered NBFC. Stage 2 provides a working daily collections lifecycle: validated overdue imports, deterministic assignment, field outcomes, promise tracking, compliant contact initiation, activity evidence and cohort analytics.

## Architecture

- `apps/api`: FastAPI, SQLAlchemy 2, PostgreSQL, JWT cookie authentication, modular domain endpoints.
- `apps/web`: Next.js App Router, TypeScript, Tailwind, TanStack Query, Zod, React Hook Form, Dexie foundation.
- `packages/types`: shared API contracts.
- `infra`: local PostgreSQL via Compose.
- `docs`: assumptions and offline architecture notes.

## Local setup

Copy `.env.example` to `.env`, replace `JWT_SECRET` with a random value (`openssl rand -hex 32`), then run `docker compose -f infra/docker-compose.yml up -d`. Backend: `cd apps/api && uv sync && uv run alembic upgrade head && uv run python -m app.seed && uv run uvicorn app.main:app --reload`. The API loads the repository root `.env` automatically. Frontend: from the repository root run `pnpm install && pnpm dev`.

Demo accounts (development only): `manager@pace.demo`, `rahul@pace.demo`, `neha@pace.demo`, `imran@pace.demo`; password `PaceDemo!2026`. Synthetic data only.

Run API checks with `cd apps/api && uv run ruff check app migrations tests && uv run pytest`. Frontend checks from the repository root: `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm format:check`.

## Stage 2 workflows

- Managers upload a UTF-8 CSV at `/imports`, inspect row errors, and confirm eligible rows transactionally.
- New and existing loans receive dated snapshots. Identical confirmed files are idempotent; same-day conflicts are rejected.
- Assignment uses branch, active status, pincode coverage, normalized workload and stable tie-breaking. Unsupported pincodes remain unassigned.
- Managers review `/assignments` and can override an assignment with pincode eligibility, rationale, version checking and audit history.
- Officers search, sort and filter the Today queue, initiate compliant contact, and submit persisted PAID, PROMISE_TO_PAY, NOT_REACHABLE and DISPUTE outcomes.
- Promise outcomes create promise records atomically. Promise reconciliation, kept/cancelled transitions, bilingual reminder previews and simulated delivery are available in `/promises`.
- Manager metrics calculate DPD distribution, operational counts, same-day logging and identity-based monthly roll rate from stored snapshots and events.
- Client-generated outcome UUIDs and device occurrence timestamps prepare the event API for the Stage 3 offline outbox.

Sample files are in `data/sample-overdue-valid.csv` and `data/sample-overdue-errors.csv`. The valid sample is also downloadable from the import screen.

## Import schema

Required columns: `loan_id`, `borrower_name`, `outstanding_amount`, `dpd`, `pincode`.

Supported optional columns: `borrower_phone`, `business_category`, `overdue_amount`, and `address`. Files must be UTF-8 CSV, no larger than 2 MB, with at most 5,000 rows.

## Contact and payment semantics

Pace enforces in-app borrower CALL and MESSAGE initiation from 08:00 inclusive to 19:00 exclusive in the branch timezone. Every allowed or blocked attempt is retained. A native phone cannot be controlled after the application hands off a permitted `tel:` request.

PAID is a reported field outcome. It does not verify bank settlement or reduce an authoritative outstanding balance.

## Deferred to Stage 3

IndexedDB outbox synchronization, conflict resolution across devices, trained ML scoring, SHAP explanations, AI reminder drafting, ranking overrides, real messaging/payment integrations and weekly model back-testing remain deferred.
