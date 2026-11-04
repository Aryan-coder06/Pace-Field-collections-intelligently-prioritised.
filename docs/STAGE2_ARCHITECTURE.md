# Stage 2 architecture

Stage 2 remains a modular monolith. `app.stage2` owns the collections workflow routes and pure policy helpers while reusing the Stage 1 authentication and SQLAlchemy session dependencies.

## Write boundaries

- Import confirmation writes loans, borrowers, snapshots, assignments and audit events in one transaction.
- Outcome creation writes the outcome, activity, audit event and optional promise transition in one transaction.
- Promise transitions and assignment overrides use expected versions and database locks where supported.
- Partial unique indexes protect one active daily assignment and one confirmed branch/file hash under concurrent requests.

## Idempotency

The SHA-256 file hash identifies confirmed imports within a branch. A client-generated UUID identifies an outcome. Retrying either operation returns the existing result or a structured conflict rather than duplicating financial operations.

## Assignment cost

Only active officers in the same branch with exact pincode coverage are candidates. Cost is:

`assigned_count / capacity + outstanding / (capacity × ₹5,00,000) + high_dpd_count / capacity`

The lowest cost wins; officer ID provides deterministic tie-breaking. Existing active assignments for the date are retained.

## Roll rate

Consecutive monthly snapshots 28–32 days apart form an observation period. Loans initially at 1–30 DPD are the eligible cohort. A loan rolls when its follow-up snapshot is 31–60 DPD. Missing follow-up loans remain in the eligible denominator and are reported separately with coverage.

## Stage 3 seam

Outcome requests already carry a client UUID, device occurrence time, server receipt time, sync state, location state and optional coordinates. The Stage 3 IndexedDB outbox can replay the same request safely without changing the endpoint contract.
