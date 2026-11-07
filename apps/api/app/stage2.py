"""Stage 2 collections workflows. All writes are scoped to the authenticated user."""

import csv
import hashlib
import io
import re
from datetime import UTC, date, datetime, time
from decimal import Decimal, InvalidOperation
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.main import current_user, db_session, loan_view, require_role
from app.models import (
    Activity,
    Assignment,
    AuditEvent,
    Borrower,
    Branch,
    CollectionOutcome,
    ContactAttempt,
    ImportBatch,
    Loan,
    OfficerProfile,
    PincodeCoverage,
    Promise,
    PromiseTransition,
    Role,
    Snapshot,
    User,
)

router = APIRouter()
REQUIRED = {"loan_id", "borrower_name", "outstanding_amount", "dpd", "pincode"}
MAX_UPLOAD = 2 * 1024 * 1024


def branch_today(db: Session, branch_id: int) -> date:
    return datetime.now(ZoneInfo(db.get(Branch, branch_id).timezone)).date()


def audit(db: Session, user: User, loan_id: int, action: str, metadata: dict | None = None):
    db.add(
        AuditEvent(
            actor_user_id=user.id,
            branch_id=user.branch_id,
            entity_type="Loan",
            entity_id=str(loan_id),
            action=action,
            metadata_json=metadata or {},
        )
    )


def allowed_loan(db: Session, user: User, loan_id: int) -> Loan:
    loan = db.get(Loan, loan_id)
    if not loan:
        raise HTTPException(404, "Loan not found.")
    if loan.branch_id != user.branch_id:
        raise HTTPException(403, "Account outside your branch.")
    if user.role == Role.FIELD_OFFICER.value and not db.scalar(
        select(Assignment.id).where(
            Assignment.loan_id == loan_id,
            Assignment.officer_id == user.id,
            Assignment.assignment_date == branch_today(db, user.branch_id),
            Assignment.status == "ACTIVE",
        )
    ):
        raise HTTPException(403, "Account is not assigned to you.")
    return loan


def amount(value: str) -> Decimal:
    try:
        result = Decimal(value).quantize(Decimal("0.01"))
        if not result.is_finite() or result < 0 or result > Decimal("999999999999.99"):
            raise ValueError
        return result
    except (InvalidOperation, ValueError):
        raise ValueError("Enter a valid non-negative amount.") from None


def optional_date(value: str, label: str, errors: list[str]) -> str | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        errors.append(f"{label} must use YYYY-MM-DD.")
        return None


