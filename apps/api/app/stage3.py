"""Stage 3 offline synchronization and explainable priority intelligence."""

import math
from datetime import UTC, date, datetime
from itertools import pairwise
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.main import current_user, db_session, loan_view, require_role
from app.models import (
    Assignment,
    AuditEvent,
    Loan,
    PriorityModelRun,
    PriorityOverride,
    PriorityScore,
    Role,
    Snapshot,
    SyncEventReceipt,
    User,
)
from app.stage2 import OutcomeBody, branch_today, record_outcome

router = APIRouter()


class SyncEventIn(BaseModel):
    client_event_id: UUID
    event_type: str = Field(pattern="^COLLECTION_OUTCOME$")
    entity_id: str = Field(min_length=1, max_length=80)
    client_occurred_at: datetime
    base_version: int = Field(ge=1)
    payload: dict[str, object]

    @model_validator(mode="after")
    def timezone_required(self):
        if self.client_occurred_at.tzinfo is None:
            raise ValueError("Client occurrence time must include a timezone.")
        return self


class SyncBatchIn(BaseModel):
    events: list[SyncEventIn] = Field(min_length=1, max_length=50)


def receipt_view(receipt: SyncEventReceipt, duplicate: bool = False):
    return {
        "client_event_id": receipt.client_event_id,
        "status": receipt.status,
        "duplicate": duplicate,
        "server_received_at": receipt.server_received_at.isoformat(),
        "error": (
            {"code": receipt.error_code, "message": receipt.error_message}
            if receipt.error_code
            else None
        ),
        "result": receipt.result_json,
    }


def persist_rejection(
    db: Session,
    user: User,
    event: SyncEventIn,
    status: str,
    code: str,
    message: str,
    result: dict[str, object] | None = None,
):
    receipt = SyncEventReceipt(
        client_event_id=str(event.client_event_id),
        event_type=event.event_type,
        entity_id=event.entity_id,
        actor_user_id=user.id,
        branch_id=user.branch_id,
        client_occurred_at=event.client_occurred_at,
        base_version=event.base_version,
        payload_json=event.payload,
        status=status,
        error_code=code,
        error_message=message,
        result_json=result or {},
    )
    db.add(receipt)
    db.commit()
    return receipt_view(receipt)


@router.post("/sync/events")
def sync_events(
    body: SyncBatchIn,
    user: User = Depends(current_user),
    db: Session = Depends(db_session),
):
    require_role(user, Role.FIELD_OFFICER)
    results = []
    for event in body.events:
        event_id = str(event.client_event_id)
        existing = db.scalar(
            select(SyncEventReceipt).where(SyncEventReceipt.client_event_id == event_id)
        )
        if existing:
            if existing.actor_user_id != user.id:
                results.append(
                    {
                        "client_event_id": event_id,
                        "status": "REJECTED",
                        "duplicate": True,
                        "error": {"code": "EVENT_ID_IN_USE", "message": "Event ID is unavailable."},
                        "result": {},
                    }
                )
            else:
                results.append(receipt_view(existing, duplicate=True))
            continue
        try:
            loan_id = int(event.entity_id)
        except ValueError:
            results.append(
                persist_rejection(
                    db, user, event, "REJECTED", "INVALID_ENTITY", "Loan ID is invalid."
                )
            )
            continue
        assignment = db.scalar(
            select(Assignment).where(
                Assignment.loan_id == loan_id,
                Assignment.officer_id == user.id,
                Assignment.assignment_date == branch_today(db, user.branch_id),
                Assignment.status == "ACTIVE",
            )
        )
        if not assignment:
            results.append(
                persist_rejection(
                    db,
                    user,
                    event,
                    "REJECTED",
                    "ACCOUNT_ACCESS_REVOKED",
                    "This account is no longer assigned to you.",
                )
            )
            continue
        if assignment.version != event.base_version:
            results.append(
                persist_rejection(
                    db,
                    user,
                    event,
                    "CONFLICT",
                    "ASSIGNMENT_VERSION_CHANGED",
                    "The assignment changed after this account was cached.",
                    {"current_version": assignment.version},
                )
            )
            continue
        try:
            outcome = OutcomeBody(
                device_event_id=event.client_event_id,
                occurred_at=event.client_occurred_at,
                **event.payload,
            )
            projection = record_outcome(db, user, loan_id, outcome, commit=False)
            receipt = SyncEventReceipt(
                client_event_id=event_id,
                event_type=event.event_type,
                entity_id=event.entity_id,
                actor_user_id=user.id,
                branch_id=user.branch_id,
                client_occurred_at=event.client_occurred_at,
                base_version=event.base_version,
                payload_json=event.payload,
                status="ACKNOWLEDGED",
                result_json=projection,
            )
            db.add(receipt)
            db.commit()
            results.append(receipt_view(receipt))
        except HTTPException as exc:
            db.rollback()
            detail = exc.detail
            message = detail if isinstance(detail, str) else detail.get("message", "Event rejected.")
            results.append(
                persist_rejection(
                    db, user, event, "REJECTED", f"VALIDATION_{exc.status_code}", message
                )
            )
        except (ValueError, TypeError) as exc:
            db.rollback()
            results.append(
                persist_rejection(db, user, event, "REJECTED", "INVALID_PAYLOAD", str(exc))
            )
        except IntegrityError:
            db.rollback()
            prior = db.scalar(
                select(SyncEventReceipt).where(SyncEventReceipt.client_event_id == event_id)
            )
            if prior and prior.actor_user_id == user.id:
                results.append(receipt_view(prior, duplicate=True))
            else:
                results.append(
                    {
                        "client_event_id": event_id,
                        "status": "REJECTED",
                        "duplicate": False,
                        "error": {"code": "CONCURRENT_EVENT", "message": "Event conflicted."},
                        "result": {},
                    }
                )
    return {"results": results, "server_time": datetime.now(UTC).isoformat()}


