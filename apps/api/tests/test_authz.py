from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import (
    app,
    business_date,
    db_session,
    password_hash,
)
from app.models import (
    Assignment,
    AuditEvent,
    Base,
    Borrower,
    Branch,
    Loan,
    OfficerProfile,
    PincodeCoverage,
    Promise,
    Snapshot,
    User,
)


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as db:
        branch = Branch(code="IDR-T", name="Indore Test", city="Indore")
        other = Branch(code="UJN-T", name="Ujjain Test", city="Ujjain")
        db.add_all([branch, other])
        db.flush()
        pw = password_hash.hash("correct horse battery")
        manager = User(
            employee_code="M-T",
            name="Manager",
            email="manager@example.com",
            password_hash=pw,
            role="BRANCH_MANAGER",
            branch_id=branch.id,
        )
        other_manager = User(
            employee_code="OM-T",
            name="Other Manager",
            email="other@example.com",
            password_hash=pw,
            role="BRANCH_MANAGER",
            branch_id=other.id,
        )
        officer = User(
            employee_code="O-T",
            name="Officer",
            email="officer@example.com",
            password_hash=pw,
            role="FIELD_OFFICER",
            branch_id=branch.id,
        )
        other_officer = User(
            employee_code="OO-T",
            name="Other Officer",
            email="otherofficer@example.com",
            password_hash=pw,
            role="FIELD_OFFICER",
            branch_id=branch.id,
        )
        db.add_all([manager, other_manager, officer, other_officer])
        db.flush()
        db.add(OfficerProfile(user_id=officer.id, home_pincode="452001", workload_capacity=12))
        db.add(PincodeCoverage(officer_id=officer.id, pincode="452001"))
        db.add(
            OfficerProfile(user_id=other_officer.id, home_pincode="452001", workload_capacity=12)
        )
        db.add(PincodeCoverage(officer_id=other_officer.id, pincode="452001"))
        b = Borrower(
            borrower_code="B-T",
            legal_name="Synthetic Works",
            display_name="Synthetic Works",
            phone="+919000000000",
            pincode="452001",
        )
        b2 = Borrower(
            borrower_code="B2-T",
            legal_name="Other Works",
            display_name="Other Works",
            phone="+919000000001",
            pincode="452002",
        )
        db.add_all([b, b2])
        db.flush()
        loan = Loan(
            loan_number="LN-T",
            borrower_id=b.id,
            branch_id=branch.id,
            principal_amount=Decimal(100000),
            product_type="Working capital",
        )
        other_loan = Loan(
            loan_number="LN-OT",
            borrower_id=b2.id,
            branch_id=other.id,
            principal_amount=Decimal(100000),
            product_type="Working capital",
        )
        db.add_all([loan, other_loan])
        db.flush()
        db.add_all(
            [
                Snapshot(
                    loan_id=loan.id,
                    snapshot_date=business_date(),
                    outstanding=Decimal(90000),
                    overdue=Decimal(12000),
                    dpd=12,
                    score=75,
                    band="HIGH",
                    reasons="DPD|Balance|Visit",
                ),
                Snapshot(
                    loan_id=other_loan.id,
                    snapshot_date=business_date(),
                    outstanding=Decimal(80000),
                    overdue=Decimal(9000),
                    dpd=9,
                    score=55,
                    band="MEDIUM",
                    reasons="Age|Balance|Visit",
                ),
                Assignment(
                    loan_id=loan.id,
                    officer_id=officer.id,
                    branch_id=branch.id,
                    assignment_date=business_date(),
                ),
                Assignment(
                    loan_id=other_loan.id,
                    officer_id=other_officer.id,
                    branch_id=other.id,
                    assignment_date=business_date(),
                ),
                Promise(
                    loan_id=loan.id,
                    officer_id=officer.id,
                    amount=Decimal(5000),
                    promise_date=business_date(),
                    status="OPEN",
                ),
                Promise(
                    loan_id=other_loan.id,
                    officer_id=other_officer.id,
                    amount=Decimal(4000),
                    promise_date=business_date(),
                    status="OPEN",
                ),
                AuditEvent(
                    actor_user_id=officer.id,
                    branch_id=branch.id,
                    entity_type="Loan",
                    entity_id=str(loan.id),
                    action="Visited account",
                    occurred_at=datetime.now(UTC),
                ),
                AuditEvent(
                    actor_user_id=other_officer.id,
                    branch_id=other.id,
                    entity_type="Loan",
                    entity_id=str(other_loan.id),
                    action="Called account",
                    occurred_at=datetime.now(UTC),
                ),
            ]
        )
        db.commit()
        ids = {"loan": loan.id, "other_loan": other_loan.id}

    def override_db():
        with factory() as db:
            yield db

    app.dependency_overrides[db_session] = override_db
    with TestClient(app) as c:
        c.test_ids = ids
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


