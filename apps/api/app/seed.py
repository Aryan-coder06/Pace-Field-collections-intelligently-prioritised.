import os
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.main import SessionLocal, business_date, password_hash
from app.models import (
    Activity,
    Assignment,
    AuditEvent,
    Borrower,
    Branch,
    CollectionOutcome,
    ContactAttempt,
    Loan,
    OfficerProfile,
    PincodeCoverage,
    PriorityModelRun,
    PriorityScore,
    Promise,
    PromiseTransition,
    Snapshot,
    User,
)


def month_start(day: date, offset: int) -> date:
    month_index = day.year * 12 + day.month - 1 + offset
    return date(month_index // 12, month_index % 12 + 1, 1)


def seed_stage2(db):
    """Idempotently enrich existing synthetic portfolios for Stage 2 demos."""
    branch = db.scalar(select(Branch).where(Branch.code == "IDR"))
    if not branch:
        return
    loans = db.scalars(select(Loan).where(Loan.branch_id == branch.id).order_by(Loan.id)).all()
    today = business_date()
    officers = db.scalars(
        select(User)
        .where(
            User.branch_id == branch.id,
            User.role == "FIELD_OFFICER",
        )
        .order_by(User.id)
    ).all()
    coverage_plan = {
        0: ["452001", "452003"],
        1: ["452001", "452003", "452007"],
        2: ["452007", "452010"],
        3: ["452010", "452015"],
        4: ["452015", "452001"],
    }
    for index, officer in enumerate(officers):
        existing_pins = set(
            db.scalars(
                select(PincodeCoverage.pincode).where(PincodeCoverage.officer_id == officer.id)
            ).all()
        )
        for pincode in coverage_plan.get(index, []):
            if pincode not in existing_pins:
                db.add(PincodeCoverage(officer_id=officer.id, pincode=pincode))
    for loan in loans:
        latest_snapshot = db.scalar(
            select(Snapshot)
            .where(Snapshot.loan_id == loan.id)
            .order_by(Snapshot.snapshot_date.desc())
        )
        today_snapshot = db.scalar(
            select(Snapshot.id).where(
                Snapshot.loan_id == loan.id,
                Snapshot.snapshot_date == today,
            )
        )
        if latest_snapshot and not today_snapshot:
            db.add(
                Snapshot(
                    loan_id=loan.id,
                    snapshot_date=today,
                    outstanding=latest_snapshot.outstanding,
                    overdue=latest_snapshot.overdue,
                    dpd=latest_snapshot.dpd,
                    score=latest_snapshot.score,
                    band=latest_snapshot.band,
                    reasons=latest_snapshot.reasons,
                )
            )
        current_assignment = db.scalar(
            select(Assignment.id).where(
                Assignment.loan_id == loan.id,
                Assignment.assignment_date == today,
                Assignment.status == "ACTIVE",
            )
        )
        latest_assignment = db.scalar(
            select(Assignment)
            .where(Assignment.loan_id == loan.id, Assignment.status == "ACTIVE")
            .order_by(Assignment.assignment_date.desc(), Assignment.assigned_at.desc())
        )
        if latest_assignment and not current_assignment:
            db.add(
                Assignment(
                    loan_id=loan.id,
                    officer_id=latest_assignment.officer_id,
                    branch_id=loan.branch_id,
                    assignment_date=today,
                    assignment_source="CARRY_FORWARD",
                    version=latest_assignment.version,
                )
            )
    for i, loan in enumerate(loans[:36]):
        for offset, late_count in enumerate([8, 8, 7, 7, 6, 6]):
            snap = db.scalar(
                select(Snapshot).where(
                    Snapshot.loan_id == loan.id,
                    Snapshot.snapshot_date == month_start(today, offset - 5),
                )
            )
            if snap:
                snap.dpd = 35 + i % 10 if offset > 0 and i < late_count else 10 + i % 18
    for dispute in db.scalars(
        select(CollectionOutcome).where(
            CollectionOutcome.outcome_type == "DISPUTE",
            CollectionOutcome.review_status == "NOT_APPLICABLE",
        )
    ).all():
        dispute.review_status = "OPEN"
    if len(loans) > 4:
        officer_id = db.scalar(
            select(Assignment.officer_id).where(Assignment.loan_id == loans[3].id)
        )
        kept = db.scalar(
            select(Promise).where(Promise.loan_id == loans[3].id, Promise.status == "KEPT")
        )
        if not kept and officer_id:
            kept = Promise(
                loan_id=loans[3].id,
                officer_id=officer_id,
                amount=Decimal(18000),
                promise_date=today - timedelta(days=3),
                status="KEPT",
            )
            db.add(kept)
            db.flush()
            db.add(
                PromiseTransition(
                    promise_id=kept.id,
                    actor_user_id=officer_id,
                    from_status="OPEN",
                    to_status="KEPT",
                    reason="Synthetic demo verification",
                )
            )
        if officer_id and not db.scalar(
            select(CollectionOutcome.id).where(CollectionOutcome.loan_id == loans[3].id)
        ):
            db.add(
                CollectionOutcome(
                    loan_id=loans[3].id,
                    officer_id=officer_id,
                    outcome_type="DISPUTE",
                    notes="Synthetic invoice amount dispute for demonstration",
                    occurred_at=datetime.now(UTC) - timedelta(days=2),
                    location_status="UNAVAILABLE",
                    device_event_id="00000000-0000-0000-0000-000000000001",
                )
            )
            db.add(
                ContactAttempt(
                    loan_id=loans[3].id,
                    officer_id=officer_id,
                    channel="CALL",
                    attempted_at=datetime.now(UTC) - timedelta(days=2),
                    allowed=True,
                )
            )
    db.commit()
    if not db.scalar(
        select(PriorityModelRun.id).where(PriorityModelRun.branch_id == branch.id).limit(1)
    ):
        manager = db.scalar(
            select(User).where(
                User.branch_id == branch.id,
                User.role == "BRANCH_MANAGER",
            )
        )
        if manager:
            from app.stage3 import train_priorities

            result = train_priorities(manager, db)
            print(
                f"Trained {result['model_version']} on {result['sample_count']} historical observations"
            )


def seed():
    with SessionLocal() as db:
        if db.scalar(select(Branch.id).limit(1)):
            seed_stage2(db)
            print("Pace seed data already exists")
            return
        branch = Branch(code="IDR", name="Indore Branch", city="Indore")
        other = Branch(code="UJN", name="Ujjain Branch", city="Ujjain")
        db.add_all([branch, other])
        db.flush()
        pw = password_hash.hash(os.getenv("SEED_DEMO_PASSWORD", "PaceDemo!2026"))
        users = [
            User(
                employee_code="MGR001",
                name="Ananya Mehta",
                email="manager@pace.demo",
                password_hash=pw,
                role="BRANCH_MANAGER",
                branch_id=branch.id,
            ),
            User(
                employee_code="FO014",
                name="Rahul Chouhan",
                email="rahul@pace.demo",
                password_hash=pw,
                role="FIELD_OFFICER",
                branch_id=branch.id,
                phone="+91 90000 00114",
            ),
            User(
                employee_code="FO021",
                name="Neha Solanki",
                email="neha@pace.demo",
                password_hash=pw,
                role="FIELD_OFFICER",
                branch_id=branch.id,
                phone="+91 90000 00221",
            ),
            User(
                employee_code="FO033",
                name="Imran Qureshi",
                email="imran@pace.demo",
                password_hash=pw,
                role="FIELD_OFFICER",
                branch_id=branch.id,
                phone="+91 90000 00333",
            ),
            User(
                employee_code="FO041",
                name="Pooja Rathore",
                email="pooja@pace.demo",
                password_hash=pw,
                role="FIELD_OFFICER",
                branch_id=branch.id,
                phone="+91 90000 00441",
            ),
            User(
                employee_code="FO052",
                name="Vikram Patidar",
                email="vikram@pace.demo",
                password_hash=pw,
                role="FIELD_OFFICER",
                branch_id=branch.id,
                phone="+91 90000 00552",
            ),
            User(
                employee_code="UJM001",
                name="Ujjain Manager",
                email="manager@ujjain.pace.demo",
                password_hash=pw,
                role="BRANCH_MANAGER",
                branch_id=other.id,
            ),
        ]
        db.add_all(users)
        db.flush()
        officers = users[1:6]
        for idx, officer in enumerate(officers):
            home_pin = ["452001", "452003", "452007", "452010", "452015"][idx]
            db.add(
                OfficerProfile(
                    user_id=officer.id,
                    home_pincode=home_pin,
                    workload_capacity=12,
                    active_status="ACTIVE",
                )
            )
            db.add(PincodeCoverage(officer_id=officer.id, pincode=home_pin))
        businesses = [
            "Aarav Packaging Works",
            "Shree Ganesh Fertiliser",
            "Metro Printworks",
            "Narmada Auto Parts",
            "Saanvi Textile Traders",
            "Malwa Agro Supplies",
            "Prakash Electricals",
            "Omkar Steel Fabrication",
            "Vardhman Paper Products",
            "Siddhi Vinayak Foods",
            "Ravi Tools & Hardware",
            "Kshipra Plastics",
            "Central India Pumps",
            "Anmol Kirana Wholesale",
            "Shakti Machine Works",
            "Mahakal Traders",
            "Arihant Labels",
            "Pioneer Fasteners",
            "Saraswati Seeds",
            "Rajdeep Furniture",
            "Krishna Packaging",
            "Jain Industrial Stores",
            "Uday Flour Mill",
            "Vishal Garments",
            "Surbhi Chemical Supply",
            "Apex Bearings",
            "Sai Cold Storage",
            "Mahalaxmi Stationers",
            "Avantika Engineering",
            "Tulsi Homeware",
            "Bafna Components",
            "Aastha Medical Supply",
            "New India Canvas",
            "Riddhi Electricals",
            "Suryansh Polymers",
            "Classic Pumps & Motors",
        ]
        products = ["Working capital", "Equipment finance", "Business term loan"]
        pins = ["452001", "452003", "452007", "452010", "452015", "452018", "452020"]
        today = business_date()
        for i, name in enumerate(businesses):
            officer = officers[i % len(officers)]
            borrower = Borrower(
                borrower_code=f"BRW-{2000 + i}",
                legal_name=name + " Private Enterprise",
                display_name=name,
                phone=f"+91 9{i % 10}1234{i:04d}",
                preferred_language="hi" if i % 3 else "en",
                address_line=f"{12 + i} Industrial Area, Indore",
                pincode=pins[i % len(pins)],
            )
            db.add(borrower)
            db.flush()
            loan_num = ["LN-10293", "LN-10871", "LN-11930"][i] if i < 3 else f"LN-{12000 + i}"
            loan = Loan(
                loan_number=loan_num,
                borrower_id=borrower.id,
                branch_id=branch.id,
                principal_amount=Decimal(550000 + i * 21500),
                product_type=products[i % 3],
            )
            db.add(loan)
            db.flush()
            dpd = [12, 27, 19][i] if i < 3 else 1 + (i * 7 % 30)
            outstanding = [640000, 310000, 220000][i] if i < 3 else 185000 + (i * 28713 % 780000)
            score = min(98, 48 + dpd + (15 if i % 4 == 0 else 0))
            reasons = (
                "Broken promise|High outstanding|DPD increasing"
                if i == 2
                else (
                    "Promise due soon|High outstanding|Visit due"
                    if i == 0
                    else "DPD increasing|High outstanding|Area route cluster"
                )
            )
            db.add(
                Snapshot(
                    loan_id=loan.id,
                    snapshot_date=today,
                    outstanding=Decimal(outstanding),
                    overdue=Decimal(max(12000, outstanding * min(dpd, 20) // 70)),
                    dpd=dpd,
                    score=score,
                    band="HIGH" if score >= 75 else "MEDIUM",
                    reasons=reasons,
                )
            )
            for month_offset, late_accounts in enumerate([8, 8, 7, 7, 6, 6]):
                month_date = month_start(today, month_offset - 5)
                historic_dpd = 30 if i < late_accounts else max(1, dpd - (5 - month_offset) * 2)
                historic_outstanding = Decimal(outstanding) * (
                    Decimal("1.02") ** (5 - month_offset)
                )
                db.add(
                    Snapshot(
                        loan_id=loan.id,
                        snapshot_date=month_date,
                        outstanding=historic_outstanding.quantize(Decimal("0.01")),
                        overdue=(
                            historic_outstanding * Decimal(min(historic_dpd, 20)) / Decimal(70)
                        ).quantize(Decimal("0.01")),
                        dpd=historic_dpd,
                        score=score,
                        band="HIGH" if score >= 75 else "MEDIUM",
                        reasons=reasons,
                    )
                )
            reason_parts = reasons.split("|")
            db.add(
                PriorityScore(
                    loan_id=loan.id,
                    score=score,
                    priority_band="HIGH" if score >= 75 else "MEDIUM",
                    model_version="seed-v1",
                    reason_1=reason_parts[0],
                    reason_2=reason_parts[1],
                    reason_3=reason_parts[2],
                )
            )
            db.add(
                Assignment(
                    loan_id=loan.id,
                    officer_id=officer.id,
                    branch_id=branch.id,
                    assignment_date=today,
                )
            )
            if i == 0:
                db.add(
                    Promise(
                        loan_id=loan.id,
                        officer_id=officer.id,
                        amount=Decimal(50000),
                        promise_date=date(2026, 11, 5),
                        status="OPEN",
                    )
                )
            if i == 1:
                db.add(
                    Promise(
                        loan_id=loan.id,
                        officer_id=officer.id,
                        amount=Decimal(35000),
                        promise_date=today,
                        status="OPEN",
                    )
                )
            if i == 2:
                db.add(
                    Promise(
                        loan_id=loan.id,
                        officer_id=officer.id,
                        amount=Decimal(50000),
                        promise_date=date(2026, 10, 31),
                        status="BROKEN",
                    )
                )
            if i < 14:
                event = [
                    "Visited borrower",
                    "Promise recorded",
                    "Contact unsuccessful",
                    "Called borrower",
                ][i % 4]
                occurred = datetime.now(UTC) - timedelta(hours=i + 1)
                db.add(
                    Activity(
                        branch_id=branch.id,
                        officer_id=officer.id,
                        loan_id=loan.id,
                        event=event,
                        occurred_at=occurred,
                    )
                )
                db.add(
                    AuditEvent(
                        actor_user_id=officer.id,
                        branch_id=branch.id,
                        entity_type="Loan",
                        entity_id=str(loan.id),
                        action=event,
                        metadata_json={"source": "synthetic_seed"},
                        occurred_at=occurred,
                    )
                )
            if i == 2:
                for days_ago, event in [
                    (3, "Promise broken · ₹50,000"),
                    (7, "Phone call · Borrower reached"),
                    (12, "Field visit"),
                ]:
                    occurred = datetime(2026, 11, 3, 12, tzinfo=UTC) - timedelta(days=days_ago)
                    db.add(
                        Activity(
                            branch_id=branch.id,
                            officer_id=officer.id,
                            loan_id=loan.id,
                            event=event,
                            occurred_at=occurred,
                        )
                    )
                    db.add(
                        AuditEvent(
                            actor_user_id=officer.id,
                            branch_id=branch.id,
                            entity_type="Loan",
                            entity_id=str(loan.id),
                            action=event,
                            metadata_json={"source": "synthetic_seed"},
                            occurred_at=occurred,
                        )
                    )
        db.commit()
        seed_stage2(db)
        print("Seeded Indore portfolio: 36 loans, 5 officers and demo users")


if __name__ == "__main__":
    seed()
