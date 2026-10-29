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
  const v = {
    cards: [], selection: null, search: "", currentId: null,
    phase: "idle", // idle | preparing | filling | awaiting | error
    loading: false, loaded: false, undo: null, undoTimer: null,
  };

  const visible = () => CVVinted.filterQueue(v.cards, { selection: v.selection, search: v.search });
  const current = () => {
    const list = visible();
    return list.find((c) => c.id === v.currentId) || list[0] || null;
  };
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

  function renderCurrent() {
    const card = current();
    const box = $("v-current");
    if (!card) {
      box.innerHTML = v.loaded
        ? `<div class="empty compact"><h1>Tout est publié</h1><p>${v.selection ? "Toute la sélection est en ligne sur Vinted." : "Aucune carte à vendre sans annonce Vinted (avec photo et prix)."}</p></div>`
        : `<div class="loader"><i></i><span>Chargement des cartes…</span></div>`;
      return;
    }
    const busy = v.phase === "preparing" || v.phase === "filling";
    const awaiting = v.phase === "awaiting" && v.currentId === card.id;
    const img = card.image_front_url ? `<img src="${escapeAttr(CVVinted.cdnUrl(card.image_front_url))}" alt="">` : "";
    box.innerHTML = `
      <div class="v-card">
        ${img}
        <div class="v-card-body">
          <strong>${escapeHtml(card.player || "Carte")}</strong>
          <span class="muted">${escapeHtml(metaOf(card))}</span>
          <span class="price">${currency(card.price)}</span>
        </div>
      </div>
      <button id="v-fill" ${busy ? "disabled" : ""}>${busy ? "Ouverture de Vinted…" : awaiting ? "Remplir à nouveau" : "Remplir l’annonce sur Vinted"}</button>
      <button id="v-skip" class="secondary" ${busy ? "disabled" : ""}>Passer à la suivante</button>`;
    if (awaiting) $("v-fill").classList.add("secondary");
    $("v-fill").addEventListener("click", () => fill(card));
    $("v-skip").addEventListener("click", () => skip(card));
  }

  function renderList() {
    const list = visible();
    const card = current();
    $("v-count").textContent = `${list.length} carte${list.length > 1 ? "s" : ""} à publier`;
    $("v-list").innerHTML = list.map((c) => `
      <li><button class="v-item${card && c.id === card.id ? " active" : ""}" data-id="${escapeAttr(c.id)}" aria-current="${card && c.id === card.id}">
        ${c.image_front_url ? `<img src="${escapeAttr(CVVinted.cdnUrl(c.image_front_url))}" alt="" loading="lazy">` : "<span class=\"v-thumb\"></span>"}
        <span class="v-item-text"><b>${escapeHtml(c.player || "Carte")}</b><span>${escapeHtml(metaOf(c))}</span></span>
        <span class="v-item-price">${currency(c.price)}</span>
      </button></li>`).join("");
    $("v-list").querySelectorAll(".v-item").forEach((button) => button.addEventListener("click", () => {
      if (v.phase === "preparing" || v.phase === "filling") return;
      v.currentId = button.dataset.id; v.phase = "idle"; setStatus(""); render();
    }));
  }

  function render() {
    const card = current();
    if (card && v.currentId !== card.id && v.phase !== "awaiting") v.currentId = card.id;
    renderSelection(); renderCurrent(); renderList();
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

  async function fill(card) {
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
        draft: { ...card.draft, photos },
      });
      if (result?.error) throw new Error(result.error);
    } catch (error) {
      v.phase = "error"; render();
      setStatus(`Impossible de remplir l’annonce : ${error.message}`, "error");
    }
  }

  function skip(card) {
    const list = visible();
    const i = list.findIndex((c) => c.id === card.id);
    const next = list[(i + 1) % list.length];
    v.currentId = next && next.id !== card.id ? next.id : card.id;
    v.phase = "idle"; setStatus(""); render();
  }

  function advanceAfter(cardId) {
    const list = visible();
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
    clearTimeout(v.undoTimer); show("v-undo", false); v.undo = null;
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

  async function attach(url) {
    const card = current();
    const listing = CVVinted.listingUrl(url);
    if (!card) return;
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
    setStatus(v.currentId ? "Annonce associée. Carte suivante prête." : "Annonce associée.");
    render();
  }

  /* ---------- Événements ---------- */

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "VINTED_EVENT") return;
    if (message.event === "filled") {
      v.phase = "awaiting"; v.currentId = message.cardId; render();
      setStatus("Annonce remplie. Vérifie-la sur Vinted puis clique sur « Ajouter » : elle sera associée toute seule.");
    } else if (message.event === "fill_error") {
      v.phase = "error"; render();
      setStatus(`Vinted n’a pas pu être rempli : ${message.error}. Réessaie ou remplis à la main.`, "error");
    } else if (message.event === "linked") {
      onLinked(message);
    } else if (message.event === "link_error") {
      setStatus(`Annonce détectée mais non associée (${message.error}). Utilise « Associer l’annonce ouverte ».`, "error");
      $("v-manual").open = true;
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.vintedSelection) { v.currentId = null; load(); }
  });

  $("v-search").addEventListener("input", (event) => { v.search = event.target.value; render(); });
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