def login(c, email):
    response = c.post("/auth/login", json={"email": email, "password": "correct horse battery"})
    if response.status_code == 200 and c.cookies.get("pace_csrf"):
        c.headers["X-CSRF-Token"] = c.cookies.get("pace_csrf")
    return response


def test_login_and_me(client):
    assert login(client, "officer@example.com").status_code == 200
    assert client.get("/auth/me").json()["role"] == "FIELD_OFFICER"


def test_failed_login(client):
    assert (
        client.post(
            "/auth/login", json={"email": "officer@example.com", "password": "wrong"}
        ).status_code
        == 401
    )


def test_login_throttling_and_csrf_protection(client):
    for _ in range(5):
        assert (
            client.post(
                "/auth/login",
                json={"email": "throttle@example.com", "password": "wrong"},
            ).status_code
            == 401
        )
    limited = client.post(
        "/auth/login", json={"email": "throttle@example.com", "password": "wrong"}
    )
    assert limited.status_code == 429
    assert limited.json()["detail"]["code"] == "LOGIN_RATE_LIMITED"

    assert login(client, "officer@example.com").status_code == 200
    csrf = client.headers.pop("X-CSRF-Token")
    blocked = client.post("/auth/logout")
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "CSRF_VALIDATION_FAILED"
    client.headers["X-CSRF-Token"] = csrf
    assert client.post("/auth/logout").status_code == 200


def test_refresh_rotates_and_logout_revokes(client):
    assert login(client, "officer@example.com").status_code == 200
    old_refresh = client.cookies.get("pace_refresh")
    assert client.post("/auth/refresh").status_code == 200
    assert client.cookies.get("pace_refresh") != old_refresh
    client.cookies.set("pace_refresh", old_refresh, path="/auth")
    assert client.post("/auth/refresh").status_code == 401
    client.cookies.delete("pace_refresh", path="/auth")
    assert login(client, "officer@example.com").status_code == 200
    assert client.post("/auth/logout").status_code == 200
    assert client.post("/auth/refresh").status_code == 401


def test_unauthenticated_blocked(client):
    assert client.get("/officer/today").status_code == 401


def test_officer_can_read_assigned_but_not_another(client):
    login(client, "officer@example.com")
    assert client.get(f"/loans/{client.test_ids['loan']}").status_code == 200
    assert client.get(f"/loans/{client.test_ids['other_loan']}").status_code == 403


def test_officer_promises_and_activity_are_scoped_to_current_assignments(client):
    login(client, "officer@example.com")
    promises = client.get("/officer/promises").json()
    activity = client.get("/officer/recent-activity").json()
    assert len(promises) == 1
    assert promises[0]["loan_number"] == "LN-T"
    assert len(activity) == 1
    assert activity[0]["borrower"] == "Synthetic Works"


def test_manager_branch_boundary(client):
    login(client, "manager@example.com")
    assert client.get(f"/loans/{client.test_ids['loan']}").status_code == 200
    login(client, "other@example.com")
    assert client.get(f"/loans/{client.test_ids['loan']}").status_code == 403


def test_health_and_seed_queue(client):
    assert client.get("/health").json() == {"status": "ok"}
    login(client, "officer@example.com")
    payload = client.get("/officer/today").json()
    assert payload["accounts"] == 1
    assert payload["items"][0]["loan_number"] == "LN-T"