def parse_file(db: Session, branch_id: int, raw: bytes):
    try:
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig", errors="strict")))
        fields = {x.strip().lower() for x in (reader.fieldnames or [])}
        missing = sorted(REQUIRED - fields)
        if missing:
            raise HTTPException(422, {"code": "CSV_COLUMNS_MISSING", "columns": missing})
        rows = []
        seen = set()
        today = branch_today(db, branch_id)
        for number, original in enumerate(reader, 2):
            values = {str(k).strip().lower(): (v or "").strip() for k, v in original.items() if k}
            errors = []
            loan_number = values.get("loan_id", "")
            if not loan_number or len(loan_number) > 30:
                errors.append("Loan ID is required (maximum 30 characters).")
            if loan_number in seen:
                errors.append("Duplicate loan ID in this file.")
            seen.add(loan_number)
            if not values.get("borrower_name") or len(values.get("borrower_name", "")) > 120:
                errors.append("Borrower name is required (maximum 120 characters).")
            if not re.fullmatch(r"\d{6}", values.get("pincode", "")):
                errors.append("Pincode must have six digits.")
            try:
                outstanding = amount(values.get("outstanding_amount", ""))
            except ValueError as exc:
                errors.append(str(exc))
                outstanding = Decimal(0)
            try:
                overdue = amount(values.get("overdue_amount", "0") or "0")
                if overdue > outstanding:
                    errors.append("Overdue amount exceeds outstanding.")
            except ValueError as exc:
                errors.append(str(exc))
                overdue = Decimal(0)
            try:
                dpd = int(values.get("dpd", ""))
                if dpd < 1 or dpd > 3650:
                    raise ValueError
            except ValueError:
                errors.append("DPD must be between 1 and 3650.")
                dpd = 0
            promise_date = optional_date(values.get("promise_date", ""), "Promise date", errors)
            last_payment_date = optional_date(
                values.get("last_payment_date", ""), "Last payment date", errors
            )
            if last_payment_date and date.fromisoformat(last_payment_date) > today:
                errors.append("Last payment date cannot be in the future.")
            latitude = longitude = None
            if values.get("latitude") or values.get("longitude"):
                try:
                    latitude = float(values.get("latitude", ""))
                    longitude = float(values.get("longitude", ""))
                    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
                        raise ValueError
                except ValueError:
                    errors.append("Latitude and longitude must be a valid coordinate pair.")
                    latitude = longitude = None
            existing = (
                db.scalar(select(Loan).where(Loan.loan_number == loan_number))
                if loan_number
                else None
            )
            if existing and existing.branch_id != branch_id:
                errors.append("Loan ID belongs to another branch.")
            if existing:
                snapshot = db.scalar(
                    select(Snapshot).where(
                        Snapshot.loan_id == existing.id, Snapshot.snapshot_date == today
                    )
                )
                if snapshot and (
                    snapshot.outstanding != outstanding
                    or snapshot.dpd != dpd
                    or snapshot.overdue != overdue
                ):
                    errors.append("Conflicting same-day snapshot; review before replacement.")
            rows.append(
                {
                    "row": number,
                    "loan_id": loan_number,
                    "borrower_name": values.get("borrower_name", ""),
                    "outstanding_amount": str(outstanding),
                    "overdue_amount": str(overdue),
                    "dpd": dpd,
                    "pincode": values.get("pincode", ""),
                    "borrower_phone": values.get("borrower_phone", ""),
                    "business_category": values.get("business_category", "Working capital"),
                    "address": values.get("address", ""),
                    "promise_date": promise_date,
                    "last_payment_date": last_payment_date,
                    "previous_officer": values.get("previous_officer", ""),
                    "latitude": latitude,
                    "longitude": longitude,
                    "existing": bool(existing),
                    "errors": errors,
                }
            )
        if len(rows) > 5000:
            raise HTTPException(413, "CSV exceeds 5,000 rows.")
        return rows
    except UnicodeDecodeError:
        raise HTTPException(
            422, {"code": "CSV_ENCODING", "message": "Upload a UTF-8 CSV file."}
        ) from None
    except csv.Error:
        raise HTTPException(
            422, {"code": "CSV_INVALID", "message": "Could not parse CSV."}
        ) from None


def assignment_cost(db: Session, officer: User, day: date):
    rows = db.execute(
        select(Assignment, Snapshot)
        .join(Snapshot, Snapshot.loan_id == Assignment.loan_id)
        .where(
            Assignment.officer_id == officer.id,
            Assignment.assignment_date == day,
            Assignment.status == "ACTIVE",
            Snapshot.snapshot_date == day,
        )
    ).all()
    profile = db.get(OfficerProfile, officer.id)
    capacity = max(1, profile.workload_capacity)
    return (
        len(rows) / capacity
        + sum(float(s.outstanding) for _, s in rows) / (capacity * 500000)
        + sum(s.dpd >= 30 for _, s in rows) / capacity
    )


def assign(db: Session, loan: Loan, day: date):
    current = db.scalar(
        select(Assignment).where(
            Assignment.loan_id == loan.id,
            Assignment.assignment_date == day,
            Assignment.status == "ACTIVE",
        )
    )
    if current:
        return "RETAINED"
    borrower = db.get(Borrower, loan.borrower_id)
    candidates = db.scalars(
        select(User)
        .join(OfficerProfile, OfficerProfile.user_id == User.id)
        .join(PincodeCoverage, PincodeCoverage.officer_id == User.id)
        .where(
            User.branch_id == loan.branch_id,
            User.role == Role.FIELD_OFFICER.value,
            User.is_active.is_(True),
            OfficerProfile.active_status == "ACTIVE",
            PincodeCoverage.pincode == borrower.pincode,
        )
        .order_by(User.id)
    ).all()
    if not candidates:
        return "UNASSIGNED"
    officer = min(candidates, key=lambda o: (assignment_cost(db, o, day), o.id))
    db.add(
        Assignment(
            loan_id=loan.id,
            officer_id=officer.id,
            branch_id=loan.branch_id,
            assignment_date=day,
            assignment_source="AUTO",
        )
    )
    db.flush()
    return "ASSIGNED"


