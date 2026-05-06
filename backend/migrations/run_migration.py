"""
Idempotent migration script — thêm cột screen detection vào scan_logs.

Cách chạy:
    cd backend
    python migrations/run_migration.py

DATABASE_URL được load từ .env qua config.py (Supabase Postgres trong production,
SQLite cho dev).

Script idempotent: detect cột đã tồn tại → skip ADD COLUMN, không lỗi nếu chạy 2 lần.
Chạy trong transaction (engine.begin) → nếu có cột thất bại thì rollback toàn bộ.

Cột thêm vào scan_logs:
  - screen_score    DOUBLE PRECISION   (0-1, NULL = client chưa gửi)
  - screen_signals  JSONB              (Postgres) / JSON (SQLite)
  - screen_class    VARCHAR(20)        ('clean'|'suspicious'|'high_risk'|NULL)
"""
import sys
import os

# Windows cmd default cp1252 → in tiếng Việt báo UnicodeEncodeError.
# Reconfigure stdout/stderr sang UTF-8 (Python 3.7+).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

# Cho phép import config từ thư mục cha
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import inspect, text
from config import engine, DATABASE_URL


# (column_name, postgres_type, sqlite_fallback_type)
COLUMNS_TO_ADD = [
    ("screen_score",   "DOUBLE PRECISION", "REAL"),
    ("screen_signals", "JSONB",            "JSON"),
    ("screen_class",   "VARCHAR(20)",      "VARCHAR(20)"),
]


def _check_engine_or_exit() -> None:
    """Bail out với thông báo rõ ràng nếu engine chưa được khởi tạo."""
    if engine is not None:
        return
    print("[ERROR] DATABASE_URL chưa được cấu hình.")
    print()
    print("Cách fix:")
    print("  1. Tạo file backend/.env (copy từ .env.example):")
    print("     cp .env.example .env")
    print("  2. Mở .env và set DATABASE_URL = connection string Supabase, vd:")
    print("     DATABASE_URL=postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres")
    print("  3. Chạy lại: python migrations/run_migration.py")
    print()
    print(f"  Để test local trên SQLite, set: DATABASE_URL=sqlite:///./scan_logs.db")
    sys.exit(2)


def get_existing_columns(table_name: str) -> set[str]:
    inspector = inspect(engine)
    try:
        cols = inspector.get_columns(table_name)
    except Exception as exc:
        print(f"[ERROR] Không inspect được bảng {table_name}: {exc}")
        print(f"  → Có thể bảng chưa tồn tại. Chạy app một lần để Base.metadata.create_all() tạo bảng,")
        print(f"    hoặc tạo thủ công trong Supabase SQL Editor.")
        sys.exit(1)
    return {c["name"] for c in cols}


def run() -> int:
    _check_engine_or_exit()

    table = "scan_logs"
    is_postgres = "postgresql" in str(engine.url)
    print(f"DB dialect: {'postgresql' if is_postgres else 'sqlite/other'}")
    print(f"DB URL: {engine.url}")

    existing = get_existing_columns(table)
    print(f"Existing columns in {table}: {sorted(existing)}\n")

    added = 0
    skipped = 0

    with engine.begin() as conn:
        for col_name, pg_type, sqlite_type in COLUMNS_TO_ADD:
            if col_name in existing:
                print(f"  [skip] {col_name} đã tồn tại")
                skipped += 1
                continue

            ddl_type = pg_type if is_postgres else sqlite_type
            sql = f'ALTER TABLE {table} ADD COLUMN {col_name} {ddl_type}'
            print(f"  [add ] {col_name} {ddl_type}")
            conn.execute(text(sql))
            added += 1

    print(f"\nMigration done: {added} added, {skipped} skipped.")

    # Verify lại sau migration
    final = get_existing_columns(table)
    missing = [c[0] for c in COLUMNS_TO_ADD if c[0] not in final]
    if missing:
        print(f"[ERROR] Cột vẫn thiếu sau migration: {missing}")
        return 1
    print("All target columns present.")
    return 0


if __name__ == "__main__":
    sys.exit(run())
