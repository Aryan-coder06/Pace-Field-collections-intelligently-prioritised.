import hashlib
import os
import secrets
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pwdlib import PasswordHash
from sqlalchemy import (
    create_engine,
    select,
    text,
)
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.models import (
    Activity,
    Assignment,
    AuditEvent,
    Borrower,
    Branch,
    CollectionOutcome,
    Loan,
    Promise,
    RefreshSession,
    Role,
    Snapshot,
    User,
)
from app.schemas import (
    ActivityOut,
    LoanDetailOut,
    LoginBody,
    ManagerOverviewOut,
    OfficerWorkloadOut,
    PromiseOut,
    SessionOut,
    TodayOut,
)

load_dotenv(Path(__file__).resolve().parents[3] / ".env")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./pace.db")
JWT_SECRET = os.getenv("JWT_SECRET") or secrets.token_urlsafe(48)
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(engine, expire_on_commit=False)
password_hash = PasswordHash.recommended()
oauth = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


app = FastAPI(title="Pace API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("WEB_ORIGIN", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


def db_session():
    with SessionLocal() as session:
        yield session


def token_for(user: User) -> str:
    return jwt.encode(
        {"sub": str(user.id), "exp": datetime.now(UTC) + timedelta(minutes=20)},
        JWT_SECRET,
        algorithm="HS256",
    )


def business_date() -> date:
    return datetime.now(ZoneInfo("Asia/Kolkata")).date()


def business_day_start_utc() -> datetime:
    return datetime.combine(business_date(), time.min, tzinfo=ZoneInfo("Asia/Kolkata")).astimezone(
        UTC
    )


def issue_refresh(db: Session, user: User) -> str:
    raw = secrets.token_urlsafe(48)
    digest = hashlib.sha256(raw.encode()).hexdigest()
    db.add(
        RefreshSession(
            user_id=user.id,
            token_digest=digest,
            expires_at=datetime.now(UTC)
            + timedelta(days=int(os.getenv("REFRESH_TOKEN_DAYS", "14"))),
        )
    )
    db.commit()
    return raw


def current_user(
    request: Request, token: str | None = Depends(oauth), db: Session = Depends(db_session)
) -> User:
    token = token or request.cookies.get("pace_access")
    if not token:
        raise HTTPException(401, "Sign in to continue.", headers={"WWW-Authenticate": "Bearer"})
    try:
        user_id = int(jwt.decode(token, JWT_SECRET, algorithms=["HS256"])["sub"])
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(
            401, "Session expired. Sign in again.", headers={"WWW-Authenticate": "Bearer"}
        ) from None
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "Account is unavailable.")
    return user


def require_role(user: User, role: Role):
    if user.role != role.value:
        raise HTTPException(403, "You don't have access to this workspace.")


def loan_view(db: Session, loan: Loan, snapshot: Snapshot | None = None):
    borrower = db.get(Borrower, loan.borrower_id)
    snap = snapshot or db.scalar(
        select(Snapshot).where(Snapshot.loan_id == loan.id).order_by(Snapshot.snapshot_date.desc())
    )
    latest_promise = db.scalar(
        select(Promise).where(Promise.loan_id == loan.id).order_by(Promise.created_at.desc())
    )
    touched = (
        db.scalar(
            select(CollectionOutcome.id)
            .where(
                CollectionOutcome.loan_id == loan.id,
                CollectionOutcome.created_at >= business_day_start_utc(),
            )
            .limit(1)
        )
        is not None
    )
    last_event = db.scalar(
        select(AuditEvent)
        .where(AuditEvent.entity_type == "Loan", AuditEvent.entity_id == str(loan.id))
        .order_by(AuditEvent.occurred_at.desc())
    )
    return {
        "id": loan.id,
        "loan_number": loan.loan_number,
        "borrower": borrower.display_name,
        "legal_name": borrower.legal_name,
        "phone": borrower.phone,
        "address": borrower.address_line,
        "pincode": borrower.pincode,
        "product": loan.product_type,
        "outstanding": format(snap.outstanding, ".2f"),
        "overdue": format(snap.overdue, ".2f"),
        "dpd": snap.dpd,
        "score": snap.score,
        "band": snap.band,
        "reasons": snap.reasons.split("|"),
        "promise_status": latest_promise.status if latest_promise else None,
        "touched": touched,
        "last_activity": last_event.action if last_event else None,
        "next_action": "Follow up on broken promise"
        if latest_promise and latest_promise.status == "BROKEN"
        else "Review open promise"
        if latest_promise and latest_promise.status == "OPEN"
        else "Review recorded outcome"
        if touched
        else "Contact borrower",
    }


