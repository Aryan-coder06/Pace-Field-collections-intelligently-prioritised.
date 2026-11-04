"""Track unresolved dispute review state.

Revision ID: 0004_dispute_review
Revises: 0003_guards
"""

import sqlalchemy as sa
from alembic import op

revision = "0004_dispute_review"
down_revision = "0003_guards"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("collection_outcomes") as batch:
        batch.add_column(
            sa.Column(
                "review_status",
                sa.String(30),
                nullable=False,
                server_default="NOT_APPLICABLE",
            )
        )


def downgrade():
    with op.batch_alter_table("collection_outcomes") as batch:
        batch.drop_column("review_status")
