UPDATE cards
SET ebay_price = CASE
  WHEN (vinted_price + 0.35) / 0.91 < 5
    THEN ceil(((vinted_price + 0.35) / 0.91) * 2) / 2
  ELSE ceil((vinted_price + 0.35) / 0.91)
END
WHERE vinted_price IS NOT NULL
  AND ebay_price IS NULL;
