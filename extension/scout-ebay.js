(() => {
  const MAX_SPECIFICS = 40;

  function text(selectors) {
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.textContent?.trim();
      if (value) return value;
    }
    return "";
  }

  function parsePrice(value) {
    const match = String(value).replace(/\s/g, "").match(/[0-9]+(?:[.,][0-9]{1,2})?/);
    const parsed = match ? Number.parseFloat(match[0].replace(",", ".")) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  /** État eBay : « Non gradée - Quasi neuf ou mieux », « Gradée - PSA 10 ». */
  function extractCondition() {
    const value = text([
      ".x-item-condition-value .ux-textspans",
      ".x-item-condition-value",
      "[data-testid='x-item-condition'] .ux-textspans",
      ".u-flL.condText",
    ]);
    // eBay double parfois le libellé avec une version lecteur d'écran.
    return clean(value).slice(0, 200);
  }

  /**
   * Caractéristiques de l'objet : « Société de notation », « Note »,
   * « Parallèle/Variété »… Bien plus sûres que le titre pour classer la carte.
   */
  function extractSpecifics() {
    const specifics = {};
    for (const row of document.querySelectorAll(".ux-labels-values")) {
      const label = clean(row.querySelector(".ux-labels-values__labels")?.textContent).replace(/\s*:\s*$/, "");
      const value = clean(row.querySelector(".ux-labels-values__values")?.textContent);
      if (!label || !value || specifics[label]) continue;
      specifics[label] = value.slice(0, 160);
      if (Object.keys(specifics).length >= MAX_SPECIFICS) break;
    }
    return specifics;
  }

  function extract() {
    const title = text(["h1.x-item-title__mainTitle", "h1[itemprop='name']", "h1"]);
    const priceText = text([".x-price-primary", "[itemprop='price']", ".x-bin-price"]);
    const imageUrl = document.querySelector(".ux-image-carousel-item.active img, .ux-image-carousel img, #icImg")?.src || document.querySelector("meta[property='og:image']")?.content || "";
    if (!title || !imageUrl) return { error: "Annonce eBay non reconnue." };
    const currencyMatch = priceText.match(/\b(EUR|USD|GBP|CHF|CAD|AUD)\b|([€$£])/i);
    const currency = currencyMatch?.[1]?.toUpperCase() || ({ "€": "EUR", "$": "USD", "£": "GBP" }[currencyMatch?.[2]] || "EUR");
    return {
      source: "ebay",
      source_url: location.href.split("?")[0],
      title,
      displayed_price: parsePrice(priceText),
      currency,
      image_url: imageUrl,
      condition: extractCondition(),
      specifics: extractSpecifics(),
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SCOUT_EXTRACT_LISTING") sendResponse(extract());
  });
})();
