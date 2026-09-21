(() => {
  const STORAGE_KEY = "vinted_pending";
  const WINDOW_NAME_PREFIX = "vinted_pending:";
  const SUCCESS_BANNER_ID = "nba-vinted-prefill-success";
  const PHOTOS_BANNER_ID = "nba-vinted-prefill-photos";
  const UPLOAD_ARROW_ID = "nba-vinted-prefill-upload-arrow";
  const ACTION_DELAY_MS = 400;
  let uploadArrowTrackingEnabled = false;
  let activeCardId = null;

  function showBanner({ id, text, background, color, top }) {
    let banner = document.getElementById(id);
    if (!banner) {
      banner = document.createElement("div");
      banner.id = id;
      banner.style.position = "fixed";
      banner.style.left = "16px";
      banner.style.right = "16px";
      banner.style.zIndex = "2147483647";
      banner.style.padding = "12px 14px";
      banner.style.borderRadius = "12px";
      banner.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      banner.style.fontSize = "14px";
      banner.style.fontWeight = "700";
      banner.style.boxShadow = "0 6px 20px rgba(0,0,0,.2)";
      banner.style.display = "flex";
      banner.style.alignItems = "center";
      banner.style.justifyContent = "space-between";
      banner.style.gap = "10px";

      const label = document.createElement("span");
      label.style.flex = "1";

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.textContent = "✕";
      closeButton.setAttribute("aria-label", "Fermer le bandeau");
      closeButton.style.border = "none";
      closeButton.style.background = "transparent";
      closeButton.style.color = "inherit";
      closeButton.style.fontSize = "14px";
      closeButton.style.fontWeight = "900";
      closeButton.style.cursor = "pointer";
      closeButton.style.lineHeight = "1";
      closeButton.style.padding = "0 2px";
      closeButton.addEventListener("click", () => banner.remove());

      banner.appendChild(label);
      banner.appendChild(closeButton);
      banner.__label = label;
      document.body.appendChild(banner);
    }

    banner.style.top = `${top}px`;
    banner.style.background = background;
    banner.style.color = color;
    if (banner.__label) banner.__label.textContent = text;
  }

  async function readPendingPayload() {
    // Méthode 1 : hash de l'URL (#vinted_pending=...)
    try {
      const match = location.hash.match(/[#&]vinted_pending=([^&]*)/);
      if (match) {
        const decoded = decodeURIComponent(match[1]);
        const parsed = JSON.parse(decoded);
        if (parsed && typeof parsed === "object") {
          history.replaceState(null, "", location.pathname + location.search);
          return parsed;
        }
      }
    } catch { /* no-op */ }

    // Méthode 2 : window.name (legacy)
    try {
      if (window.name && window.name.startsWith(WINDOW_NAME_PREFIX)) {
        const decoded = decodeURIComponent(window.name.slice(WINDOW_NAME_PREFIX.length));
        localStorage.setItem(STORAGE_KEY, decoded);
        window.name = "";
      }
    } catch { /* no-op */ }

    // Méthode 3 : localStorage
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch { /* no-op */ }

    // Méthode 4 : stockage interne de l'extension. Vinted peut retirer le hash
    // avant l'exécution du content script lors de certaines navigations SPA.
    try {
      const response = await chrome.runtime.sendMessage({ type: "VINTED_GET_PENDING_DRAFT" });
      if (response?.draft && typeof response.draft === "object") return response.draft;
    } catch { /* no-op */ }

    return null;
  }

  function queryFirst(selectors) {
    for (const selector of selectors) {
      const candidates = Array.from(document.querySelectorAll(selector));
      const visible = candidates.find((el) => isVisible(el));
      if (visible) return visible;
      if (candidates[0]) return candidates[0];
    }
    return null;
  }

  function formatPriceForVinted(value) {
    return String(value ?? "").trim().replace(/\s/g, "");
  }

  function findVintedFields() {
    const title = queryFirst([
      'input[name="title"]', 'input[id*="title" i]',
      'input[placeholder*="titre" i]', 'input[placeholder*="title" i]',
      'input[data-testid*="title" i]'
    ]);
    const description = queryFirst([
      'textarea[name="description"]', 'textarea[id*="description" i]',
      'textarea[placeholder*="description" i]', 'textarea[data-testid*="description" i]'
    ]);
    const price = queryFirst([
      'input[name="price"]', 'input[id*="price" i]',
      'input[placeholder*="prix" i]', 'input[placeholder*="price" i]',
      'input[data-testid*="price" i]', 'input[inputmode="decimal"]'
    ]);
    if (!title || !description || !price) return null;
    return { title, description, price };
  }

  function waitForFields(timeoutMs = 25000) {
    return new Promise((resolve, reject) => {
      const found = findVintedFields();
      if (found) { resolve(found); return; }

      const observer = new MutationObserver(() => {
        const current = findVintedFields();
        if (!current) return;
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve(current);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      const timeoutId = setTimeout(() => {
        observer.disconnect();
        reject(new Error("Champs Vinted non trouvés"));
      }, timeoutMs);
    });
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeText(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findClickableByLabel(labels) {
    const normalizedLabels = labels.map((l) => normalizeText(l));
    return Array.from(document.querySelectorAll(
      'button, [role="button"], [role="option"], [role="menuitem"], li, a, div, span'
    )).find((el) => {
      if (!isVisible(el)) return false;
      const text = normalizeText(`${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`);
      return normalizedLabels.some((l) => text.includes(l));
    });
  }

  function waitForElement(predicateOrSelector, timeoutMs = 8000) {
    const resolve_ = () => typeof predicateOrSelector === "string"
      ? document.querySelector(predicateOrSelector)
      : predicateOrSelector();

    return new Promise((resolve, reject) => {
      const immediate = resolve_();
      if (immediate) { resolve(immediate); return; }

      const observer = new MutationObserver(() => {
        const current = resolve_();
        if (!current) return;
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve(current);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      const timeoutId = setTimeout(() => {
        observer.disconnect();
        reject(new Error("Element not found"));
      }, timeoutMs);
    });
  }

  function clickWithEvents(element) {
    if (!element) return;
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    element.click();
  }

  function findTextInputByLabel(labels) {
    const normalizedLabels = labels.map((l) => normalizeText(l));
    return Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]')).find((el) => {
      if (!isVisible(el)) return false;
      const lookup = normalizeText(`${el.getAttribute("placeholder") || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("name") || ""} ${el.getAttribute("id") || ""}`);
      return normalizedLabels.some((l) => lookup.includes(l));
    });
  }

  async function selectBrand(brand) {
    const normalizedBrand = String(brand || "").trim();
    if (!normalizedBrand) return;

    const brandDropdown = await waitForElement(() => findClickableByLabel(["Marque"]), 7000).catch(() => null);
    if (!brandDropdown) return;
    clickWithEvents(brandDropdown);
    await delay(ACTION_DELAY_MS);

    const brandSearchInput = await waitForElement(
      () => findTextInputByLabel(["Trouver une marque", "Rechercher une marque", "Chercher une marque"]),
      5000
    ).catch(() => null);
    if (brandSearchInput) { setInputValue(brandSearchInput, normalizedBrand); await delay(ACTION_DELAY_MS); }

    const brandOption = await waitForElement(() => findClickableByLabel([normalizedBrand]), 7000).catch(() => null);
    if (!brandOption) return;
    clickWithEvents(brandOption);
    await delay(ACTION_DELAY_MS);
  }

  async function selectCondition() {
    const conditionDropdown = await waitForElement(() => findClickableByLabel(["État", "Etat"]), 7000).catch(() => null);
    if (!conditionDropdown) return;
    clickWithEvents(conditionDropdown);
    await delay(ACTION_DELAY_MS);

    const conditionOption = await waitForElement(
      () => findClickableByLabel(["Neuf sans étiquette", "Neuf sans etiquette"]),
      7000
    ).catch(() => null);
    if (!conditionOption) return;
    clickWithEvents(conditionOption);
    await delay(ACTION_DELAY_MS);
  }

  async function applyVintedSelections(pending) {
    await selectBrand(pending?.brand || "");
    await selectCondition();
  }

  function setInputValue(element, value) {
    const text = String(value ?? "");
    const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) descriptor.set.call(element, text);
    else element.value = text;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function normalizedPrice(value) {
    let text = String(value ?? "")
      .trim()
      .replace(/[\s\u00a0\u202f]/g, "")
      .replace(/[^\d,.-]/g, "");
    const lastComma = text.lastIndexOf(",");
    const lastDot = text.lastIndexOf(".");
    if (lastComma >= 0 && lastDot >= 0) {
      const decimalSeparator = lastComma > lastDot ? "," : ".";
      const thousandsSeparator = decimalSeparator === "," ? /\./g : /,/g;
      text = text.replace(thousandsSeparator, "").replace(decimalSeparator, ".");
    } else {
      text = text.replace(",", ".");
    }
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function setPriceValue(element, value) {
    const expected = normalizedPrice(value);
    if (expected === null) throw new Error("Prix Vinted invalide");
    const candidates = [String(value).replace(",", "."), String(value).replace(".", ",")];
    for (const candidate of [...new Set(candidates)]) {
      setInputValue(element, candidate);
      element.blur();
      await delay(120);
      const displayedValue = Number.isFinite(element.valueAsNumber)
        ? element.valueAsNumber
        : normalizedPrice(element.value);
      if (displayedValue !== null && Math.abs(displayedValue - expected) < 0.001) return;
    }
    throw new Error("Vinted a refusé le prix prérempli");
  }

  function sanitizeFilenamePart(value) {
    return (String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/_+/g, "_")) || "card";
  }

  function dataUrlToFile(dataUrl, index, baseName) {
    const match = String(dataUrl).match(/^data:(.*?);base64,(.*)$/);
    if (!match) throw new Error("Photo base64 invalide");
    const mime = match[1];
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const extension = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const filename = `${index + 1}_${baseName}_${index === 0 ? "front" : "back"}.${extension}`;
    return { filename, blob: new Blob([bytes], { type: mime }) };
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function findUploadZoneElement() {
    const fileInput = queryFirst(['input[type="file"]', 'input[accept*="image"]', 'input[accept*="photo"]']);
    if (fileInput) {
      return fileInput.closest('label, [role="button"], [data-testid*="photo" i], [data-testid*="image" i], div') || fileInput;
    }
    return queryFirst(['[data-testid*="photo-upload" i]', '[data-testid*="photos" i]', '[data-testid*="image-upload" i]', '[class*="photo-upload" i]', '[class*="image-upload" i]']);
  }

  function ensureUploadArrow() {
    let arrow = document.getElementById(UPLOAD_ARROW_ID);
    if (arrow) return arrow;
    arrow = document.createElement("div");
    arrow.id = UPLOAD_ARROW_ID;
    arrow.style.position = "fixed";
    arrow.style.zIndex = "2147483645";
    arrow.style.fontFamily = "system-ui, sans-serif";
    arrow.style.fontSize = "14px";
    arrow.style.fontWeight = "800";
    arrow.style.color = "#22c55e";
    arrow.style.textShadow = "0 2px 8px rgba(0,0,0,.35)";
    arrow.style.pointerEvents = "none";
    arrow.textContent = "⬇ glissez-les ici";
    document.body.appendChild(arrow);
    return arrow;
  }

  function positionUploadArrow() {
    const arrow = ensureUploadArrow();
    const zone = findUploadZoneElement();
    if (!zone) { arrow.style.display = "none"; return; }
    const rect = zone.getBoundingClientRect();
    arrow.style.display = "block";
    arrow.style.left = `${Math.max(12, rect.left + rect.width / 2 - 65)}px`;
    arrow.style.top = `${Math.max(80, rect.top - 28)}px`;
  }

  function enableUploadArrowTracking() {
    positionUploadArrow();
    if (uploadArrowTrackingEnabled) return;
    uploadArrowTrackingEnabled = true;
    window.addEventListener("scroll", positionUploadArrow, { passive: true });
    window.addEventListener("resize", positionUploadArrow);
  }

  function disableUploadArrowTracking() {
    if (!uploadArrowTrackingEnabled) return;
    uploadArrowTrackingEnabled = false;
    window.removeEventListener("scroll", positionUploadArrow);
    window.removeEventListener("resize", positionUploadArrow);
  }

  function removeUploadArrow() {
    disableUploadArrowTracking();
    document.getElementById(UPLOAD_ARROW_ID)?.remove();
  }

  async function tryAutoUploadPhotos(photos, title) {
    const fileInput = queryFirst([
      'input[type="file"][multiple][accept*="image"]',
      'input[type="file"][multiple]',
      'input[type="file"][accept*="image"]',
      'input[type="file"]',
    ]);
    if (!fileInput) return false;

    try {
      const baseName = sanitizeFilenamePart(title);
      const files = photos.slice(0, 2).map((dataUrl, i) => {
        const { blob, filename } = dataUrlToFile(dataUrl, i, baseName);
        return new File([blob], filename, { type: blob.type, lastModified: Date.now() });
      });

      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      fileInput.files = dt.files;
      // Vinted traite le FileList au changement de l'input. Déclencher aussi
      // un drop sur la zone faisait traiter le même lot deux fois et pouvait
      // laisser uniquement le dernier fichier (le verso).
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      await delay(800);

      return fileInput.files?.length === files.length;
    } catch (err) {
      console.log("[NBA Vinted] Erreur upload automatique:", err.message);
      return false;
    }
  }

  function createDraggableThumbnail(dataUrl, index, title) {
    const baseName = sanitizeFilenamePart(title);
    const { blob, filename } = dataUrlToFile(dataUrl, index, baseName);
    const file = new File([blob], filename, { type: blob.type, lastModified: Date.now() });

    const container = document.createElement("div");
    container.style.cssText = "position:relative;width:60px;height:60px;border-radius:8px;overflow:hidden;cursor:grab;border:2px solid #22c55e;box-shadow:0 2px 8px rgba(0,0,0,0.3);flex-shrink:0;";
    container.draggable = true;
    container.title = `Glissez ${index === 0 ? "recto" : "verso"} vers la zone photo`;

    const img = document.createElement("img");
    img.src = dataUrl;
    img.style.cssText = "width:100%;height:100%;object-fit:cover;pointer-events:none;";
    img.draggable = false;

    const label = document.createElement("div");
    label.textContent = index === 0 ? "R" : "V";
    label.style.cssText = "position:absolute;bottom:2px;right:2px;background:#22c55e;color:#052e16;font-size:10px;font-weight:800;padding:1px 4px;border-radius:4px;";

    container.appendChild(img);
    container.appendChild(label);

    container.addEventListener("dragstart", (e) => {
      container.style.opacity = "0.5";
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("text/plain", filename);
      e.dataTransfer.items.add(file);
    });
    container.addEventListener("dragend", () => { container.style.opacity = "1"; });

    return container;
  }

  function showPhotosBanner(photos, title) {
    if (document.getElementById(PHOTOS_BANNER_ID)) return;

    const banner = document.createElement("div");
    banner.id = PHOTOS_BANNER_ID;
    banner.style.cssText = "position:fixed;left:16px;right:16px;top:64px;z-index:2147483646;display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;background:#0f172a;color:#f8fafc;box-shadow:0 6px 20px rgba(0,0,0,.2);font-family:system-ui,sans-serif;font-size:14px;font-weight:700;";

    const thumbs = document.createElement("div");
    thumbs.style.cssText = "display:flex;gap:8px;align-items:center;";
    photos.slice(0, 2).forEach((photo, i) => thumbs.appendChild(createDraggableThumbnail(photo, i, title)));

    const lbl = document.createElement("span");
    lbl.innerHTML = "👆 <strong>Glissez</strong> vers la zone photo";
    lbl.style.flex = "1";

    const btnStyle = "border:1px solid rgba(248,250,252,0.35);border-radius:8px;padding:8px 10px;font-size:12px;font-weight:700;cursor:pointer;background:transparent;color:#f8fafc;";

    const dlBtn = document.createElement("button");
    dlBtn.type = "button";
    dlBtn.textContent = "📥 Télécharger";
    dlBtn.style.cssText = btnStyle;
    dlBtn.addEventListener("click", () => {
      const baseName = sanitizeFilenamePart(title);
      photos.slice(0, 2).forEach((dataUrl, i) => {
        const { blob, filename } = dataUrlToFile(dataUrl, i, baseName);
        setTimeout(() => downloadBlob(blob, filename), i * 250);
      });
      enableUploadArrowTracking();
    });

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = btnStyle;
    closeBtn.addEventListener("click", () => { removeUploadArrow(); banner.remove(); });

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;align-items:center;gap:8px;";
    actions.appendChild(dlBtn);
    actions.appendChild(closeBtn);

    banner.appendChild(thumbs);
    banner.appendChild(lbl);
    banner.appendChild(actions);
    document.body.appendChild(banner);
    enableUploadArrowTracking();
  }

  async function fillVintedForm() {
    const pending = await readPendingPayload();
    if (!pending) return;
    activeCardId = pending.cardId || null;

    const fields = await waitForFields();
    setInputValue(fields.title, pending.title || "");
    setInputValue(fields.description, pending.description || "");
    await setPriceValue(fields.price, formatPriceForVinted(pending.price || ""));
    await applyVintedSelections(pending);

    if (Array.isArray(pending.photos) && pending.photos.length > 0) {
      await delay(800);
      const uploaded = await tryAutoUploadPhotos(pending.photos, pending.title);
      if (uploaded) {
        showBanner({ id: SUCCESS_BANNER_ID, text: "Carte pré-remplie + photos ajoutées ✓", background: "#16a34a", color: "#ffffff", top: 12 });
      } else {
        showBanner({ id: SUCCESS_BANNER_ID, text: "Carte pré-remplie ✓ — glissez les photos depuis le bandeau", background: "#16a34a", color: "#ffffff", top: 12 });
        showPhotosBanner(pending.photos, pending.title);
      }
    } else {
      showBanner({ id: SUCCESS_BANNER_ID, text: "Carte pré-remplie ✓", background: "#16a34a", color: "#ffffff", top: 12 });
    }

    localStorage.removeItem(STORAGE_KEY);
  }

  let lastUrl = location.href;
  let bootstrapRan = false;

  async function bootstrap() {
    const published = location.pathname.match(/^\/items\/\d+(?:-[^/?#]+)?\/?$/);
    if (published) {
      chrome.runtime.sendMessage({ type: "VINTED_LISTING_PUBLISHED", url: `${location.origin}${location.pathname}` }).catch(() => {});
      return;
    }
    if (!location.pathname.includes("/items/new")) return;
    if (bootstrapRan) return;
    bootstrapRan = true;
    try {
      await fillVintedForm();
    } catch (error) {
      showBanner({ id: SUCCESS_BANNER_ID, text: "Pré-remplissage impossible sur cette page.", background: "#f59e0b", color: "#111827", top: 12 });
      chrome.runtime.sendMessage({ type: "VINTED_DRAFT_ERROR", cardId: activeCardId, error: error?.message }).catch(() => {});
    }
  }

  // Surveille les navigations SPA
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      bootstrapRan = false;
      bootstrap();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
