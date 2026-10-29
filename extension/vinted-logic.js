/*
 * Règles de la publication Vinted, sans dépendance au navigateur : partagées
 * par le service worker (importScripts), le panneau (balise script) et les
 * tests Node (test-vinted-logic.mjs).
 */
(function (root) {
  const LISTING_RE = /^https:\/\/(?:www\.)?vinted\.fr\/items\/(\d+)(?:-[^/?#]+)?\/?(?:[?#].*)?$/;
  const NEW_ITEM_RE = /^https:\/\/(?:www\.)?vinted\.fr\/items\/new(?:[/?#].*)?$/;
  const MEMBER_RE = /^https:\/\/(?:www\.)?vinted\.fr\/member\/\d+/;
  // Après « Ajouter », Vinted peut renvoyer sur le profil au lieu de l'annonce.
  const LEFT_FORM_WINDOW_MS = 2 * 60 * 1000;
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

  function isMemberUrl(url) {
    return MEMBER_RE.test(String(url || ""));
  }

  /**
   * Le profil s'affiche-t-il juste après la publication (formulaire quitté ou
   * clic « Ajouter » récents, dans l'onglet rempli) ? Alors l'annonce créée est
   * en tête de ses articles.
   */
  function expectsNewListing(session, tabId, now) {
    if (!session || session.phase !== "awaiting_publish" || session.tabId !== tabId) return false;
    const leftForm = session.leftFormAt != null && now - session.leftFormAt < LEFT_FORM_WINDOW_MS;
    const justSubmitted = session.submittedAt != null && now - session.submittedAt < SUBMIT_WINDOW_MS;
    return leftForm || justSubmitted;
  }

  const slugTokens = (value) => fold(value).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

  /** « 20,00 € » → 20 */
  function priceIn(text) {
    const match = String(text || "").match(/(\d+(?:[.,]\d{1,2})?)\s*€/);
    return match ? Number(match[1].replace(",", ".")) : null;
  }

  /**
   * Parmi les articles du profil (dans l'ordre affiché, le plus récent en
   * premier), retrouve l'annonce de la carte : nom du joueur dans l'adresse ou
   * le titre, et même prix si Vinted l'affiche. `confident` seulement si c'est
   * l'un des tout premiers articles et que le prix ne contredit pas.
   */
  function pickPublishedListing(candidates, { player, price } = {}) {
    const wanted = slugTokens(player);
    if (!wanted.length) return null;
    const seen = new Set();
    const list = (candidates || [])
      .map((c) => ({ ...c, url: listingUrl(c.url) }))
      .filter((c) => c.url && !seen.has(c.url) && seen.add(c.url));
    const index = list.findIndex((c) => {
      const words = new Set(slugTokens(`${c.url} ${c.title || ""}`));
      return wanted.every((w) => words.has(w));
    });
    if (index < 0) return null;
    const match = list[index];
    const shownPrice = priceIn(match.title);
    const priceOk = shownPrice == null || price == null || Math.abs(shownPrice - price) < 0.01;
    return { url: match.url, title: match.title || "", confident: index < 2 && priceOk };
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

  /**
   * Recherche eBay d'une carte : celle fournie par l'API, sinon reconstruite
   * à partir des champs de la file (serveur pas encore à jour).
   */
  function ebayQueryOf(card) {
    if (card?.ebay_query) return card.ebay_query;
    return [card?.player, card?.year, card?.set_name, card?.variant, card?.numbered]
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
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

  /* ---------- Rattrapage : profil Vinted ↔ cartes CardVaults ---------- */

  function listingId(url) {
    const match = String(url || "").match(/vinted\.fr\/items\/(\d+)/);
    return match ? match[1] : null;
  }

  const tokenize = (value) => fold(value).replace(/[^a-z0-9/]+/g, " ").split(" ").filter((t) => t && t !== "/");
  const numberedOf = (value) => (String(value || "").match(/\/\s*(\d+)/) || [])[1] || null;

  /**
   * Ressemblance entre une carte et une annonce (0 à 1). Le titre des annonces
   * créées par l'extension reprend celui de la carte : on compare les mots.
   * Le nom du joueur doit y être en entier, et le tirage (/75) ne doit pas différer.
   */
  function matchScore(card, listing) {
    const listed = new Set(tokenize(listing.title));
    const player = tokenize(card.player);
    if (!player.length || !player.every((t) => listed.has(t))) return 0;
    const cardNum = numberedOf(card.numbered);
    const listNum = numberedOf(listing.title);
    if (cardNum && listNum && cardNum !== listNum) return 0;
    const words = [...new Set(tokenize(card.title || [card.player, card.year, card.set_name, card.variant, card.numbered].filter(Boolean).join(" ")))];
    const common = words.filter((t) => listed.has(t)).length;
    let score = 0.75 * (common / words.length) + 0.25 * (common / Math.max(listed.size, 1));
    if (cardNum && !listNum) score *= 0.6;
    if (card.price > 0 && listing.price > 0 && Math.abs(card.price - listing.price) < 0.01) score += 0.05;
    return Math.min(1, Math.round(score * 1000) / 1000);
  }

  /**
   * Rapproche les annonces du profil et les cartes :
   * - `pairs` : lien déjà bon (même identifiant d'annonce) ou correspondance sûre ;
   * - `review` : annonce avec plusieurs cartes possibles, à choisir ;
   * - `orphans` : annonce sans carte ressemblante ;
   * - `broken` : carte dont le lien Vinted ne mène à aucune annonce du profil.
   */
  function matchWardrobe(listings, cards) {
    const byId = new Map(listings.map((l) => [listingId(l.url), l]).filter(([id]) => id));
    const usedListings = new Set();
    const usedCards = new Set();
    const pairs = [];
    for (const card of cards) {
      const listing = byId.get(listingId(card.vinted_url));
      if (listing && !usedListings.has(listing)) {
        pairs.push({ card, listing, kind: "linked", score: 1 });
        usedListings.add(listing); usedCards.add(card.id);
      }
    }
    const scored = [];
    for (const listing of listings) {
      if (usedListings.has(listing)) continue;
      for (const card of cards) {
        if (usedCards.has(card.id)) continue;
        const score = matchScore(card, listing);
        if (score >= 0.5) scored.push({ card, listing, score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    const bestFor = (listing, except) => Math.max(0, ...scored.filter((s) => s.listing === listing && s.card !== except && !usedCards.has(s.card.id)).map((s) => s.score));
    for (const s of scored) {
      if (usedListings.has(s.listing) || usedCards.has(s.card.id)) continue;
      if (s.score >= 0.8 && s.score - bestFor(s.listing, s.card) >= 0.1) {
        pairs.push({ card: s.card, listing: s.listing, kind: "matched", score: s.score });
        usedListings.add(s.listing); usedCards.add(s.card.id);
      }
    }
    const review = [];
    const orphans = [];
    for (const listing of listings) {
      if (usedListings.has(listing)) continue;
      const options = scored.filter((s) => s.listing === listing && !usedCards.has(s.card.id)).slice(0, 3);
      if (options.length) review.push({ listing, options: options.map(({ card, score }) => ({ card, score })) });
      else orphans.push(listing);
    }
    const broken = cards.filter((c) => c.vinted_url && !usedCards.has(c.id));
    return { pairs, review, orphans, broken };
  }

  /**
   * Changements à appliquer pour une paire carte ↔ annonce, selon l'état de
   * l'annonce et les choix faits dans le panneau :
   * decisions.reserved = "sold_outside" | "reserve" | "keep"
   * decisions.hidden   = "sold_outside" | "unlink" | "keep"
   * Renvoie { action, changes, warning } ; action null si rien ne change.
   */
  function planPair(card, listing, decisions = {}) {
    const action = { card_id: card.id };
    const changes = [];
    let warning = null;
    const url = listingUrl(listing.url);
    const relink = url && listingId(card.vinted_url) !== listingId(url);
    const setStatus = (status, label) => {
      if (card.status !== status) { action.status = status; changes.push(label); }
    };
    const state = listing.state || "unknown";
    let unlink = false;
    if (state === "sold") {
      if (card.status !== "vendu") {
        action.status = "vendu";
        if (listing.price > 0) action.price = listing.price;
        changes.push(listing.price > 0 ? `Vendue sur Vinted (${String(listing.price).replace(".", ",")} €)` : "Vendue sur Vinted");
      }
    } else if (state === "reserved" || state === "hidden") {
      const choice = decisions[state] || "keep";
      if (choice === "sold_outside") setStatus("vendu", "Vendue hors Vinted");
      else if (choice === "reserve") setStatus("reserve", "Réservée");
      else if (choice === "unlink") unlink = true;
      else if (choice === "relist") { unlink = true; setStatus("a_vendre", "Remise en vente"); }
    } else if (state === "active") {
      if (card.status === "vendu") warning = "Vendue dans CardVaults mais encore en ligne sur Vinted : pense à retirer l'annonce.";
      else setStatus("a_vendre", "À vendre");
    }
    if (unlink) {
      if (card.vinted_url) { action.clear_url = true; changes.unshift("Lien Vinted retiré"); }
    } else if (relink) {
      action.vinted_url = url;
      changes.unshift(card.vinted_url ? "Lien corrigé" : "Lien ajouté");
    }
    const hasChange = action.status || action.vinted_url || action.clear_url || action.price;
    return { action: hasChange ? action : null, changes, warning };
  }

  /**
   * Carte dont le lien ne correspond à aucune annonce du profil (lien bidon,
   * carte mal marquée) : `unlink` retire le lien, `relist` le retire et remet
   * la carte à vendre.
   */
  function planBroken(card, choice = "keep") {
    if (choice !== "unlink" && choice !== "relist") return { action: null, changes: [] };
    const action = { card_id: card.id, clear_url: true };
    const changes = ["Lien Vinted retiré"];
    if (choice === "relist" && card.status !== "a_vendre") { action.status = "a_vendre"; changes.push("Remise en vente"); }
    return { action, changes };
  }

  root.CVVinted = {
    listingUrl, isNewItemUrl, isMemberUrl, shouldAutoLink, expectsNewListing, pickPublishedListing, cdnUrl, numberedBadge, filterQueue, ebaySoldUrl, ebayQueryOf, parsePrice,
    GROUPS, groupKey, groupCards, inGroup, sortCards,
    listingId, matchScore, matchWardrobe, planPair, planBroken,
    SUBMIT_WINDOW_MS, FILL_WINDOW_MS,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
