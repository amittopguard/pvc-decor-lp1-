"""In-process sliding-window rate limiter for public endpoints.

Keyed by a caller identifier (client IP). This is single-process only — good
enough to blunt form-spam floods against POST /api/leads on a single worker.
For a horizontally scaled deployment, back this with a shared store (Redis)
instead.
"""
from __future__ import annotations

from collections import deque
from threading import Lock


class RateLimiter:
    """Allow at most ``max_requests`` hits per ``window_seconds`` per key."""

    def __init__(self, max_requests: int, window_seconds: float):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque] = {}
        self._lock = Lock()

    @property
    def enabled(self) -> bool:
        return self.max_requests > 0

    def check(self, key: str, now: float):
        """Record a hit for ``key`` at monotonic time ``now``.

        Returns ``(allowed, retry_after)``. When blocked, ``retry_after`` is the
        whole seconds until the oldest in-window hit expires (always >= 1).
        When limiting is disabled (``max_requests <= 0``) every call is allowed
        and nothing is recorded.
        """
        if not self.enabled:
            return True, 0
        with self._lock:
            hits = self._hits.get(key)
            if hits is None:
                hits = deque()
                self._hits[key] = hits
            cutoff = now - self.window_seconds
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= self.max_requests:
                retry_after = int(hits[0] + self.window_seconds - now) + 1
                return False, max(retry_after, 1)
            hits.append(now)
            if not hits:
                # never happens after append, but keeps the map tidy if logic
                # above changes — drop empty buckets to bound memory growth.
                self._hits.pop(key, None)
            return True, 0

    def reset(self, key: "str | None" = None):
        """Clear recorded hits for one key, or all keys when ``key`` is None."""
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)
