"""Stage 2 collections engine.

Revision ID: 0002_collections_engine
Revises: 0001_initial
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_collections_engine"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "import_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("branch_id", sa.Integer(), sa.ForeignKey("branches.id"), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("filename", sa.String(180), nullable=False),
        sa.Column("file_hash", sa.String(64), nullable=False),
        sa.Column("import_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("rows_json", sa.JSON(), nullable=False),
        sa.Column("summary_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_import_batches_branch_id", "import_batches", ["branch_id"])
    op.create_index("ix_import_batches_file_hash", "import_batches", ["file_hash"])
    op.create_table(
        "promise_transitions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("promise_id", sa.Integer(), sa.ForeignKey("promises.id"), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("from_status", sa.String(20), nullable=False),
        sa.Column("to_status", sa.String(20), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_promise_transitions_promise_id", "promise_transitions", ["promise_id"])
    with op.batch_alter_table("collection_outcomes") as batch:
        batch.add_column(sa.Column("reported_amount", sa.Numeric(14, 2)))
        batch.add_column(
            sa.Column(
                "location_status", sa.String(30), nullable=False, server_default="UNAVAILABLE"
            )
        )


def downgrade():
    with op.batch_alter_table("collection_outcomes") as batch:
        batch.drop_column("location_status")
        batch.drop_column("reported_amount")
    op.drop_index("ix_promise_transitions_promise_id", table_name="promise_transitions")
    op.drop_table("promise_transitions")
    op.drop_index("ix_import_batches_file_hash", table_name="import_batches")
    op.drop_index("ix_import_batches_branch_id", table_name="import_batches")
    op.drop_table("import_batches")
