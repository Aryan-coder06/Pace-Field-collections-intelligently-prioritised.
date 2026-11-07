# Stage 3 architecture

## Synchronization protocol

`POST /sync/events` accepts at most 50 client events. `client_event_id` is the immutable idempotency key. Each collection outcome carries the cached assignment `base_version`; stale or revoked work is not auto-merged. The server processes each envelope independently so one conflict does not discard other valid field work, while each accepted outcome, promise projection, audit event and sync receipt commits atomically.

The manager sync overview reports acknowledged, conflicted and rejected receipts without exposing cross-branch data.

## Explainable priority model

Pace trains a regularized logistic regression directly from historical PostgreSQL snapshots. The target is the documented 1–30 DPD to 31–60 DPD roll-forward over 28–32 days. Features are DPD, log outstanding exposure, overdue ratio and DPD change. Inputs are standardized from the training cohort.

The latest 20% of observations form a temporal validation holdout. Persisted run metadata includes sample and positive counts, coefficients, normalization parameters, AUC, accuracy, precision, recall and Brier score. Weekly back-tests group historical predictions by ISO observation week and disclose unavailable AUC values when a period has only one outcome class.

Scores, bands, model version and three positive feature-contribution reasons are persisted. This is a real deterministic trained model, not a seeded score or an external opaque service. It is advisory: a manager can create a versioned queue-rank override with a mandatory rationale, while the underlying model output remains intact.

## Controlled reminders

Reminder drafts use approved English and Hindi templates with safely substituted borrower display name, amount and due date. The response labels the drafting engine, simulation state and human-review requirement. No external message or generative model provider is invoked.