@router.post("/manager/imports/preview")
async def import_preview(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(db_session),
):
    require_role(user, Role.BRANCH_MANAGER)
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(422, "Choose a CSV file.")
    raw = await file.read(MAX_UPLOAD + 1)
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(413, "CSV must be under 2 MB.")
    digest = hashlib.sha256(raw).hexdigest()
    existing = db.scalar(
        select(ImportBatch).where(
            ImportBatch.branch_id == user.branch_id,
            ImportBatch.file_hash == digest,
            ImportBatch.status == "CONFIRMED",
        )
    )
    rows = parse_file(db, user.branch_id, raw)
    summary = {
        "total": len(rows),
        "valid": sum(not r["errors"] for r in rows),
        "invalid": sum(bool(r["errors"]) for r in rows),
        "duplicates": sum(any("Duplicate" in e for e in r["errors"]) for r in rows),
        "existing": sum(r["existing"] for r in rows),
        "new": sum(not r["existing"] for r in rows),
        "already_imported": bool(existing),
    }
    batch = ImportBatch(
        branch_id=user.branch_id,
        actor_user_id=user.id,
        filename=file.filename[:180],
        file_hash=digest,
        import_date=branch_today(db, user.branch_id),
        rows_json=rows,
        summary_json=summary,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return {"id": batch.id, "status": batch.status, "summary": summary, "rows": rows}


@router.post("/manager/imports/{batch_id}/confirm")
def import_confirm(
    batch_id: int, user: User = Depends(current_user), db: Session = Depends(db_session)
):
    require_role(user, Role.BRANCH_MANAGER)
    batch = db.scalar(
        select(ImportBatch)
        .where(ImportBatch.id == batch_id, ImportBatch.branch_id == user.branch_id)
        .with_for_update()
    )
    if not batch:
        raise HTTPException(404, "Import not found.")
    if batch.status == "CONFIRMED":
        return {"id": batch.id, "status": "CONFIRMED", "summary": batch.summary_json}
    if batch.import_date != branch_today(db, user.branch_id):
        raise HTTPException(409, "Preview expired. Upload the file again today.")
    if db.scalar(
        select(ImportBatch.id).where(
            ImportBatch.branch_id == user.branch_id,
            ImportBatch.file_hash == batch.file_hash,
            ImportBatch.status == "CONFIRMED",
        )
    ):
        raise HTTPException(409, "This file has already been imported.")
    if batch.summary_json["invalid"]:
        raise HTTPException(422, "Correct all invalid rows before confirming.")
    counts = {"assigned": 0, "retained": 0, "unassigned": 0}
    try:
        for row in batch.rows_json:
            loan = db.scalar(select(Loan).where(Loan.loan_number == row["loan_id"]))
            if loan and loan.branch_id != user.branch_id:
                raise HTTPException(403, "Loan belongs to another branch.")
            outstanding = Decimal(row["outstanding_amount"])
            overdue = Decimal(row["overdue_amount"])
            if loan:
                snapshot = db.scalar(
                    select(Snapshot).where(
                        Snapshot.loan_id == loan.id, Snapshot.snapshot_date == batch.import_date
                    )
                )
                if snapshot and (
                    snapshot.outstanding != outstanding
                    or snapshot.overdue != overdue
                    or snapshot.dpd != row["dpd"]
                ):
                    raise HTTPException(409, f"Same-day snapshot conflict for {loan.loan_number}.")
            else:
                borrower = Borrower(
                    borrower_code=f"IMP-{batch.id}-{row['row']}",
                    legal_name=row["borrower_name"],
                    display_name=row["borrower_name"],
                    phone=row["borrower_phone"],
                    pincode=row["pincode"],
                    address_line=row["address"],
                    latitude=row.get("latitude"),
                    longitude=row.get("longitude"),
                )
                db.add(borrower)
                db.flush()
                loan = Loan(
                    loan_number=row["loan_id"],
                    borrower_id=borrower.id,
                    branch_id=user.branch_id,
                    principal_amount=outstanding,
                    product_type=row["business_category"],
                )
                db.add(loan)
                db.flush()
                snapshot = None
            if not snapshot:
                db.add(
                    Snapshot(
                        loan_id=loan.id,
                        snapshot_date=batch.import_date,
                        outstanding=outstanding,
                        overdue=overdue,
                        dpd=row["dpd"],
                        source_import_id=batch.id,
                        score=min(95, 45 + row["dpd"]),
                        band="HIGH" if row["dpd"] >= 25 else "MEDIUM",
                        reasons="DPD increasing|Outstanding exposure|Newly imported",
                    )
                )
                db.flush()
            result = assign(db, loan, batch.import_date)
            counts[result.lower()] += 1
            audit(
                db,
                user,
                loan.id,
                "Imported loan snapshot",
                {"import_id": batch.id, "assignment": result},
            )
        batch.status = "CONFIRMED"
        batch.confirmed_at = datetime.now(UTC)
        batch.summary_json = {**batch.summary_json, **counts}
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409, "Import or assignment changed during confirmation. Refresh and try again."
        ) from None
    except Exception:
        db.rollback()
        raise
    return {"id": batch.id, "status": batch.status, "summary": batch.summary_json}


