(() => {
  const MAX_SPECIFICS = 40;

  function text(selectors) {
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.textContent?.trim();
      if (value) return value;
    }
    return "";
  }

  function meta(property) {
    return document.querySelector(`meta[property="${property}"]`)?.content || "";
  }

  function parsePrice(value) {
    const normalized = String(value).replace(/[^0-9,.]/g, "").replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  /** Détails Vinted (Marque, État, Taille…), affichés en paires libellé/valeur. */
  function extractSpecifics() {
    const specifics = {};
    for (const row of document.querySelectorAll("[data-testid$='--content-row'], .details-list__item-value")) {
      const label = clean(row.querySelector("[class*='title'], .web_ui__Cell__title")?.textContent).replace(/\s*:\s*$/, "");
      const value = clean(row.querySelector("[class*='subtitle'], .web_ui__Cell__subtitle")?.textContent);
      if (!label || !value || specifics[label]) continue;
      specifics[label] = value.slice(0, 160);
      if (Object.keys(specifics).length >= MAX_SPECIFICS) break;
    }
    return specifics;
  }

  function extract() {
    const title = meta("og:title") || text(["h1", "[data-testid='item-title']"]);
    const priceText = text(["[data-testid='item-price']", "[class*='price']"]);
    const imageUrl = meta("og:image") || document.querySelector("main img")?.src || "";
    if (!title || !imageUrl) return { error: "Annonce Vinted non reconnue." };
    const specifics = extractSpecifics();
    return {
      source: "vinted",
      source_url: location.href.split("?")[0],
      title,
      displayed_price: parsePrice(priceText),
      currency: "EUR",
      image_url: imageUrl,
      condition: clean(specifics["État"] || specifics["Etat"] || "").slice(0, 200),
      specifics,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SCOUT_EXTRACT_LISTING") sendResponse(extract());
  });
})();
