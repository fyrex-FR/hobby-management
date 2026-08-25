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

  /**
   * État eBay : « Non gradée - Quasi neuf ou mieux », « Gradée - PSA 10 ».
   * eBay répète la valeur pour les lecteurs d'écran et y accroche un lien
   * « En savoir plus » : on ne garde que le premier libellé.
   */
  function extractCondition() {
    const value = text([
      ".x-item-condition-text .ux-textspans",
      ".x-item-condition-value .ux-textspans",
      "[data-testid='x-item-condition'] .ux-textspans",
      ".u-flL.condText",
    ]);
    return clean(value).replace(/\s*En savoir plus.*$/i, "").slice(0, 200);
  }

  /**
   * Caractéristiques de l'objet : « Joueur ou athlète », « Set », « Numéro de
   * carte », « Société de notation »… Ce sont des paires dt/dd de la section
   * `--features`, à ne pas confondre avec le bloc livraison/retours qui
   * utilise, lui, les classes `ux-labels-values`.
   */
  function extractSpecifics() {
    const specifics = {};
    for (const col of document.querySelectorAll(".ux-layout-section--features .ux-layout-section-evo__col")) {
      const label = clean(col.querySelector("dt .ux-textspans, dt")?.textContent).replace(/\s*:\s*$/, "");
      const value = clean(col.querySelector("dd .ux-textspans, dd")?.textContent);
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
