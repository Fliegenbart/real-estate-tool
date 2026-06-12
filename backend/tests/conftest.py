import os

# Tests must never touch the real development database: several API tests
# clear all tables. Force a separate throwaway file before app.database
# reads DATABASE_URL at import time.
os.environ["DATABASE_URL"] = "sqlite:///./.pytest_real_estate.db"