FEATURE_NAMES = ["dpd", "log_outstanding", "overdue_ratio", "dpd_change"]


def feature_vector(current: Snapshot, previous: Snapshot | None = None) -> list[float]:
    outstanding = max(float(current.outstanding), 1.0)
    return [
        float(current.dpd),
        math.log1p(outstanding),
        float(current.overdue) / outstanding,
        float(current.dpd - previous.dpd) if previous else 0.0,
    ]


def sigmoid(value: float) -> float:
    value = max(-35.0, min(35.0, value))
    return 1.0 / (1.0 + math.exp(-value))


def auc_score(labels: list[int], predictions: list[float]) -> float | None:
    positives = [p for y, p in zip(labels, predictions, strict=True) if y == 1]
    negatives = [p for y, p in zip(labels, predictions, strict=True) if y == 0]
    if not positives or not negatives:
        return None
    wins = sum(1 if pos > neg else 0.5 if pos == neg else 0 for pos in positives for neg in negatives)
    return wins / (len(positives) * len(negatives))


def training_rows(db: Session, branch_id: int):
    loans = db.scalars(select(Loan).where(Loan.branch_id == branch_id)).all()
    rows: list[tuple[list[float], int, date]] = []
    for loan in loans:
        snapshots = db.scalars(
            select(Snapshot)
            .where(Snapshot.loan_id == loan.id)
            .order_by(Snapshot.snapshot_date)
        ).all()
        for index, (initial, follow) in enumerate(pairwise(snapshots)):
            gap = (follow.snapshot_date - initial.snapshot_date).days
            if 28 <= gap <= 32 and 1 <= initial.dpd <= 30:
                previous = snapshots[index - 1] if index else None
                rows.append(
                    (feature_vector(initial, previous), int(31 <= follow.dpd <= 60), initial.snapshot_date)
                )
    return rows


