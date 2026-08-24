"""
ULIDs — the submission id.

A ULID is a 128-bit id whose leading 48 bits are the creation time in
milliseconds, encoded in Crockford base32. Two properties matter here:

1. **Lexicographically sortable by creation time.** DynamoDB sorts strings
   bytewise, so "oldest first" needs no separate sort key on the base table.
2. **Not guessable and not sequential across submitters**, unlike an
   auto-increment integer — a submission id ends up in a URL the admin follows,
   and a countable id leaks how much traffic the box gets.

Implemented here rather than pulled in as a dependency: it is twenty lines, and
every dependency in the Lambda image has to be listed by hand in
Dockerfile.lambda, where a missing one is a cold-start ImportError that 502s
every request.
"""

import os
import threading
import time

# Crockford base32 — no I, L, O or U, so a hand-copied id can't be misread.
_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_LENGTH = 26
_RANDOM_BITS = 80
_RANDOM_MAX = (1 << _RANDOM_BITS) - 1

# Monotonic generation state. FastAPI serves sync handlers on a threadpool, so
# two submissions really can land in the same millisecond on different threads.
_lock = threading.Lock()
_last: tuple[int, int] = (0, 0)  # (timestamp_ms, random_component)


def _encode(value: int) -> str:
    chars = []
    for _ in range(_LENGTH):
        chars.append(_ALPHABET[value & 0x1F])
        value >>= 5
    return "".join(reversed(chars))


def new_ulid(now_ms: int | None = None) -> str:
    """A fresh ULID. `now_ms` is injectable so tests can pin the timestamp.

    **Monotonic within a millisecond.** Two ids minted in the same millisecond
    would otherwise be ordered by their random components — i.e. arbitrarily —
    and "pending, oldest first" is the triage page's entire contract. When the
    timestamp repeats, the random component is incremented instead of redrawn,
    which the ULID spec provides for exactly this case.
    """
    global _last
    timestamp = int(time.time() * 1000) if now_ms is None else now_ms

    with _lock:
        last_timestamp, last_random = _last
        if timestamp == last_timestamp and last_random < _RANDOM_MAX:
            randomness = last_random + 1
        elif timestamp < last_timestamp:
            # The clock went backwards (NTP step, or a pinned `now_ms` in a
            # test). Keep issuing increasing ids under the previous timestamp
            # rather than emitting one that sorts before an id already handed
            # out — a duplicate ordering is a worse failure than a slightly
            # wrong embedded time.
            timestamp, randomness = last_timestamp, min(last_random + 1, _RANDOM_MAX)
        else:
            randomness = int.from_bytes(os.urandom(10), "big")
        _last = (timestamp, randomness)

    return _encode((timestamp << _RANDOM_BITS) | randomness)


def is_ulid(value: str) -> bool:
    """Cheap shape check, so a malformed id 404s instead of hitting the store."""
    return (
        isinstance(value, str)
        and len(value) == _LENGTH
        and all(char in _ALPHABET for char in value)
    )