@router.get("/manager/imports")
def import_history(user: User = Depends(current_user), db: Session = Depends(db_session)):
    require_role(user, Role.BRANCH_MANAGER)
    batches = db.scalars(
        select(ImportBatch)
        .where(ImportBatch.branch_id == user.branch_id)
        .order_by(ImportBatch.created_at.desc())
        .limit(30)
    ).all()
    return [
        {
            "id": b.id,
            "filename": b.filename,
            "status": b.status,
            "date": b.import_date,
            "summary": b.summary_json,
        }
        for b in batches
    ]


class ReassignBody(BaseModel):
    loan_id: int
    officer_id: int
    expected_version: int = Field(ge=0)
    reason: str = Field(min_length=5, max_length=500)


@router.get("/manager/assignments")
def manager_assignments(user: User = Depends(current_user), db: Session = Depends(db_session)):
    require_role(user, Role.BRANCH_MANAGER)
    today = branch_today(db, user.branch_id)
    loans = db.scalars(
        select(Loan)
        .join(Snapshot, Snapshot.loan_id == Loan.id)
        .where(Loan.branch_id == user.branch_id, Snapshot.snapshot_date == today)
        .order_by(Snapshot.dpd.desc())
    ).all()
    result = []
    for loan in loans:
        assignment = db.scalar(
            select(Assignment).where(
                Assignment.loan_id == loan.id,
                Assignment.assignment_date == today,
                Assignment.status == "ACTIVE",
            )
        )
        borrower = db.get(Borrower, loan.borrower_id)
        eligible_ids = db.scalars(
            select(User.id)
            .join(OfficerProfile, OfficerProfile.user_id == User.id)
            .join(PincodeCoverage, PincodeCoverage.officer_id == User.id)
            .where(
                User.branch_id == user.branch_id,
                User.role == Role.FIELD_OFFICER.value,
                User.is_active.is_(True),
                OfficerProfile.active_status == "ACTIVE",
                PincodeCoverage.pincode == borrower.pincode,
            )
            .order_by(User.id)
        ).all()
        result.append(
            {
                **loan_view(db, loan),
                "officer_id": assignment.officer_id if assignment else None,
                "officer": db.get(User, assignment.officer_id).name if assignment else None,
                "version": assignment.version if assignment else 0,
                "assignment_source": assignment.assignment_source if assignment else "UNASSIGNED",
                "eligible_officer_ids": eligible_ids,
            }
        )
    return result


