"""
In-memory daily quota tracker for Gemini API calls.
Resets automatically at UTC midnight.
"""
from datetime import date
from collections import defaultdict

DAILY_LIMIT = 480  # leave 20 buffer under Gemini free tier 500 RPD

# { "YYYY-MM-DD": count }
_counts: dict[str, int] = defaultdict(int)


def _today() -> str:
    return date.today().isoformat()


def increment() -> int:
    """Increment today's counter. Returns new count."""
    _counts[_today()] += 1
    return _counts[_today()]


def get_usage() -> dict:
    today = _today()
    used = _counts[today]
    return {
        "date": today,
        "used": used,
        "limit": DAILY_LIMIT,
        "remaining": max(0, DAILY_LIMIT - used),
        "pct": round(used / DAILY_LIMIT * 100, 1),
    }


def check_quota() -> bool:
    """Returns True if quota is available, False if exhausted."""
    return _counts[_today()] < DAILY_LIMIT
