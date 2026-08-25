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
  if (message?.type !== "SCOUT_ACTIVE_LISTING") return false;
  chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
    if (!tab?.id) throw new Error("Aucun onglet actif");
    return chrome.tabs.sendMessage(tab.id, { type: "SCOUT_EXTRACT_LISTING" });
  }).then(sendResponse).catch((error) => sendResponse({ error: error.message }));
  return true;
});
