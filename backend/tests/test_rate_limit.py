"""Unit tests for the sliding-window RateLimiter (no network / DB / heavy deps)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ratelimit import RateLimiter


def test_allows_under_limit():
    rl = RateLimiter(max_requests=3, window_seconds=60)
    assert rl.check("1.1.1.1", 0.0) == (True, 0)
    assert rl.check("1.1.1.1", 1.0) == (True, 0)
    assert rl.check("1.1.1.1", 2.0) == (True, 0)


def test_blocks_over_limit():
    rl = RateLimiter(3, 60)
    for t in (0.0, 1.0, 2.0):
        assert rl.check("ip", t)[0] is True
    allowed, retry_after = rl.check("ip", 3.0)
    assert allowed is False
    assert retry_after > 0


def test_window_slides():
    rl = RateLimiter(2, 10)
    assert rl.check("ip", 0.0)[0] is True
    assert rl.check("ip", 1.0)[0] is True
    assert rl.check("ip", 5.0)[0] is False   # both hits still inside the window
    # first hit (t=0) has expired by t=11, freeing a slot again
    assert rl.check("ip", 11.0)[0] is True


def test_keys_are_isolated():
    rl = RateLimiter(1, 60)
    assert rl.check("a", 0.0)[0] is True
    assert rl.check("b", 0.0)[0] is True   # different key, own budget
    assert rl.check("a", 1.0)[0] is False  # "a" already spent


def test_disabled_when_zero():
    rl = RateLimiter(0, 60)
    for t in range(100):
        assert rl.check("ip", float(t)) == (True, 0)


def test_retry_after_shrinks_as_window_passes():
    rl = RateLimiter(1, 10)
    assert rl.check("ip", 0.0)[0] is True
    _, retry_early = rl.check("ip", 1.0)
    _, retry_late = rl.check("ip", 8.0)
    assert retry_early > retry_late >= 1


def test_reset_clears_budget():
    rl = RateLimiter(1, 60)
    assert rl.check("ip", 0.0)[0] is True
    assert rl.check("ip", 1.0)[0] is False
    rl.reset("ip")
    assert rl.check("ip", 2.0)[0] is True