def test_csv_preview_confirm_assignment_and_idempotency(client):
    assert login(client, "manager@example.com").status_code == 200
    content = b"loan_id,borrower_name,outstanding_amount,dpd,pincode,overdue_amount\nLN-NEW,Synthetic Parts,150000,18,452001,25000\n"
    preview = client.post(
        "/manager/imports/preview", files={"file": ("daily.csv", content, "text/csv")}
    )
    assert preview.status_code == 200
    batch = preview.json()
    assert batch["summary"]["valid"] == 1
    confirmed = client.post(f"/manager/imports/{batch['id']}/confirm")
    assert confirmed.status_code == 200
    assert confirmed.json()["summary"]["assigned"] == 1
    assert client.post(f"/manager/imports/{batch['id']}/confirm").status_code == 200
    assignment = next(
        x for x in client.get("/manager/assignments").json() if x["loan_number"] == "LN-NEW"
    )
    email = (
        "officer@example.com" if assignment["officer"] == "Officer" else "otherofficer@example.com"
    )
    assert login(client, email).status_code == 200
    assert any(
        item["loan_number"] == "LN-NEW" for item in client.get("/officer/today").json()["items"]
    )


def test_csv_invalid_duplicate_and_branch_boundary(client):
    assert login(client, "manager@example.com").status_code == 200
    content = b"loan_id,borrower_name,outstanding_amount,dpd,pincode,last_payment_date\nLN-X,Synthetic,100000,8,452001,invalid-date\nLN-X,Synthetic,100000,8,452001,2026-10-30\n"
    batch = client.post(
        "/manager/imports/preview", files={"file": ("bad.csv", content, "text/csv")}
    ).json()
    assert batch["summary"]["duplicates"] == 1
    assert any("YYYY-MM-DD" in error for error in batch["rows"][0]["errors"])
    assert client.post(f"/manager/imports/{batch['id']}/confirm").status_code == 422
    assert login(client, "other@example.com").status_code == 200
    assert client.post(f"/manager/imports/{batch['id']}/confirm").status_code == 404


def test_outcome_idempotency_promise_and_reported_payment(client):
    assert login(client, "officer@example.com").status_code == 200
    loan_id = client.test_ids["loan"]
    outstanding = client.get(f"/loans/{loan_id}").json()["outstanding"]
    body = {
        "device_event_id": str(uuid4()),
        "outcome_type": "PAID",
        "occurred_at": datetime.now(UTC).isoformat(),
        "reported_amount": "1000.00",
        "location_status": "DENIED",
    }
    first = client.post(f"/loans/{loan_id}/outcomes", json=body)
    assert first.status_code == 201
    assert client.post(f"/loans/{loan_id}/outcomes", json=body).json()["duplicate"] is True
    assert client.get(f"/loans/{loan_id}").json()["outstanding"] == outstanding
    existing = client.get("/officer/promises").json()[0]
    assert (
        client.post(
            f"/promises/{existing['promise_id']}/mark-kept",
            json={"expected_version": existing["version"], "reason": "Mock verified payment"},
        ).status_code
        == 200
    )
    from datetime import timedelta

    body = {
        "device_event_id": str(uuid4()),
        "outcome_type": "PROMISE_TO_PAY",
        "occurred_at": datetime.now(UTC).isoformat(),
        "promised_amount": "3000.00",
        "promise_date": (business_date() + timedelta(days=1)).isoformat(),
    }
    assert client.post(f"/loans/{loan_id}/outcomes", json=body).status_code == 201
    assert any(p["amount"] == "3000.00" for p in client.get("/officer/promises").json())
    assert (
        client.post(f"/loans/{client.test_ids['other_loan']}/outcomes", json=body).status_code
        == 403
    )


