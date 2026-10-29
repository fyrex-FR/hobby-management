/*
 * Règles de la publication Vinted, sans dépendance au navigateur : partagées
 * par le service worker (importScripts), le panneau (balise script) et les
 * tests Node (test-vinted-logic.mjs).
 */
(function (root) {
  const LISTING_RE = /^https:\/\/(?:www\.)?vinted\.fr\/items\/(\d+)(?:-[^/?#]+)?\/?(?:[?#].*)?$/;
  const NEW_ITEM_RE = /^https:\/\/(?:www\.)?vinted\.fr\/items\/new(?:[/?#].*)?$/;
  // Après le clic sur « Ajouter », Vinted ouvre l'annonce créée : on n'associe
  // automatiquement que dans cette fenêtre, et seulement dans l'onglet rempli.
  const SUBMIT_WINDOW_MS = 5 * 60 * 1000;
  const FILL_WINDOW_MS = 45 * 60 * 1000;

  /** URL canonique d'une annonce Vinted, ou null si ce n'en est pas une. */
  function listingUrl(url) {
    const value = String(url || "");
    if (!LISTING_RE.test(value)) return null;
    const { pathname } = new URL(value);
    return `https://www.vinted.fr${pathname.replace(/\/$/, "")}`;
  }

  function isNewItemUrl(url) {
    return NEW_ITEM_RE.test(String(url || ""));
  }

  /**
   * L'onglet vient d'afficher `url` : est-ce l'annonce qu'on vient de publier ?
   * Il faut un formulaire rempli dans CE même onglet, puis soit une arrivée
   * directe depuis la page de création, soit un clic « Ajouter » récent. Une
   * autre annonce consultée entre-temps n'est jamais associée par erreur.
   */
  function shouldAutoLink(session, tabId, url, prevUrl, now) {
    if (!session || session.phase !== "awaiting_publish" || session.tabId !== tabId) return false;
    if (!listingUrl(url)) return false;
    if (now - (session.filledAt || 0) > FILL_WINDOW_MS) return false;
    const fromForm = isNewItemUrl(prevUrl);
    const justSubmitted = session.submittedAt != null && now - session.submittedAt < SUBMIT_WINDOW_MS;
    return fromForm || justSubmitted;
  }

  /** Les images passent par le proxy même origine de l'app (CORS ouvert). */
  function cdnUrl(url) {
    return String(url || "").replace(/^https:\/\/images\.cardvaults\.app\//, "https://collection.cardvaults.app/cdn/");
  }

  function numberedBadge(numbered) {
    const value = String(numbered || "").trim();
    if (!value) return "";
    return `NUMÉROTÉE ${value.includes("/") ? value : `/${value}`}`;
  }

  const fold = (value) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  /**
   * Cartes affichées dans le panneau : la sélection envoyée depuis l'app (dans
   * son ordre) si elle existe, sinon les cartes « à vendre ». Puis la recherche.
   */
  function filterQueue(cards, { selection = null, search = "", missingPrice = false } = {}) {
    let list;
    if (selection && selection.length) {
      const byId = new Map(cards.map((c) => [c.id, c]));
      list = selection.map((id) => byId.get(id)).filter(Boolean);
    } else {
      list = cards.filter((c) => c.status === "a_vendre");
    }
    if (missingPrice) list = list.filter((c) => !(c.price > 0));
    const tokens = fold(search).split(/\s+/).filter(Boolean);
    if (!tokens.length) return list;
    return list.filter((c) => {
      const hay = fold([c.player, c.team, c.year, c.set_name, c.variant, c.numbered].filter(Boolean).join(" "));
      return tokens.every((t) => hay.includes(t));
    });
  }

  /** Ventes eBay terminées pour la carte (même lien que « eBay Sold » de la fiche). */
  function ebaySoldUrl(query) {
    const text = String(query || "").trim();
    if (!text) return null;
    return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(text).replace(/%20/g, "+")}&LH_Sold=1&LH_Complete=1`;
  }

  /** Prix saisi (« 12,50 », « 12 € », « 1 200 ») → nombre > 0, ou null. */
  function parsePrice(raw) {
    const text = String(raw ?? "").replace(/[€\s\u00a0\u202f]/g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
    const value = Number(text);
    return value > 0 ? Math.round(value * 100) / 100 : null;
  }

  /* ---------- Groupes et tri (publier équipe par équipe, etc.) ---------- */

  const GROUPS = {
    team: { label: "Équipe", empty: "Sans équipe", of: (c) => c.team },
    player: { label: "Joueur", empty: "Sans joueur", of: (c) => c.player },
    set: { label: "Set", empty: "Sans set", of: (c) => c.set_name },
    year: { label: "Année", empty: "Sans année", of: (c) => c.year },
  };

  function groupKey(card, by) {
    const group = GROUPS[by];
    return group ? String(group.of(card) || "").trim() || null : null;
  }

  /**
   * Regroupe la file en conservant l'ordre des cartes dans chaque groupe.
   * Groupes par ordre alphabétique (années : récentes d'abord), « Sans … » en dernier.
   */
  function groupCards(list, by) {
    const group = GROUPS[by];
    if (!group) return [{ key: null, label: null, cards: list }];
    const map = new Map();
    for (const card of list) {
      const key = groupKey(card, by);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(card);
    }
    const compare = by === "year" ? (a, b) => b.localeCompare(a) : (a, b) => a.localeCompare(b, "fr", { sensitivity: "base" });
    return [...map.entries()]
      .sort(([a], [b]) => (a === null) - (b === null) || (a && b ? compare(a, b) : 0))
      .map(([key, cards]) => ({ key, label: key ?? group.empty, cards }));
  }

  /** Ne garde que le groupe choisi (« Publier ce groupe »). */
  function inGroup(list, scope) {
    if (!scope || !GROUPS[scope.by]) return list;
    return list.filter((c) => groupKey(c, scope.by) === scope.key);
  }

  const lastName = (name) => String(name || "").trim().split(/\s+/).slice(-1)[0] || "";

  /** « recent » garde l'ordre de l'API (ajout le plus récent d'abord). */
  function sortCards(list, sort) {
    const out = [...list];
    if (sort === "price_desc") out.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    else if (sort === "price_asc") out.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    else if (sort === "player") out.sort((a, b) => lastName(a.player).localeCompare(lastName(b.player), "fr") || String(a.player || "").localeCompare(String(b.player || ""), "fr"));
    return out;
  }

  root.CVVinted = {
    listingUrl, isNewItemUrl, shouldAutoLink, cdnUrl, numberedBadge, filterQueue, ebaySoldUrl, parsePrice,
    GROUPS, groupKey, groupCards, inGroup, sortCards,
    SUBMIT_WINDOW_MS, FILL_WINDOW_MS,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