@router.post("/manager/assignments/reassign")
def reassign(
    body: ReassignBody, user: User = Depends(current_user), db: Session = Depends(db_session)
):
    require_role(user, Role.BRANCH_MANAGER)
    loan = allowed_loan(db, user, body.loan_id)
    officer = db.get(User, body.officer_id)
    profile = db.get(OfficerProfile, body.officer_id)
    if (
        not officer
        or officer.branch_id != user.branch_id
        or officer.role != Role.FIELD_OFFICER.value
        or not officer.is_active
        or not profile
        or profile.active_status != "ACTIVE"
    ):
        raise HTTPException(422, "Select an active officer in your branch.")
    borrower = db.get(Borrower, loan.borrower_id)
    if not db.scalar(
        select(PincodeCoverage.id).where(
            PincodeCoverage.officer_id == officer.id,
            PincodeCoverage.pincode == borrower.pincode,
        )
    ):
        raise HTTPException(422, "Selected officer does not cover this pincode.")
    day = branch_today(db, user.branch_id)
    current = db.scalar(
        select(Assignment)
        .where(
            Assignment.loan_id == loan.id,
            Assignment.assignment_date == day,
            Assignment.status == "ACTIVE",
        )
        .with_for_update()
    )
    if (current.version if current else 0) != body.expected_version:
        raise HTTPException(409, "Assignment changed. Refresh and try again.")
    if current and current.officer_id == officer.id:
        raise HTTPException(409, "This officer already owns the account.")
    if current:
        current.status = "REASSIGNED"
        current.version += 1
    db.add(
        Assignment(
            loan_id=loan.id,
            officer_id=officer.id,
            branch_id=user.branch_id,
            assignment_date=day,
            assignment_source="MANAGER_OVERRIDE",
            version=body.expected_version + 1,
        )
    )
    audit(
        db,
        user,
        loan.id,
        "Assignment overridden",
        {
            "previous_officer_id": current.officer_id if current else None,
            "officer_id": officer.id,
            "reason": body.reason,
        },
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Assignment changed. Refresh and try again.") from None
    return {"status": "ASSIGNED", "officer": officer.name, "version": body.expected_version + 1}


def contact_allowed(now: datetime, timezone: str) -> bool:
    local = now.astimezone(ZoneInfo(timezone)).time()
    return time(8) <= local < time(19)


class ContactBody(BaseModel):
    channel: str = Field(pattern="^(CALL|MESSAGE)$")


@router.post("/loans/{loan_id}/contact-attempts")
def initiate_contact(
    loan_id: int,
    body: ContactBody,
    user: User = Depends(current_user),
    db: Session = Depends(db_session),
):
    require_role(user, Role.FIELD_OFFICER)
    loan = allowed_loan(db, user, loan_id)
    now = datetime.now(UTC)
    allowed = contact_allowed(now, db.get(Branch, user.branch_id).timezone)
    db.add(
        ContactAttempt(
            loan_id=loan_id,
            officer_id=user.id,
            channel=body.channel,
            attempted_at=now,
            allowed=allowed,
            block_reason=None if allowed else "CONTACT_WINDOW_CLOSED",
        )
    )
    audit(
        db,
        user,
        loan_id,
        "Contact initiated" if allowed else "Contact blocked",
        {"channel": body.channel, "allowed": allowed},
    )
    db.commit()
    if not allowed:
        raise HTTPException(
            403,
            {
                "code": "CONTACT_WINDOW_CLOSED",
                "message": "Borrower contact is available between 8:00 AM and 7:00 PM.",
            },
        )
    borrower = db.get(Borrower, loan.borrower_id)
    return {
        "allowed": True,
        "channel": body.channel,
        "phone": borrower.phone if body.channel == "CALL" else None,
    }


class OutcomeBody(BaseModel):
    device_event_id: UUID
    outcome_type: str = Field(pattern="^(PAID|PROMISE_TO_PAY|NOT_REACHABLE|DISPUTE)$")
    occurred_at: datetime
    notes: str = Field(default="", max_length=1000)
    reported_amount: Decimal | None = Field(default=None, gt=0)
    promised_amount: Decimal | None = Field(default=None, gt=0)
    promise_date: date | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    location_status: str = Field(
        default="UNAVAILABLE", pattern="^(CAPTURED|DENIED|TIMEOUT|UNAVAILABLE|LOW_ACCURACY)$"
    )

    @model_validator(mode="after")
    def validate_outcome(self):
        if self.occurred_at.tzinfo is None:
            raise ValueError("Occurrence time must include a timezone.")
        if self.outcome_type == "DISPUTE" and len(self.notes.strip()) < 8:
            raise ValueError("Explain the dispute in at least eight characters.")
        if self.outcome_type == "PROMISE_TO_PAY" and (
            not self.promised_amount or not self.promise_date
        ):
            raise ValueError("Promise amount and due date are required.")
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Supply both coordinates or neither.")
        if self.location_status == "CAPTURED" and self.latitude is None:
            raise ValueError("Captured location requires coordinates.")
        if self.location_status not in ("CAPTURED", "LOW_ACCURACY") and self.latitude is not None:
            raise ValueError("Coordinates require a captured or low-accuracy location status.")
        return self


@router.post("/loans/{loan_id}/outcomes", status_code=201)
def create_outcome(
    loan_id: int,
    body: OutcomeBody,
    user: User = Depends(current_user),
    db: Session = Depends(db_session),
):
    return record_outcome(db, user, loan_id, body)


def record_outcome(
    db: Session,
    user: User,
    loan_id: int,
    body: OutcomeBody,
    *,
    commit: bool = True,
):
    require_role(user, Role.FIELD_OFFICER)
    allowed_loan(db, user, loan_id)
    event_id = str(body.device_event_id)
    existing = db.scalar(
        select(CollectionOutcome).where(CollectionOutcome.device_event_id == event_id)
    )
    if existing:
        if existing.officer_id != user.id or existing.loan_id != loan_id:
            raise HTTPException(409, "Event ID has already been used.")
        return {"id": existing.id, "status": "RECORDED", "duplicate": True}
    today = branch_today(db, user.branch_id)
    if body.outcome_type == "PROMISE_TO_PAY":
        if body.promise_date < today:
            raise HTTPException(422, "Promise date cannot be in the past.")
        open_promise = db.scalar(
            select(Promise.id).where(Promise.loan_id == loan_id, Promise.status == "OPEN")
        )
        if open_promise:
            raise HTTPException(409, "This account already has an open promise.")
    latest = db.scalar(
        select(Snapshot).where(Snapshot.loan_id == loan_id).order_by(Snapshot.snapshot_date.desc())
    )
    reported = (
        body.promised_amount if body.outcome_type == "PROMISE_TO_PAY" else body.reported_amount
    )
    if reported and latest and reported > latest.outstanding:
        raise HTTPException(422, "Reported amount cannot exceed current outstanding.")
    now = datetime.now(UTC)
    event = CollectionOutcome(
        loan_id=loan_id,
        officer_id=user.id,
        outcome_type=body.outcome_type,
        notes=body.notes.strip(),
        occurred_at=body.occurred_at,
        created_at=now,
        latitude=body.latitude,
        longitude=body.longitude,
        location_status=body.location_status,
        reported_amount=body.reported_amount,
        device_event_id=event_id,
        review_status="OPEN" if body.outcome_type == "DISPUTE" else "NOT_APPLICABLE",
    )
    db.add(event)
    db.flush()
    promise_id = None
    if body.outcome_type == "PROMISE_TO_PAY":
        promise = Promise(
            loan_id=loan_id,
            officer_id=user.id,
            amount=body.promised_amount,
            promise_date=body.promise_date,
            status="OPEN",
        )
        db.add(promise)
        db.flush()
        promise_id = promise.id
        db.add(
            PromiseTransition(
                promise_id=promise.id,
                actor_user_id=user.id,
                from_status="NONE",
                to_status="OPEN",
                reason="Outcome recorded",
            )
        )
    db.add(
        Activity(
            branch_id=user.branch_id,
            officer_id=user.id,
            loan_id=loan_id,
            event=body.outcome_type,
            occurred_at=body.occurred_at,
        )
    )
    audit(
        db,
        user,
        loan_id,
        f"Outcome: {body.outcome_type}",
        {
            "event_id": event_id,
            "location_status": body.location_status,
            "outcome_id": event.id,
            "promise_id": promise_id,
        },
    )
    if commit:
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            existing = db.scalar(
                select(CollectionOutcome).where(CollectionOutcome.device_event_id == event_id)
            )
            if existing and existing.officer_id == user.id and existing.loan_id == loan_id:
                return {"id": existing.id, "status": "RECORDED", "duplicate": True}
            raise HTTPException(409, "Outcome conflicts with an existing event.") from None
    return {"id": event.id, "status": "RECORDED", "duplicate": False, "promise_id": promise_id}


def reconcile_promises(db: Session, branch_id: int):
    today = branch_today(db, branch_id)
    rows = db.scalars(
        select(Promise)
        .join(Loan, Loan.id == Promise.loan_id)
        .where(Loan.branch_id == branch_id, Promise.status == "OPEN", Promise.promise_date < today)
    ).all()
    for promise in rows:
        promise.status = "BROKEN"
        promise.version += 1
        db.add(
            PromiseTransition(
                promise_id=promise.id,
                actor_user_id=None,
                from_status="OPEN",
                to_status="BROKEN",
                reason="Due date elapsed",
            )
        )
    if rows:
        db.commit()


class PromiseAction(BaseModel):
    expected_version: int = Field(ge=1)
    reason: str = Field(min_length=5, max_length=500)


def change_promise(db: Session, user: User, promise_id: int, body: PromiseAction, target: str):
    reconcile_promises(db, user.branch_id)
    promise = db.scalar(select(Promise).where(Promise.id == promise_id).with_for_update())
    if not promise:
        raise HTTPException(404, "Promise not found.")
    allowed_loan(db, user, promise.loan_id)
    if promise.version != body.expected_version:
        raise HTTPException(409, "Promise changed. Refresh and try again.")
    if target == "CANCELLED" and promise.status != "OPEN":
        raise HTTPException(409, "Only open promises can be cancelled.")
    if target == "KEPT" and promise.status not in ("OPEN", "BROKEN"):
        raise HTTPException(409, "This promise cannot be marked kept.")
    previous = promise.status
    promise.status = target
    promise.version += 1
    db.add(
        PromiseTransition(
            promise_id=promise.id,
            actor_user_id=user.id,
            from_status=previous,
            to_status=target,
            reason=body.reason,
        )
    )
    audit(
        db,
        user,
        promise.loan_id,
        f"Promise {target.lower()}",
        {"promise_id": promise.id, "reason": body.reason, "mock_verification": target == "KEPT"},
    )
    db.commit()
    return {"id": promise.id, "status": target, "version": promise.version}


@router.post("/promises/{promise_id}/mark-kept")
def mark_kept(
    promise_id: int,
    body: PromiseAction,
    user: User = Depends(current_user),
    db: Session = Depends(db_session),
):
    return change_promise(db, user, promise_id, body, "KEPT")


@router.post("/promises/{promise_id}/cancel")
def cancel_promise(
    promise_id: int,
    body: PromiseAction,
    user: User = Depends(current_user),
    db: Session = Depends(db_session),
):
    return change_promise(db, user, promise_id, body, "CANCELLED")


@router.get("/promises/{promise_id}/history")
def promise_history(
    promise_id: int, user: User = Depends(current_user), db: Session = Depends(db_session)
):
    promise = db.get(Promise, promise_id)
    if not promise:
        raise HTTPException(404, "Promise not found.")
    allowed_loan(db, user, promise.loan_id)
    rows = db.scalars(
        select(PromiseTransition)
        .where(PromiseTransition.promise_id == promise_id)
        .order_by(PromiseTransition.occurred_at)
    ).all()
    return [
        {
            "from": row.from_status,
            "to": row.to_status,
            "reason": row.reason,
            "time": row.occurred_at,
            "actor": db.get(User, row.actor_user_id).name if row.actor_user_id else "System",
        }
        for row in rows
    ]


@router.get("/promises/{promise_id}/reminder")
def reminder(
    promise_id: int,
    language: str = "en",
    user: User = Depends(current_user),
    db: Session = Depends(db_session),
):
    promise = db.get(Promise, promise_id)
    if not promise:
        raise HTTPException(404, "Promise not found.")
    loan = allowed_loan(db, user, promise.loan_id)
    borrower = db.get(Borrower, loan.borrower_id)
    value = format(promise.amount, ".2f")
    due = promise.promise_date.strftime("%d %b %Y")
    message = (
        f"Namaste {borrower.display_name}, this is a reminder of your promised payment of ₹{value} due on {due}. Please contact your branch if you need help. — Pace demo"
        if language == "en"
        else f"नमस्ते {borrower.display_name}, ₹{value} का आपका वादा किया भुगतान {due} को देय है। सहायता के लिए शाखा से संपर्क करें। — Pace डेमो"
    )
    return {
        "simulation": True,
        "language": language,
        "message": message,
        "drafting_engine": "approved-template-v1",
        "human_review_required": True,
        "variables": ["borrower_display_name", "promised_amount", "promise_due_date"],
    }


def cohort(db: Session, branch_id: int, start: date, follow: date):
    initial = db.execute(
        select(Snapshot.loan_id, Snapshot.dpd)
        .join(Loan, Loan.id == Snapshot.loan_id)
        .where(
            Loan.branch_id == branch_id,
            Snapshot.snapshot_date == start,
            Snapshot.dpd >= 1,
            Snapshot.dpd <= 30,
        )
    ).all()
    ids = {loan_id for loan_id, _ in initial}
    if not ids:
        return {
            "start": start,
            "follow_up": follow,
            "eligible": 0,
            "observed": 0,
            "missing": 0,
            "rolled": 0,
            "rate": None,
            "coverage": None,
        }
    observed = db.execute(
        select(Snapshot.loan_id, Snapshot.dpd).where(
            Snapshot.snapshot_date == follow, Snapshot.loan_id.in_(ids)
        )
    ).all()
    rolled = sum(31 <= dpd <= 60 for _, dpd in observed)
    return {
        "start": start,
        "follow_up": follow,
        "eligible": len(ids),
        "observed": len(observed),
        "missing": len(ids) - len(observed),
        "rolled": rolled,
        "rate": round(100 * rolled / len(ids), 1) if observed else None,
        "coverage": round(100 * len(observed) / len(ids), 1),
    }


@router.get("/manager/analytics/roll-rates")
def roll_rates(user: User = Depends(current_user), db: Session = Depends(db_session)):
    require_role(user, Role.BRANCH_MANAGER)
    days = db.scalars(
        select(Snapshot.snapshot_date)
        .join(Loan, Loan.id == Snapshot.loan_id)
        .where(Loan.branch_id == user.branch_id)
        .distinct()
        .order_by(Snapshot.snapshot_date)
    ).all()
    periods = [
        cohort(db, user.branch_id, days[i], days[i + 1])
        for i in range(len(days) - 1)
        if 28 <= (days[i + 1] - days[i]).days <= 32
    ]
    return {"target": 16, "brief_baseline": 22, "periods": periods[-6:]}


@router.get("/manager/analytics/overview")
def analytics_overview(user: User = Depends(current_user), db: Session = Depends(db_session)):
    require_role(user, Role.BRANCH_MANAGER)
    reconcile_promises(db, user.branch_id)
    day = branch_today(db, user.branch_id)
    rows = db.execute(
        select(Loan, Snapshot)
        .join(Snapshot, Snapshot.loan_id == Loan.id)
        .where(Loan.branch_id == user.branch_id, Snapshot.snapshot_date == day)
    ).all()
    loans = {loan.id for loan, _ in rows}
    assignments = db.scalars(
        select(Assignment).where(
            Assignment.branch_id == user.branch_id,
            Assignment.assignment_date == day,
            Assignment.status == "ACTIVE",
        )
    ).all()
    assigned = {item.loan_id for item in assignments}
    promises = db.scalars(
        select(Promise)
        .join(Loan, Loan.id == Promise.loan_id)
        .where(Loan.branch_id == user.branch_id)
    ).all()
    outcomes = db.scalars(
        select(CollectionOutcome)
        .join(Loan, Loan.id == CollectionOutcome.loan_id)
        .where(
            Loan.branch_id == user.branch_id,
            CollectionOutcome.created_at
            >= datetime.combine(
                day, time.min, tzinfo=ZoneInfo(db.get(Branch, user.branch_id).timezone)
            ).astimezone(UTC),
        )
    ).all()
    same_day = sum(
        o.occurred_at.astimezone(ZoneInfo(db.get(Branch, user.branch_id).timezone)).date()
        == o.created_at.astimezone(ZoneInfo(db.get(Branch, user.branch_id).timezone)).date()
        for o in outcomes
    )
    return {
        "buckets": {
            "1_30": sum(1 <= s.dpd <= 30 for _, s in rows),
            "31_60": sum(31 <= s.dpd <= 60 for _, s in rows),
            "61_plus": sum(s.dpd >= 61 for _, s in rows),
        },
        "assigned": len(loans & assigned),
        "unassigned": len(loans - assigned),
        "broken_promises": sum(p.status == "BROKEN" for p in promises),
        "due_today": sum(p.status == "OPEN" and p.promise_date == day for p in promises),
        "outcomes_today": len(outcomes),
        "same_day_logging_rate": round(100 * same_day / len(outcomes), 1) if outcomes else None,
        "open_disputes": db.scalar(
            select(func.count(CollectionOutcome.id))
            .join(Loan, Loan.id == CollectionOutcome.loan_id)
            .where(
                Loan.branch_id == user.branch_id,
                CollectionOutcome.outcome_type == "DISPUTE",
                CollectionOutcome.review_status == "OPEN",
            )
        ),
        "roll_rate": roll_rates(user, db),
    }


@router.get("/manager/promises")
def manager_promises(user: User = Depends(current_user), db: Session = Depends(db_session)):
    require_role(user, Role.BRANCH_MANAGER)
    reconcile_promises(db, user.branch_id)
    rows = db.execute(
        select(Promise, Loan)
        .join(Loan, Promise.loan_id == Loan.id)
        .where(Loan.branch_id == user.branch_id)
        .order_by(Promise.promise_date.desc())
    ).all()
    return [
        {
            **loan_view(db, loan),
            "promise_id": promise.id,
            "amount": format(promise.amount, ".2f"),
            "promise_date": promise.promise_date,
            "promise_status": promise.status,
            "version": promise.version,
            "officer": db.get(User, promise.officer_id).name,
        }
        for promise, loan in rows
    ]


@router.post("/promises/{promise_id}/send-reminder")
def send_reminder(
    promise_id: int,
    language: str = "en",
    user: User = Depends(current_user),
    db: Session = Depends(db_session),
):
    require_role(user, Role.FIELD_OFFICER)
    promise = db.get(Promise, promise_id)
    if not promise:
        raise HTTPException(404, "Promise not found.")
    allowed_loan(db, user, promise.loan_id)
    initiate_contact(promise.loan_id, ContactBody(channel="MESSAGE"), user, db)
    content = reminder(promise_id, language, user, db)
    return {**content, "status": "SIMULATED_DELIVERY", "sent_at": datetime.now(UTC)}