@app.get("/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        raise HTTPException(503, "Database is unavailable.") from None
    return {"status": "ok"}


@app.post("/auth/login", response_model=SessionOut)
def login(body: LoginBody, response: Response, db: Session = Depends(db_session)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not password_hash.verify(body.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect.")
    if not user.is_active:
        raise HTTPException(403, "This account has been deactivated.")
    response.set_cookie(
        "pace_access",
        token_for(user),
        httponly=True,
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        max_age=1200,
        path="/",
    )
    response.set_cookie(
        "pace_refresh",
        issue_refresh(db, user),
        httponly=True,
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        max_age=int(os.getenv("REFRESH_TOKEN_DAYS", "14")) * 86400,
        path="/auth",
    )
    return SessionOut(
        id=user.id, name=user.name, email=user.email, role=user.role, branch_id=user.branch_id
    )


@app.post("/auth/refresh", response_model=SessionOut)
def refresh(request: Request, response: Response, db: Session = Depends(db_session)):
    raw = request.cookies.get("pace_refresh")
    if not raw:
        raise HTTPException(401, "Refresh session expired. Sign in again.")
    digest = hashlib.sha256(raw.encode()).hexdigest()
    session = db.scalar(select(RefreshSession).where(RefreshSession.token_digest == digest))
    now = datetime.now(UTC)
    if not session or session.revoked_at or session.expires_at.replace(tzinfo=UTC) <= now:
        raise HTTPException(401, "Refresh session expired. Sign in again.")
    user = db.get(User, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "Account is unavailable.")
    session.revoked_at = now
    db.commit()
    response.set_cookie(
        "pace_access",
        token_for(user),
        httponly=True,
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        max_age=1200,
        path="/",
    )
    response.set_cookie(
        "pace_refresh",
        issue_refresh(db, user),
        httponly=True,
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        max_age=int(os.getenv("REFRESH_TOKEN_DAYS", "14")) * 86400,
        path="/auth",
    )
    return SessionOut(
        id=user.id, name=user.name, email=user.email, role=user.role, branch_id=user.branch_id
    )


@app.post("/auth/logout")
def logout(request: Request, response: Response, db: Session = Depends(db_session)):
    raw = request.cookies.get("pace_refresh")
    if raw:
        digest = hashlib.sha256(raw.encode()).hexdigest()
        session = db.scalar(select(RefreshSession).where(RefreshSession.token_digest == digest))
        if session and not session.revoked_at:
            session.revoked_at = datetime.now(UTC)
            db.commit()
    response.delete_cookie("pace_access", path="/")
    response.delete_cookie("pace_refresh", path="/auth")
    return {"status": "signed_out"}


@app.get("/auth/me", response_model=SessionOut)
def me(user: User = Depends(current_user)):
    return SessionOut(
        id=user.id, name=user.name, email=user.email, role=user.role, branch_id=user.branch_id
    )


@app.get("/officer/today", response_model=TodayOut)
def officer_today(user: User = Depends(current_user), db: Session = Depends(db_session)):
    require_role(user, Role.FIELD_OFFICER)
    from app.stage2 import reconcile_promises

    reconcile_promises(db, user.branch_id)
    today = business_date()
    rows = db.execute(
        select(Loan, Snapshot)
        .join(Assignment, Assignment.loan_id == Loan.id)
        .join(Snapshot, Snapshot.loan_id == Loan.id)
        .where(
            Assignment.officer_id == user.id,
            Assignment.status == "ACTIVE",
            Assignment.assignment_date == today,
            Snapshot.snapshot_date == today,
        )
    ).all()
    items = [loan_view(db, loan, snap) for loan, snap in rows]
    items.sort(key=lambda x: (-x["score"], -x["dpd"]))
    for rank, item in enumerate(items, 1):
        item["rank"] = rank
    total = sum((Decimal(x["outstanding"]) for x in items), Decimal("0.00"))
    return {
        "officer": user.name,
        "date": today.isoformat(),
        "accounts": len(items),
        "outstanding_total": format(total, ".2f"),
        "completed": sum(bool(x["touched"]) for x in items),
        "items": items,
    }


@app.get("/loans/{loan_id}", response_model=LoanDetailOut)
def get_loan(loan_id: int, user: User = Depends(current_user), db: Session = Depends(db_session)):
    from app.stage2 import reconcile_promises

    reconcile_promises(db, user.branch_id)
    loan = db.get(Loan, loan_id)
    if not loan:
        raise HTTPException(404, "Loan not found.")
    if user.role == Role.FIELD_OFFICER.value:
        permitted = db.scalar(
            select(Assignment.id).where(
                Assignment.loan_id == loan_id,
                Assignment.officer_id == user.id,
                Assignment.status == "ACTIVE",
            )
        )
    else:
        permitted = loan.branch_id == user.branch_id
    if not permitted:
        raise HTTPException(403, "This account isn't in your portfolio.")
    view = loan_view(db, loan)
    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.entity_type == "Loan", AuditEvent.entity_id == str(loan_id))
        .order_by(AuditEvent.occurred_at.desc())
        .limit(12)
    ).all()
    view["history"] = [
        {
            "occurred_at": e.occurred_at.isoformat(),
            "event": e.action,
            "officer": db.get(User, e.actor_user_id).name,
        }
        for e in events
    ]
    view["promises"] = [
        {
            "amount": format(p.amount, ".2f"),
            "promise_date": p.promise_date.isoformat(),
            "status": p.status,
        }
        for p in db.scalars(
            select(Promise).where(Promise.loan_id == loan_id).order_by(Promise.promise_date.desc())
        ).all()
    ]
    return view


@app.get("/officer/promises", response_model=list[PromiseOut])
def promises(user: User = Depends(current_user), db: Session = Depends(db_session)):
    require_role(user, Role.FIELD_OFFICER)
    from app.stage2 import reconcile_promises

    reconcile_promises(db, user.branch_id)
    rows = db.execute(
        select(Promise, Loan)
        .join(Loan, Promise.loan_id == Loan.id)
        .join(Assignment, Assignment.loan_id == Loan.id)
        .where(
            Promise.officer_id == user.id,
            Assignment.officer_id == user.id,
            Assignment.status == "ACTIVE",
            Assignment.assignment_date == business_date(),
        )
        .order_by(Promise.promise_date)
    ).all()
    return [
        {
            **loan_view(db, loan),
            "promise_id": promise.id,
            "amount": format(promise.amount, ".2f"),
            "promise_date": promise.promise_date.isoformat(),
            "promise_status": promise.status,
            "version": promise.version,
        }
        for promise, loan in rows
    ]


@app.get("/officer/recent-activity", response_model=list[ActivityOut])
def officer_recent_activity(user: User = Depends(current_user), db: Session = Depends(db_session)):
    require_role(user, Role.FIELD_OFFICER)
    active_loans = set(
        db.scalars(
            select(Assignment.loan_id).where(
                Assignment.officer_id == user.id,
                Assignment.status == "ACTIVE",
                Assignment.assignment_date == business_date(),
            )
        ).all()
    )
    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.actor_user_id == user.id)
        .order_by(AuditEvent.occurred_at.desc())
        .limit(30)
    ).all()
    return [
        audit_view(db, event)
        for event in events
        if event.entity_type == "Loan"
        and event.entity_id.isdigit()
        and int(event.entity_id) in active_loans
    ]