def train_logistic(rows: list[tuple[list[float], int, date]]):
    rows = sorted(rows, key=lambda row: row[2])
    vectors = [row[0] for row in rows]
    labels = [row[1] for row in rows]
    cut = max(8, min(len(rows) - 4, round(len(rows) * 0.8)))
    training_vectors = vectors[:cut]
    training_labels = labels[:cut]
    means = [sum(row[i] for row in training_vectors) / len(training_vectors) for i in range(len(FEATURE_NAMES))]
    scales = []
    for i, mean in enumerate(means):
        variance = sum((row[i] - mean) ** 2 for row in training_vectors) / len(training_vectors)
        scales.append(max(math.sqrt(variance), 1e-6))
    normalized = [
        [(row[i] - means[i]) / scales[i] for i in range(len(FEATURE_NAMES))]
        for row in training_vectors
    ]
    weights = [0.0] * len(FEATURE_NAMES)
    positive_rate = min(0.999, max(0.001, sum(training_labels) / len(training_labels)))
    intercept = math.log(positive_rate / (1 - positive_rate))
    learning_rate = 0.08
    for _ in range(900):
        predictions = [sigmoid(intercept + sum(w * x for w, x in zip(weights, row, strict=True))) for row in normalized]
        errors = [prediction - label for prediction, label in zip(predictions, training_labels, strict=True)]
        intercept -= learning_rate * sum(errors) / len(errors)
        for i in range(len(weights)):
            gradient = sum(error * row[i] for error, row in zip(errors, normalized, strict=True)) / len(errors)
            weights[i] -= learning_rate * (gradient + 0.02 * weights[i])
    validation_vectors = vectors[cut:] or vectors
    validation_labels = labels[cut:] or labels
    validation_normalized = [[(row[i] - means[i]) / scales[i] for i in range(len(FEATURE_NAMES))] for row in validation_vectors]
    predictions = [sigmoid(intercept + sum(w * x for w, x in zip(weights, row, strict=True))) for row in validation_normalized]
    predicted = [int(value >= 0.5) for value in predictions]
    true_positive = sum(p == 1 and y == 1 for p, y in zip(predicted, validation_labels, strict=True))
    false_positive = sum(p == 1 and y == 0 for p, y in zip(predicted, validation_labels, strict=True))
    false_negative = sum(p == 0 and y == 1 for p, y in zip(predicted, validation_labels, strict=True))
    metrics = {
        "auc": round(auc_score(validation_labels, predictions), 4) if auc_score(validation_labels, predictions) is not None else None,
        "accuracy": round(sum(p == y for p, y in zip(predicted, validation_labels, strict=True)) / len(validation_labels), 4),
        "precision": round(true_positive / (true_positive + false_positive), 4) if true_positive + false_positive else None,
        "recall": round(true_positive / (true_positive + false_negative), 4) if true_positive + false_negative else None,
        "brier": round(sum((p - y) ** 2 for p, y in zip(predictions, validation_labels, strict=True)) / len(validation_labels), 4),
        "training_count": len(training_labels),
        "validation_count": len(validation_labels),
    }
    return {"features": FEATURE_NAMES, "means": means, "scales": scales, "weights": weights, "intercept": intercept}, metrics


def risk_reasons(vector: list[float], parameters: dict[str, object]) -> list[str]:
    means = parameters["means"]
    scales = parameters["scales"]
    weights = parameters["weights"]
    contributions = [
        weights[i] * ((vector[i] - means[i]) / scales[i]) for i in range(len(FEATURE_NAMES))
    ]
    labels = [
        "DPD is elevated for the early-arrears cohort",
        "Outstanding exposure is above the portfolio norm",
        "Overdue share of outstanding is elevated",
        "DPD has increased since the previous snapshot",
    ]
    ordered = sorted(range(len(labels)), key=lambda i: contributions[i], reverse=True)
    reasons = [labels[i] for i in ordered if contributions[i] > 0][:3]
    fallbacks = ["Account is within the active early-intervention cohort", "Collection follow-up is due", "Current exposure warrants review"]
    return (reasons + [item for item in fallbacks if item not in reasons])[:3]


def score_vector(vector: list[float], parameters: dict[str, object]):
    z = parameters["intercept"]
    for index in range(len(FEATURE_NAMES)):
        z += parameters["weights"][index] * (
            (vector[index] - parameters["means"][index]) / parameters["scales"][index]
        )
    return max(1, min(99, round(sigmoid(z) * 100)))


