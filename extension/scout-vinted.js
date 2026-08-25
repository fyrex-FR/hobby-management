(() => {
  const MAX_SPECIFICS = 40;
  const MAX_DESCRIPTION = 600;

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

  /** Texte d'une cellule, sans les boutons d'aide que Vinted y imbrique. */
  function cellText(cell) {
    const copy = cell.cloneNode(true);
    copy.querySelectorAll("button").forEach((element) => element.remove());
    return clean(copy.textContent);
  }

  /**
   * Le titre de la page porte le suffixe « | Vinted » : laissé en place, il
   * part comme mot-clé obligatoire dans la recherche eBay et ne correspond à
   * aucune annonce. Le `h1` est le titre propre.
   */
  function extractTitle() {
    return clean(text(["h1", "[data-testid='item-title']"]))
      || clean(meta("og:title").replace(/\s*[|·–-]\s*Vinted\s*$/i, ""));
  }

  /** Détails Vinted : deux cellules par ligne, libellé puis valeur. */
  function extractSpecifics() {
    const specifics = {};
    for (const row of document.querySelectorAll(".details-list__item, [data-testid^='item-attributes-']")) {
      const cells = row.querySelectorAll(".details-list__item-value");
      if (cells.length < 2) continue;
      const label = cellText(cells[0]).replace(/\s*:\s*$/, "");
      const value = cellText(cells[1]);
      if (!label || !value || specifics[label]) continue;
      specifics[label] = value.slice(0, 160);
      if (Object.keys(specifics).length >= MAX_SPECIFICS) break;
    }
    return specifics;
  }

  /**
   * Sur Vinted, la note et le numéro de carte vivent souvent dans la
   * description plutôt que dans le titre, faute de champs dédiés.
   */
  function extractDescription() {
    return clean(text([
      "[itemprop='description']",
      "[data-testid='item-description']",
      ".details-list--description",
    ])).slice(0, MAX_DESCRIPTION);
  }

  function extract() {
    const title = extractTitle();
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
      description: extractDescription(),
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SCOUT_EXTRACT_LISTING") sendResponse(extract());
  });
})();
