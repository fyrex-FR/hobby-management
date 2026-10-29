/*
 * Onglet « Publier sur Vinted » du panneau.
 *
 * Une carte à la fois : « Remplir l'annonce » ouvre la page de création Vinted
 * et la remplit (photos comprises) ; dès que l'annonce publiée s'affiche, le
 * service worker l'associe à la carte et le panneau propose « Annuler » puis
 * passe à la suivante. Secours manuel : associer l'annonce ouverte ou coller
 * son adresse.
 *
 * Utilise les utilitaires de sidepanel.js ($, show, api, escapeHtml…) et les
 * règles de vinted-logic.js (CVVinted).
 */
(() => {
  const UNDO_MS = 8000;
  const CHAIN_DELAY_MS = 1500;
  const PREFS_KEY = "vinted_panel_prefs";
  const v = {
    cards: [], selection: null, search: "", currentId: null,
    phase: "idle", // idle | preparing | filling | awaiting | error
    loading: false, loaded: false, undo: null, undoTimer: null,
    // Préférences gardées entre deux ouvertures du panneau.
    groupBy: "team", sort: "recent", chain: false,
    // « Publier ce groupe » : la file se limite à une équipe (ou un joueur, un set…).
    scope: null,
    published: 0, chainTimer: null,
    // Filtre « Sans prix » et prix en cours de saisie (gardés entre deux rendus).
    missingPrice: false, priceInput: {},
  };

  /** Cartes de la file, filtrées puis triées, avant découpage en groupes. */
  const visible = () => CVVinted.sortCards(
    CVVinted.inGroup(CVVinted.filterQueue(v.cards, { selection: v.selection, search: v.search, missingPrice: v.missingPrice }), v.scope),
    v.sort,
  );
  const priceText = (value) => (value > 0 ? String(value).replace(".", ",") : "");
  const groups = () => CVVinted.groupCards(visible(), v.scope ? "none" : v.groupBy);
  /** Ordre d'affichage (groupes à la suite) : c'est aussi l'ordre de publication. */
  const ordered = () => groups().flatMap((g) => g.cards);
  const current = () => {
    const list = ordered();
    return list.find((c) => c.id === v.currentId) || list[0] || null;
  };

  async function loadPrefs() {
    const prefs = (await chrome.storage.local.get(PREFS_KEY))[PREFS_KEY] || {};
    if (prefs.groupBy in CVVinted.GROUPS || prefs.groupBy === "none") v.groupBy = prefs.groupBy;
    if (["recent", "price_desc", "price_asc", "player"].includes(prefs.sort)) v.sort = prefs.sort;
    v.chain = prefs.chain === true;
    $("v-group").value = v.groupBy; $("v-sort").value = v.sort; $("v-chain").checked = v.chain;
  }

  function savePrefs() {
    chrome.storage.local.set({ [PREFS_KEY]: { groupBy: v.groupBy, sort: v.sort, chain: v.chain } }).catch(() => {});
  }
  const metaOf = (c) => [c.year, c.set_name, c.variant, c.numbered].filter(Boolean).join(" · ");

  function setStatus(text, tone = "") {
    $("v-status").textContent = text || "";
    $("v-status").className = `status${tone ? ` ${tone}` : ""}`;
  }

  async function loadSelection() {
    const { vintedSelection } = await chrome.storage.local.get("vintedSelection");
    v.selection = vintedSelection?.cardIds?.length ? vintedSelection.cardIds : null;
  }

  async function load() {
    if (v.loading) return;
    v.loading = true;
    try {
      if (!v.loaded) await loadPrefs();
      await loadSelection();
      v.cards = await api("/vinted-queue");
      v.loaded = true;
      render();
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      v.loading = false;
    }
  }

  function renderSelection() {
    const box = $("v-selection");
    if (!v.selection) { show("v-selection", false); return; }
    const left = CVVinted.filterQueue(v.cards, { selection: v.selection }).length;
    box.innerHTML = `<span>Sélection envoyée depuis CardVaults · <b>${left}</b> à publier</span><button id="v-clear-selection" class="link">Tout afficher</button>`;
    show("v-selection");
    $("v-clear-selection").addEventListener("click", async () => {
      await chrome.storage.local.remove("vintedSelection");
      v.selection = null; v.currentId = null; render();
    });
  }

  function renderScope() {
    if (!v.scope) { show("v-scope", false); return; }
    const left = visible().length;
    $("v-scope").innerHTML = `<span>${escapeHtml(CVVinted.GROUPS[v.scope.by].label)} : <b>${escapeHtml(v.scope.label)}</b> · ${left} restante${left > 1 ? "s" : ""}</span><button id="v-clear-scope" class="link">Tout afficher</button>`;
    show("v-scope");
    $("v-clear-scope").addEventListener("click", () => { v.scope = null; render(); });
  }

  function renderCurrent() {
    const card = current();
    const box = $("v-current");
    if (!card) {
      box.innerHTML = v.loaded
        ? `<div class="empty compact"><h1>${v.scope ? `${escapeHtml(v.scope.label)} : tout est publié` : "Tout est publié"}</h1><p>${v.scope ? "Toutes les cartes de ce groupe sont en ligne sur Vinted." : v.selection ? "Toute la sélection est en ligne sur Vinted." : "Aucune carte à vendre sans annonce Vinted (avec photo et prix)."}</p>${v.scope ? '<button id="v-scope-done" class="secondary">Voir les autres cartes</button>' : ""}</div>`
        : `<div class="loader"><i></i><span>Chargement des cartes…</span></div>`;
      $("v-scope-done")?.addEventListener("click", () => { v.scope = null; render(); });
      return;
    }
    const busy = v.phase === "preparing" || v.phase === "filling";
    const awaiting = v.phase === "awaiting" && v.currentId === card.id;
    const typed = v.priceInput[card.id] ?? priceText(card.price);
    const price = CVVinted.parsePrice(typed);
    const ebay = CVVinted.ebaySoldUrl(CVVinted.ebayQueryOf(card));
    const img = card.image_front_url ? `<img src="${escapeAttr(CVVinted.cdnUrl(card.image_front_url))}" alt="">` : "";
    box.innerHTML = `
      <div class="v-card">
        ${img}
        <div class="v-card-body">
          <strong>${escapeHtml(card.player || "Carte")}</strong>
          <span class="muted">${escapeHtml(metaOf(card))}</span>
          <label class="v-price">Prix Vinted
            <span class="v-price-field"><input id="v-price" inputmode="decimal" autocomplete="off" value="${escapeAttr(typed)}" placeholder="À fixer" aria-describedby="v-price-hint"><span>€</span></span>
          </label>
          ${ebay ? `<a class="v-ebay-link" href="${escapeAttr(ebay)}" target="_blank" rel="noopener">Ventes eBay ↗</a>` : ""}
        </div>
      </div>
      <p id="v-price-hint" class="v-hint${price ? " hidden" : ""}">${typed && !price ? "Prix invalide : saisis un montant, par exemple 12,50." : "Fixe un prix pour publier cette carte : il sera enregistré dans CardVaults."}</p>
      <button id="v-fill" ${busy || !price ? "disabled" : ""}>${busy ? "Ouverture de Vinted…" : awaiting ? "Remplir à nouveau" : "Remplir l’annonce sur Vinted"}</button>
      <button id="v-skip" class="secondary" ${busy ? "disabled" : ""}>Passer à la suivante</button>`;
    if (awaiting) $("v-fill").classList.add("secondary");
    const input = $("v-price");
    input.addEventListener("input", () => {
      v.priceInput[card.id] = input.value;
      const ok = CVVinted.parsePrice(input.value);
      $("v-fill").disabled = busy || !ok;
      $("v-price-hint").classList.toggle("hidden", Boolean(ok));
      $("v-price-hint").textContent = input.value.trim() && !ok ? "Prix invalide : saisis un montant, par exemple 12,50." : "Fixe un prix pour publier cette carte : il sera enregistré dans CardVaults.";
    });
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); savePrice(card, input.value); } });
    input.addEventListener("change", () => savePrice(card, input.value));
    $("v-fill").addEventListener("click", () => fill(card));
    $("v-skip").addEventListener("click", () => skip(card));
  }

  function itemHtml(c, card) {
    const active = card && c.id === card.id;
    const ebay = CVVinted.ebaySoldUrl(CVVinted.ebayQueryOf(c));
    return `<li class="v-row${active ? " active" : ""}"><button class="v-item" data-id="${escapeAttr(c.id)}" aria-current="${Boolean(active)}">
        ${c.image_front_url ? `<img src="${escapeAttr(CVVinted.cdnUrl(c.image_front_url))}" alt="" loading="lazy">` : "<span class=\"v-thumb\"></span>"}
        <span class="v-item-text"><b>${escapeHtml(c.player || "Carte")}</b><span>${escapeHtml(metaOf(c))}</span></span>
        <span class="v-item-price${c.price > 0 ? "" : " missing"}">${c.price > 0 ? currency(c.price) : "Sans prix"}</span>
      </button>${ebay ? `<a class="v-ebay" href="${escapeAttr(ebay)}" target="_blank" rel="noopener" title="Ventes eBay de ${escapeAttr(c.player || "cette carte")}" aria-label="Ventes eBay de ${escapeAttr(c.player || "cette carte")}">eBay</a>` : ""}</li>`;
  }

  function renderList() {
    const list = groups();
    const total = list.reduce((n, g) => n + g.cards.length, 0);
    const card = current();
    $("v-count").textContent = `${total} à publier${v.published ? ` · ${v.published} publiée${v.published > 1 ? "s" : ""}` : ""}`;
    const missing = CVVinted.filterQueue(v.cards, { selection: v.selection, missingPrice: true }).length;
    $("v-missing-count").textContent = missing ? String(missing) : "";
    $("v-filter").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.filter === "missing") === v.missingPrice)));
    $("v-list").innerHTML = list.map((g) => [
      g.label !== null
        ? `<li class="v-group-head"><b>${escapeHtml(g.label)}</b><span class="count">${g.cards.length}</span><button class="link" data-group="${escapeAttr(g.key ?? "")}" data-null="${g.key === null}" data-label="${escapeAttr(g.label)}">Publier ce groupe</button></li>`
        : "",
      ...g.cards.map((c) => itemHtml(c, card)),
    ].join("")).join("");
    $("v-list").querySelectorAll(".v-item").forEach((button) => button.addEventListener("click", () => {
      if (v.phase === "preparing" || v.phase === "filling") return;
      v.currentId = button.dataset.id; v.phase = "idle"; setStatus(""); render();
    }));
    $("v-list").querySelectorAll("[data-group]").forEach((button) => button.addEventListener("click", () => {
      if (v.phase === "preparing" || v.phase === "filling") return;
      v.scope = { by: v.groupBy, key: button.dataset.null === "true" ? null : button.dataset.group, label: button.dataset.label };
      v.currentId = null; v.phase = "idle"; setStatus("");
      render();
      $("v-current").scrollIntoView({ block: "start", behavior: "smooth" });
    }));
  }

  function render() {
    const card = current();
    if (card && v.currentId !== card.id && v.phase !== "awaiting") v.currentId = card.id;
    renderSelection(); renderScope(); renderCurrent(); renderList();
    show("v-manual", !!card);
  }

  /* ---------- Photos : proxy CardVaults + pastille de numérotation ---------- */

  async function toDataUrl(url) {
    const response = await fetch(CVVinted.cdnUrl(url));
    if (!response.ok) throw new Error("Photo inaccessible");
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Photo illisible"));
      reader.readAsDataURL(blob);
    });
  }

  /** Même rendu que l'app web (lib/vintedPhotoBadge.ts). */
  function withBadge(dataUrl, numbered) {
    const label = CVVinted.numberedBadge(numbered);
    if (!label) return Promise.resolve(dataUrl);
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(image, 0, 0);
        const margin = Math.max(16, Math.round(canvas.width * 0.035));
        const fontSize = Math.max(24, Math.round(canvas.width * 0.055));
        const padX = Math.round(fontSize * 0.65), padY = Math.round(fontSize * 0.45);
        ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
        const w = Math.ceil(ctx.measureText(label).width + padX * 2), h = Math.ceil(fontSize + padY * 2);
        const x = Math.max(margin, canvas.width - w - margin), y = margin;
        ctx.fillStyle = "rgba(9, 9, 11, 0.88)";
        ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.round(h * 0.24)); ctx.fill();
        ctx.fillStyle = "#f5c542"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(label, x + w / 2, y + h / 2 + fontSize * 0.03);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      };
      image.onerror = () => resolve(dataUrl);
      image.src = dataUrl;
    });
  }

  /* ---------- Actions ---------- */

  /** Enregistre le prix dans CardVaults (price et vinted_price) s'il a changé. */
  async function savePrice(card, raw) {
    const price = CVVinted.parsePrice(raw);
    if (!price || price === card.price) return price;
    try {
      await api(`/cards/${encodeURIComponent(card.id)}/price`, { method: "PATCH", body: JSON.stringify({ price }) });
      card.price = price;
      card.draft = { ...card.draft, price };
      delete v.priceInput[card.id];
      setStatus(`Prix enregistré : ${currency(price)}`);
      renderList();
      return price;
    } catch (error) {
      setStatus(`Prix non enregistré : ${error.message}`, "error");
      throw error;
    }
  }

  async function fill(card) {
    const price = CVVinted.parsePrice(v.priceInput[card.id] ?? priceText(card.price));
    if (!price) { setStatus("Fixe un prix avant de remplir l’annonce.", "error"); return; }
    try { await savePrice(card, String(price)); } catch { return; }
    v.currentId = card.id; v.phase = "preparing"; render();
    setStatus("Préparation des photos…");
    try {
      const sources = [card.image_front_url, card.image_back_url].filter(Boolean);
      const photos = await Promise.all(sources.map(toDataUrl));
      if (photos[0]) photos[0] = await withBadge(photos[0], card.numbered);
      v.phase = "filling"; render();
      setStatus("Ouverture de la page de création Vinted…");
      const result = await chrome.runtime.sendMessage({
        type: "VINTED_FILL", cardId: card.id, player: card.player, prevStatus: card.status,
        draft: { ...card.draft, price, photos },
      });
      if (result?.error) throw new Error(result.error);
    } catch (error) {
      v.phase = "error"; render();
      setStatus(`Impossible de remplir l’annonce : ${error.message}`, "error");
    }
  }

  function skip(card) {
    const list = ordered();
    const i = list.findIndex((c) => c.id === card.id);
    const next = list[(i + 1) % list.length];
    v.currentId = next && next.id !== card.id ? next.id : card.id;
    v.phase = "idle"; setStatus(""); render();
  }

  function advanceAfter(cardId) {
    const list = ordered();
    const i = list.findIndex((c) => c.id === cardId);
    const next = list[i + 1] || list.find((c) => c.id !== cardId);
    v.cards = v.cards.filter((c) => c.id !== cardId);
    v.currentId = next?.id || null;
    v.phase = "idle";
  }

  function showUndo({ cardId, player, url, prevStatus }) {
    clearTimeout(v.undoTimer);
    v.undo = { cardId, player, url, prevStatus, card: v.cards.find((c) => c.id === cardId) };
    $("v-undo").innerHTML = `<span><b>${escapeHtml(player || "Carte")}</b> associée à son annonce Vinted</span><button id="v-undo-btn" class="link">Annuler</button>`;
    show("v-undo");
    $("v-undo-btn").addEventListener("click", undoLink);
    v.undoTimer = setTimeout(() => { show("v-undo", false); v.undo = null; }, UNDO_MS);
  }

  async function undoLink() {
    const undo = v.undo;
    if (!undo) return;
    clearTimeout(v.undoTimer); clearTimeout(v.chainTimer); show("v-undo", false); v.undo = null;
    v.published = Math.max(0, v.published - 1);
    try {
      await api(`/cards/${encodeURIComponent(undo.cardId)}/vinted-listing`, {
        method: "PATCH",
        body: JSON.stringify({ url: null, restore_status: undo.prevStatus === "collection" ? "collection" : "a_vendre" }),
      });
      await load();
      v.currentId = undo.cardId; render();
      setStatus("Association annulée. La carte est de nouveau à publier.");
    } catch (error) {
      setStatus(`Annulation impossible : ${error.message}`, "error");
    }
  }

  async function attach(url, cardId = null) {
    const card = (cardId && v.cards.find((c) => c.id === cardId)) || current();
    const listing = CVVinted.listingUrl(url);
    if (!card) return;
    show("v-detect", false);
    if (!listing) { setStatus("Ce n’est pas l’adresse d’une annonce Vinted (vinted.fr/items/…).", "error"); return; }
    try {
      await api(`/cards/${encodeURIComponent(card.id)}/vinted-listing`, { method: "PATCH", body: JSON.stringify({ url: listing }) });
      $("v-url").value = "";
      onLinked({ cardId: card.id, player: card.player, url: listing, prevStatus: card.status });
    } catch (error) {
      setStatus(`Association impossible : ${error.message}`, "error");
    }
  }

  function onLinked(detail) {
    showUndo(detail);
    advanceAfter(detail.cardId);
    v.published += 1;
    const next = current();
    if (v.chain && next && next.price > 0) {
      setStatus("Annonce associée. Ouverture de la suivante…");
      clearTimeout(v.chainTimer);
      // Laisse le temps de voir la confirmation (et d'annuler) avant d'enchaîner.
      v.chainTimer = setTimeout(() => fill(next), CHAIN_DELAY_MS);
    } else {
      setStatus(next ? (next.price > 0 ? "Annonce associée. Carte suivante prête." : "Annonce associée. La suivante n’a pas de prix : fixe-le pour continuer.") : "Annonce associée.");
    }
    render();
  }

  /* ---------- Événements ---------- */

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "VINTED_EVENT") return;
    if (message.event === "filled") {
      v.phase = "awaiting"; v.currentId = message.cardId; render();
      if (message.priceFailed) {
        setStatus(`Annonce remplie, mais Vinted n’a pas pris le prix : tape ${currency(message.price)} dans le champ Prix, puis clique sur « Ajouter ».`, "error");
      } else {
        setStatus("Annonce remplie. Vérifie-la sur Vinted puis clique sur « Ajouter » : elle sera associée toute seule.");
      }
    } else if (message.event === "fill_error") {
      v.phase = "error"; render();
      setStatus(`Vinted n’a pas pu être rempli : ${message.error}. Réessaie ou remplis à la main.`, "error");
    } else if (message.event === "linked") {
      onLinked(message);
    } else if (message.event === "link_error") {
      setStatus(`Annonce détectée mais non associée (${message.error}). Utilise « Associer l’annonce ouverte ».`, "error");
      $("v-manual").open = true;
    } else if (message.event === "detected") {
      // Retrouvée sur le profil mais pas certaine (prix différent, pas en tête) : on demande.
      $("v-detect").innerHTML = `<span>Annonce trouvée sur ton profil : <b>${escapeHtml(message.title || message.url)}</b>. C’est celle de ${escapeHtml(message.player || "cette carte")} ?</span>
        <div><button id="v-detect-yes">Associer</button><button id="v-detect-no" class="secondary">Ce n’est pas elle</button></div>`;
      show("v-detect");
      $("v-detect-yes").addEventListener("click", () => attach(message.url, message.cardId));
      $("v-detect-no").addEventListener("click", () => {
        show("v-detect", false); $("v-manual").open = true;
        setStatus("Ouvre la bonne annonce sur Vinted puis « Associer l’annonce ouverte ».");
      });
    } else if (message.event === "not_found") {
      setStatus("Annonce publiée, mais introuvable sur ton profil. Ouvre-la sur Vinted puis « Associer l’annonce ouverte ».", "error");
      $("v-manual").open = true;
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.vintedSelection) { v.currentId = null; load(); }
  });

  $("v-search").addEventListener("input", (event) => { v.search = event.target.value; render(); });
  $("v-group").addEventListener("change", (event) => { v.groupBy = event.target.value; v.scope = null; savePrefs(); render(); });
  $("v-sort").addEventListener("change", (event) => { v.sort = event.target.value; savePrefs(); render(); });
  $("v-chain").addEventListener("change", (event) => { v.chain = event.target.checked; savePrefs(); });
  $("v-filter").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    v.missingPrice = button.dataset.filter === "missing"; v.currentId = null; render();
  }));
  $("v-attach-tab").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    attach(tab?.url);
  });
  $("v-attach-url").addEventListener("click", () => attach($("v-url").value.trim()));
  $("v-url").addEventListener("keydown", (event) => { if (event.key === "Enter") attach(event.target.value.trim()); });

  window.CVVintedPanel = {
    open: () => (v.loaded ? load() : (render(), load())),
  };
  if (!$("vinted").classList.contains("hidden")) window.CVVintedPanel.open();
})();