@app.get("/manager/overview", response_model=ManagerOverviewOut)
def manager_overview(user: User = Depends(current_user), db: Session = Depends(db_session)):
    require_role(user, Role.BRANCH_MANAGER)
    from app.stage2 import reconcile_promises, roll_rates

    reconcile_promises(db, user.branch_id)
    loans = db.scalars(select(Loan).where(Loan.branch_id == user.branch_id)).all()
    rows = [loan_view(db, loan) for loan in loans]
    officers = db.scalars(
        select(User).where(User.branch_id == user.branch_id, User.role == Role.FIELD_OFFICER.value)
    ).all()
    total = sum((Decimal(x["outstanding"]) for x in rows), Decimal("0.00"))
    periods = roll_rates(user, db)["periods"]
    trend = [
        {"month": period["follow_up"].strftime("%b"), "rate": round(period["rate"])}
        for period in periods
        if period["rate"] is not None
    ]
    return {
        "branch": db.get(Branch, user.branch_id).name,
        "accounts": len(rows),
        "overdue_total": format(total, ".2f"),
        "dpd_1_30": sum(1 for x in rows if 1 <= x["dpd"] <= 30),
        "broken_promises": db.query(Promise)
        .filter(Promise.status == "BROKEN", Promise.officer_id.in_([o.id for o in officers]))
        .count(),
        "activity_today": db.query(Activity)
        .filter(
            Activity.branch_id == user.branch_id, Activity.occurred_at >= business_day_start_utc()
        )
        .count(),
        "officers": len(officers),
        "trend": trend,
    }


