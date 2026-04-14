import sys
import os
import pytest

# Thêm backend vào sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import MagicMock, patch


@pytest.fixture
def mock_session(monkeypatch):
    """Mock SessionLocal để tránh kết nối DB thật."""
    session = MagicMock()
    session.__enter__ = MagicMock(return_value=session)
    session.__exit__ = MagicMock(return_value=False)
    session.flush = MagicMock()
    session.commit = MagicMock()

    monkeypatch.setattr("services.scan_service.SessionLocal", lambda: session)
    return session


@pytest.fixture
def mock_email(monkeypatch):
    """Mock send_scan_email để tránh gọi Resend thật."""
    monkeypatch.setattr(
        "services.scan_service.send_scan_email",
        MagicMock(return_value=True),
    )


@pytest.fixture
def flask_app():
    """Flask test app với config tối thiểu."""
    import importlib
    import config as cfg

    # Patch engine/SessionLocal trước khi import app
    with patch.object(cfg, "SessionLocal", lambda: MagicMock(
        __enter__=lambda s, *a: s,
        __exit__=lambda s, *a: False,
        query=MagicMock(),
        add=MagicMock(),
        flush=MagicMock(),
        commit=MagicMock(),
    )):
        from app import app as flask_app
        flask_app.config["TESTING"] = True
        yield flask_app
