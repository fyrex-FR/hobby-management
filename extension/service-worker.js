importScripts("vinted-logic.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

function compatible(url = "") {
  return /^https:\/\/(?:www\.)?vinted\.fr\/items\//.test(url) ||
    /^https:\/\/(?:www\.)?ebay\.(?:fr|com)\/itm\//.test(url);
}

function notifyNavigation(tabId, url) {
  if (compatible(url)) chrome.runtime.sendMessage({ type: "SCOUT_TAB_CHANGED", tabId, url }).catch(() => {});
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" || changeInfo.url) notifyNavigation(tabId, changeInfo.url || tab.url || "");
  if (changeInfo.url) onVintedTabUrl(tabId, changeInfo.url).catch(() => {});
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then((tab) => notifyNavigation(tabId, tab.url || "")).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SCOUT_ACTIVE_LISTING") {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab?.id) throw new Error("Aucun onglet actif");
      return chrome.tabs.sendMessage(tab.id, { type: "SCOUT_EXTRACT_LISTING" });
    }).then(sendResponse).catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message?.type === "VINTED_QUEUE_SET") {
    // Sélection envoyée depuis la Collection : le panneau l'affiche en priorité.
    const cardIds = Array.isArray(message.cardIds) ? message.cardIds.filter((id) => typeof id === "string").slice(0, 500) : [];
    chrome.storage.local.set({ vintedSelection: { cardIds, at: Date.now() } })
      .then(() => sendResponse({ accepted: true, count: cardIds.length }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message?.type === "VINTED_FILL") {
    startFill(message).then(sendResponse).catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message?.type === "VINTED_GET_PENDING_DRAFT") {
    vintedSession().then((session) => {
      const mine = session && session.tabId === _sender.tab?.id && session.phase === "filling";
      sendResponse({ draft: mine ? session.draft : null });
    }).catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message?.type === "VINTED_FORM_FILLED") {
    updateSession((s) => (s && s.tabId === _sender.tab?.id ? { ...s, phase: "awaiting_publish", filledAt: Date.now(), draft: null } : s))
      .then((s) => s && notifyPanel("filled", { cardId: s.cardId, priceFailed: Boolean(message.priceFailed), price: message.price ?? null }));
    return false;
  }

  if (message?.type === "VINTED_SUBMITTED") {
    updateSession((s) => (s && s.tabId === _sender.tab?.id && s.phase === "awaiting_publish" ? { ...s, submittedAt: Date.now() } : s));
    return false;
  }

  if (message?.type === "VINTED_SCAN") {
    // Rattrapage : demande au script de la page Vinted active de lire tout le profil.
    chrome.tabs.query({ active: true, lastFocusedWindow: true })
      .then(([tab]) => {
        if (!tab?.id || !CVVinted.isMemberUrl(tab.url)) throw new Error("Ouvre ton profil Vinted (ta photo → Mon profil) dans l'onglet actif, puis relance.");
        return scanWardrobe(tab.id);
      })
      .then((result) => sendResponse(result || { error: "Pas de réponse de la page Vinted : recharge-la puis relance." }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message?.type === "VINTED_PROFILE_LISTINGS") {
    if (_sender.tab?.id) onProfileListings(_sender.tab.id, message.listings || []).catch(() => {});
    return false;
  }

  if (message?.type === "VINTED_LISTING_PUBLISHED") {
    // Double sécurité avec tabs.onUpdated : la même règle décide, rien n'est associé deux fois.
    if (_sender.tab?.id) onVintedTabUrl(_sender.tab.id, message.url).catch(() => {});
    return false;
  }

  if (message?.type === "VINTED_DRAFT_ERROR") {
    vintedSession().then((s) => {
      if (s && s.tabId === _sender.tab?.id) notifyPanel("fill_error", { cardId: s.cardId, error: message.error || "Préremplissage impossible" });
    });
  }
  return false;
});

const VINTED_NEW_URL = "https://www.vinted.fr/items/new";

/**
 * Un onglet ouvert avant l'installation ou le rechargement de l'extension n'a
 * pas le script de page : on recharge l'onglet une fois, puis on relance.
 */
async function scanWardrobe(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "VINTED_SCAN_WARDROBE" });
  } catch (error) {
    if (!/Receiving end does not exist|Could not establish connection/i.test(error?.message || "")) throw error;
  }
  await reloadAndWait(tabId);
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "VINTED_SCAN_WARDROBE" });
  } catch {
    throw new Error("La page Vinted ne répond pas : recharge-la puis relance.");
  }
}

