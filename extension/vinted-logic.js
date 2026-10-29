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
  function filterQueue(cards, { selection = null, search = "" } = {}) {
    let list;
    if (selection && selection.length) {
      const byId = new Map(cards.map((c) => [c.id, c]));
      list = selection.map((id) => byId.get(id)).filter(Boolean);
    } else {
      list = cards.filter((c) => c.status === "a_vendre");
    }
    const tokens = fold(search).split(/\s+/).filter(Boolean);
    if (!tokens.length) return list;
    return list.filter((c) => {
      const hay = fold([c.player, c.team, c.year, c.set_name, c.variant, c.numbered].filter(Boolean).join(" "));
      return tokens.every((t) => hay.includes(t));
    });
  }

  root.CVVinted = { listingUrl, isNewItemUrl, shouldAutoLink, cdnUrl, numberedBadge, filterQueue, SUBMIT_WINDOW_MS, FILL_WINDOW_MS };
})(typeof globalThis !== "undefined" ? globalThis : self);
