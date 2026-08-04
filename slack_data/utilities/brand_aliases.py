"""
Canonical brand names. The gear datasets spell some manufacturers several ways
(e.g. "BalanceCommunity" vs "Balance Community: Slackline Outfitters"), which
would create duplicate Brand rows. `get_brand()` runs each brand string through
`canonical_brand()` so every variant resolves to one row.

Add new variants here (variant -> canonical) as they turn up.
"""

BRAND_ALIASES: dict[str, str] = {
    "Aki Slackline": "Aki Slacklines",
    "Balance Community: Slackline Outfitters": "Balance Community",
    "BalanceCommunity": "Balance Community",
    "Elephant": "Elephant Slacklines",
    "Equilibrium": "Equilibrium Slacklines (EQB)",
    "slackliner.de": "Slackliner.de",
    "SlackMountain": "Slack Mountain",
    # Slack Pro! rebranded to lineGrip. The gear seed files still carry the old
    # name, so both spellings must map to the new one directly — canonical_brand()
    # is a single dict lookup and does NOT chain, so pointing "slackPro" at
    # "Slack Pro!" would leave it stranded on the retired name.
    "slackPro": "lineGrip (formerly Slack Pro!)",
    "Slack Pro!": "lineGrip (formerly Slack Pro!)",
    "Spider slacklines": "Spider Slacklines",
    "yogaslackers": "Yoga Slackers",
}


def canonical_brand(name: str) -> str:
    """Map a brand-name variant to its canonical spelling (unchanged if unknown)."""
    return BRAND_ALIASES.get(name.strip(), name.strip())
