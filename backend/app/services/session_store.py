import time
from threading import Lock

from app.models.session import Session

_SESSION_TTL_SECONDS = 2 * 60 * 60  # session 閒置超過 2 小時即清除

_sessions: dict[str, Session] = {}
_lock = Lock()


def create_session() -> Session:
    session = Session()
    with _lock:
        _sessions[session.id] = session
    return session


def get_session(session_id: str) -> Session | None:
    _cleanup_expired()
    with _lock:
        session = _sessions.get(session_id)
        if session:
            session.last_active_at = time.time()
        return session


def _cleanup_expired() -> None:
    now = time.time()
    with _lock:
        expired = [
            sid for sid, session in _sessions.items()
            if now - session.last_active_at > _SESSION_TTL_SECONDS
        ]
        for sid in expired:
            del _sessions[sid]