function reloadAndWait(tabId, timeout = 20000) {
  return new Promise((resolve) => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      setTimeout(resolve, 800); // content.js est injecté à document_idle, juste après « complete »
    };
    const listener = (id, info) => { if (id === tabId && info.status === "complete") done(); };
    const timer = setTimeout(done, timeout);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.reload(tabId).catch(done);
  });
}

async function vintedSession() {
  return (await chrome.storage.session.get("vintedSession")).vintedSession || null;
}

async function updateSession(update) {
  const next = update(await vintedSession());
  await chrome.storage.session.set({ vintedSession: next });
  return next;
}

function notifyPanel(event, detail = {}) {
  chrome.runtime.sendMessage({ type: "VINTED_EVENT", event, ...detail }).catch(() => {});
}

/**
 * Remplit l'annonce d'une carte : réutilise l'onglet Vinted actif (sinon en
 * ouvre un), recharge une page de création vierge, et garde le brouillon
 * (photos comprises) dans le stockage de session de l'extension plutôt que
 * dans l'adresse de la page.
 */
async function startFill({ cardId, player, prevStatus, draft }) {
  if (!cardId || !draft) throw new Error("Brouillon Vinted incomplet");
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  let tab = active && /^https:\/\/(?:www\.)?vinted\.fr\//.test(active.url || "") ? active : null;
  if (!tab) tab = await chrome.tabs.create({ url: "about:blank", active: true });
  await chrome.storage.session.set({
    vintedSession: { tabId: tab.id, cardId, player, price: draft.price ?? null, prevStatus, draft: { ...draft, cardId }, phase: "filling", lastUrl: VINTED_NEW_URL, filledAt: null, submittedAt: null, leftFormAt: null },
  });
  if (CVVinted.isNewItemUrl(tab.url)) await chrome.tabs.reload(tab.id);
  else await chrome.tabs.update(tab.id, { url: VINTED_NEW_URL, active: true });
  return { accepted: true };
}

async function onVintedTabUrl(tabId, url) {
  const session = await vintedSession();
  if (!session || session.tabId !== tabId) return;
  const prevUrl = session.lastUrl;
  if (url === prevUrl) return;
  // Moment où l'onglet quitte le formulaire : la page suivante (annonce ou profil) vient de la publication.
  const leftFormAt = CVVinted.isNewItemUrl(prevUrl) && !CVVinted.isNewItemUrl(url) ? Date.now() : session.leftFormAt ?? null;
  const seen = { ...session, lastUrl: url, leftFormAt };
  if (!CVVinted.shouldAutoLink(session, tabId, url, prevUrl, Date.now())) {
    await chrome.storage.session.set({ vintedSession: seen });
    return;
  }
  await linkListing(seen, CVVinted.listingUrl(url));
}

/** Profil affiché juste après la publication : on y cherche l'annonce créée. */
async function onProfileListings(tabId, listings) {
  const session = await vintedSession();
  if (!CVVinted.expectsNewListing(session, tabId, Date.now())) return;
  const found = CVVinted.pickPublishedListing(listings, { player: session.player, price: session.price });
  if (!found) {
    notifyPanel("not_found", { cardId: session.cardId });
    return;
  }
  if (found.confident) {
    await linkListing(session, found.url);
  } else {
    notifyPanel("detected", { cardId: session.cardId, player: session.player, url: found.url, title: found.title, prevStatus: session.prevStatus });
  }
}

async function linkListing(session, listing) {
  await chrome.storage.session.set({ vintedSession: { ...session, phase: "linking" } });
  const url = session.lastUrl;
  try {
    await extensionApi(`/cards/${encodeURIComponent(session.cardId)}/vinted-listing`, {
      method: "PATCH", body: JSON.stringify({ url: listing }),
    });
    await chrome.storage.session.set({ vintedSession: { ...session, phase: "linked", lastUrl: url, linkedUrl: listing } });
    notifyPanel("linked", { cardId: session.cardId, player: session.player, url: listing, prevStatus: session.prevStatus });
  } catch (error) {
    await chrome.storage.session.set({ vintedSession: { ...session, lastUrl: url } });
    notifyPanel("link_error", { cardId: session.cardId, url: listing, error: error.message });
  }
}

async function extensionApi(path, options = {}) {
  const { scout_token: token } = await chrome.storage.local.get("scout_token");
  if (!token) throw new Error("Extension non appairée à CardVaults");
  const response = await fetch(`https://collection-api.cardvaults.app/api/extension${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || `Erreur ${response.status}`);
  return response.json();
}
