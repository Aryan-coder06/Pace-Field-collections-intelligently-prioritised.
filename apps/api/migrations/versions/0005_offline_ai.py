"""Add offline synchronization and explainable priority intelligence.

Revision ID: 0005_offline_ai
Revises: 0004_dispute_review
"""

import sqlalchemy as sa
from alembic import op

revision = "0005_offline_ai"
down_revision = "0004_dispute_review"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "priority_model_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("branch_id", sa.Integer(), sa.ForeignKey("branches.id"), nullable=False),
        sa.Column("model_version", sa.String(60), nullable=False, unique=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="TRAINED"),
        sa.Column("training_start", sa.Date(), nullable=False),
        sa.Column("training_end", sa.Date(), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("positive_count", sa.Integer(), nullable=False),
        sa.Column("metrics_json", sa.JSON(), nullable=False),
        sa.Column("parameters_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_priority_model_runs_branch_id", "priority_model_runs", ["branch_id"])
    op.create_index(
        "ix_priority_model_runs_model_version", "priority_model_runs", ["model_version"]
    )
    op.create_table(
        "priority_overrides",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("loan_id", sa.Integer(), sa.ForeignKey("loans.id"), nullable=False),
        sa.Column("branch_id", sa.Integer(), sa.ForeignKey("branches.id"), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_priority_overrides_loan_id", "priority_overrides", ["loan_id"])
    op.create_index("ix_priority_overrides_branch_id", "priority_overrides", ["branch_id"])
    op.create_table(
        "sync_event_receipts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_event_id", sa.String(100), nullable=False, unique=True),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.String(80), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("branch_id", sa.Integer(), sa.ForeignKey("branches.id"), nullable=False),
        sa.Column("client_occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("server_received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("base_version", sa.Integer(), nullable=True),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("error_code", sa.String(80), nullable=True),
        sa.Column("error_message", sa.String(500), nullable=True),
        sa.Column("result_json", sa.JSON(), nullable=False),
    )
    op.create_index(
        "ix_sync_event_receipts_client_event_id", "sync_event_receipts", ["client_event_id"]
    )
    op.create_index(
        "ix_sync_event_receipts_actor_user_id", "sync_event_receipts", ["actor_user_id"]
    )
    op.create_index("ix_sync_event_receipts_branch_id", "sync_event_receipts", ["branch_id"])


def downgrade():
    op.drop_table("sync_event_receipts")
    op.drop_table("priority_overrides")
    op.drop_table("priority_model_runs")
