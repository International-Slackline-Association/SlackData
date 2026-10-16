"""
The rate cap — live editing phase 6 (LIVE_EDITING_PLAN.md § 7.2, D53, P6-C).

No more than **20 saves in any 60 minutes and 100 in any 24 hours** per
account. Each save counts once — an edit, a new product or brand, a media
change — however many fields or files it carries.

**Who is counted is read off the change itself**: a save whose log records
carry the role `editor` counts. An admin's are recorded as `admin`, and a
manufacturer's on their own brand's gear as `manufacturer for <brand>`, so
both are exempt exactly where D53 says, by the same rule that labels them in
the log (`Person.role_label`). The machine API's records are always the
brand's own, so it is never counted.

**Where it is counted**: the times of the last 24 hours' counted saves, on the
person's record (`Person.saves`), with `saves_rev`. The save and the count are
written together — hosted in the change's DynamoDB transaction, conditional on
`saves_rev` still being the one read, so two parallel saves cannot both take
the last place (`changelog/writer.py`).
"""

import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone

from slack_data.models.changes import ChangeRecord
from slack_data.models.people import Person

HOURLY_CAP = 20
DAILY_CAP = 100
HOUR = 60 * 60
DAY = 24 * HOUR

# The role a counted save is recorded with (`Person.role_label`).
EDITOR = "editor"


class CapExceeded(Exception):
    """At the cap. `retry_at`: when the oldest save in the full window leaves
    it (Unix seconds)."""

    def __init__(self, retry_at: int, window: str, limit: int) -> None:
        self.retry_at = retry_at
        self.window = window
        self.limit = limit
        super().__init__(
            f"you have saved {limit} changes in the last {window} — you can save again at "
            f"{iso(retry_at)}"
        )


class CapRace(Exception):
    """Another save of this person's was counted between the read and the
    write. Nothing was written; trying again is safe."""


def now() -> float:
    """The clock the cap reads (tests move it)."""
    return time.time()


def iso(epoch: int) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class CapUse:
    """A counted save: the person's new list, to write if `saves_rev` is
    still `expected_rev`."""

    sub: str
    expected_rev: int
    saves: list[int]

    @property
    def new_rev(self) -> int:
        return self.expected_rev + 1


@dataclass
class RateCap:
    """The cap of the person making this request."""

    people: object
    person: Person
    clock: Callable[[], float] = field(default=lambda: now())

    def charge(self, records: list[ChangeRecord]) -> CapUse | None:
        """What this change costs: None when it is exempt (or changes
        nothing), else the count to write with it. `CapExceeded` at the cap."""
        if not any(record.actor_role == EDITOR for record in records):
            return None
        now = int(self.clock())
        recent = self._check(now)
        return CapUse(self.person.sub, self.person.saves_rev, [*recent, now])

    def precheck(self, role: str) -> None:
        """`CapExceeded` now, for a save recorded as `role`, before work that
        cannot be undone — publishing an upload — is done for nothing."""
        if role == EDITOR:
            self._check(int(self.clock()))

    def _check(self, now: int) -> list[int]:
        recent = sorted(t for t in self.person.saves if t > now - DAY)
        last_hour = [t for t in recent if t > now - HOUR]
        if len(last_hour) >= HOURLY_CAP:
            raise CapExceeded(last_hour[-HOURLY_CAP] + HOUR, "hour", HOURLY_CAP)
        if len(recent) >= DAILY_CAP:
            raise CapExceeded(recent[-DAILY_CAP] + DAY, "24 hours", DAILY_CAP)
        return recent