@router.get("/manager/ai/backtest")
def weekly_backtest(user: User = Depends(current_user), db: Session = Depends(db_session)):
    require_role(user, Role.BRANCH_MANAGER)
    run = db.scalar(
        select(PriorityModelRun)
        .where(PriorityModelRun.branch_id == user.branch_id)
        .order_by(PriorityModelRun.created_at.desc())
    )
    if not run:
        raise HTTPException(404, "Train a priority model before running a back-test.")
    grouped: dict[str, list[tuple[list[float], int]]] = {}
    for vector, label, observation_date in training_rows(db, user.branch_id):
        year, week, _ = observation_date.isocalendar()
        grouped.setdefault(f"{year}-W{week:02d}", []).append((vector, label))
    periods = []
    for period, samples in sorted(grouped.items()):
        labels = [sample[1] for sample in samples]
        predictions = [score_vector(sample[0], run.parameters_json) / 100 for sample in samples]
        periods.append(
            {
                "period": period,
                "observations": len(samples),
                "positives": sum(labels),
                "auc": round(auc_score(labels, predictions), 4)
                if auc_score(labels, predictions) is not None
                else None,
                "brier": round(
                    sum((prediction - label) ** 2 for prediction, label in zip(predictions, labels, strict=True)) / len(labels),
                    4,
                ),
            }
        )
    return {"model_version": run.model_version, "periods": periods, "method": "Historical 28–32 day roll-forward grouped by ISO observation week"}


@router.post("/manager/ai/train")
def train_priorities(user: User = Depends(current_user), db: Session = Depends(db_session)):
    require_role(user, Role.BRANCH_MANAGER)
    rows = training_rows(db, user.branch_id)
    labels = [row[1] for row in rows]
    if len(rows) < 12 or len(set(labels)) < 2:
        raise HTTPException(422, "At least 12 historical observations with both outcomes are required.")
    parameters, metrics = train_logistic(rows)
    version = f"pace-logit-{user.branch_id}-{datetime.now(UTC).strftime('%Y%m%d%H%M%S%f')}"
    run = PriorityModelRun(
        branch_id=user.branch_id,
        model_version=version,
        training_start=min(row[2] for row in rows),
        training_end=max(row[2] for row in rows),
        sample_count=len(rows),
        positive_count=sum(labels),
        metrics_json=metrics,
        parameters_json=parameters,
    )
    db.add(run)
    db.flush()
    loans = db.scalars(select(Loan).where(Loan.branch_id == user.branch_id)).all()
    scored = 0
    for loan in loans:
        snapshots = db.scalars(
            select(Snapshot).where(Snapshot.loan_id == loan.id).order_by(Snapshot.snapshot_date.desc())
        ).all()
        if not snapshots:
            continue
        vector = feature_vector(snapshots[0], snapshots[1] if len(snapshots) > 1 else None)
        score = score_vector(vector, parameters)
        band = "HIGH" if score >= 70 else "MEDIUM" if score >= 40 else "LOW"
        reasons = risk_reasons(vector, parameters)
        db.add(
            PriorityScore(
                loan_id=loan.id,
                score=score,
                priority_band=band,
                model_version=version,
                reason_1=reasons[0],
                reason_2=reasons[1],
                reason_3=reasons[2],
            )
        )
        snapshots[0].score = score
        snapshots[0].band = band
        snapshots[0].reasons = "|".join(reasons)
        scored += 1
    db.add(
        AuditEvent(
            actor_user_id=user.id,
            branch_id=user.branch_id,
            entity_type="PriorityModel",
            entity_id=version,
            action="Priority model trained",
            metadata_json={"samples": len(rows), "scored_loans": scored, "metrics": metrics},
        )
    )
    db.commit()
    return {"model_version": version, "sample_count": len(rows), "scored_loans": scored, "metrics": metrics}


