from enum import Enum

class Country(str, Enum):
    ARGENTINA = "Argentina"
    AUSTRALIA = "Australia"
    AUSTRIA = "Austria"
    BELARUS = "Belarus"
    BELGIUM = "Belgium"
    BOLIVIA = "Bolivia"
    BRAZIL = "Brazil"
    CANADA = "Canada"
    CHILE = "Chile"
    CHINA = "China"
    COLOMBIA = "Colombia"
    CZECH_REPUBLIC = "Czech Republic"
    DENMARK = "Denmark"
    FRANCE = "France"
    GERMANY = "Germany"
    INDIA = "India"
    IRAN = "Iran"
    IRELAND = "Ireland"
    ISRAEL = "Israel"
    ITALY = "Italy"
    JAPAN = "Japan"
    LATVIA = "Latvia"
    LITHUANIA = "Lithuania"
    MEXICO = "Mexico"
    NETHERLANDS = "Netherlands"
    NEW_ZEALAND = "New Zealand"
    NORWAY = "Norway"
    PERU = "Peru"
    POLAND = "Poland"
    PORTUGAL = "Portugal"
    RUSSIA = "Russia"
    SINGAPORE = "Singapore"
    SOUTH_KOREA = "South Korea"
    SPAIN = "Spain"
    ROMANIA = "Romania"
    SWEDEN = "Sweden"
    SWITZERLAND = "Switzerland"
    TURKEY = "Turkey"
    UKRAINE = "Ukraine"
    UNITED_KINGDOM = "United Kingdom"
    UNITED_STATES = "United States"
    SOUTH_AFRICA = "South Africa"
    OTHER = "Other"


# ISO 3166-1 alpha-2 -> Country. The manufacturer sources (manufacturers.json and
# slackdb.com/api/manufacturers) both express country as a two-letter code, while
# this enum stores full display names — this is the bridge between them.
_COUNTRY_BY_CODE: dict[str, Country] = {
    "AR": Country.ARGENTINA,
    "AT": Country.AUSTRIA,
    "AU": Country.AUSTRALIA,
    "BE": Country.BELGIUM,
    "BO": Country.BOLIVIA,
    "BR": Country.BRAZIL,
    "BY": Country.BELARUS,
    "CA": Country.CANADA,
    "CH": Country.SWITZERLAND,
    "CL": Country.CHILE,
    "CN": Country.CHINA,
    "CO": Country.COLOMBIA,
    "CZ": Country.CZECH_REPUBLIC,
    "DE": Country.GERMANY,
    "DK": Country.DENMARK,
    "ES": Country.SPAIN,
    "FR": Country.FRANCE,
    "GB": Country.UNITED_KINGDOM,
    "IE": Country.IRELAND,
    "IL": Country.ISRAEL,
    "IN": Country.INDIA,
    "IR": Country.IRAN,
    "IT": Country.ITALY,
    "JP": Country.JAPAN,
    "KR": Country.SOUTH_KOREA,
    "LT": Country.LITHUANIA,
    "LV": Country.LATVIA,
    "MX": Country.MEXICO,
    "NL": Country.NETHERLANDS,
    "NO": Country.NORWAY,
    "NZ": Country.NEW_ZEALAND,
    "PE": Country.PERU,
    "PL": Country.POLAND,
    "PT": Country.PORTUGAL,
    "RO": Country.ROMANIA,
    "RU": Country.RUSSIA,
    "SE": Country.SWEDEN,
    "SG": Country.SINGAPORE,
    "TR": Country.TURKEY,
    "UA": Country.UKRAINE,
    "US": Country.UNITED_STATES,
    "ZA": Country.SOUTH_AFRICA,
}


def get_country(code: str | None) -> Country | None:
    """Resolve an ISO alpha-2 code to a Country.

    Returns None for a blank/unknown code rather than falling back to OTHER —
    an unrecognised code is a data problem worth seeing as a null, not something
    to silently bucket. (Every code present in manufacturers.json today maps.)
    """
    if not code:
        return None
    return _COUNTRY_BY_CODE.get(code.strip().upper())