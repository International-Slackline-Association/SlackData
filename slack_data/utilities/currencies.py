from enum import Enum

class Currency(str, Enum):
    """
    Enum for ISO 4217 currency codes.
    """
    ARS = "ARS"  # Argentine Peso
    AUD = "AUD"  # Australian Dollar
    BOB = "BOB"  # Boliviano
    BRL = "BRL"  # Brazilian Real
    BYN = "BYN"  # Belarusian Ruble
    CAD = "CAD"  # Canadian Dollar
    CHF = "CHF"  # Swiss Franc
    CLP = "CLP"  # Chilean Peso
    CNY = "CNY"  # Chinese Yuan
    COP = "COP"  # Colombian Peso
    CZK = "CZK"  # Czech Koruna
    DKK = "DKK"  # Danish Krone
    EUR = "EUR"  # Euro
    GBP = "GBP"  # British Pound
    HKD = "HKD"  # Hong Kong Dollar
    ILS = "ILS"  # Israeli New Shekel
    INR = "INR"  # Indian Rupee
    IRR = "IRR"  # Iranian Rial
    JPY = "JPY"  # Japanese Yen
    KRW = "KRW"  # South Korean Won
    MXN = "MXN"  # Mexican Peso
    NZD = "NZD"  # New Zealand Dollar
    PEN = "PEN"  # Peruvian Sol
    PLN = "PLN"  # Polish Zloty
    RUB = "RUB"  # Russian Ruble
    SEK = "SEK"  # Swedish Krona
    SGD = "SGD"  # Singapore Dollar
    TRY = "TRY"  # Turkish Lira
    UAH = "UAH"  # Ukrainian Hryvnia
    USD = "USD"  # United States Dollar
    ZAR = "ZAR"  # South African Rand

def get_currency(currency: str) -> Currency:
    """
    Convert the currency string to a Currency enum.
    """
    currency = currency.upper()
    if currency in Currency.__members__:
        return Currency[currency]
    
    for currency_member in Currency:
        if currency_member.value in currency:
            return currency_member

    raise ValueError(f"Invalid currency: {currency}")
    

if __name__ == "__main__":
    # Example usage
    try:
        print(get_currency("usd"))  # Output: Currency.USD
        print(get_currency("USD"))
        print(get_currency("EUR"))  # Output: Currency.EUR
        print(get_currency("EURO"))
        print(get_currency("xyz"))  # Raises ValueError
    except ValueError as e:
        print(e)