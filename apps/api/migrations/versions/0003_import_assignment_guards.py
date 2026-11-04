"""Partial unique indexes for concurrent import and assignment writes.

Revision ID: 0003_guards
Revises: 0002_collections_engine
"""

import sqlalchemy as sa
from alembic import op

revision = "0003_guards"
down_revision = "0002_collections_engine"
branch_labels = None
depends_on = None


def upgrade():
    predicate = sa.text("status = 'CONFIRMED'")
    op.create_index(
        "uq_confirmed_import_hash",
        "import_batches",
        ["branch_id", "file_hash"],
        unique=True,
        postgresql_where=predicate,
        sqlite_where=predicate,
    )
    predicate = sa.text("status = 'ACTIVE'")
    op.create_index(
        "uq_active_daily_assignment",
        "assignments",
        ["loan_id", "assignment_date"],
        unique=True,
        postgresql_where=predicate,
        sqlite_where=predicate,
    )


def downgrade():
    op.drop_index("uq_active_daily_assignment", table_name="assignments")
    op.drop_index("uq_confirmed_import_hash", table_name="import_batches")
