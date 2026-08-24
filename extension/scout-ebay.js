(() => {
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

  function extract() {
    const title = text(["h1.x-item-title__mainTitle", "h1[itemprop='name']", "h1"]);
    const priceText = text([".x-price-primary", "[itemprop='price']", ".x-bin-price"]);
    const imageUrl = document.querySelector(".ux-image-carousel-item.active img, .ux-image-carousel img, #icImg")?.src || document.querySelector("meta[property='og:image']")?.content || "";
    if (!title || !imageUrl) return { error: "Annonce eBay non reconnue." };
    return { source: "ebay", source_url: location.href.split("?")[0], title, displayed_price: parsePrice(priceText), image_url: imageUrl };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SCOUT_EXTRACT_LISTING") sendResponse(extract());
  });
})();