@router.get("/manager/ai/overview")
def ai_overview(user: User = Depends(current_user), db: Session = Depends(db_session)):
    require_role(user, Role.BRANCH_MANAGER)
    run = db.scalar(
        select(PriorityModelRun)
        .where(PriorityModelRun.branch_id == user.branch_id)
        .order_by(PriorityModelRun.created_at.desc())
    )
    overrides = db.scalars(
        select(PriorityOverride).where(
            PriorityOverride.branch_id == user.branch_id, PriorityOverride.active.is_(True)
        )
    ).all()
    queue = []
    assignments = db.execute(
        select(Loan, Assignment)
        .join(Assignment, Assignment.loan_id == Loan.id)
        .where(
            Loan.branch_id == user.branch_id,
            Assignment.status == "ACTIVE",
            Assignment.assignment_date == branch_today(db, user.branch_id),
        )
    ).all()
    override_by_loan = {item.loan_id: item for item in overrides}
    for loan, assignment in assignments:
        item = loan_view(db, loan)
        override = override_by_loan.get(loan.id)
        item.update(
            {
                "officer_id": assignment.officer_id,
                "override_rank": override.rank if override else None,
                "override_reason": override.reason if override else None,
                "override_version": override.version if override else None,
            }
        )
        queue.append(item)
    queue.sort(key=lambda item: (item["override_rank"] is None, item["override_rank"] or 9999, -item["score"]))
    return {
        "model": None
        if not run
        else {
            "version": run.model_version,
            "trained_at": run.created_at,
            "training_start": run.training_start,
            "training_end": run.training_end,
            "sample_count": run.sample_count,
            "positive_count": run.positive_count,
            "metrics": run.metrics_json,
        },
        "queue": queue,
        "active_overrides": len(overrides),
    }


class OverrideBody(BaseModel):
    rank: int = Field(ge=1, le=100)
    reason: str = Field(min_length=8, max_length=500)
    expected_version: int | None = Field(default=None, ge=1)


@router.post("/manager/ai/loans/{loan_id}/override")
def override_priority(
    loan_id: int,
    body: OverrideBody,
    user: User = Depends(current_user),
    db: Session = Depends(db_session),
):
    require_role(user, Role.BRANCH_MANAGER)
    loan = db.get(Loan, loan_id)
    if not loan or loan.branch_id != user.branch_id:
        raise HTTPException(404, "Loan not found in this branch.")
    current = db.scalar(
        select(PriorityOverride)
        .where(PriorityOverride.loan_id == loan_id, PriorityOverride.active.is_(True))
        .with_for_update()
    )
    if current and body.expected_version != current.version:
        raise HTTPException(
            409,
            {"code": "STALE_OVERRIDE", "message": "Priority override changed. Refresh and retry."},
        )
    if current:
        current.active = False
    override = PriorityOverride(
        loan_id=loan_id,
        branch_id=user.branch_id,
        actor_user_id=user.id,
        rank=body.rank,
        reason=body.reason.strip(),
        version=(current.version + 1) if current else 1,
    )
    db.add(override)
    db.add(
        AuditEvent(
            actor_user_id=user.id,
            branch_id=user.branch_id,
            entity_type="Loan",
            entity_id=str(loan_id),
            action="Priority rank overridden",
            metadata_json={"rank": body.rank, "reason": body.reason, "version": override.version},
        )
    )
    db.commit()
    return {"id": override.id, "rank": override.rank, "reason": override.reason, "version": override.version}


@router.get("/manager/sync/overview")
def sync_overview(user: User = Depends(current_user), db: Session = Depends(db_session)):
    require_role(user, Role.BRANCH_MANAGER)
    receipts = db.scalars(
        select(SyncEventReceipt)
        .where(SyncEventReceipt.branch_id == user.branch_id)
        .order_by(SyncEventReceipt.server_received_at.desc())
        .limit(100)
    ).all()
    return {
        "acknowledged": sum(item.status == "ACKNOWLEDGED" for item in receipts),
        "conflicts": sum(item.status == "CONFLICT" for item in receipts),
        "rejected": sum(item.status == "REJECTED" for item in receipts),
        "recent": [
            {
                "client_event_id": item.client_event_id,
                "officer": db.get(User, item.actor_user_id).name,
                "status": item.status,
                "event_type": item.event_type,
                "received_at": item.server_received_at,
                "error_code": item.error_code,
            }
            for item in receipts[:20]
        ],
    }