def test_contact_window_boundaries_and_blocked_audit(client, monkeypatch):
    from zoneinfo import ZoneInfo

    from app import stage2

    india = ZoneInfo("Asia/Kolkata")
    for hour, minute, expected in [(7, 59, False), (8, 0, True), (18, 59, True), (19, 0, False)]:
        instant = datetime.combine(business_date(), time(hour, minute), tzinfo=india)
        assert stage2.contact_allowed(instant.astimezone(UTC), "Asia/Kolkata") is expected
    real_datetime = stage2.datetime

    class ClosedClock(real_datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.combine(business_date(), time(19), tzinfo=india).astimezone(UTC)

    monkeypatch.setattr(stage2, "datetime", ClosedClock)
    assert login(client, "officer@example.com").status_code == 200
    blocked = client.post(
        f"/loans/{client.test_ids['loan']}/contact-attempts", json={"channel": "CALL"}
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "CONTACT_WINDOW_CLOSED"
    assert (
        client.post(
            f"/loans/{client.test_ids['other_loan']}/contact-attempts", json={"channel": "CALL"}
        ).status_code
        == 403
    )
    db = next(client.app.dependency_overrides[db_session]())
    from app.models import ContactAttempt

    assert (
        db.query(ContactAttempt)
        .filter(
            ContactAttempt.loan_id == client.test_ids["loan"], ContactAttempt.allowed.is_(False)
        )
        .count()
        == 1
    )
    assert client.get(f"/loans/{client.test_ids['loan']}").status_code == 200
    administrative = {
        "device_event_id": str(uuid4()),
        "outcome_type": "NOT_REACHABLE",
        "occurred_at": datetime.now(UTC).isoformat(),
        "location_status": "UNAVAILABLE",
    }
    assert (
        client.post(f"/loans/{client.test_ids['loan']}/outcomes", json=administrative).status_code
        == 201
    )


def test_assignment_override_requires_branch_and_version(client):
    assert login(client, "manager@example.com").status_code == 200
    loan_id = client.test_ids["loan"]
    row = next(x for x in client.get("/manager/assignments").json() if x["id"] == loan_id)
    body = {
        "loan_id": loan_id,
        "officer_id": 4,
        "expected_version": row["version"],
        "reason": "Route coverage adjustment",
    }
    assert client.post("/manager/assignments/reassign", json=body).status_code == 200
    assert client.post("/manager/assignments/reassign", json=body).status_code == 409
    assert login(client, "other@example.com").status_code == 200
    assert client.post("/manager/assignments/reassign", json=body).status_code == 403


def test_import_conflicting_same_day_snapshot_and_unassigned(client):
    assert login(client, "manager@example.com").status_code == 200
    conflict = b"loan_id,borrower_name,outstanding_amount,dpd,pincode\nLN-T,Synthetic Works,999999,12,452001\n"
    preview = client.post(
        "/manager/imports/preview", files={"file": ("conflict.csv", conflict, "text/csv")}
    ).json()
    assert preview["summary"]["invalid"] == 1
    assert "Conflicting same-day" in preview["rows"][0]["errors"][0]
    unassigned = b"loan_id,borrower_name,outstanding_amount,dpd,pincode\nLN-UNASSIGNED,Remote Synthetic Works,100000,10,459999\n"
    batch = client.post(
        "/manager/imports/preview", files={"file": ("remote.csv", unassigned, "text/csv")}
    ).json()
    result = client.post(f"/manager/imports/{batch['id']}/confirm")
    assert result.status_code == 200
    assert result.json()["summary"]["unassigned"] == 1
    row = next(
        x for x in client.get("/manager/assignments").json() if x["loan_number"] == "LN-UNASSIGNED"
    )
    assert row["officer_id"] is None


def test_outcome_validation_and_promise_version(client):
    assert login(client, "officer@example.com").status_code == 200
    loan_id = client.test_ids["loan"]
    body = {
        "device_event_id": str(uuid4()),
        "outcome_type": "DISPUTE",
        "occurred_at": datetime.now(UTC).isoformat(),
        "notes": "short",
    }
    assert client.post(f"/loans/{loan_id}/outcomes", json=body).status_code == 422
    too_large = {
        "device_event_id": str(uuid4()),
        "outcome_type": "PAID",
        "occurred_at": datetime.now(UTC).isoformat(),
        "reported_amount": "90001",
    }
    assert client.post(f"/loans/{loan_id}/outcomes", json=too_large).status_code == 422
    dispute = {
        "device_event_id": str(uuid4()),
        "outcome_type": "DISPUTE",
        "occurred_at": datetime.now(UTC).isoformat(),
        "notes": "Invoice value requires manager review",
    }
    assert client.post(f"/loans/{loan_id}/outcomes", json=dispute).status_code == 201
    assert login(client, "manager@example.com").status_code == 200
    assert client.get("/manager/analytics/overview").json()["open_disputes"] == 1
    assert login(client, "officer@example.com").status_code == 200
    body = {
        "device_event_id": str(uuid4()),
        "outcome_type": "PROMISE_TO_PAY",
        "occurred_at": datetime.now(UTC).isoformat(),
        "promised_amount": "-1",
        "promise_date": business_date().isoformat(),
    }
    assert client.post(f"/loans/{loan_id}/outcomes", json=body).status_code == 422
    promise = client.get("/officer/promises").json()[0]
    action = {"expected_version": promise["version"], "reason": "Mock verified payment"}
    assert (
        client.post(f"/promises/{promise['promise_id']}/mark-kept", json=action).status_code == 200
    )
    assert (
        client.post(f"/promises/{promise['promise_id']}/mark-kept", json=action).status_code == 409
    )
    assert client.get(f"/promises/{promise['promise_id']}/history").status_code == 200


def test_roll_rate_identity_denominator_and_missing_coverage(client):
    from datetime import date

    from app.stage2 import cohort

    generator = client.app.dependency_overrides[db_session]()
    db = next(generator)
    branch_id = 1
    start, follow = date(2026, 1, 1), date(2026, 2, 1)
    db.add_all(
        [
            Snapshot(
                loan_id=client.test_ids["loan"],
                snapshot_date=start,
                outstanding=Decimal(90000),
                overdue=Decimal(10000),
                dpd=20,
                score=60,
                band="MEDIUM",
                reasons="A|B|C",
            ),
            Snapshot(
                loan_id=client.test_ids["loan"],
                snapshot_date=follow,
                outstanding=Decimal(85000),
                overdue=Decimal(20000),
                dpd=35,
                score=70,
                band="HIGH",
                reasons="A|B|C",
            ),
        ]
    )
    borrower = Borrower(
        borrower_code="B-MISSING",
        legal_name="Missing Follow Up",
        display_name="Missing Follow Up",
        phone="+919000000005",
        pincode="452001",
    )
    db.add(borrower)
    db.flush()
    loan = Loan(
        loan_number="LN-MISSING",
        borrower_id=borrower.id,
        branch_id=branch_id,
        principal_amount=Decimal(50000),
        product_type="Working capital",
    )
    db.add(loan)
    db.flush()
    db.add(
        Snapshot(
            loan_id=loan.id,
            snapshot_date=start,
            outstanding=Decimal(40000),
            overdue=Decimal(5000),
            dpd=15,
            score=55,
            band="MEDIUM",
            reasons="A|B|C",
        )
    )
    db.commit()
    result = cohort(db, branch_id, start, follow)
    assert result["eligible"] == 2 and result["observed"] == 1
    assert result["missing"] == 1 and result["rolled"] == 1
    assert result["rate"] == 50.0 and result["coverage"] == 50.0
    empty = cohort(db, branch_id, date(2030, 1, 1), date(2030, 2, 1))
    assert empty["eligible"] == 0 and empty["rate"] is None
    db.close()
    generator.close()


def test_assignment_balances_and_excludes_inactive_officer(client):
    assert login(client, "manager@example.com").status_code == 200
    content = b"loan_id,borrower_name,outstanding_amount,dpd,pincode\nLN-BAL-1,Balance One,100000,10,452001\nLN-BAL-2,Balance Two,100000,10,452001\n"
    batch = client.post(
        "/manager/imports/preview", files={"file": ("balance.csv", content, "text/csv")}
    ).json()
    assert client.post(f"/manager/imports/{batch['id']}/confirm").status_code == 200
    assignments = {
        row["loan_number"]: row["officer_id"] for row in client.get("/manager/assignments").json()
    }
    assert assignments["LN-BAL-1"] != assignments["LN-BAL-2"]

    generator = client.app.dependency_overrides[db_session]()
    db = next(generator)
    inactive = db.get(OfficerProfile, 4)
    inactive.active_status = "INACTIVE"
    db.commit()
    db.close()
    generator.close()
    content = b"loan_id,borrower_name,outstanding_amount,dpd,pincode\nLN-ACTIVE,Active Route,100000,10,452001\n"
    batch = client.post(
        "/manager/imports/preview", files={"file": ("active.csv", content, "text/csv")}
    ).json()
    assert client.post(f"/manager/imports/{batch['id']}/confirm").status_code == 200
    row = next(
        item
        for item in client.get("/manager/assignments").json()
        if item["loan_number"] == "LN-ACTIVE"
    )
    assert row["officer_id"] == 3


def test_promise_reconciliation_uses_branch_date(client):
    from datetime import timedelta

    assert login(client, "officer@example.com").status_code == 200
    generator = client.app.dependency_overrides[db_session]()
    db = next(generator)
    promise = db.scalar(select(Promise).where(Promise.loan_id == client.test_ids["loan"]))
    promise.promise_date = business_date() - timedelta(days=1)
    db.commit()
    db.close()
    generator.close()
    promises = client.get("/officer/promises").json()
    assert promises[0]["promise_status"] == "BROKEN"


def test_manager_analytics_is_branch_scoped(client):
    assert login(client, "manager@example.com").status_code == 200
    assert client.get("/manager/analytics/overview").json()["assigned"] == 1
    assert login(client, "other@example.com").status_code == 200
    overview = client.get("/manager/analytics/overview")
    assert overview.status_code == 200
    assert overview.json()["assigned"] == 1
    assert overview.json()["buckets"]["1_30"] == 1


def test_offline_sync_acknowledges_idempotently_and_detects_conflicts(client):
    assert login(client, "officer@example.com").status_code == 200
    event_id = str(uuid4())
    envelope = {
        "client_event_id": event_id,
        "event_type": "COLLECTION_OUTCOME",
        "entity_id": str(client.test_ids["loan"]),
        "client_occurred_at": datetime.now(UTC).isoformat(),
        "base_version": 1,
        "payload": {
            "outcome_type": "NOT_REACHABLE",
            "notes": "",
            "reported_amount": None,
            "promised_amount": None,
            "promise_date": None,
            "location_status": "UNAVAILABLE",
        },
    }
    first = client.post("/sync/events", json={"events": [envelope]})
    assert first.status_code == 200
    assert first.json()["results"][0]["status"] == "ACKNOWLEDGED"
    repeated = client.post("/sync/events", json={"events": [envelope]}).json()["results"][0]
    assert repeated["status"] == "ACKNOWLEDGED" and repeated["duplicate"] is True

    conflict = {**envelope, "client_event_id": str(uuid4()), "base_version": 99}
    conflict_result = client.post("/sync/events", json={"events": [conflict]}).json()["results"][0]
    assert conflict_result["status"] == "CONFLICT"
    assert conflict_result["error"]["code"] == "ASSIGNMENT_VERSION_CHANGED"

    unauthorized = {
        **envelope,
        "client_event_id": str(uuid4()),
        "entity_id": str(client.test_ids["other_loan"]),
    }
    rejected = client.post("/sync/events", json={"events": [unauthorized]}).json()["results"][0]
    assert rejected["status"] == "REJECTED"
    assert rejected["error"]["code"] == "ACCOUNT_ACCESS_REVOKED"


def test_reassigned_offline_event_is_preserved_as_audited_conflict(client):
    assert login(client, "manager@example.com").status_code == 200
    loan_id = client.test_ids["loan"]
    assignment = next(
        row for row in client.get("/manager/assignments").json() if row["id"] == loan_id
    )
    assert (
        client.post(
            "/manager/assignments/reassign",
            json={
                "loan_id": loan_id,
                "officer_id": 4,
                "expected_version": assignment["version"],
                "reason": "Route ownership changed during offline work",
            },
        ).status_code
        == 200
    )
    assert login(client, "officer@example.com").status_code == 200
    event_id = str(uuid4())
    result = client.post(
        "/sync/events",
        json={
            "events": [
                {
                    "client_event_id": event_id,
                    "event_type": "COLLECTION_OUTCOME",
                    "entity_id": str(loan_id),
                    "client_occurred_at": datetime.now(UTC).isoformat(),
                    "base_version": assignment["version"],
                    "payload": {
                        "outcome_type": "NOT_REACHABLE",
                        "notes": "",
                        "location_status": "UNAVAILABLE",
                    },
                }
            ]
        },
    ).json()["results"][0]
    assert result["status"] == "CONFLICT"
    assert result["error"]["code"] == "ASSIGNMENT_REASSIGNED"
    generator = client.app.dependency_overrides[db_session]()
    db = next(generator)
    event = db.scalar(
        select(AuditEvent).where(
            AuditEvent.action == "Offline sync conflict",
            AuditEvent.entity_id == str(loan_id),
        )
    )
    assert event is not None
    assert event.metadata_json["client_event_id"] == event_id
    db.close()
    generator.close()


def test_language_preference_is_persisted(client):
    assert login(client, "officer@example.com").status_code == 200
    updated = client.post("/auth/preferences", json={"language_preference": "hi"})
    assert updated.status_code == 200
    assert updated.json()["language_preference"] == "hi"
    assert client.get("/auth/me").json()["language_preference"] == "hi"


def test_explainable_model_training_and_priority_override(client):
    generator = client.app.dependency_overrides[db_session]()
    db = next(generator)
    branch_id = 1
    start = date(2025, 1, 1)
    for index in range(14):
        borrower = Borrower(
            borrower_code=f"B-ML-{index}",
            legal_name=f"Model Synthetic {index}",
            display_name=f"Model Synthetic {index}",
            phone=f"+91910000{index:04d}",
            pincode="452001",
        )
        db.add(borrower)
        db.flush()
        loan = Loan(
            loan_number=f"LN-ML-{index}",
            borrower_id=borrower.id,
            branch_id=branch_id,
            principal_amount=Decimal(200000 + index * 10000),
            product_type="Working capital",
        )
        db.add(loan)
        db.flush()
        initial_dpd = 8 + index
        db.add_all(
            [
                Snapshot(
                    loan_id=loan.id,
                    snapshot_date=start,
                    outstanding=Decimal(150000 + index * 10000),
                    overdue=Decimal(10000 + index * 2000),
                    dpd=initial_dpd,
                    score=50,
                    band="MEDIUM",
                    reasons="A|B|C",
                ),
                Snapshot(
                    loan_id=loan.id,
                    snapshot_date=start + timedelta(days=30),
                    outstanding=Decimal(145000 + index * 10000),
                    overdue=Decimal(12000 + index * 2000),
                    dpd=35 + index if index % 2 == 0 else initial_dpd + 2,
                    score=50,
                    band="MEDIUM",
                    reasons="A|B|C",
                ),
            ]
        )
    db.commit()
    db.close()
    generator.close()

    assert login(client, "manager@example.com").status_code == 200
    trained = client.post("/manager/ai/train")
    assert trained.status_code == 200
    assert trained.json()["sample_count"] >= 14
    assert trained.json()["metrics"]["auc"] is not None
    overview = client.get("/manager/ai/overview")
    assert overview.status_code == 200
    assert overview.json()["model"]["version"].startswith("pace-logit-")
    assert len(overview.json()["queue"][0]["reasons"]) == 3

    loan_id = client.test_ids["loan"]
    applied = client.post(
        f"/manager/ai/loans/{loan_id}/override",
        json={"rank": 1, "reason": "Confirmed strategic account escalation"},
    )
    assert applied.status_code == 200
    stale = client.post(
        f"/manager/ai/loans/{loan_id}/override",
        json={"rank": 2, "reason": "Attempted stale operational update"},
    )
    assert stale.status_code == 409
    assert login(client, "other@example.com").status_code == 200
    assert (
        client.post(
            f"/manager/ai/loans/{loan_id}/override",
            json={"rank": 2, "reason": "Cross branch override attempt"},
        ).status_code
        == 404
    )
