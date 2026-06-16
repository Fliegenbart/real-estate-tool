import os

# Tests must never touch the real development database: several API tests
# clear all tables. Force a separate throwaway file before app.database
# reads DATABASE_URL at import time.
os.environ["DATABASE_URL"] = "sqlite:///./.pytest_real_estate.db"

import pytest


@pytest.fixture(autouse=True)
def clean_listing_state():
    from app.database import SessionLocal, init_db
    from app.main import clear_database

    init_db()
    db = SessionLocal()
    try:
        clear_database(db)
    finally:
        db.close()
    yield
    db = SessionLocal()
    try:
        clear_database(db)
    finally:
        db.close()
