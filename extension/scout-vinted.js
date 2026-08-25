(() => {
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

  function extract() {
    const title = meta("og:title") || text(["h1", "[data-testid='item-title']"]);
    const priceText = text(["[data-testid='item-price']", "[class*='price']"]);
    const imageUrl = meta("og:image") || document.querySelector("main img")?.src || "";
    if (!title || !imageUrl) return { error: "Annonce Vinted non reconnue." };
    return { source: "vinted", source_url: location.href.split("?")[0], title, displayed_price: parsePrice(priceText), currency: "EUR", image_url: imageUrl };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SCOUT_EXTRACT_LISTING") sendResponse(extract());
  });
})();
