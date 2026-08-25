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
  if (message?.type === "SCOUT_EBAY_SEARCH") {
    collectEbayResults(message.url).then(sendResponse).catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  if (message?.type !== "SCOUT_ACTIVE_LISTING") return false;
  chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
    if (!tab?.id) throw new Error("Aucun onglet actif");
    return chrome.tabs.sendMessage(tab.id, { type: "SCOUT_EXTRACT_LISTING" });
  }).then(sendResponse).catch((error) => sendResponse({ error: error.message }));
  return true;
});

function waitForTab(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("eBay ne répond pas")), timeoutMs);
    function finish(error, tab) {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      error ? reject(error) : resolve(tab);
    }
    function onUpdated(updatedId, changeInfo, tab) {
      if (updatedId === tabId && changeInfo.status === "complete") finish(null, tab);
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") finish(null, tab);
    }).catch(finish);
  });
}

async function collectEbayResults(url) {
  if (!/^https:\/\/www\.ebay\.fr\/sch\/i\.html\?/.test(url || "")) throw new Error("Recherche eBay invalide");
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    const loaded = await waitForTab(tab.id);
    if (/signin\.ebay\.fr/.test(loaded.url || "")) throw new Error("eBay demande une reconnexion dans Chrome");
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => [...document.querySelectorAll("li.s-item")].map((row) => ({
        title: row.querySelector(".s-item__title")?.textContent?.trim() || "",
        price_text: row.querySelector(".s-item__price")?.textContent || "",
        url: row.querySelector("a.s-item__link")?.href || "",
        image: row.querySelector(".s-item__image-img")?.src || "",
      })).filter((item) => item.title && item.url),
    });
    return { results: result || [] };
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}
