import os
import jwt
import datetime as dt
from typing import Any, Dict

ALGO = "HS256"
SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
ACCESS_MIN = int(os.environ.get("JWT_EXPIRES_MINUTES", "15"))
REFRESH_DAYS = int(os.environ.get("REFRESH_EXPIRES_DAYS", "7"))
RESET_MIN = int(os.environ.get("PWD_RESET_EXPIRES_MINUTES", "30"))

def create_access_token(sub: str | int, extra: Dict[str, Any] | None = None) -> str:
    now = dt.datetime.utcnow()
    payload: Dict[str, Any] = {
        "sub": str(sub),
        "iat": now,
        "exp": now + dt.timedelta(minutes=ACCESS_MIN),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, SECRET, algorithm=ALGO)

def decode_token(token: str) -> Dict[str, Any]:
    return jwt.decode(token, SECRET, algorithms=[ALGO])

def create_refresh_token(sub: str | int) -> str:
    now = dt.datetime.utcnow()
    payload: Dict[str, Any] = {
        "sub": str(sub),
        "type": "refresh",
        "iat": now,
        "exp": now + dt.timedelta(days=REFRESH_DAYS),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGO)

def decode_refresh_token(token: str) -> Dict[str, Any]:
    data = jwt.decode(token, SECRET, algorithms=[ALGO])
    if data.get("type") != "refresh":
        raise jwt.InvalidTokenError("Not a refresh token")
    return data

def create_password_reset_token(sub: str | int) -> str:
    now = dt.datetime.utcnow()
    payload: Dict[str, Any] = {
        "sub": str(sub),
        "type": "pwd_reset",
        "iat": now,
        "exp": now + dt.timedelta(minutes=RESET_MIN),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGO)

def decode_password_reset_token(token: str) -> Dict[str, Any]:
    data = jwt.decode(token, SECRET, algorithms=[ALGO])
    if data.get("type") != "pwd_reset":
        raise jwt.InvalidTokenError("Not a password reset token")
    return data
