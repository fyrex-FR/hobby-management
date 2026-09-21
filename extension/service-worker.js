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

  if (message?.type === "VINTED_QUEUE_DRAFT") {
    startVintedDraft(message.draft, _sender.tab).then(sendResponse).catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message?.type === "VINTED_GET_PENDING_DRAFT") {
    queueState().then((state) => {
      const draft = _sender.tab?.id === state.vintedTabId ? state.draft || null : null;
      sendResponse({ draft });
    }).catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message?.type === "VINTED_LISTING_PUBLISHED") {
    completeVintedDraft(message.url, _sender.tab).then(sendResponse).catch(async (error) => {
      const state = await queueState();
      await notifyCollection("VINTED_QUEUE_ERROR", { cardId: state.cardId, error: error.message });
      sendResponse({ error: error.message });
    });
    return true;
  }

  if (message?.type === "VINTED_DRAFT_ERROR") {
    notifyCollection("VINTED_QUEUE_ERROR", { cardId: message.cardId, error: message.error || "Préremplissage impossible" });
  }
  return false;
});

const VINTED_NEW_URL = "https://www.vinted.fr/items/new";

async function queueState() {
  return (await chrome.storage.session.get("vintedQueue")).vintedQueue || {};
}

async function setQueueState(value) {
  await chrome.storage.session.set({ vintedQueue: value });
}

async function startVintedDraft(draft, sourceTab) {
  if (!sourceTab?.id || !draft?.cardId) throw new Error("Brouillon Vinted incomplet");
  const state = await queueState();
  let vintedTab = state.vintedTabId ? await chrome.tabs.get(state.vintedTabId).catch(() => null) : null;
  const encoded = encodeURIComponent(JSON.stringify(draft));
  const url = `${VINTED_NEW_URL}#vinted_pending=${encoded}`;
  if (vintedTab?.id) {
    await setQueueState({ collectionTabId: sourceTab.id, vintedTabId: vintedTab.id, cardId: draft.cardId, draft });
    await chrome.tabs.update(vintedTab.id, { url, active: true });
  } else {
    vintedTab = await chrome.tabs.create({ url: "about:blank", active: true });
    await setQueueState({ collectionTabId: sourceTab.id, vintedTabId: vintedTab.id, cardId: draft.cardId, draft });
    await chrome.tabs.update(vintedTab.id, { url });
  }
  return { accepted: true };
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

async function notifyCollection(eventType, detail) {
  const state = await queueState();
  if (!state.collectionTabId) return;
  await chrome.tabs.sendMessage(state.collectionTabId, { type: "VINTED_QUEUE_EVENT", eventType, detail }).catch(() => {});
}

async function completeVintedDraft(url, sourceTab) {
  const state = await queueState();
  if (!sourceTab?.id || sourceTab.id !== state.vintedTabId || !state.cardId) throw new Error("Session Vinted inconnue");
  const result = await extensionApi(`/cards/${encodeURIComponent(state.cardId)}/vinted-listing`, {
    method: "PATCH", body: JSON.stringify({ url }),
  });
  await notifyCollection("VINTED_QUEUE_PUBLISHED", result);
  await setQueueState({ ...state, cardId: null, draft: null });
  return result;
}
