from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
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
    return c.post("/auth/login", json={"email": email, "password": "correct horse battery"})


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


def test_refresh_rotates_and_logout_revokes(client):
    assert login(client, "officer@example.com").status_code == 200
    old_refresh = client.cookies.get("pace_refresh")
    assert client.post("/auth/refresh").status_code == 200
    assert client.cookies.get("pace_refresh") != old_refresh
    client.cookies.set("pace_refresh", old_refresh, path="/auth")
    assert client.post("/auth/refresh").status_code == 401
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
