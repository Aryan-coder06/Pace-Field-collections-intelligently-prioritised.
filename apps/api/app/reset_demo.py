"""Explicitly reset synthetic demo data. Never runs without a confirmation phrase."""

import argparse
import os

from app.main import SessionLocal, engine
from app.models import Base
from app.seed import seed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm", required=True)
    args = parser.parse_args()
    if args.confirm != "RESET_SYNTHETIC_DEMO":
        raise SystemExit("Refusing reset: confirmation phrase did not match.")
    if (
        os.getenv("ENVIRONMENT", "development") == "production"
        and os.getenv("ALLOW_DEMO_RESET", "false").lower() != "true"
    ):
        raise SystemExit("Production reset is disabled. Set ALLOW_DEMO_RESET=true temporarily.")
    with SessionLocal() as db:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
    Base.metadata.create_all(engine)
    seed()


if __name__ == "__main__":
    main()
