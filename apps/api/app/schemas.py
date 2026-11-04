from datetime import date, datetime

from pydantic import BaseModel, EmailStr

from app.models import Role


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class SessionOut(BaseModel):
    id: int
    name: str
    email: str
    role: Role
    branch_id: int


class LoanOut(BaseModel):
    id: int
    loan_number: str
    borrower: str
    legal_name: str
    phone: str
    address: str
    pincode: str
    product: str
    outstanding: str
    overdue: str
    dpd: int
    score: int
    band: str
    reasons: list[str]
    promise_status: str | None = None
    touched: bool = False
    last_activity: str | None = None
    next_action: str = "Review account"


class HistoryOut(BaseModel):
    occurred_at: datetime
    event: str
    officer: str


class LoanPromiseOut(BaseModel):
    amount: str
    promise_date: date
    status: str


class LoanDetailOut(LoanOut):
    history: list[HistoryOut]
    promises: list[LoanPromiseOut]


class PromiseOut(LoanOut):
    promise_id: int
    amount: str
    promise_date: date
    promise_status: str
    version: int


class TodayOut(BaseModel):
    officer: str
    date: date
    accounts: int
    outstanding_total: str
    completed: int
    items: list[LoanOut]


class TrendOut(BaseModel):
    month: str
    rate: int


class ManagerOverviewOut(BaseModel):
    branch: str
    accounts: int
    overdue_total: str
    dpd_1_30: int
    broken_promises: int
    activity_today: int
    officers: int
    trend: list[TrendOut]


class OfficerWorkloadOut(BaseModel):
    id: int
    name: str
    phone: str
    assigned: int
    outstanding: str
    high_priority: int
    active: bool


class ActivityOut(BaseModel):
    time: datetime
    officer: str
    borrower: str
    event: str
    audit_id: int | None = None
    location_status: str | None = None
    latitude: float | None = None
    longitude: float | None = None
