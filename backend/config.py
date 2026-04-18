import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
# Fix Supabase URL prefix — SQLAlchemy requires postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "checklist@yourdomain.com")
EMAIL_TO = os.getenv("EMAIL_TO", "manager@company.com")
FLASK_ENV = os.getenv("FLASK_ENV", "development")
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "http://localhost:5173")
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

Base = declarative_base()

engine = create_engine(DATABASE_URL, pool_pre_ping=True) if DATABASE_URL else None
SessionLocal = (
    sessionmaker(autocommit=False, autoflush=False, bind=engine)
    if engine else None
)
