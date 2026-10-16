"""
A request to represent a brand — "I represent this brand" (D5, phase 5).

A signed-in person asks; an admin approves (the person is linked to the brand,
`Person.brands`) or declines. The request shows the admin whether the person's
**verified** email domain matches the brand's website — a signal, never the
decision: a company mailbox is not authority over a brand, and many small
brands use gmail (D5).

A request is not a change to anything, so it is not in the public change log;
approving one is (`brand.link`). Plain pydantic, stored in its own table
hosted (P5-B), a SQLite file locally.
"""

from enum import Enum
from urllib.parse import urlparse

from pydantic import BaseModel, Field

from slack_data.models.brand_clients import now_iso

MAX_NOTE_LENGTH = 1000


class RequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DECLINED = "declined"


class BrandRequest(BaseModel):
    # A monotonic ULID: sorting by id is sorting by age — the queue's order.
    request_id: str
    sub: str
    isa_id: str
    catalog_id: int
    note: str | None = Field(default=None, max_length=MAX_NOTE_LENGTH)
    # Worked out when the request is made, from the person's verified address.
    email_domain_matches: bool = False
    status: RequestStatus = RequestStatus.PENDING
    created_at: str = Field(default_factory=now_iso)
    decided_at: str | None = None
    # The deciding admin's ISA id.
    decided_by: str | None = None
    decision_note: str | None = Field(default=None, max_length=MAX_NOTE_LENGTH)


def _host(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value if "://" in value else f"https://{value}")
    host = (parsed.hostname or "").lower()
    return host[4:] if host.startswith("www.") else host or None


def email_domain_matches(email: str | None, email_verified: bool, website: str | None) -> bool:
    """True when a **verified** address's domain is the website's host, or
    one is a subdomain of the other (`shop.gibbon.com` / `gibbon.com`)."""
    if not (email and email_verified and "@" in email):
        return False
    domain = email.rsplit("@", 1)[1].lower().strip()
    host = _host(website)
    if not host or not domain:
        return False
    return domain == host or domain.endswith(f".{host}") or host.endswith(f".{domain}")