@app.get("/manager/officers", response_model=list[OfficerWorkloadOut])
def manager_officers(user: User = Depends(current_user), db: Session = Depends(db_session)):
    require_role(user, Role.BRANCH_MANAGER)
    officers = db.scalars(
        select(User).where(User.branch_id == user.branch_id, User.role == Role.FIELD_OFFICER.value)
    ).all()
    result = []
    for officer in officers:
        loans = db.execute(
            select(Loan, Snapshot)
            .join(Assignment, Assignment.loan_id == Loan.id)
            .join(Snapshot, Snapshot.loan_id == Loan.id)
            .where(
                Assignment.officer_id == officer.id,
                Assignment.status == "ACTIVE",
                Assignment.assignment_date == business_date(),
                Snapshot.snapshot_date == business_date(),
            )
        ).all()
        amount = sum((s.outstanding for _, s in loans), Decimal("0.00"))
        result.append(
            {
                "id": officer.id,
                "name": officer.name,
                "phone": officer.phone,
                "assigned": len(loans),
                "outstanding": format(amount, ".2f"),
                "high_priority": sum(s.band == "HIGH" for _, s in loans),
                "active": bool(loans),
            }
        )
    return result


@app.get("/manager/recent-activity", response_model=list[ActivityOut])
def recent_activity(user: User = Depends(current_user), db: Session = Depends(db_session)):
    require_role(user, Role.BRANCH_MANAGER)
    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.branch_id == user.branch_id)
        .order_by(AuditEvent.occurred_at.desc())
        .limit(20)
    ).all()
    return [
        audit_view(db, event)
        for event in events
        if event.entity_type == "Loan" and event.entity_id.isdigit()
    ]


def audit_view(db: Session, event: AuditEvent):
    loan = db.get(Loan, int(event.entity_id))
    outcome_id = event.metadata_json.get("outcome_id") if event.metadata_json else None
    outcome = db.get(CollectionOutcome, outcome_id) if outcome_id else None
    return {
        "time": event.occurred_at.isoformat(),
        "officer": db.get(User, event.actor_user_id).name,
        "borrower": db.get(Borrower, loan.borrower_id).display_name,
        "event": event.action,
        "audit_id": event.id,
        "location_status": outcome.location_status if outcome else None,
        "latitude": outcome.latitude if outcome else None,
        "longitude": outcome.longitude if outcome else None,
    }


# Stage 2 routes use the same authentication and database dependencies.
from app.stage2 import router as collections_router

app.include_router(collections_router)
