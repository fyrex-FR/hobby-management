from services.ebay_sold_scraper import _parse_items, _parse_price


def test_parse_french_prices():
    assert _parse_price("12,50 EUR") == 12.5
    assert _parse_price("1 234,56 EUR") == 1234.56


def test_parse_items_keeps_eur_currency():
    html = """
    <ul><li class="s-item">
      <a class="s-item__link" href="https://www.ebay.fr/itm/123456789012"></a>
      <div class="s-item__title">Carte test</div>
      <div class="s-item__price">12,50 EUR</div>
    </li></ul>
    """
    rows, raw_count = _parse_items(html, 20)
    assert raw_count == 1
    assert rows[0]["price"] == 12.5
    assert rows[0]["currency"] == "EUR"
