"""
ULIDs — the submission id.

Chosen over a UUID4 because the triage queue's entire contract is "pending,
oldest first", and a ULID sorts by creation time as a plain string. That lets
both repositories order by primary key, and lets DynamoDB do it without a second
attribute — see `SqliteSubmissionRepository.list_by_status`.

Which makes ordering a correctness property, not a cosmetic one, so it is tested
at the boundary that actually breaks: two ids minted inside the same millisecond.
"""

import pytest

from slack_data.utilities.ulid import is_ulid, new_ulid

CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def test_a_new_ulid_has_the_right_shape():
    value = new_ulid()
    assert len(value) == 26
    assert set(value) <= set(CROCKFORD)
    assert is_ulid(value)


def test_ids_are_unique():
    assert len({new_ulid() for _ in range(5000)}) == 5000


def test_ids_sort_by_creation_order():
    ids = [new_ulid() for _ in range(2000)]
    assert ids == sorted(ids)


def test_ids_minted_in_the_same_millisecond_still_sort():
    """The case that makes this monotonic rather than merely random.

    A plain ULID fills the low 80 bits with randomness, so two ids from the same
    millisecond sort in whatever order chance picked — and the triage queue would
    shuffle a burst of submissions. Pinning the clock forces that collision.
    """
    ids = [new_ulid(now_ms=1_755_600_000_000) for _ in range(1000)]
    assert ids == sorted(ids)
    assert len(set(ids)) == 1000


def test_a_later_timestamp_sorts_after_an_earlier_one():
    earlier = new_ulid(now_ms=1_755_600_000_000)
    later = new_ulid(now_ms=1_755_600_001_000)
    assert earlier < later


def test_a_clock_going_backwards_does_not_break_ordering():
    """NTP corrections happen; the queue must not reorder when one does."""
    forward = new_ulid(now_ms=1_755_600_001_000)
    backward = new_ulid(now_ms=1_755_600_000_000)
    assert backward > forward


@pytest.mark.parametrize(
    "value",
    [
        "",
        "not-a-ulid",
        "01J0000000000000000000000",       # 25 chars
        "01J0000000000000000000000AB",     # 27 chars
        "01J000000000000000000000IL",      # I and L are not in Crockford base32
        "01j0000000000000000000000a",      # lowercase
        "../../etc/passwd",
    ],
)
def test_junk_is_not_a_ulid(value):
    assert is_ulid(value) is False
